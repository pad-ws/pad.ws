import json
import asyncio
import uuid
from uuid import UUID
from typing import Optional, Any
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pydantic import BaseModel, Field, field_validator
from redis import asyncio as aioredis

from dependencies import UserSession, get_session_domain
from cache import RedisClient
ws_router = APIRouter()

STREAM_EXPIRY = 3600

class WebSocketMessage(BaseModel):
    type: str
    pad_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[str] = None        # ID of the user related to the event or sending the message
    connection_id: Optional[str] = None  # Connection ID related to the event or sending the message
    data: Optional[Any] = None           # Payload; structure depends entirely on 'type'

    @field_validator('timestamp', mode='before')
    @classmethod
    def ensure_datetime_object(cls, v):
        if isinstance(v, str):
            if v.endswith('Z'):
                return datetime.fromisoformat(v[:-1] + '+00:00')
            return datetime.fromisoformat(v)
        if isinstance(v, datetime):
            return v
        raise ValueError("Timestamp must be a datetime object or an ISO 8601 string")

    class Config:
        json_encoders = {
            datetime: lambda dt: dt.isoformat().replace('+00:00', 'Z') if dt.tzinfo else dt.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z')
        }

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

async def publish_event_to_redis(redis_client: aioredis.Redis, stream_key: str, event_model: WebSocketMessage):
    """Formats event data from WebSocketMessage model and publishes it to a Redis stream."""
    message_dict = event_model.model_dump() 

    # Ensure all values are suitable for Redis stream (mostly strings, or numbers)
    field_value_dict = {}
    for k, v in message_dict.items():
        if isinstance(v, datetime):
            field_value_dict[k] = v.isoformat().replace('+00:00', 'Z')
        elif isinstance(v, (dict, list)): # Serialize complex data field to JSON string
            field_value_dict[k] = json.dumps(v)
        elif v is None:
            continue # Optionally skip None values or convert to empty string
        else:
            field_value_dict[k] = str(v)
            
    try:
        async with redis_client.pipeline() as pipe:
            # Add message to stream
            await pipe.xadd(stream_key, field_value_dict, maxlen=100, approximate=True)
            # Set expiration on the stream key
            await pipe.expire(stream_key, STREAM_EXPIRY)
            await pipe.execute()
    except Exception as e:
        print(f"Error publishing event to Redis stream {stream_key}: {str(e)}")


async def _handle_received_data(
    raw_data: str,
    pad_id: UUID,
    user: UserSession,
    redis_client: aioredis.Redis,
    stream_key: str,
    connection_id: str
):
    """Processes decoded message data, wraps it in WebSocketMessage, and publishes to Redis."""
    try:
        client_message_dict = json.loads(raw_data)
        
        # Create a WebSocketMessage instance from the client's data.
        # The client might not send user_id or connection_id, or we might want to override them.
        processed_message = WebSocketMessage(
            type=client_message_dict.get("type", "unknown_client_message"), # Get type from client
            pad_id=str(pad_id), # Server sets/overrides pad_id
            user_id=str(user.id), # Server sets/overrides user_id from authenticated session
            connection_id=connection_id, # Server sets/overrides connection_id
            timestamp=datetime.now(timezone.utc), # Server sets timestamp
            data=client_message_dict.get("data") # Pass through client's data payload
        )

        print(f"[WS] {processed_message.timestamp.strftime('%H:%M:%S')} - Type: {processed_message.type} from User: {processed_message.user_id[:5]} Conn: [{processed_message.connection_id[:5]}] on Pad: ({processed_message.pad_id[:5]})")

        await publish_event_to_redis(redis_client, stream_key, processed_message)

    except json.JSONDecodeError:
        print(f"Invalid JSON received from {connection_id[:5]}")
    except Exception as e:
        print(f"Error processing message from {connection_id[:5]}: {e}")


