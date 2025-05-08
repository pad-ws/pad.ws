# Database and Migration Flow Documentation

This document provides a comprehensive walkthrough of the database architecture, execution flow, and migration processes in the Pad.ws application. It covers how PostgreSQL (managed by SQLAlchemy) and Alembic migrations work together to provide a robust database layer.

## Table of Contents

1. [Database Architecture Overview](#1-database-architecture-overview)
2. [Application Startup Sequence](#2-application-startup-sequence)
3. [SQLAlchemy Configuration and Usage](#3-sqlalchemy-configuration-and-usage)
4. [Alembic Migration System](#4-alembic-migration-system)
5. [Migration Scripts Analysis](#5-migration-scripts-analysis)
6. [Repository Pattern Implementation](#6-repository-pattern-implementation)
7. [Service Layer Implementation](#7-service-layer-implementation)
8. [Database Access in API Routes](#8-database-access-in-api-routes)
9. [Distributed Database Operations](#9-distributed-database-operations)
10. [Best Practices and Patterns](#10-best-practices-and-patterns)

## 1. Database Architecture Overview

### 1.1 Schema Design

The application uses a dedicated PostgreSQL schema named `pad_ws` (defined in `base_model.py`) to isolate its tables from other applications that might share the same database. This approach provides several benefits:

- **Namespace isolation**: Prevents table name collisions with other applications
- **Security boundaries**: Allows for more granular permission control
- **Organizational clarity**: Makes it clear which tables belong to the application

### 1.2 Model Relationships

The database schema consists of four main models:

```mermaid
erDiagram
    UserModel ||--o{ PadModel : "owns"
    PadModel ||--o{ BackupModel : "has"
    
    UserModel {
        UUID id PK
        string username
        string email
        boolean email_verified
        string name
        string given_name
        string family_name
        jsonb roles
        datetime created_at
        datetime updated_at
    }
    
    PadModel {
        UUID id PK
        UUID owner_id FK
        string display_name
        jsonb data
        datetime created_at
        datetime updated_at
    }
    
    BackupModel {
        UUID id PK
        UUID source_id FK
        jsonb data
        datetime created_at
        datetime updated_at
    }
    
    TemplatePadModel {
        UUID id PK
        string name
        string display_name
        jsonb data
        datetime created_at
        datetime updated_at
    }
```

- **UserModel**: Represents application users, synchronized with Keycloak authentication
- **PadModel**: Represents a canvas/pad instance owned by a user
- **BackupModel**: Stores point-in-time backups of pads
- **TemplatePadModel**: Stores reusable templates for new pads

### 1.3 Database Connection Architecture

The application uses SQLAlchemy's async capabilities to interact with PostgreSQL:

- **Async Engine**: Created with `create_async_engine` for non-blocking database operations
- **Session Factory**: Uses `sessionmaker` with `AsyncSession` for async session management
- **Connection Pool**: Managed by SQLAlchemy to efficiently reuse database connections
- **Dependency Injection**: Sessions are provided to routes via FastAPI's dependency injection system

## 2. Application Startup Sequence

### 2.1 Database Initialization Flow

The application startup sequence for database initialization follows these steps:

```mermaid
sequenceDiagram
    participant App as FastAPI Application
    participant DB as Database Module
    participant Redis as Redis
    participant Alembic as Alembic
    participant Postgres as PostgreSQL
    
    App->>DB: Start application (lifespan)
    DB->>Postgres: Establish connection
    DB->>Redis: Check migration lock
    alt Lock acquired
        Redis-->>DB: Lock granted
        DB->>Alembic: Run migrations
        Alembic->>Postgres: Apply migrations
        Postgres-->>Alembic: Migrations applied
        Alembic-->>DB: Migrations complete
        DB->>Redis: Set migration status "completed"
        DB->>Redis: Release lock
    else Another instance running migrations
        Redis-->>DB: Lock denied
        DB->>Redis: Poll migration status
        loop Until status is "completed" or timeout
            Redis-->>DB: Check status
        end
    end
    DB->>App: Database ready
    App->>DB: Load templates
    DB->>Postgres: Store templates
    App->>App: Start serving requests
```

### 2.2 Detailed Startup Process

1. **Application Start**: The FastAPI application starts with the `lifespan` context manager in `main.py`
2. **Database Connection**: The application establishes a connection to PostgreSQL
3. **Migration Coordination**:
   - The application attempts to acquire a Redis lock for migrations
   - If successful, it runs Alembic migrations
   - If not, it waits for another instance to complete migrations
4. **Template Loading**: Default templates are loaded into the database
5. **Application Ready**: The application starts serving requests

### 2.3 Code Flow Analysis

The startup sequence is implemented in `main.py` using FastAPI's `lifespan` context manager:

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    # Initialize database
    await init_db()
    print("Database connection established successfully")
    
    # Run database migrations with Redis lock
    try:
        migration_success = await run_migrations_with_lock(
            redis_client=redis_client,
            lock_timeout=120,  # 2 minutes timeout for the lock
            max_wait_time=300  # 5 minutes maximum wait time
        )
        
        if migration_success:
            print("Database migrations completed successfully or already done")
        else:
            print("Warning: Migrations failed or timed out - proceeding with caution")
    except Exception as e:
        print(f"Warning: Failed to run migrations: {str(e)}")
    
    # Check Redis connection
    try:
        redis_client.ping()
        print("Redis connection established successfully")
    except Exception as e:
        print(f"Warning: Redis connection failed: {str(e)}")
    
    # Load all templates from the templates directory
    await load_templates()
    print("Templates loaded successfully")
    
    yield
    
    # Clean up connections when shutting down
    try:
        redis_pool.disconnect()
        print("Redis connections closed")
    except Exception as e:
        print(f"Error closing Redis connections: {str(e)}")
```

## 3. SQLAlchemy Configuration and Usage

### 3.1 Engine Configuration

The SQLAlchemy engine is configured in `database.py` with the following settings:

```python
# PostgreSQL connection configuration
DB_USER = os.getenv('POSTGRES_USER', 'postgres')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'postgres')
DB_NAME = os.getenv('POSTGRES_DB', 'pad')
DB_HOST = os.getenv('POSTGRES_HOST', 'localhost')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')

# SQLAlchemy async database URL
DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{urlquote(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)
```

Key points:
- Uses environment variables for configuration with sensible defaults
- Uses the `asyncpg` driver for async PostgreSQL access
- URL-quotes the password to handle special characters
- Disables SQL echo for production (set `echo=True` for debugging)

### 3.2 Session Management

Sessions are created using a session factory and provided via dependency injection:

```python
# Create async session factory
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a database session"""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
```

Key points:
- Uses `AsyncSession` for async database operations
- Sets `expire_on_commit=False` to allow using objects after commit
- Properly closes sessions with `finally` block to ensure cleanup
- Uses FastAPI's dependency injection system to provide sessions to routes

### 3.3 Transaction Handling

Transactions are handled at the repository level, with explicit commits:

```python
async def create(self, owner_id: UUID, display_name: str, data: Dict[str, Any]) -> PadModel:
    """Create a new pad"""
    pad = PadModel(owner_id=owner_id, display_name=display_name, data=data)
    self.session.add(pad)
    await self.session.commit()
    await self.session.refresh(pad)
    return pad
```

Key points:
- Explicit `await session.commit()` to commit transactions
- `await session.refresh(pad)` to reload the object with database-generated values
- Error handling is typically done at the service layer

## 4. Alembic Migration System

### 4.1 Migration Execution Flow

The migration process follows this flow:

```mermaid
flowchart TD
    A[Application Start] --> B{Redis Lock Available?}
    B -->|Yes| C[Acquire Lock]
    B -->|No| D[Wait for Migration Status]
    C --> E[Set Status: in_progress]
    E --> F[Run Alembic Migrations]
    F --> G{Migration Successful?}
    G -->|Yes| H[Set Status: completed]
    G -->|No| I[Set Status: failed]
    H --> J[Release Lock]
    I --> J
    D --> K{Status Check}
    K -->|completed| L[Continue Startup]
    K -->|failed| M[Continue with Caution]
    K -->|in_progress| N[Wait and Check Again]
    K -->|no status & no lock| O[Try to Acquire Lock]
    J --> L
    M --> P[Application Running]
    L --> P
    N --> K
    O --> B
```

### 4.2 Alembic Configuration

The Alembic configuration is defined in `alembic.ini`:

```ini
[alembic]
# path to migration scripts
script_location = migrations

# Use a more descriptive file template that includes date and time
file_template = %%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s

# The SQLAlchemy connection URL is set in env.py from environment variables
sqlalchemy.url = postgresql://postgres:postgres@localhost/pad
```

Key points:
- Uses a descriptive file template with date and time
- Connection URL is overridden in `env.py` with environment variables
- Migration scripts are stored in the `migrations` directory

### 4.3 Migration Environment

The migration environment is configured in `env.py`:

```python
# Import the Base metadata from the models
import importlib.util
import os

# Get the absolute path to the models module
models_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "__init__.py")

# Load the module dynamically
spec = importlib.util.spec_from_file_location("models", models_path)
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)

# Get Base and SCHEMA_NAME from the loaded module
Base = models.Base
SCHEMA_NAME = models.SCHEMA_NAME
target_metadata = Base.metadata

# Override sqlalchemy.url in alembic.ini
config.set_main_option('sqlalchemy.url', f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}")
```

Key points:
- Dynamically imports the models to avoid circular imports
- Gets the `Base` metadata from the models for auto-generating migrations
- Overrides the connection URL with environment variables
- Configures Alembic to include schemas and set the version table schema

### 4.4 Distributed Migration Locking

The application uses Redis for distributed locking to coordinate migrations across multiple instances:

```python
async def run_migrations_with_lock(redis_client=None, lock_timeout: int = 120, max_wait_time: int = 300) -> bool:
    """
    Run database migrations using Alembic with a Redis distributed lock.
    All workers will wait for the migration to complete before proceeding.
    """
    if redis_client is None:
        # Import here to avoid circular imports
        from config import get_redis_client
        redis_client = get_redis_client()
    
    # Keys for Redis coordination
    lock_name = "alembic_migration_lock"
    status_key = "alembic_migration_status"
    lock_value = f"instance_{time.time()}"
    
    # Check if migrations are already completed
    migration_status = redis_client.get(status_key)
    if migration_status == "completed":
        print("Migrations already completed - continuing startup")
        return True
    
    # Try to acquire the lock - non-blocking
    lock_acquired = redis_client.set(
        lock_name, 
        lock_value,
        nx=True,  # Only set if key doesn't exist
        ex=lock_timeout  # Expiry in seconds
    )
    
    if lock_acquired:
        # This instance will run migrations
        # ...
    else:
        # Another instance is running migrations - wait for completion
        # ...
```

Key points:
- Uses Redis `SET NX EX` for atomic lock acquisition
- Sets a status key to track migration progress
- Implements a waiting mechanism for other instances
- Handles timeouts and error conditions

## 5. Migration Scripts Analysis

### 5.1 Schema Creation Migration

The first migration (`2025_05_04_2310-create_schema.py`) creates the application schema:

```python
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
```

Key points:
- Uses direct SQL execution for schema creation
- Includes `IF NOT EXISTS` for idempotence
- Deliberately omits schema deletion in downgrade to protect data

### 5.2 Data Migration

The second migration (`2025_05_02_2055-migrate_canvas_data.py`) migrates data from old tables to the new schema:

```python
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
    # ...
    
    # Define the new tables in the pad_ws schema with all required columns
    # ...
    
    # Create a session for ORM operations
    session = Session(connection)
    
    try:
        # Dictionary to store user_id -> pad_id mapping for later use with backups
        user_pad_mapping = {}
        
        # Step 1: Process canvas_data if it exists
        # ...
        
        # Step 2: For each canvas_data record, create a new pad
        # ...
        
        # Step 3: Process canvas_backups if it exists
        # ...
        
        # Step 4: For each canvas_backup record, create a new backup
        # ...
        
        # Commit the transaction
        session.commit()
        
    except Exception as e:
        session.rollback()
        logging.error(f"Error during migration: {e}")
        raise
    finally:
        session.close()
```

Key points:
- Checks if source tables exist before attempting migration
- Uses SQLAlchemy Core for table definitions
- Uses a session for transactional integrity
- Implements proper error handling with rollback
- Preserves relationships between migrated data

## 6. Repository Pattern Implementation

### 6.1 Repository Structure

The application uses the Repository pattern to encapsulate database operations:

```python
class PadRepository:
    """Repository for pad-related database operations"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the repository with a database session"""
        self.session = session
    
    async def create(self, owner_id: UUID, display_name: str, data: Dict[str, Any]) -> PadModel:
        """Create a new pad"""
        pad = PadModel(owner_id=owner_id, display_name=display_name, data=data)
        self.session.add(pad)
        await self.session.commit()
        await self.session.refresh(pad)
        return pad
    
    # Other CRUD operations...
```

Key points:
- Each repository is initialized with a session
- Methods are async to support async database operations
- Each method encapsulates a specific database operation
- Methods return domain objects (models) rather than raw data

### 6.2 CRUD Operations

Repositories implement standard CRUD operations:

```python
# Create
async def create(self, owner_id: UUID, display_name: str, data: Dict[str, Any]) -> PadModel:
    """Create a new pad"""
    pad = PadModel(owner_id=owner_id, display_name=display_name, data=data)
    self.session.add(pad)
    await self.session.commit()
    await self.session.refresh(pad)
    return pad

# Read
async def get_by_id(self, pad_id: UUID) -> Optional[PadModel]:
    """Get a pad by ID"""
    stmt = select(PadModel).where(PadModel.id == pad_id)
    result = await self.session.execute(stmt)
    return result.scalars().first()

# Update
async def update(self, pad_id: UUID, data: Dict[str, Any]) -> Optional[PadModel]:
    """Update a pad"""
    stmt = update(PadModel).where(PadModel.id == pad_id).values(**data).returning(PadModel)
    result = await self.session.execute(stmt)
    await self.session.commit()
    return result.scalars().first()

# Delete
async def delete(self, pad_id: UUID) -> bool:
    """Delete a pad"""
    stmt = delete(PadModel).where(PadModel.id == pad_id)
    result = await self.session.execute(stmt)
    await self.session.commit()
    return result.rowcount > 0
```

Key points:
- Uses SQLAlchemy's async API for all operations
- Commits transactions explicitly
- Returns appropriate data types for each operation
- Uses SQLAlchemy's `select`, `update`, and `delete` functions

### 6.3 Query Operations

Repositories also implement query operations:

```python
async def get_by_owner(self, owner_id: UUID) -> List[PadModel]:
    """Get all pads for a specific owner, sorted by created_at timestamp"""
    stmt = select(PadModel).where(PadModel.owner_id == owner_id).order_by(PadModel.created_at)
    result = await self.session.execute(stmt)
    return result.scalars().all()

async def get_by_name(self, owner_id: UUID, display_name: str) -> Optional[PadModel]:
    """Get a pad by owner and display name"""
    stmt = select(PadModel).where(
        PadModel.owner_id == owner_id,
        PadModel.display_name == display_name
    )
    result = await self.session.execute(stmt)
    return result.scalars().first()
```

Key points:
- Uses SQLAlchemy's query API for filtering and sorting
- Returns lists or single objects as appropriate
- Uses `scalars()` to extract model objects from results

## 7. Service Layer Implementation

### 7.1 Service Structure

The application uses a Service layer to implement business logic:

```python
class PadService:
    """Service for pad-related business logic"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the service with a database session"""
        self.session = session
        self.repository = PadRepository(session)
        self.user_repository = UserRepository(session)
    
    # Business logic methods...
```

Key points:
- Each service is initialized with a session
- Services create and use repositories
- Services can use multiple repositories
- Services implement business logic, not just CRUD

### 7.2 Business Logic

Services implement business logic and validation:

```python
async def create_pad(self, owner_id: UUID, display_name: str, data: Dict[str, Any], user_session: "UserSession" = None) -> Dict[str, Any]:
    """Create a new pad"""
    # Validate input
    if not display_name:
        raise ValueError("Display name is required")
    
    if not data:
        raise ValueError("Pad data is required")
    
    # Check if owner exists
    owner = await self.user_repository.get_by_id(owner_id)
    if not owner and user_session:
        # Reaching here is an anomaly, this is a failsafe
        # User should already exist in the database
        
        # Create a UserService instance
        user_service = UserService(self.session)
        
        # Create token data dictionary from UserSession properties
        token_data = {
            "username": user_session.username,
            "email": user_session.email,
            "email_verified": user_session.email_verified,
            "name": user_session.name,
            "given_name": user_session.given_name,
            "family_name": user_session.family_name,
            "roles": user_session.roles
        }
        
        # Use sync_user_with_token_data which handles race conditions
        try:
            await user_service.sync_user_with_token_data(owner_id, token_data)
            # Get the user again to confirm it exists
            owner = await self.user_repository.get_by_id(owner_id)
            if not owner:
                raise ValueError(f"Failed to create user with ID '{owner_id}'")
        except Exception as e:
            print(f"Error creating user as failsafe: {str(e)}")
            raise ValueError(f"Failed to create user with ID '{owner_id}': {str(e)}")
    
    # Create pad
    pad = await self.repository.create(owner_id, display_name, data)
    return pad.to_dict()
```

Key points:
- Validates input before database operations
- Implements complex business logic (e.g., user creation failsafe)
- Handles error conditions with appropriate exceptions
- Returns dictionaries rather than model objects to API clients

### 7.3 Error Handling

Services implement error handling and validation:

```python
async def update_pad(self, pad_id: UUID, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a pad"""
    # Get the pad to check if it exists
    pad = await self.repository.get_by_id(pad_id)
    if not pad:
        raise ValueError(f"Pad with ID '{pad_id}' does not exist")
    
    # Validate display_name if it's being updated
    if 'display_name' in data and not data['display_name']:
        raise ValueError("Display name cannot be empty")
    
    # Update pad
    updated_pad = await self.repository.update(pad_id, data)
    return updated_pad.to_dict() if updated_pad else None
```

Key points:
- Checks for existence before updates
- Validates input data
- Raises specific exceptions for error conditions
- Converts model objects to dictionaries for API responses

## 8. Database Access in API Routes

### 8.1 Dependency Injection

The application uses FastAPI's dependency injection system to provide database access to routes:

```python
# In database.py
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a database session"""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

# Dependency for getting repositories
async def get_user_repository(session: AsyncSession = Depends(get_session)):
    """Get a user repository"""
    from .repository import UserRepository
    return UserRepository(session)

# Dependency for getting services
async def get_user_service(session: AsyncSession = Depends(get_session)):
    """Get a user service"""
    from .service import UserService
    return UserService(session)
```

Key points:
- Uses FastAPI's `Depends` for dependency injection
- Creates a new session for each request
- Properly closes sessions after request completion
- Provides repositories and services as dependencies

### 8.2 Route Implementation

Routes use injected services for database operations:

```python
# Example route in pad_router.py
@router.post("/", response_model=PadResponse)
async def create_pad(
    pad: PadCreate,
    pad_service: PadService = Depends(get_pad_service),
    auth: UserSession = Depends(require_auth)
):
    """Create a new pad"""
    try:
        result = await pad_service.create_pad(
            owner_id=auth.user_id,
            display_name=pad.display_name,
            data=pad.data,
            user_session=auth
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create pad: {str(e)}")
```

Key points:
- Uses injected services for database operations
- Handles exceptions and converts them to HTTP responses
- Uses authentication information from the request
- Returns service results directly to clients

## 9. Distributed Database Operations

### 9.1 Redis-based Coordination

The application uses Redis for distributed coordination:

```python
# Keys for Redis coordination
lock_name = "alembic_migration_lock"
status_key = "alembic_migration_status"
lock_value = f"instance_{time.time()}"

# Try to acquire the lock - non-blocking
lock_acquired = redis_client.set(
    lock_name, 
    lock_value,
    nx=True,  # Only set if key doesn't exist
    ex=lock_timeout  # Expiry in seconds
)
```

Key points:
- Uses Redis `SET NX EX` for atomic lock acquisition
- Sets a unique value to identify the lock owner
- Sets an expiry time to prevent indefinite locks
- Uses status keys to track operation progress

### 9.2 Migration Coordination

The application coordinates migrations across multiple instances:

```python
if lock_acquired:
    print("This instance will run migrations")
    try:
        # Set status to in-progress
        redis_client.set(status_key, "in_progress", ex=lock_timeout)
        
        # Run migrations
        success = await run_migrations_subprocess()
        
        if success:
            # Set status to completed with a longer expiry (1 hour)
            redis_client.set(status_key, "completed", ex=3600)
            print("Migration completed successfully - signaling other instances")
            return True
        else:
            # Set status to failed
            redis_client.set(status_key, "failed", ex=3600)
            print("Migration failed - signaling other instances")
            return False
    finally:
        # Release the lock only if we're the owner
        current_value = redis_client.get(lock_name)
        if current_value == lock_value:
            redis_client.delete(lock_name)
else:
    print("Another instance is running migrations - waiting for completion")
    
    # Wait for the migration to complete
    start_time = time.time()
    while time.time() - start_time < max_wait_time:
        # Check migration status
        status = redis_client.get(status_key)
        
        if status == "completed":
            print("Migrations completed by another instance - continuing startup")
            return True
        elif status == "failed":
            print("Migrations failed in another instance - continuing startup with caution")
            return False
        elif status is None:
            # No status yet, might be a stale lock or not started
            # Check if lock exists
            if not redis_client.exists(lock_name):
                # Lock released but no status - try to acquire the lock ourselves
                print("No active migration lock - attempting to acquire")
                return await run_migrations_with_lock(redis_client, lock_timeout, max_wait_time)
        
        # Wait before checking again
        await asyncio.sleep(1)
```

Key points:
- Sets status keys to track migration progress
- Implements a waiting mechanism for other instances
- Handles timeouts and error conditions
- Releases locks properly in `finally` blocks
- Checks for stale locks and handles recovery

### 9.3 Race Condition Handling

The application handles race conditions in user creation:

```python
async def sync_user_with_token_data(self, user_id: UUID, token_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronize user data with token data.
    This handles race conditions where multiple requests might try to create the same user.
    """
    # Check if user exists
    user = await self.repository.get_by_id(user_id)
    
    if user:
        # User exists, update if needed
        # ...
    else:
        # User doesn't exist, create
        try:
            # Create user
            user = await self.repository.create(
                id=user_id,
                username=token_data.get("username", f"user_{user_id}"),
                email=token_data.get("email", f"user_{user_id}@example.com"),
                email_verified=token_data.get("email_verified", False),
                name=token_data.get("name", ""),
                given_name=token_data.get("given_name", ""),
                family_name=token_data.get("family_name", ""),
                roles=token_data.get("roles", [])
            )
        except Exception as e:
            # Handle race condition - another request might have created the user
            # between our check and create
            if "duplicate key" in str(e).lower():
                # Try to get the user again
                user = await self.repository.get_by_id(user_id)
                if not user:
                    # This shouldn't happen, but just in case
                    raise ValueError(f"Failed to create or retrieve user with ID '{user_id}'")
            else:
                # Some other error
                raise
```

Key points:
- Checks for existence before creation
- Handles race conditions with exception handling
- Retries operations when appropriate
- Uses database constraints for concurrency control

## 10. Best Practices and Patterns

### 10.1 Async Database Access

The application follows these best practices for async database access:

- **Use AsyncSession**: All database operations use `AsyncSession` for non-blocking I/O
- **Explicit Commits**: Transactions are explicitly committed with `await session.commit()`
- **Proper Cleanup**: Sessions are closed in `finally` blocks to ensure cleanup
- **Error Handling**: Exceptions are caught and handled appropriately

### 10.2 Migration Management

The application follows these best practices for migration management:

- **Schema-First Migrations**: Creates the schema explicitly before other operations
- **Distributed Coordination**: Uses Redis for coordinating migrations across instances
- **Idempotent Operations**: Uses `IF NOT EXISTS` for schema creation
- **Safe Downgrade**: Avoids destructive operations in downgrade functions
- **Descriptive Naming**: Uses date and time in migration filenames
- **Transaction Management**: Wraps migrations in transactions for atomicity

### 10.3 Error Handling

The application implements robust error handling:

- **Service Layer Validation**: Validates input before database operations
- **Specific Exceptions**: Raises specific exceptions for different error conditions
- **HTTP Status Codes**: Maps exceptions to appropriate HTTP status codes
- **Transaction Rollback**: Rolls back transactions on error
- **Logging**: Logs errors for debugging and monitoring

### 10.4 Repository Pattern

The application follows the Repository pattern for database access:

- **Separation of Concerns**: Separates database access from business logic
- **Testability**: Makes it easy to mock repositories for testing
- **Reusability**: Allows reusing repository methods across services
- **Encapsulation**: Encapsulates database operations behind a clean API
- **Type Safety**: Uses type hints for better IDE support and error detection

### 10.5 Service Layer

The application implements a Service layer for business logic:

- **Business Logic Encapsulation**: Encapsulates business logic in services
- **Transaction Management**: Manages transactions at the service level
- **Input Validation**: Validates input before database operations
- **Error Handling**: Handles errors and provides meaningful messages
- **Domain Logic**: Implements domain-specific logic separate from repositories

### 10.6 Dependency Injection

The application uses dependency injection for database access:

- **Session Management**: Provides sessions via dependency injection
- **Repository Injection**: Injects repositories into services
- **Service Injection**: Injects services into routes
- **Testability**: Makes it easy to mock dependencies for testing
- **Lifecycle Management**: Manages session lifecycle automatically
