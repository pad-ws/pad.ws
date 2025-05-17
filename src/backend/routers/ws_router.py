import json
import asyncio
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
    stream_key: str
):
    """Processes decoded message data and publishes to Redis."""
    message_data = json.loads(raw_data) 

    message_data.update({
        "user_id": str(user.id),
        "pad_id": str(pad_id),
        "timestamp": datetime.now().isoformat()
    })
    print(f"Received message from {user.id} on pad {str(pad_id)[:5]}")

    await publish_event_to_redis(redis_client, stream_key, message_data)

async def consume_redis_stream(redis_client: aioredis.Redis, stream_key: str, websocket: WebSocket, last_id: str = '$'):
    """Consumes messages from Redis stream and forwards them to the WebSocket"""
    try:
        while websocket.client_state.CONNECTED:
            # Read new messages from the stream
            streams = await redis_client.xread({stream_key: last_id}, count=5, block=1000)
            
            # Process received messages
            if streams:
                stream_name, stream_messages = streams[0]
                for message_id, message_data in stream_messages:
                    # Convert message data to a format suitable for WebSocket
                    formatted_message = {}
                    for k, v in message_data.items():
                        # Handle key - could be bytes or string
                        key = k.decode() if isinstance(k, bytes) else k
                        
                        # Handle value - could be bytes or string
                        if isinstance(v, bytes):
                            value = v.decode()
                        else:
                            value = v
                        
                        formatted_message[key] = value
                    
                    # Send to WebSocket
                    await websocket.send_json(formatted_message)
                    
                    # Update last_id to get newer messages next time
                    last_id = message_id
            
            # Brief pause to prevent CPU hogging
            await asyncio.sleep(0.01)
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
        
        # Send initial connection success
        if websocket.client_state.CONNECTED:
            await websocket.send_json({
                "type": "connected",
                "pad_id": str(pad_id),
                "user_id": str(user.id)
            })
            
            # Publish user joined message
            try:
                join_message = {
                    "type": "user_joined",
                    "pad_id": str(pad_id),
                    "user_id": str(user.id),
                    "timestamp": datetime.now().isoformat()
                }
                if redis_client:
                    await publish_event_to_redis(redis_client, stream_key, join_message)
            except Exception as e:
                print(f"Error publishing join message: {e}")
        
        # Create tasks for WebSocket message handling and Redis stream reading
        async def handle_websocket_messages():
            while websocket.client_state.CONNECTED:
                try:
                    data = await websocket.receive_text()
                    await _handle_received_data(data, pad_id, user, redis_client, stream_key)
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
        # Start from current - only get new messages
        redis_task = asyncio.create_task(consume_redis_stream(redis_client, stream_key, websocket, last_id='$'))
        
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
