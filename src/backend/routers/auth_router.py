import secrets
import jwt
import httpx
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
import os
from typing import Optional
import time

from config import (FRONTEND_URL, STATIC_DIR)
from dependencies import get_coder_api, session
from coder import CoderAPI
from dependencies import optional_auth, UserSession

auth_router = APIRouter()

@auth_router.get("/login")
async def login(request: Request, kc_idp_hint: str = None, popup: str = None):
    
    session_id = secrets.token_urlsafe(32)

    auth_url = session.get_auth_url()
    state = "popup" if popup == "1" else "default"

    if kc_idp_hint:
        auth_url = f"{auth_url}&kc_idp_hint={kc_idp_hint}"

    # Add state param to OIDC URL
    auth_url = f"{auth_url}&state={state}"

    response = RedirectResponse(auth_url)
    response.set_cookie('session_id', session_id)

    return response

@auth_router.get("/callback")
async def callback(
    request: Request, 
    code: str, 
    state: str = "default",
    coder_api: CoderAPI = Depends(get_coder_api)
):
    session_id = request.cookies.get('session_id')
    if not session_id:
        raise HTTPException(status_code=400, detail="No session")
    
    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            session.get_token_url(),
            data={
                'grant_type': 'authorization_code',
                'client_id': session.oidc_config['client_id'],
                'client_secret': session.oidc_config['client_secret'],
                'code': code,
                'redirect_uri': session.oidc_config['redirect_uri']
            }
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Auth failed")
        
        token_data = token_response.json()
        expiry = token_data['refresh_expires_in']
        session.set(session_id, token_data, expiry)
        session.track_event(session_id, 'login')
        
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
    
    session_data = session.get(session_id)
    if not session_data:
        return RedirectResponse('/')
    
    id_token = session_data.get('id_token', '')
    
    # Track logout event before deleting session
    session.track_event(session_id, 'logout')
    
    # Delete the session from Redis
    session.delete(session_id)
    
    # Create the Keycloak logout URL with redirect back to our app
    logout_url = f"{session.oidc_config['server_url']}/realms/{session.oidc_config['realm']}/protocol/openid-connect/logout"
    full_logout_url = f"{logout_url}?id_token_hint={id_token}&post_logout_redirect_uri={FRONTEND_URL}"
    
    # Create a response with the logout URL and clear the session cookie
    response = JSONResponse({"status": "success", "logout_url": full_logout_url})
    response.delete_cookie(
        key="session_id",
        path="/",
        secure=True,
        httponly=True,
        samesite="lax"
    )
    
    return response

@auth_router.get("/status")
async def auth_status(
    user_session: Optional[UserSession] = Depends(optional_auth)
):
    """Check if the user is authenticated and return session information"""
    if not user_session:
        return JSONResponse({
            "authenticated": False,
            "message": "Not authenticated"
        })
    
    try:
        expires_in = user_session.token_data.get('exp') - time.time()
        
        return JSONResponse({
            "authenticated": True,
            "user": {
                "username": user_session.username,
                "email": user_session.email,
                "name": user_session.name
            },
            "expires_in": expires_in
        })
    except Exception as e:
        return JSONResponse({
            "authenticated": False,
            "message": f"Error processing session: {str(e)}"
        })

@auth_router.post("/refresh")
async def refresh_session(request: Request):
    """Refresh the current session's access token"""
    session_id = request.cookies.get('session_id')
    if not session_id:
        raise HTTPException(status_code=401, detail="No session found")
    
    session_data = session.get(session_id)
    if not session_data:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Try to refresh the token
    success, new_session = await session.refresh_token(session_id, session_data)
    if not success:
        raise HTTPException(status_code=401, detail="Failed to refresh session")
    
    # Return the new expiry time
    return JSONResponse({
        "expires_in": new_session.get('expires_in'),
        "authenticated": True
    })