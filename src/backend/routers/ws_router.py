import json
import asyncio
import uuid
from uuid import UUID
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from redis import asyncio as aioredis

from config import get_redis_client
from dependencies import UserSession, get_session_domain

ws_router = APIRouter()

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

async def publish_event_to_redis(redis_client: aioredis.Redis, stream_key: str, event_data: dict):
    """Formats event data and publishes it to a Redis stream."""
    field_value_dict = {
        str(k): str(v) if not isinstance(v, (int, float)) else v
        for k, v in event_data.items()
    }
    await redis_client.xadd(stream_key, field_value_dict, maxlen=100, approximate=True)

async def _handle_received_data(
    raw_data: str,
    pad_id: UUID,
    user: UserSession,
    redis_client: aioredis.Redis,
    stream_key: str,
    connection_id: str
):
    """Processes decoded message data and publishes to Redis."""
    message_data = json.loads(raw_data)

    if 'user_id' not in message_data: # Should not happen if client sends it, but as a safeguard
        message_data['user_id'] = str(user.id)
    
    # Add other metadata if not present or to ensure consistency
    message_data.setdefault("pad_id", str(pad_id))
    message_data.setdefault("timestamp", datetime.now().isoformat())
    message_data.setdefault("connection_id", connection_id)

    print(f"[WS] {datetime.now().strftime('%H:%M:%S')} - {message_data.get('type', 'Unknown')} from [{str(connection_id)[:5]}] on pad ({str(pad_id)[:5]})")

    await publish_event_to_redis(redis_client, stream_key, message_data)

async def consume_redis_stream(
    redis_client: aioredis.Redis,
    stream_key: str,
    websocket: WebSocket,
    current_connection_id: str,  # Changed to identify the specific connection
    last_id: str = '$'
):
    """Consumes messages from Redis stream and forwards them to the WebSocket, avoiding echo."""
    try:
        while websocket.client_state.CONNECTED:
            streams = await redis_client.xread({stream_key: last_id}, count=5, block=1000)
            
            if streams:
                stream_name, stream_messages = streams[0]
                for message_id, message_data_raw in stream_messages:
                    formatted_message = {}
                    for k, v in message_data_raw.items():
                        key = k.decode() if isinstance(k, bytes) else k
                        if isinstance(v, bytes):
                            value = v.decode()
                        else:
                            value = v
                        formatted_message[key] = value
                    
                    message_origin_connection_id = formatted_message.get('connection_id')

                    if message_origin_connection_id != current_connection_id:
                        await websocket.send_json(formatted_message)
                    else:
                        pass
                    
                    last_id = message_id
            
            # Release asyncio lock to prevent CPU hogging
            await asyncio.sleep(0)
    except Exception as e:
        print(f"Error in Redis stream consumer: {e}")

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
    redis_client = None
    
    try:
        redis_client = await get_redis_client()
        stream_key = f"pad:stream:{pad_id}"
        
        # Generate a unique connection ID for this WebSocket session
        connection_id = str(uuid.uuid4())
        
        # Send initial connection success
        if websocket.client_state.CONNECTED:
            await websocket.send_json({
                "type": "connected",
                "pad_id": str(pad_id),
                "user_id": str(user.id),
                "connection_id": connection_id
            })
            
            # Publish user joined message
            join_message = {
                "type": "user_joined",
                "pad_id": str(pad_id),
                "user_id": str(user.id),
                "connection_id": connection_id,
                "timestamp": datetime.now().isoformat()
            }
            await publish_event_to_redis(redis_client, stream_key, join_message)
        
        # Create tasks for WebSocket message handling and Redis stream reading
        async def handle_websocket_messages():
            while websocket.client_state.CONNECTED:
                try:
                    data = await websocket.receive_text()
                    await _handle_received_data(data, pad_id, user, redis_client, stream_key, connection_id)
                except WebSocketDisconnect:
                    break
                except json.JSONDecodeError as e:
                    print(f"Invalid JSON received: {e}")
                    if websocket.client_state.CONNECTED:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Invalid message format"
                        })
                except Exception as e:
                    print(f"Error in WebSocket connection: {e}")
                    break
        
        # Run both tasks concurrently
        ws_task = asyncio.create_task(handle_websocket_messages())
        redis_task = asyncio.create_task(
            consume_redis_stream(redis_client, stream_key, websocket, connection_id, last_id='$')
        )
        
        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [ws_task, redis_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel any pending tasks
        for task in pending:
            task.cancel()
                
    except Exception as e:
        print(f"Error in WebSocket endpoint: {e}")
    finally:
        # Send user left message before cleanup
        try:
            if redis_client:
                leave_message = {
                    "type": "user_left",
                    "pad_id": str(pad_id),
                    "user_id": str(user.id),
                    "connection_id": connection_id,
                    "timestamp": datetime.now().isoformat()
                }
                await publish_event_to_redis(redis_client, stream_key, leave_message)
        except Exception as e:
            print(f"Error publishing leave message: {e}")
            
        # Close websocket if still connected
        try:
            if websocket.client_state.CONNECTED:
                await websocket.close()
        except Exception as e:
            if "already completed" not in str(e) and "close message has been sent" not in str(e):
                print(f"Error closing WebSocket connection: {e}")
