import os
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

sessions = {}
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
