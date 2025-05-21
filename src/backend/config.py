import os
import json
import time
import httpx
import jwt
from jwt.jwks_client import PyJWKClient
from typing import Optional, Dict, Any, Tuple
from dotenv import load_dotenv
from cache import RedisClient

# Load environment variables once
load_dotenv()

# ===== Application Configuration =====
STATIC_DIR = os.getenv("STATIC_DIR")
ASSETS_DIR = os.getenv("ASSETS_DIR")
FRONTEND_URL = os.getenv('FRONTEND_URL')
PAD_DEV_MODE = os.getenv('PAD_DEV_MODE', 'false').lower() == 'true'
DEV_FRONTEND_URL = os.getenv('DEV_FRONTEND_URL', 'http://localhost:3003')

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

default_pad = {}
with open("templates/dev.json", 'r') as f:
    default_pad = json.load(f)

# ===== Coder API Configuration =====
CODER_API_KEY = os.getenv("CODER_API_KEY")
CODER_URL = os.getenv("CODER_URL")
CODER_TEMPLATE_ID = os.getenv("CODER_TEMPLATE_ID")
CODER_DEFAULT_ORGANIZATION = os.getenv("CODER_DEFAULT_ORGANIZATION")
CODER_WORKSPACE_NAME = os.getenv("CODER_WORKSPACE_NAME", "ubuntu")

# Cache for JWKS client
_jwks_client = None

def get_jwks_client():
    """Get or create a PyJWKClient for token verification"""
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{OIDC_SERVER_URL}/realms/{OIDC_REALM}/protocol/openid-connect/certs"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client

