import secrets
import jwt
import httpx
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
import os

from config import get_auth_url, get_token_url, OIDC_CONFIG, set_session, delete_session, STATIC_DIR, get_session
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
    logout_url = f"{OIDC_CONFIG['server_url']}/realms/{OIDC_CONFIG['realm']}/protocol/openid-connect/logout"
    redirect_uri = OIDC_CONFIG['frontend_url']  # Match the frontend redirect URI
    full_logout_url = f"{logout_url}?id_token_hint={id_token}&post_logout_redirect_uri={redirect_uri}"
    
    # Create a redirect response to Keycloak's logout endpoint
    response = JSONResponse({"status": "success", "logout_url": full_logout_url})
    
    return response
