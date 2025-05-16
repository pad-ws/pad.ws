from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Cookie
from typing import Dict, Set, Optional
from uuid import UUID
import json
import asyncio
from config import get_redis_client
from dependencies import UserSession, session
from datetime import datetime

ws_router = APIRouter()

# Store active WebSocket connections
active_connections: Dict[UUID, Set[WebSocket]] = {}

async def get_ws_user(websocket: WebSocket) -> Optional[UserSession]:
    """WebSocket-specific authentication dependency"""
    # Get session ID from cookies
    session_id = websocket.cookies.get('session_id')
    if not session_id:
        return None
        
    # Get session data from Redis
    session_data = session.get(session_id)
    if not session_data:
        return None
        
    # Handle token expiration
    if session.is_token_expired(session_data):
        # Try to refresh the token
        success, new_session = await session.refresh_token(session_id, session_data)
        if not success:
            return None
        session_data = new_session
    
    # Create user session object
    return UserSession(
        access_token=session_data.get('access_token'),
        token_data=session_data
    )

async def cleanup_connection(pad_id: UUID, websocket: WebSocket):
    """Clean up WebSocket connection and remove from active connections"""
    # Remove from active connections first to prevent any race conditions
    if pad_id in active_connections:
        active_connections[pad_id].discard(websocket)
        if not active_connections[pad_id]:
            del active_connections[pad_id]
    
    # Only try to close if the connection is still open
    try:
        if websocket.client_state.CONNECTED:
            await websocket.close()
    except Exception as e:
        # Ignore "connection already closed" errors
        if "already completed" not in str(e) and "close message has been sent" not in str(e):
            print(f"Error closing WebSocket connection: {e}")

async def handle_redis_messages(websocket: WebSocket, pad_id: UUID, redis_client, stream_key: str):
    """Handle Redis stream messages asynchronously"""
    try:
        # Get the last message ID to start from
        last_id = "0"
        
        while websocket.client_state.CONNECTED:
            # Get messages from Redis stream with a timeout
            messages = await asyncio.to_thread(
                redis_client.xread,
                {stream_key: last_id},
                block=1000
            )
            
            if messages and websocket.client_state.CONNECTED:
                for stream, stream_messages in messages:
                    for message_id, message_data in stream_messages:
                        # Update last_id to avoid processing the same message twice
                        last_id = message_id
                        
                        # Forward message to all connected clients
                        for connection in active_connections[pad_id].copy():
                            try:
                                if connection.client_state.CONNECTED:
                                    await connection.send_json(message_data)
                            except (WebSocketDisconnect, Exception) as e:
                                if "close message has been sent" not in str(e):
                                    print(f"Error sending message to client: {e}")
                                await cleanup_connection(pad_id, connection)
    except Exception as e:
        print(f"Error in Redis message handling: {e}")
    finally:
        await cleanup_connection(pad_id, websocket)

@ws_router.websocket("/ws/pad/{pad_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    pad_id: UUID,
    user: Optional[UserSession] = Depends(get_ws_user)
):
    """WebSocket endpoint for real-time pad updates"""
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return
        
    await websocket.accept()
    
    # Add connection to active connections
    if pad_id not in active_connections:
        active_connections[pad_id] = set()
    active_connections[pad_id].add(websocket)
    
    # Subscribe to Redis stream for this pad
    redis_client = get_redis_client()
    stream_key = f"pad:stream:{pad_id}"
    
    try:
        # Send initial connection success
        if websocket.client_state.CONNECTED:
            await websocket.send_json({
                "type": "connected",
                "pad_id": str(pad_id),
                "user_id": str(user.id)
            })
            
            # Broadcast user joined message
            join_message = {
                "type": "user_joined",
                "pad_id": str(pad_id),
                "user_id": str(user.id),
                "timestamp": datetime.now().isoformat()
            }
            redis_client.xadd(stream_key, join_message)
        
        # Start Redis message handling in a separate task
        redis_task = asyncio.create_task(handle_redis_messages(websocket, pad_id, redis_client, stream_key))
        
        # Wait for WebSocket disconnect
        while websocket.client_state.CONNECTED:
            try:
                # Keep the connection alive and handle any incoming messages
                data = await websocket.receive_text()
                # Handle any client messages here if needed
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"Error in WebSocket connection: {e}")
                break
                
    except Exception as e:
        print(f"Error in WebSocket endpoint: {e}")
    finally:
        # Clean up
        redis_task.cancel()
        try:
            await redis_task
        except asyncio.CancelledError:
            pass
            
        # Broadcast user left message before cleanup
        try:
            leave_message = {
                "type": "user_left",
                "pad_id": str(pad_id),
                "user_id": str(user.id),
                "timestamp": datetime.now().isoformat()
            }
            redis_client.xadd(stream_key, leave_message)
        except Exception as e:
            print(f"Error broadcasting leave message: {e}")
            
        await cleanup_connection(pad_id, websocket) 