async def consume_redis_stream(
    redis_client: aioredis.Redis,
    stream_key: str,
    websocket: WebSocket,
    connection_id: str,
    last_id: str = '$'
):
    """Consumes messages from Redis stream, parses to WebSocketMessage, and forwards them."""
    try:
        while websocket.client_state.CONNECTED:
            streams = await redis_client.xread({stream_key: last_id}, count=5, block=1000)
            
            if streams:
                stream_name, stream_messages = streams[0]
                for message_id, message_data_raw_redis in stream_messages:
                    # Convert raw Redis data to a standard dict, handling bytes or str
                    redis_dict = {}
                    for k, v in message_data_raw_redis.items():
                        key = k.decode() if isinstance(k, bytes) else k
                        value_str = v.decode() if isinstance(v, bytes) else v
                        
                        # Attempt to parse 'data' field if it was stored as JSON string
                        if key == 'data':
                            try:
                                redis_dict[key] = json.loads(value_str)
                            except json.JSONDecodeError:
                                redis_dict[key] = value_str # Keep as string if not valid JSON
                        elif key == 'pad_id' and value_str == 'None': # Handle 'None' string for nullable fields
                             redis_dict[key] = None
                        else:
                            redis_dict[key] = value_str
                    
                    try:
                        # Parse the dictionary from Redis into our Pydantic model
                        message_to_send = WebSocketMessage(**redis_dict)
                        
                        # Avoid echoing messages to the sender
                        if message_to_send.connection_id != connection_id:
                            await websocket.send_text(message_to_send.model_dump_json())
                        else:
                            pass # Message originated from this connection, don't echo
                            
                    except Exception as pydantic_error:
                        print(f"Error parsing message from Redis stream {stream_key} (ID: {message_id}): {pydantic_error}. Data: {redis_dict}")

                    last_id = message_id
            
            await asyncio.sleep(0)
    except Exception as e:
        print(f"Error in Redis stream consumer for {stream_key}: {e}")


@ws_router.websocket("/ws/pad/{pad_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    pad_id: UUID,
    user: Optional[UserSession] = Depends(get_ws_user)
):
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return
        
    await websocket.accept()
    redis_client = None
    connection_id = str(uuid.uuid4()) # Unique ID for this WebSocket connection
    stream_key = f"pad:stream:{pad_id}"
    
    try:
        redis_client = await RedisClient.get_instance()
        
        # Send initial connection success message
        if websocket.client_state.CONNECTED:
            connected_msg = WebSocketMessage(
                type="connected",
                pad_id=str(pad_id),
                user_id=str(user.id),
                connection_id=connection_id,
                data={"message": f"Successfully connected to pad {str(pad_id)}."}
            )

            await websocket.send_text(connected_msg.model_dump_json())
            
            # Publish user joined message to Redis
            join_event_data = {"displayName": getattr(user, 'displayName', str(user.id))} # Adapt if user model has display name
            join_message = WebSocketMessage(
                type="user_joined",
                pad_id=str(pad_id),
                user_id=str(user.id),
                connection_id=connection_id,
                data=join_event_data
            )
            await publish_event_to_redis(redis_client, stream_key, join_message)
        
        async def handle_websocket_messages():
            while websocket.client_state.CONNECTED:
                try:
                    data = await websocket.receive_text()
                    await _handle_received_data(data, pad_id, user, redis_client, stream_key, connection_id)
                except WebSocketDisconnect:
                    print(f"WebSocket disconnected for user {str(user.id)[:5]} conn {connection_id[:5]} from pad {str(pad_id)[:5]}")
                    break
                except json.JSONDecodeError as e:
                    print(f"Invalid JSON received from {connection_id[:5]}: {e}")
                    if websocket.client_state.CONNECTED:
                        error_msg = WebSocketMessage(
                            type="error",
                            pad_id=str(pad_id),
                            data={"message": "Invalid message format. Please send valid JSON."}
                        )
                        await websocket.send_text(error_msg.model_dump_json())
                except Exception as e:
                    print(f"Error in WebSocket connection for {connection_id[:5]}: {e}")
                    break
        
        ws_task = asyncio.create_task(handle_websocket_messages())
        redis_task = asyncio.create_task(
            consume_redis_stream(redis_client, stream_key, websocket, connection_id, last_id='$')
        )
        
        done, pending = await asyncio.wait(
            [ws_task, redis_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        for task in pending:
            task.cancel()
            try:
                await task # Await cancellation
            except asyncio.CancelledError:
                pass
                
    except Exception as e:
        print(f"Error in WebSocket endpoint for pad {str(pad_id)}: {e}")
    finally:
        print(f"Cleaning up connection for user {str(user.id)[:5]} conn {connection_id[:5]} from pad {str(pad_id)[:5]}")
        try:
            if redis_client and user: # Ensure user is not None
                leave_event_data = {} # No specific data needed for leave, user_id is top-level
                leave_message = WebSocketMessage(
                    type="user_left",
                    pad_id=str(pad_id),
                    user_id=str(user.id),
                    connection_id=connection_id,
                    data=leave_event_data
                )
                await publish_event_to_redis(redis_client, stream_key, leave_message)
        except Exception as e:
            print(f"Error publishing leave message for {connection_id[:5]}: {e}")
            
        try:
            if websocket.client_state.CONNECTED:
                await websocket.close()
        except Exception as e:
            # Suppress common errors on close if already handled or connection is gone
            if "already completed" not in str(e) and "close message has been sent" not in str(e) and "no connection" not in str(e).lower():
                print(f"Error closing WebSocket connection for {connection_id[:5]}: {e}")
        
        if redis_client:
            await redis_client.close() # Ensure Redis client is closed if it was opened
