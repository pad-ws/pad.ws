# Pad.ws Developer Onboarding Guide

## Project Overview

Pad.ws is an innovative project that combines a whiteboard canvas with cloud development environments, delivering an "IDE-in-a-whiteboard" experience. The system allows users to seamlessly transition between visual thinking (drawing, diagramming) and coding directly in the browser.

### Key Features

- **Interactive Whiteboard**: Built on a fork of Excalidraw for drawing and visualizing ideas
- **Cloud Development Environment**: Complete development environment accessible from the browser
- **Seamless Workflow**: Switch between ideation and coding in a single interface
- **Collaboration**: Support for collaborative work with backup and versioning

## Architecture Overview

The system follows a microservices architecture with the following components:

```
                        ┌─────────────┐
                        │   Client    │
                        │  (Browser)  │
                        └──────┬──────┘
                               │
                               ▼
┌────────────────────────────────────────────────┐
│              FastAPI Backend App               │
│                                                │
│  ┌─────────────┐    ┌────────────────────┐    │
│  │ Static File │    │  API Controllers   │    │
│  │   Serving   │    │  (routers/*.py)    │    │
│  │ (Excalidraw)│    └────────────────────┘    │
│  └─────────────┘               │              │
└─────────────────────────┬──────┼──────────────┘
                          │      │
                          │      │
            ┌─────────────▼──────▼──────────────┐
            │            Services               │
            │                                   │
┌───────────▼───────┐  ┌─────────▼────────┐  ┌─▼───────────────┐
│     Database      │  │     Keycloak     │  │      Coder      │
│    (PostgreSQL)   │  │   (Auth/OIDC)    │  │   (Dev Envs)    │
└───────────────────┘  └──────────────────┘  └──────────────────┘
         │                      │                     │
         │                      │                     │
         ▼                      ▼                     ▼
┌────────────────┐   ┌────────────────┐    ┌────────────────┐
│   Pad Data &   │   │  User Auth &   │    │ Dev Container  │
│    Backups     │   │  Sessions      │    │  Environments  │
└────────────────┘   └────────────────┘    └────────────────┘
```

### Core Components

1. **FastAPI Backend**
   - Serves the frontend (Excalidraw fork)
   - Handles API requests for pad management
   - Manages authentication flow with Keycloak
   - Interfaces with Coder API for workspace management

2. **PostgreSQL Database**
   - Stores user data, pad content, and backups
   - Shared with Keycloak and Coder for their data

3. **Redis**
   - Manages user sessions
   - Provides caching for performance

4. **Keycloak**
   - Provides OIDC authentication
   - Manages user accounts and roles

5. **Coder**
   - Provisions and manages cloud development environments
   - Accessed through the pad's interface

## Code Structure

The repository is structured as follows:

### Backend (`/backend` directory)

```
backend/
├── coder.py               # Coder API integration
├── config.py              # Configuration and environment variables
├── dependencies.py        # FastAPI dependencies
├── main.py                # Application entry point
├── requirements.txt       # Python dependencies
├── database/              # Database models and operations
│   ├── database.py        # Database connection
│   ├── models/            # SQLAlchemy models
│   ├── repository/        # Data access layer
│   └── service/           # Business logic layer
├── routers/               # API routes
│   ├── app_router.py      # General app routes
│   ├── auth_router.py     # Authentication routes
│   ├── pad_router.py      # Pad management routes
│   └── workspace_router.py # Coder workspace routes
└── templates/             # Default pad templates
```

### Key Classes and Components

#### Auth Flow

1. Users authenticate via Keycloak OIDC
2. Session tokens are stored in Redis
3. The `UserSession` class in `dependencies.py` provides access to user information
4. The `auth_router.py` handles login, callback, and logout endpoints

#### Pad Management

1. `PadModel` represents a canvas instance
2. `BackupModel` stores point-in-time backups of pads
3. `TemplatePadModel` provides reusable templates for new pads
4. The Repository pattern is used for data access
5. Service classes implement business logic

#### Coder Integration

The `coder.py` module handles:
1. User management in Coder
2. Workspace creation and provisioning
3. Workspace state management (start/stop)

## Database Schema

The database uses a schema called `pad_ws` with the following tables:

1. **users** - Stores user information
   - Synced with Keycloak user data

2. **pads** - Stores canvas/pad data
   - Each pad belongs to a user
   - Contains the complete state of the canvas

3. **backups** - Stores point-in-time backups of pads
   - Automatically created based on time intervals
   - Limited to a maximum number per user

4. **template_pads** - Stores reusable templates
   - Used when creating new pads

## Development Workflow

1. The FastAPI app serves the Excalidraw frontend at the root route
2. Users interact with the whiteboard interface
3. Canvas data is periodically saved to the backend
4. When a user accesses development features, their Coder workspace is started
5. The UI integrates the dev environment within the whiteboard

## Getting Started

1. Follow the self-hosting instructions in the README to set up the development environment
2. The `.env` file contains configuration for all services
3. For local development, you can use `docker-compose` to run the dependencies (PostgreSQL, Redis, Keycloak, Coder)
4. Run the FastAPI app with `uvicorn main:app --reload` for local development

## Key APIs and Endpoints

- `/auth/*` - Authentication endpoints
- `/api/pad/*` - Canvas/pad management
- `/api/workspace/*` - Coder workspace management
- `/api/users/*` - User management
- `/api/templates/*` - Template management

## Additional Resources

- Excalidraw documentation: https://github.com/excalidraw/excalidraw
- Coder documentation: https://coder.com/docs/
- FastAPI documentation: https://fastapi.tiangolo.com/
- SQLAlchemy documentation: https://docs.sqlalchemy.org/
