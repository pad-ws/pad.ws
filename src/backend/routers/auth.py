import secrets
import httpx
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import RedirectResponse, FileResponse
import os
import jwt

from config import (
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_CONFIG,
    STATIC_DIR,
    get_auth_url,
    sessions,
)
from coder import CoderAPI

auth_router = APIRouter()
coder_api = CoderAPI()


@auth_router.get("/login-old")
async def login(request: Request, kc_idp_hint: str = None, popup: str = None):
    session_id = secrets.token_urlsafe(32)
    auth_url = get_auth_url()
    state = "popup" if popup == "1" else "default"
    if kc_idp_hint:
        auth_url = f"{auth_url}&kc_idp_hint={kc_idp_hint}"
    # Add state param to OIDC URL
    auth_url = f"{auth_url}&state={state}"
    response = RedirectResponse(auth_url)
    response.set_cookie("session_id", session_id)


@auth_router.get("/login")
async def newLogin(request: Request, popup: str = None):
    session_id = secrets.token_urlsafe(32)
    state = "popup" if popup == "1" else "default"
    responseParams = {
        "client_id": OIDC_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": request.base_url._url + "auth/callback",
        "scope": "openid profile email offline_access",
        "state": state,
    }
    authorization_url = OIDC_CONFIG["authorization_endpoint"]
    authorization_url += "?" + "&".join(
        f"{key}={value}" for key, value in responseParams.items()
    )
    response = RedirectResponse(authorization_url)
    response.set_cookie("session_id", session_id)
    return response


@auth_router.get("/callback")
async def callback(request: Request, code: str, state: str = "default"):
    session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="No session")

    # Exchange authorization code for access token
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OIDC_CONFIG["token_endpoint"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": request.base_url._url + "auth/callback",
                "client_id": OIDC_CLIENT_ID,
                "client_secret": OIDC_CLIENT_SECRET,
            },
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid token request",
            )

        response_data = response.json()

        sessions[session_id] = response_data
        access_token = response_data["access_token"]
        user_info = jwt.decode(
            access_token, options={"verify_signature": False}
        )

        try:
            user_data, _ = coder_api.ensure_user_exists(user_info)
            coder_api.ensure_workspace_exists(user_data["username"])
        except Exception as e:
            print(f"Error in user/workspace setup: {str(e)}")
            # Continue with login even if Coder API fails

        if state == "popup":
            return FileResponse(
                os.path.join(STATIC_DIR or "", "auth/popup-close.html")
            )
        else:
            return RedirectResponse("/api/user/me")


@auth_router.get("/logout")
async def logout(request: Request):
    session_id = request.cookies.get("session_id")
    
    if OIDC_CONFIG["end_session_endpoint"]:
        end_session_url = OIDC_CONFIG["end_session_endpoint"]
        params = {
            "id_token_hint": sessions[session_id]["id_token"],
            "post_logout_redirect_uri": request.base_url._url,
        }
        
        end_session_url += "?" + "&".join(
            f"{key}={value}" for key, value in params.items()
        )


    if session_id in sessions:
        del sessions[session_id]
        
    response = RedirectResponse(end_session_url)
    

    # Clear the session_id cookie with all necessary parameters
    response.delete_cookie(
        key="session_id",
        path="/",
        domain=None,  # Use None to match the current domain
        secure=request.url.scheme == "https",
        httponly=True,
    )
    
    return response
