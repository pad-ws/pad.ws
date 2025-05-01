import os
import json
import time
import httpx
import redis
import jwt
from typing import Optional, Dict, Any, Tuple
from dotenv import load_dotenv

load_dotenv()

STATIC_DIR = os.getenv("STATIC_DIR")
ASSETS_DIR = os.getenv("ASSETS_DIR")

OIDC_CONFIG = {
    'client_id': os.getenv('OIDC_CLIENT_ID'),
    'client_secret': os.getenv('OIDC_CLIENT_SECRET'),
    'server_url': os.getenv('OIDC_SERVER_URL'),
    'realm': os.getenv('OIDC_REALM'),
    'redirect_uri': os.getenv('REDIRECT_URI'),
    'frontend_url': os.getenv('FRONTEND_URL')
}

# Redis connection
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    password=os.getenv('REDIS_PASSWORD', None),
    port=int(os.getenv('REDIS_PORT', 6379)),
    db=0,
    decode_responses=True
)

# Session management functions
def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get session data from Redis"""
    session_data = redis_client.get(f"session:{session_id}")
    if session_data:
        return json.loads(session_data)
    return None

def set_session(session_id: str, data: Dict[str, Any], expiry: int) -> None:
    """Store session data in Redis with expiry in seconds"""
    redis_client.setex(
        f"session:{session_id}", 
        expiry,
        json.dumps(data)
    )

def delete_session(session_id: str) -> None:
    """Delete session data from Redis"""
    redis_client.delete(f"session:{session_id}")

provisioning_times = {}

def get_auth_url() -> str:
    """Generate the authentication URL for Keycloak login"""
    auth_url = f"{OIDC_CONFIG['server_url']}/realms/{OIDC_CONFIG['realm']}/protocol/openid-connect/auth"
    params = {
        'client_id': OIDC_CONFIG['client_id'],
        'response_type': 'code',
        'redirect_uri': OIDC_CONFIG['redirect_uri'],
        'scope': 'openid profile email'
    }
    return f"{auth_url}?{'&'.join(f'{k}={v}' for k,v in params.items())}"

def get_token_url() -> str:
    """Get the token endpoint URL"""
    return f"{OIDC_CONFIG['server_url']}/realms/{OIDC_CONFIG['realm']}/protocol/openid-connect/token"

def is_token_expired(token_data: Dict[str, Any], buffer_seconds: int = 30) -> bool:
    """
    Check if the access token is expired or about to expire
    
    Args:
        token_data: The token data containing the access token
        buffer_seconds: Buffer time in seconds to refresh token before it actually expires
        
    Returns:
        bool: True if token is expired or about to expire, False otherwise
    """
    if not token_data or 'access_token' not in token_data:
        return True
        
    try:
        # Decode the JWT token without verification to get expiration time
        decoded = jwt.decode(token_data['access_token'], options={"verify_signature": False})
        
        # Get expiration time from token
        exp_time = decoded.get('exp', 0)
        
        # Check if token is expired or about to expire (with buffer)
        current_time = time.time()
        return current_time + buffer_seconds >= exp_time
    except Exception as e:
        print(f"Error checking token expiration: {str(e)}")
        return True

async def refresh_token(session_id: str, token_data: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    Refresh the access token using the refresh token
    
    Args:
        session_id: The session ID
        token_data: The current token data containing the refresh token
        
    Returns:
        Tuple[bool, Dict[str, Any]]: Success status and updated token data
    """
    if not token_data or 'refresh_token' not in token_data:
        return False, token_data
        
    try:
        async with httpx.AsyncClient() as client:
            refresh_response = await client.post(
                get_token_url(),
                data={
                    'grant_type': 'refresh_token',
                    'client_id': OIDC_CONFIG['client_id'],
                    'client_secret': OIDC_CONFIG['client_secret'],
                    'refresh_token': token_data['refresh_token']
                }
            )
            
            if refresh_response.status_code != 200:
                print(f"Token refresh failed: {refresh_response.text}")
                return False, token_data
                
            # Get new token data
            new_token_data = refresh_response.json()
            
            # Update session with new tokens
            expiry = new_token_data['expires_in']
            set_session(session_id, new_token_data, expiry)
            
            return True, new_token_data
    except Exception as e:
        print(f"Error refreshing token: {str(e)}")
        return False, token_data
