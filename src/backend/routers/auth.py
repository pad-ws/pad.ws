import secrets
import jwt
import httpxaaqqqqaaqqaqqa
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse

from config import get_auth_url, get_token_url, OIDC_CONFIG, sessions
from dependencies import SessionData, require_auth
from coder import CoderAPI

auth_router = APIRouter()
coder_api = CoderAPI()

@auth_router.get("/login")
async def login(request: Request, kc_idp_hint: str = None):
    session_id = secrets.token_urlsafe(32)
    auth_url = get_auth_url()
    if kc_idp_hint:
        auth_url = f"{auth_url}&kc_idp_hint={kc_idp_hint}"
    response = RedirectResponse(auth_url)
    response.set_cookie('session_id', session_id)

    return response

@auth_router.get("/callback")
async def callback(request: Request, code: str):
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
        
        sessions[session_id] = token_response.json()
        access_token = token_response.json()['access_token']
        user_info = jwt.decode(access_token, options={"verify_signature": False})
        
        try:
            user_data, _ = coder_api.ensure_user_exists(
                user_info
            )
            coder_api.ensure_workspace_exists(user_data['username'])
            
                
        except Exception as e:
            print(f"Error in user/workspace setup: {str(e)}")
            # Continue with login even if Coder API fails
    
    return RedirectResponse('/')

@auth_router.get("/logout")
async def logout(request: Request):
    session_id = request.cookies.get('session_id')
    if session_id in sessions:
        del sessions[session_id]
    response = RedirectResponse('/')
    response.delete_cookie('session_id')
    return response
