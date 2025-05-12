import jwt
from typing import Optional, Dict, Any
from uuid import UUID

from fastapi import Request, HTTPException

from config import get_session, is_token_expired, refresh_token
from database.service import UserService
from coder import CoderAPI

class UserSession:
    """
    Unified user session model that integrates authentication data with user information.
    This provides a single interface for accessing both token data and user details.
    """
    def __init__(self, access_token: str, token_data: dict, user_id: UUID = None):
        self.access_token = access_token
        self._user_data = None

        # Get the signing key and decode with verification
        from config import get_jwks_client, OIDC_CLIENT_ID
        try:
            jwks_client = get_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(access_token)
            
            self.token_data = jwt.decode(
                access_token,
                signing_key.key,
                algorithms=["RS256"],
                audience=OIDC_CLIENT_ID
            )

        except jwt.InvalidTokenError as e:
            # Log the error and raise an appropriate exception
            print(f"Invalid token: {str(e)}")
            raise ValueError(f"Invalid authentication token: {str(e)}")
        
    @property
    def is_authenticated(self) -> bool:
        """Check if the session is authenticated"""
        return bool(self.access_token and self.id)
    
    @property
    def id(self) -> UUID:
        """Get user ID from token data"""
        return UUID(self.token_data.get("sub"))
    
    @property
    def email(self) -> str:
        """Get user email from token data"""
        return self.token_data.get("email", "")
    
    @property
    def email_verified(self) -> bool:
        """Get email verification status from token data"""
        return self.token_data.get("email_verified", False)
    
    @property
    def username(self) -> str:
        """Get username from token data"""
        return self.token_data.get("preferred_username", "")
    
    @property
    def name(self) -> str:
        """Get full name from token data"""
        return self.token_data.get("name", "")
    
    @property
    def given_name(self) -> str:
        """Get given name from token data"""
        return self.token_data.get("given_name", "")
    
    @property
    def family_name(self) -> str:
        """Get family name from token data"""
        return self.token_data.get("family_name", "")
    
    @property
    def roles(self) -> list:
        """Get user roles from token data"""
        return self.token_data.get("realm_access", {}).get("roles", [])
    
    @property
    def is_admin(self) -> bool:
        """Check if user has admin role"""
        return "admin" in self.roles
    
    async def get_user_data(self, user_service: UserService) -> Dict[str, Any]:
        """Get user data from database, caching the result"""
        if self._user_data is None and self.id:
            self._user_data = await user_service.get_user(self.id)
        return self._user_data

class AuthDependency:
    """
    Authentication dependency that validates session tokens and provides
    a unified UserSession object for route handlers.
    """
    def __init__(self, auto_error: bool = True, require_admin: bool = False):
        self.auto_error = auto_error
        self.require_admin = require_admin

    async def __call__(self, request: Request) -> Optional[UserSession]:
        # Get session ID from cookies
        session_id = request.cookies.get('session_id')
        
        # Handle missing session ID
        if not session_id:
            return self._handle_auth_error("Not authenticated")
            
        # Get session data from Redis
        session = get_session(session_id)
        if not session:
            return self._handle_auth_error("Not authenticated")
            
        # Handle token expiration
        if is_token_expired(session):
            # Try to refresh the token
            success, new_session = await refresh_token(session_id, session)
            if not success:
                return self._handle_auth_error("Session expired")
            session = new_session
        
        # Create user session object
        user_session = UserSession(
            access_token=session.get('access_token'),
            token_data=session
        )
        
        # Check admin requirement if specified
        if self.require_admin and not user_session.is_admin:
            return self._handle_auth_error("Admin privileges required", status_code=403)
            
        return user_session
        
    def _handle_auth_error(self, detail: str, status_code: int = 401) -> Optional[None]:
        """Handle authentication errors based on auto_error setting"""
        if self.auto_error:
            headers = {"WWW-Authenticate": "Bearer"} if status_code == 401 else None
            raise HTTPException(
                status_code=status_code,
                detail=detail,
                headers=headers,
            )
        return None

# Create dependency instances for use in route handlers
require_auth = AuthDependency(auto_error=True)
optional_auth = AuthDependency(auto_error=False)
require_admin = AuthDependency(auto_error=True, require_admin=True)

def get_coder_api():
    """
    Dependency that provides a CoderAPI instance.
    """
    return CoderAPI()
