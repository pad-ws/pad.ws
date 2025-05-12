import os
import json
import time
import httpx
import redis
from redis import ConnectionPool, Redis
import jwt
from jwt.jwks_client import PyJWKClient
from typing import Optional, Dict, Any, Tuple
from dotenv import load_dotenv

# Load environment variables once
load_dotenv()

# ===== Application Configuration =====
STATIC_DIR = os.getenv("STATIC_DIR")
ASSETS_DIR = os.getenv("ASSETS_DIR")
FRONTEND_URL = os.getenv('FRONTEND_URL')

MAX_BACKUPS_PER_USER = 10  # Maximum number of backups to keep per user
MIN_INTERVAL_MINUTES = 5  # Minimum interval in minutes between backups
DEFAULT_PAD_NAME = "Untitled"  # Default name for new pads
DEFAULT_TEMPLATE_NAME = "default" # Template name to use when a user doesn't have a pad

# ===== PostHog Configuration =====
POSTHOG_API_KEY = os.getenv("VITE_PUBLIC_POSTHOG_KEY")
POSTHOG_HOST = os.getenv("VITE_PUBLIC_POSTHOG_HOST")

# ===== OIDC Configuration =====
OIDC_CLIENT_ID = os.getenv('OIDC_CLIENT_ID')
OIDC_CLIENT_SECRET = os.getenv('OIDC_CLIENT_SECRET')
OIDC_SERVER_URL = os.getenv('OIDC_SERVER_URL')
OIDC_REALM = os.getenv('OIDC_REALM')
OIDC_REDIRECT_URI = os.getenv('REDIRECT_URI')

# ===== Redis Configuration =====
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))

# Create a Redis connection pool
redis_pool = ConnectionPool(
    host=REDIS_HOST,
    password=REDIS_PASSWORD,
    port=REDIS_PORT,
    db=0,
    decode_responses=True,
    max_connections=10,  # Adjust based on your application's needs
    socket_timeout=5.0,
    socket_connect_timeout=1.0,
    health_check_interval=30
)

# Create a Redis client that uses the connection pool
redis_client = Redis(connection_pool=redis_pool)

def get_redis_client():
    """Get a Redis client from the connection pool"""
    return Redis(connection_pool=redis_pool)

# ===== Coder API Configuration =====
CODER_API_KEY = os.getenv("CODER_API_KEY")
CODER_URL = os.getenv("CODER_URL")
CODER_TEMPLATE_ID = os.getenv("CODER_TEMPLATE_ID")
CODER_DEFAULT_ORGANIZATION = os.getenv("CODER_DEFAULT_ORGANIZATION")
CODER_WORKSPACE_NAME = os.getenv("CODER_WORKSPACE_NAME", "ubuntu")

# Cache for JWKS client
_jwks_client = None

# Session management functions
def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get session data from Redis"""
    client = get_redis_client()
    session_data = client.get(f"session:{session_id}")
    if session_data:
        return json.loads(session_data)
    return None

def set_session(session_id: str, data: Dict[str, Any], expiry: int) -> None:
    """Store session data in Redis with expiry in seconds"""
    client = get_redis_client()
    client.setex(
        f"session:{session_id}", 
        expiry,
        json.dumps(data)
    )

def delete_session(session_id: str) -> None:
    """Delete session data from Redis"""
    client = get_redis_client()
    client.delete(f"session:{session_id}")

def get_auth_url() -> str:
    """Generate the authentication URL for Keycloak login"""
    auth_url = f"{OIDC_SERVER_URL}/realms/{OIDC_REALM}/protocol/openid-connect/auth"
    params = {
        'client_id': OIDC_CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': OIDC_REDIRECT_URI,
        'scope': 'openid profile email'
    }
    return f"{auth_url}?{'&'.join(f'{k}={v}' for k,v in params.items())}"

def get_token_url() -> str:
    """Get the token endpoint URL"""
    return f"{OIDC_SERVER_URL}/realms/{OIDC_REALM}/protocol/openid-connect/token"

def is_token_expired(token_data: Dict[str, Any], buffer_seconds: int = 30) -> bool:
    if not token_data or 'access_token' not in token_data:
        return True
        
    try:
        # Get the signing key
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token_data['access_token'])
        
        # Decode with verification
        decoded = jwt.decode(
            token_data['access_token'],
            signing_key.key,
            algorithms=["RS256"],  # Common algorithm for OIDC
            audience=OIDC_CLIENT_ID,
        )
        
        # Check expiration
        exp_time = decoded.get('exp', 0)
        current_time = time.time()
        return current_time + buffer_seconds >= exp_time
    except jwt.ExpiredSignatureError:
        return True
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
                    'client_id': OIDC_CLIENT_ID,
                    'client_secret': OIDC_CLIENT_SECRET,
                    'refresh_token': token_data['refresh_token']
                }
            )
            
            if refresh_response.status_code != 200:
                print(f"Token refresh failed: {refresh_response.text}")
                return False, token_data
                
            # Get new token data
            new_token_data = refresh_response.json()
            
            # Update session with new tokens
            expiry = new_token_data['refresh_expires_in']
            print(f"New expiry in refresh_token: {expiry}")
            set_session(session_id, new_token_data, expiry)
            
            return True, new_token_data
    except Exception as e:
        print(f"Error refreshing token: {str(e)}")
        return False, token_data

def get_jwks_client():
    """Get or create a PyJWKClient for token verification"""
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{OIDC_SERVER_URL}/realms/{OIDC_REALM}/protocol/openid-connect/certs"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client
