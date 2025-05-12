import secrets
import jwt
import httpx
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
import os
from datetime import datetime

from config import (get_auth_url, get_token_url, set_session, delete_session, get_session, 
                    FRONTEND_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_SERVER_URL, OIDC_REALM, OIDC_REDIRECT_URI, STATIC_DIR)
from dependencies import get_coder_api
from coder import CoderAPI

auth_router = APIRouter()

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
async def callback(
    request: Request, 
    code: str, 
    state: str = "default",
    coder_api: CoderAPI = Depends(get_coder_api)
):
    session_id = request.cookies.get('session_id')
    if not session_id:
        print("No session ID found")
        raise HTTPException(status_code=400, detail="No session")
    
    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            get_token_url(),
            data={
                'grant_type': 'authorization_code',
                'client_id': OIDC_CLIENT_ID,
                'client_secret': OIDC_CLIENT_SECRET,
                'code': code,
                'redirect_uri': OIDC_REDIRECT_URI
            }
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Auth failed")
        
        token_data = token_response.json()
        expiry = token_data['expires_in']
        set_session(session_id, token_data, expiry)
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
    
    session_data = get_session(session_id)
    if not session_data:
        return RedirectResponse('/')
    
    id_token = session_data.get('id_token', '')
    
    # Delete the session from Redis
    delete_session(session_id)
    
    # Create the Keycloak logout URL with redirect back to our app
    logout_url = f"{OIDC_SERVER_URL}/realms/{OIDC_REALM}/protocol/openid-connect/logout"
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
async def auth_status(request: Request):
    """Check if the user is authenticated and return session information"""
    session_id = request.cookies.get('session_id')
    
    if not session_id:
        return JSONResponse({
            "authenticated": False,
            "message": "No session found"
        })
    
    session_data = get_session(session_id)
    if not session_data:
        return JSONResponse({
            "authenticated": False,
            "message": "Invalid session"
        })
    
    # Decode the access token to get user info
    try:
        access_token = session_data.get('access_token')
        if not access_token:
            return JSONResponse({
                "authenticated": False,
                "message": "No access token found"
            })
            
        user_info = jwt.decode(access_token, options={"verify_signature": False})
        
        return JSONResponse({
            "authenticated": True,
            "user": {
                "username": user_info.get('preferred_username'),
                "email": user_info.get('email'),
                "name": user_info.get('name')
            },
            "expires_in": session_data.get('expires_in')
        })
    except Exception as e:
        return JSONResponse({
            "authenticated": False,
            "message": f"Error decoding token: {str(e)}"
        })
