import os
from dotenv import load_dotenv
import requests

load_dotenv()

STATIC_DIR = os.getenv("STATIC_DIR")
ASSETS_DIR = os.getenv("ASSETS_DIR")

OIDC_DISCOVERY_URL = os.getenv("OIDC_DISCOVERY_URL")
OIDC_CLIENT_ID = os.getenv("OIDC_CLIENT_ID")
OIDC_CLIENT_SECRET = os.getenv("OIDC_CLIENT_SECRET")


OIDC_CONFIG = requests.get(OIDC_DISCOVERY_URL or "").json()

sessions = {}
provisioning_times = {}

def get_auth_url() -> str:
    """Generate the authentication URL for Keycloak login"""
    auth_url = f"{OIDC_CONFIG['server_url']}/realms/{OIDC_CONFIG['realm']}/protocol/openid-connect/auth"
    params = {
        "client_id": OIDC_CONFIG["client_id"],
        "response_type": "code",
        "redirect_uri": OIDC_CONFIG["redirect_uri"],
    }
    return f"{auth_url}?{'&'.join(f'{k}={v}' for k,v in params.items())}"

def get_token_url() -> str:
    """Get the token endpoint URL"""
    return f"{OIDC_CONFIG['server_url']}/realms/{OIDC_CONFIG['realm']}/protocol/openid-connect/token"
