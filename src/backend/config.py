import os
import json
import redis
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

STATIC_DIR = os.getenv("STATIC_DIR")
ASSETS_DIR = os.getenv("ASSETS_DIR")

OIDC_CONFIG = {
    'client_id': os.getenv('OIDC_CLIENT_ID'),
    'client_secret': os.getenv('OIDC_CLIENT_SECRET'),
    'server_url': os.getenv('OIDC_SERVER_URL'),
    'realm': os.getenv('OIDC_REALM'),
    'redirect_uri': os.getenv('REDIRECT_URI')
}

# Redis connection
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
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

def set_session(session_id: str, data: Dict[str, Any], expiry: int = 86400) -> None:
    """Store session data in Redis with expiry in seconds (default 24 hours)"""
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
        'redirect_uri': OIDC_CONFIG['redirect_uri']
    }
    return f"{auth_url}?{'&'.join(f'{k}={v}' for k,v in params.items())}"

def get_token_url() -> str:
    """Get the token endpoint URL"""
    return f"{OIDC_CONFIG['server_url']}/realms/{OIDC_CONFIG['realm']}/protocol/openid-connect/token"
