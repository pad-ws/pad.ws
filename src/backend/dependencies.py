import jwt
from typing import Optional, Dict, Any

from fastapi import Request, HTTPException, Depends

from config import get_session, is_token_expired, refresh_token
from database import get_user_service
from database.service import UserService

class SessionData:
    def __init__(self, access_token: str, token_data: dict):
        self.access_token = access_token
        self.token_data = token_data

class AuthDependency:
    def __init__(self, auto_error: bool = True):
        self.auto_error = auto_error

    async def __call__(self, request: Request) -> Optional[SessionData]:
        session_id = request.cookies.get('session_id')
        
        if not session_id:
            if self.auto_error:
                raise HTTPException(
                    status_code=401,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return None
            
        session = get_session(session_id)
        if not session:
            if self.auto_error:
                raise HTTPException(
                    status_code=401,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return None
            
        # Check if token is expired and refresh if needed
        if is_token_expired(session):
            # Try to refresh the token
            success, new_session = await refresh_token(session_id, session)
            if not success:
                # Token refresh failed, user needs to re-authenticate
                if self.auto_error:
                    raise HTTPException(
                        status_code=401,
                        detail="Session expired",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                return None
            # Use the refreshed token data
            session = new_session
            
        return SessionData(
            access_token=session.get('access_token'),
            token_data=session
        )

# Create instances for use in route handlers
require_auth = AuthDependency(auto_error=True)
optional_auth = AuthDependency(auto_error=False)

# JWT token handling dependencies
async def get_decoded_token(
    auth: SessionData = Depends(require_auth)
) -> Dict[str, Any]:

    token_data = auth.token_data
    access_token = token_data.get("access_token")

    return jwt.decode(access_token, options={"verify_signature": False})


async def get_current_user(
    decoded_token: Dict[str, Any] = Depends(get_decoded_token),
    user_service: UserService = Depends(get_user_service),
) -> Dict[str, Any]:

    user_id = decoded_token["sub"]
    user_info = await user_service.get_user(user_id)

    if not user_info:
        try:
            user_info = await user_service.create_user(
                user_id=user_id,
                username=decoded_token["preferred_username"],
                email=decoded_token["email"],
                email_verified=decoded_token["email_verified"],
                name=decoded_token["name"],
            given_name=decoded_token["given_name"],
            family_name=decoded_token["family_name"],
                roles=decoded_token["realm_access"]["roles"],
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error creating user: {e}"
            )
    
    return user_info


async def require_admin(
    decoded_token: Dict[str, Any] = Depends(get_decoded_token)
) -> bool:

    roles = decoded_token.get("realm_access", {}).get("roles", [])

    if "admin" not in roles:
        raise HTTPException(
            status_code=403, 
            detail=f"Admin privileges required"
        )
    
    return True
