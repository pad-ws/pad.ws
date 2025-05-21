import os
import json
from contextlib import asynccontextmanager
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

import posthog
from fastapi import FastAPI, Request, Depends
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db, engine
from config import (
    STATIC_DIR, ASSETS_DIR, POSTHOG_API_KEY, POSTHOG_HOST, 
)
from cache import RedisClient
from dependencies import UserSession, optional_auth
from routers.auth_router import auth_router
from routers.users_router import users_router
from routers.workspace_router import workspace_router
from routers.pad_router import pad_router
from routers.app_router import app_router
from routers.ws_router import ws_router
from database.database import get_session
from database.models.user_model import UserStore
from domain.pad import Pad

# Initialize PostHog if API key is available
if POSTHOG_API_KEY:
    posthog.project_api_key = POSTHOG_API_KEY
    posthog.host = POSTHOG_HOST

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Initialize database
    await init_db()
    print("Database connection established successfully")
    
    # Initialize Redis client and verify connection
    redis = await RedisClient.get_instance()
    await redis.ping()
    print("Redis connection established successfully")
    
    
    yield
    
    # Clean up connections when shutting down
    await redis.close()
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")



@app.get("/pad/{pad_id}")
async def read_pad(
    pad_id: UUID,
    request: Request,
    user: Optional[UserSession] = Depends(optional_auth),
    session: AsyncSession = Depends(get_session)
):
    if not user:
        print("No user found")
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
        
    try:

        pad = await Pad.get_by_id(session, pad_id)
        if not pad:
            print("No pad found")
            return FileResponse(os.path.join(STATIC_DIR, "index.html"))
            
        # Check access permissions
        if not pad.can_access(user.id):
            print("No access to pad")
            return FileResponse(os.path.join(STATIC_DIR, "index.html"))
            
        # Add pad to user's open pads if not already there
        user_store = await UserStore.get_by_id(session, user.id)
        if user_store:
            # Convert all UUIDs to strings for comparison
            open_pads_str = [str(pid) for pid in user_store.open_pads]
            if str(pad_id) not in open_pads_str:
                # Convert back to UUIDs for storage
                user_store.open_pads = [UUID(pid) for pid in open_pads_str] + [pad_id]
                try:
                    await user_store.save(session)
                except Exception as e:
                    print(f"Error updating user's open pads: {e}")
                    # Continue even if update fails - don't block pad access
        
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
    except Exception as e:
        print(f"Error in read_pad endpoint: {e}")
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/")
async def read_root(request: Request, auth: Optional[UserSession] = Depends(optional_auth)):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

app.include_router(auth_router, prefix="/api/auth")
app.include_router(users_router, prefix="/api/users")
app.include_router(workspace_router, prefix="/api/workspace")
app.include_router(pad_router, prefix="/api/pad")
app.include_router(app_router, prefix="/api/app")
app.include_router(ws_router)
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
