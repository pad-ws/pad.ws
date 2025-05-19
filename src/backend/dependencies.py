import jwt
from typing import Optional, Dict, Any
from uuid import UUID
import os

from fastapi import Request, HTTPException

from cache import RedisClient
from domain.session import Session
from coder import CoderAPI

# oidc_config for session creation and user sessions
oidc_config = {
    'server_url': os.getenv('OIDC_SERVER_URL'),
    'realm': os.getenv('OIDC_REALM'),
    'client_id': os.getenv('OIDC_CLIENT_ID'),
    'client_secret': os.getenv('OIDC_CLIENT_SECRET'),
    'redirect_uri': os.getenv('REDIRECT_URI')
}

async def get_session_domain() -> Session:
    """Get a Session domain instance for the current request."""
    redis_client = await RedisClient.get_instance()
    return Session(redis_client, oidc_config)

class UserSession:
    """
    Unified user session model that integrates authentication data with user information.
    This provides a single interface for accessing both token data and user details.
    """
    def __init__(self, access_token: str, token_data: dict, session_domain: Session, user_id: UUID = None):
        self.access_token = access_token
        self._user_data = None
        self._session_domain = session_domain

        # Get the signing key and decode with verification
        try:
            jwks_client = self._session_domain._get_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(access_token)
            
            self.token_data = jwt.decode(
                access_token,
                signing_key.key,
                algorithms=["RS256"],
                audience=oidc_config['client_id']
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
        
        # Get session domain instance
        current_session_domain = await get_session_domain()

        # Handle missing session ID
        if not session_id:
            return self._handle_auth_error("Not authenticated")
            
        # Get session data from Redis
        session_data = await current_session_domain.get(session_id)
        if not session_data:
            return self._handle_auth_error("Not authenticated")
            
        # Handle token expiration
        if current_session_domain.is_token_expired(session_data):
            # Try to refresh the token
            success, new_session_data = await current_session_domain.refresh_token(session_id, session_data)
            if not success:
                return self._handle_auth_error("Session expired")
            session_data = new_session_data
        
        # Create user session object
        user_session = UserSession(
            access_token=session_data.get('access_token'),
            token_data=session_data,
            session_domain=current_session_domain
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
