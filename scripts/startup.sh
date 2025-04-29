#!/bin/bash
set -e

# Create runtime config with environment variables
mkdir -p /app/frontend/dist/config
cat > /app/frontend/dist/config/runtime-config.js <<EOL
window.RUNTIME_CONFIG = {
  CODER_URL: "${CODER_URL}"
};
EOL

# Start the application
exec uvicorn main:app --host 0.0.0.0 --port 8000
