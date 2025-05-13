import os
import json
from contextlib import asynccontextmanager
from typing import Optional

import posthog
from fastapi import FastAPI, Request, Depends
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from config import STATIC_DIR, ASSETS_DIR, POSTHOG_API_KEY, POSTHOG_HOST, redis_client, redis_pool
from dependencies import UserSession, optional_auth
from routers.auth_router import auth_router
from routers.users_router import users_router
from routers.workspace_router import workspace_router
from routers.pad_router import pad_router
from routers.app_router import app_router

# Initialize PostHog if API key is available
if POSTHOG_API_KEY:
    posthog.project_api_key = POSTHOG_API_KEY
    posthog.host = POSTHOG_HOST

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Initialize database
    await init_db()
    print("Database connection established successfully")
    
    redis_client.ping()
    print("Redis connection established successfully")
    
    yield
    
    # Clean up connections when shutting down
    try:
        redis_pool.disconnect()
        print("Redis connections closed")
    except Exception as e:
        print(f"Error closing Redis connections: {str(e)}")

app = FastAPI(lifespan=lifespan)

# CORS middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def read_root(request: Request, auth: Optional[UserSession] = Depends(optional_auth)):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

# Include routers in the main app with the /api prefix
app.include_router(auth_router, prefix="/api/auth")
app.include_router(users_router, prefix="/api/users")
app.include_router(workspace_router, prefix="/api/workspace")
app.include_router(pad_router, prefix="/api/pad")
app.include_router(app_router, prefix="/api/app")
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
