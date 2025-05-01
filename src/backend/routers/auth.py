import secrets
import jwt
import httpx
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, FileResponse
import os

from config import get_auth_url, get_token_url, OIDC_CONFIG, set_session, delete_session, STATIC_DIR
from dependencies import SessionData, require_auth
from coder import CoderAPI

auth_router = APIRouter()
coder_api = CoderAPI()

@auth_router.get("/login")
async def login(request: Request, kc_idp_hint: str = None, popup: str = None):
    session_id = secrets.token_urlsafe(32)
    auth_url = get_auth_url()
    state = "popup" if popup == "1" else "default"
    if kc_idp_hint:
        auth_url = f"{auth_url}&kc_idp_hint={kc_idp_hint}"
    # Add state param to OIDC URL
    auth_url = f"{auth_url}&state={state}"
    response = RedirectResponse(auth_url)
    response.set_cookie('session_id', session_id)

    return response

@auth_router.get("/callback")
async def callback(request: Request, code: str, state: str = "default"):
    session_id = request.cookies.get('session_id')
    if not session_id:
        raise HTTPException(status_code=400, detail="No session")
    
    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            get_token_url(),
            data={
                'grant_type': 'authorization_code',
                'client_id': OIDC_CONFIG['client_id'],
                'client_secret': OIDC_CONFIG['client_secret'],
                'code': code,
                'redirect_uri': OIDC_CONFIG['redirect_uri']
            }
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Auth failed")
        
        token_data = token_response.json()
        set_session(session_id, token_data)
        access_token = token_data['access_token']
        user_info = jwt.decode(access_token, options={"verify_signature": False})
        
        try:
            user_data, _ = coder_api.ensure_user_exists(
                user_info
            )
            coder_api.ensure_workspace_exists(user_data['username'])
        except Exception as e:
            print(f"Error in user/workspace setup: {str(e)}")
            # Continue with login even if Coder API fails

    if state == "popup":
        return FileResponse(os.path.join(STATIC_DIR, "auth/popup-close.html"))
    else:
        return RedirectResponse('/')

@auth_router.get("/logout")
async def logout(request: Request):
    session_id = request.cookies.get('session_id')
    if session_id:
        delete_session(session_id)
    
    # Create a response that doesn't redirect but still clears the cookie
    from fastapi.responses import JSONResponse
    response = JSONResponse({"status": "success", "message": "Logged out successfully"})
    
    # Clear the session_id cookie with all necessary parameters
    response.delete_cookie(
        key="session_id",
        path="/",
        domain=None,  # Use None to match the current domain
        secure=request.url.scheme == "https",
        httponly=True
    )
    
    return response
