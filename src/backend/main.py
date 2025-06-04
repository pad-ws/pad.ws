import os
import json
from contextlib import asynccontextmanager
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

import posthog
import httpx
from fastapi import FastAPI, Request, Depends, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db, engine
from config import (
    STATIC_DIR, ASSETS_DIR, POSTHOG_API_KEY, POSTHOG_HOST, 
    PAD_DEV_MODE, DEV_FRONTEND_URL
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
from workers.canvas_worker import CanvasWorker
from domain.user import User

# Initialize PostHog if API key is available
if POSTHOG_API_KEY:
    posthog.project_api_key = POSTHOG_API_KEY
    posthog.host = POSTHOG_HOST

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage the lifecycle of the application and its services."""
    
    if PAD_DEV_MODE:
        print("Starting in dev mode")

    # Initialize database
    await init_db()
    print("Database connection established successfully")
    
    # Initialize Redis client and verify connection
    redis = await RedisClient.get_instance()
    print("Redis connection established successfully")
    
    # Initialize the canvas worker
    canvas_worker = await CanvasWorker.get_instance()
    print("Canvas worker started successfully")
    
    yield
    
    await CanvasWorker.shutdown_instance()
    await RedisClient.close()
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

async def serve_index_html(request: Request = None, response: Response = None, pad_id: Optional[UUID] = None):
    """
    Helper function to serve the index.html file or proxy to dev server based on PAD_DEV_MODE.
    Optionally sets a pending_pad_id cookie if pad_id is provided.
    """
    
    if PAD_DEV_MODE:
        try:
            # Proxy the request to the development server's root URL
            url = f"{DEV_FRONTEND_URL}/"
            # If request path is available, use it for proxying
            if request and str(request.url).replace(str(request.base_url), ""):
                url = f"{DEV_FRONTEND_URL}{request.url.path}"
            
            async with httpx.AsyncClient() as client:
                proxy_response = await client.get(url)
                # Create a new response with the proxied content
                final_response = Response(
                    content=proxy_response.content,
                    status_code=proxy_response.status_code,
                    media_type=proxy_response.headers.get("content-type")
                )
                
                # Set cookie if pad_id is provided
                if pad_id is not None:
                    final_response.set_cookie(
                        key="pending_pad_id",
                        value=str(pad_id),
                        httponly=True,
                        secure=True,
                        samesite="lax"
                    )
                
                return final_response
        except Exception as e:
            error_message = f"Error proxying to dev server: {e}"
            print(error_message)
            return Response(content=error_message, status_code=500)
    else:
        # For production, serve the static build
        file_response = FileResponse(os.path.join(STATIC_DIR, "index.html"))
        
        # Set cookie if pad_id is provided
        if pad_id is not None:
            file_response.set_cookie(
                key="pending_pad_id",
                value=str(pad_id),
                httponly=True,
                secure=True,
                samesite="lax"
            )
        
        return file_response

@app.get("/pad/{pad_id}")
async def read_pad(
    pad_id: UUID,
    request: Request,
    response: Response,
    user: Optional[UserSession] = Depends(optional_auth),
    session: AsyncSession = Depends(get_session)
):
    if not user:
        return await serve_index_html(request, response, pad_id)
        
    try:
        pad = await Pad.get_by_id(session, pad_id)
        if not pad:
            print("No pad found")
            return await serve_index_html(request, response)
            
        if not pad.can_access(user.id):
            print("No access to pad")
            return await serve_index_html(request, response)
            
        # Just serve the page if user has access
        return await serve_index_html(request, response, pad_id)
    except Exception as e:
        print(f"Error in read_pad endpoint: {e}")
        return await serve_index_html(request, response, pad_id)

@app.get("/")
async def read_root(request: Request, auth: Optional[UserSession] = Depends(optional_auth)):
    return await serve_index_html(request)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(users_router, prefix="/api/users")
app.include_router(workspace_router, prefix="/api/workspace")
app.include_router(pad_router, prefix="/api/pad")
app.include_router(app_router, prefix="/api/app")
app.include_router(ws_router)
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
