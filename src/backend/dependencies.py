from typing import Optional
from fastapi import Request, HTTPException, Depends

from config import sessions

class SessionData:
    def __init__(self, access_token: str, token_data: dict):
        self.access_token = access_token
        self.token_data = token_data

class AuthDependency:
    def __init__(self, auto_error: bool = True):
        self.auto_error = auto_error

    async def __call__(self, request: Request) -> Optional[SessionData]:
        session_id = request.cookies.get('session_id')
        
        if not session_id or session_id not in sessions:
            if self.auto_error:
                raise HTTPException(
                    status_code=401,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return None
            
        session = sessions[session_id]
        return SessionData(
            access_token=session.get('access_token'),
            token_data=session
        )

# Create instances for use in route handlers
require_auth = AuthDependency(auto_error=True)
optional_auth = AuthDependency(auto_error=False)
