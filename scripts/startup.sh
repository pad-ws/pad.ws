#!/bin/bash
set -e

# Start the application
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers $API_WORKERS
