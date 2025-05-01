import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, Depends
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import posthog

load_dotenv()

POSTHOG_API_KEY = os.environ.get("VITE_PUBLIC_POSTHOG_KEY")
POSTHOG_HOST = os.environ.get("VITE_PUBLIC_POSTHOG_HOST")

if POSTHOG_API_KEY:
    posthog.project_api_key = POSTHOG_API_KEY
    posthog.host = POSTHOG_HOST

from db import init_db
from config import STATIC_DIR, ASSETS_DIR
from dependencies import SessionData, optional_auth
from routers.auth import auth_router
from routers.canvas import canvas_router
from routers.user import user_router
from routers.workspace import workspace_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    print("Database connection established successfully")
    yield

app = FastAPI(lifespan=lifespan)

# CORS middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://kc.pad.ws", "https://alex.pad.ws"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def read_root(request: Request, auth: Optional[SessionData] = Depends(optional_auth)):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

# Include routers in the main app with the /api prefix
app.include_router(auth_router, prefix="/auth")
app.include_router(canvas_router, prefix="/api/canvas")
app.include_router(user_router, prefix="/api/user")
app.include_router(workspace_router, prefix="/api/workspace")
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
