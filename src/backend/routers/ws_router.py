from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Cookie
from typing import Dict, Set, Optional
from uuid import UUID
import json
import asyncio
from config import get_redis_client
from dependencies import UserSession, get_session_domain
from datetime import datetime

ws_router = APIRouter()

# Store active WebSocket connections
active_connections: Dict[UUID, Set[WebSocket]] = {}

async def get_ws_user(websocket: WebSocket) -> Optional[UserSession]:
    """WebSocket-specific authentication dependency"""
    try:
        session_id = websocket.cookies.get('session_id')
        if not session_id:
            return None
        
        current_session_domain = await get_session_domain()
            
        session_data = await current_session_domain.get(session_id)
        if not session_data:
            return None
            
        if current_session_domain.is_token_expired(session_data):
            success, new_session_data = await current_session_domain.refresh_token(session_id, session_data)
            if not success:
                return None
            session_data = new_session_data
        
        return UserSession(
            access_token=session_data.get('access_token'),
            token_data=session_data,
            session_domain=current_session_domain
        )
    except Exception as e:
        print(f"Error in WebSocket authentication: {str(e)}")
        return None

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
        # Start with latest ID to only get new messages - not entire history
        last_id = "$"
        
        # First, trim the stream to keep only the latest 100 messages
        await redis_client.xtrim(stream_key, maxlen=100, approximate=True)
        
        while websocket.client_state.CONNECTED:
            try:
                messages = await redis_client.xread(
                    {stream_key: last_id},
                    block=1000,
                    count=100  # Limit to fetching 100 messages at a time
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
                                        # Convert message_data from Redis format to JSON-serializable dict
                                        json_message = {k.decode('utf-8') if isinstance(k, bytes) else k: 
                                                      v.decode('utf-8') if isinstance(v, bytes) else v 
                                                      for k, v in message_data.items()}
                                        await connection.send_json(json_message)
                                except (WebSocketDisconnect, Exception) as e:
                                    if "close message has been sent" not in str(e):
                                        print(f"Error sending message to client: {e}")
                                    await cleanup_connection(pad_id, connection)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"Error handling Redis stream: {e}")
                await asyncio.sleep(1)  # Throttle reconnection attempts
                
    except asyncio.CancelledError:
        raise
    except Exception as e:
        print(f"Fatal error in Redis message handling: {e}")
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
    
    if pad_id not in active_connections:
        active_connections[pad_id] = set()
    active_connections[pad_id].add(websocket)
    
    redis_client = None
    redis_task = None
    
    try:
        redis_client = await get_redis_client()
        stream_key = f"pad:stream:{pad_id}"
        
        # Send initial connection success
        if websocket.client_state.CONNECTED:
            await websocket.send_json({
                "type": "connected",
                "pad_id": str(pad_id),
                "user_id": str(user.id)
            })
            
            # Broadcast user joined message
            try:
                join_message = {
                    "type": "user_joined",
                    "pad_id": str(pad_id),
                    "user_id": str(user.id),
                    "timestamp": datetime.now().isoformat()
                }
                # Convert dict to proper format for Redis xadd
                field_value_dict = {str(k): str(v) if not isinstance(v, (int, float)) else v 
                                   for k, v in join_message.items()}
                await redis_client.xadd(stream_key, field_value_dict, maxlen=100, approximate=True)
            except Exception as e:
                print(f"Error broadcasting join message: {e}")
        
        redis_task = asyncio.create_task(handle_redis_messages(websocket, pad_id, redis_client, stream_key))
        
        # Wait for WebSocket disconnect
        while websocket.client_state.CONNECTED:
            try:
                # Keep the connection alive and handle any incoming messages
                data = await websocket.receive_text()
                message_data = json.loads(data)
                
                # Add user_id and timestamp to the message
                message_data.update({
                    "user_id": str(user.id),
                    "pad_id": str(pad_id),
                    "timestamp": datetime.now().isoformat()
                })
                print(f"Received message from {user.id} on pad {str(pad_id)[:5]}")
                
                # Publish the message to Redis stream to be broadcasted to all clients
                # Convert dict to proper format for Redis xadd (field-value pairs)
                field_value_dict = {str(k): str(v) if not isinstance(v, (int, float)) else v 
                                   for k, v in message_data.items()}
                await redis_client.xadd(stream_key, field_value_dict, maxlen=100, approximate=True)
            except WebSocketDisconnect:
                break
            except json.JSONDecodeError as e:
                print(f"Invalid JSON received: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid message format"
                })
            except Exception as e:
                print(f"Error in WebSocket connection: {e}")
                break
                
    except Exception as e:
        print(f"Error in WebSocket endpoint: {e}")
    finally:
        # Clean up
        if redis_task:
            redis_task.cancel()
            try:
                await redis_task
            except asyncio.CancelledError:
                pass
            
        # Broadcast user left message before cleanup
        try:
            if redis_client:
                leave_message = {
                    "type": "user_left",
                    "pad_id": str(pad_id),
                    "user_id": str(user.id),
                    "timestamp": datetime.now().isoformat()
                }
                # Convert dict to proper format for Redis xadd
                field_value_dict = {str(k): str(v) if not isinstance(v, (int, float)) else v 
                                   for k, v in leave_message.items()}
                await redis_client.xadd(stream_key, field_value_dict, maxlen=100, approximate=True)
        except Exception as e:
            print(f"Error broadcasting leave message: {e}")
            
        await cleanup_connection(pad_id, websocket) 