from uuid import UUID

from fastapi import APIRouter, Depends

from dependencies import UserSession, require_auth

pad_router = APIRouter()

@pad_router.get("/{pad_id}")
async def get_pad(
    pad_id: UUID,
    user: UserSession = Depends(require_auth),
):
    """Get a specific pad for the authenticated user"""
    raise NotImplementedError("Not implemented")