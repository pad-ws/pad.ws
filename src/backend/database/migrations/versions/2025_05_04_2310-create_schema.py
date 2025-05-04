"""Create schema explicitly

Revision ID: create_schema
Revises: 
Create Date: 2025-05-04 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

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

# revision identifiers, used by Alembic.
revision: str = 'create_schema'
down_revision: Union[str, None] = None  # This is the first migration
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create schema explicitly before other operations."""
    # Create schema using execute() with a SQL string instead of CreateSchema
    # This approach can be more reliable in certain PostgreSQL versions
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA_NAME}")


def downgrade() -> None:
    """Drop schema if needed."""
    # We don't actually want to drop the schema on downgrade
    # as it would delete all data, but the function is required
    pass
