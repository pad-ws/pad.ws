"""Migrate canvas_data and canvas_backups to new schema

Revision ID: migrate_canvas_data
Revises: 
Create Date: 2025-05-02 20:55:00.000000

"""
import logging
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import Session
import uuid
from datetime import datetime

# revision identifiers, used by Alembic.
revision = 'migrate_canvas_data'
down_revision = None
branch_labels = None
depends_on = None

# Import the schema name from the models using dynamic import
import importlib.util
import os

# Get the absolute path to the base_model module
base_model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "base_model.py")

# Load the module dynamically
spec = importlib.util.spec_from_file_location("base_model", base_model_path)
base_model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base_model)

# Get SCHEMA_NAME from the loaded module
SCHEMA_NAME = base_model.SCHEMA_NAME

def table_exists(connection, table_name, schema='public'):
    """Check if a table exists in the database"""
    query = sa.text(
        """
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = :schema 
            AND table_name = :table_name
        )
        """
    )
    result = connection.execute(query, {"schema": schema, "table_name": table_name}).scalar()
    return bool(result)

def upgrade() -> None:
    """Migrate data from old tables to new schema"""
    
    # Create a connection to execute raw SQL
    connection = op.get_bind()
    
    # Define tables for direct SQL operations
    metadata = sa.MetaData()
    
    # Check if the source tables exist
    canvas_data_exists = table_exists(connection, 'canvas_data')
    canvas_backups_exists = table_exists(connection, 'canvas_backups')
    
    if not canvas_data_exists and not canvas_backups_exists:
        logging.info("Source tables 'canvas_data' and 'canvas_backups' do not exist. Skipping data migration.")
        return
    
    # Define the old tables in the public schema
    canvas_data = sa.Table(
        'canvas_data',
        metadata,
        sa.Column('user_id', UUID(as_uuid=True), primary_key=True),
        sa.Column('data', JSONB),
        schema='public'
    )
    
    canvas_backups = sa.Table(
        'canvas_backups',
        metadata,
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True)),
        sa.Column('canvas_data', JSONB),
        sa.Column('timestamp', sa.DateTime),
        schema='public'
    )
    
    # Define the new tables in the pad_ws schema with all required columns
    users = sa.Table(
        'users',
        metadata,
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('username', sa.String(254)),
        sa.Column('email', sa.String(254)),
        sa.Column('email_verified', sa.Boolean),
        sa.Column('name', sa.String(254)),
        sa.Column('given_name', sa.String(254)),
        sa.Column('family_name', sa.String(254)),
        sa.Column('roles', JSONB),
        schema=SCHEMA_NAME
    )
    
    pads = sa.Table(
        'pads',
        metadata,
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('owner_id', UUID(as_uuid=True)),
        sa.Column('display_name', sa.String(100)),
        sa.Column('data', JSONB),
        schema=SCHEMA_NAME
    )
    
    backups = sa.Table(
        'backups',
        metadata,
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('source_id', UUID(as_uuid=True)),
        sa.Column('data', JSONB),
        sa.Column('created_at', sa.DateTime),
        schema=SCHEMA_NAME
    )
    
    # Create a session for ORM operations
    session = Session(connection)
    
    try:
        # Dictionary to store user_id -> pad_id mapping for later use with backups
        user_pad_mapping = {}
        
        # Step 1: Process canvas_data if it exists
        if canvas_data_exists:
            try:
                # Get all canvas_data records
                canvas_data_records = session.execute(sa.select(canvas_data)).fetchall()
                logging.info(f"Found {len(canvas_data_records)} records in canvas_data table")
                
                # Step 2: For each canvas_data record, create a new pad
                for record in canvas_data_records:
                    user_id = record.user_id
            
                    # Check if the user exists in the new schema
                    user_exists = session.execute(
                        sa.select(users).where(users.c.id == user_id)
                    ).fetchone()
                    
                    if not user_exists:
                        logging.info(f"User {user_id} not found in new schema, creating with placeholder data")
                        # Create a new user with placeholder data
                        # The real data will be updated when the user accesses the /me route
                        session.execute(
                            users.insert().values(
                                id=user_id,
                                username=f"migrated_user_{user_id}",
                                email=f"migrated_{user_id}@example.com",
                                email_verified=False,
                                name="Migrated User",
                                given_name="Migrated",
                                family_name="User",
                                roles=[],
                            )
                        )
                    
                    # Generate a new UUID for the pad
                    pad_id = uuid.uuid4()
                    
                    # Store the mapping for later use
                    user_pad_mapping[user_id] = pad_id
                    
                    # Insert the pad record
                    session.execute(
                        pads.insert().values(
                            id=pad_id,
                            owner_id=user_id,
                            display_name="Untitled",
                            data=record.data,
                        )
                    )
            except Exception as e:
                logging.error(f"Error processing canvas_data: {e}")
                session.rollback()
                raise
        
        # Step 3: Process canvas_backups if it exists
        if canvas_backups_exists and user_pad_mapping:  # Only process backups if we have pads
            try:
                # Get all canvas_backups records
                canvas_backup_records = session.execute(sa.select(canvas_backups)).fetchall()
                logging.info(f"Found {len(canvas_backup_records)} records in canvas_backups table")
                
                # Step 4: For each canvas_backup record, create a new backup
                for record in canvas_backup_records:
                    user_id = record.user_id
                    
                    # Skip if we don't have a pad for this user
                    if user_id not in user_pad_mapping:
                        logging.warning(f"No pad found for user {user_id}, skipping backup")
                        continue
                    
                    pad_id = user_pad_mapping[user_id]
                    
                    # Insert the backup record
                    session.execute(
                        backups.insert().values(
                            id=uuid.uuid4(),
                            source_id=pad_id,
                            data=record.canvas_data,  # Note: using canvas_data field from the record
                            created_at=record.timestamp,
                        )
                    )
            except Exception as e:
                logging.error(f"Error processing canvas_backups: {e}")
                session.rollback()
                raise
        
        # Commit the transaction
        session.commit()
        
        if canvas_data_exists or canvas_backups_exists:
            pad_count = len(user_pad_mapping) if canvas_data_exists else 0
            backup_count = len(canvas_backup_records) if canvas_backups_exists and 'canvas_backup_records' in locals() else 0
            logging.info(f"Migration complete: {pad_count} pads and {backup_count} backups migrated")
        else:
            logging.info("No data to migrate")
        
    except Exception as e:
        session.rollback()
        logging.error(f"Error during migration: {e}")
        raise
    finally:
        session.close()


def downgrade() -> None:
    """Downgrade is not supported for this migration"""
    print("Downgrade is not supported for this data migration")
