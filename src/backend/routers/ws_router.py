import json
import asyncio
import uuid
from uuid import UUID
from typing import Optional, Any, Dict, List, Tuple
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from redis import asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import UserSession, get_session_domain, PadAccess
from cache import RedisClient
from domain.pad import Pad
from database.database import async_session
ws_router = APIRouter()

STREAM_EXPIRY = 3600
PAD_USERS_EXPIRY = 3600  # Expiry time for the pad users hash
POINTER_CHANNEL_PREFIX = "pad:pointer:updates:"  # Prefix for pointer update pub/sub channels

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

async def publish_pointer_update(redis_client: aioredis.Redis, pad_id: UUID, message: WebSocketMessage):
    """
    Publish pointer updates through Redis pub/sub instead of streams.
    Since we don't care about persistence or consuming history for pointer updates,
    pub/sub is more efficient than streams for this high-frequency data.
    """
    try:
        channel = f"{POINTER_CHANNEL_PREFIX}{pad_id}"
        # Serialize the message and publish it
        message_json = message.model_dump_json()
        await redis_client.publish(channel, message_json)
    except Exception as e:
        print(f"Error publishing pointer update to Redis pub/sub {pad_id}: {str(e)}")

async def check_pad_access(pad_id: UUID, user: UserSession, session: AsyncSession) -> Tuple[bool, Optional[str]]:
    """Check if user still has access to the pad. Returns (has_access, error_reason)."""
    try:
        pad_access = PadAccess()
        await pad_access(pad_id, user, session)
        return True, None
    except HTTPException as e:
        return False, e.detail
    except Exception as e:
        return False, str(e)

async def periodic_auth_check(
    websocket: WebSocket,
    pad_id: UUID,
    user: UserSession,
    redis_client: aioredis.Redis,
    stream_key: str,
    connection_id: str,
    session: AsyncSession
):
    """Periodically check if the user still has access to the pad."""
    while websocket.client_state.CONNECTED:
        try:
            # Check pad access
            has_access, error_reason = await check_pad_access(pad_id, user, session)
            
            if not has_access:
                # Create a disconnect message
                disconnect_message = WebSocketMessage(
                    type="force_disconnect",
                    pad_id=str(pad_id),
                    user_id=str(user.id),
                    connection_id=connection_id,
                    data={"reason": error_reason}
                )
                # Publish the disconnect message so other clients know
                await publish_event_to_redis(redis_client, stream_key, disconnect_message)
                # Close the websocket
                await websocket.close(code=4003, reason=error_reason)
                break
                
        except Exception as e:
            print(f"Error in periodic auth check for {connection_id[:5]}: {e}")
            break
            
        # Wait for 1 second before next check
        await asyncio.sleep(1)

async def _handle_received_data(raw_data: str, pad_id: UUID, user: UserSession, 
                               redis_client: aioredis.Redis, stream_key: str, connection_id: str,
                               session: AsyncSession):
    """Processes decoded message data, wraps it in WebSocketMessage, and publishes to Redis."""
    try:

        client_message_dict = json.loads(raw_data)
        
        # Create a WebSocketMessage instance from the client's data
        processed_message = WebSocketMessage(
            type=client_message_dict.get("type", "unknown_client_message"),
            pad_id=str(pad_id),
            user_id=str(user.id),
            connection_id=connection_id,
            timestamp=datetime.now(timezone.utc),
            data=client_message_dict.get("data")
        )

        if processed_message.type == 'pointer_update':
            await publish_pointer_update(redis_client, pad_id, processed_message)
        else:
            await publish_event_to_redis(redis_client, stream_key, processed_message)
        
            
    except WebSocketDisconnect:
        raise
    except json.JSONDecodeError:
        print(f"Invalid JSON received from {connection_id[:5]}")
    except Exception as e:
        print(f"Error processing message from {connection_id[:5]}: {e}")

async def consume_redis_stream(redis_client: aioredis.Redis, stream_key: str, 
                              websocket: WebSocket, connection_id: str, last_id: str = '$'):
    """Consumes messages from Redis stream, parses to WebSocketMessage, and forwards them."""
    while websocket.client_state.CONNECTED:
        try:
            # Read from Redis stream
            streams = await redis_client.xread({stream_key: last_id}, count=5, block=1000)
            
            if not streams:
                await asyncio.sleep(0)
                continue
                
            stream_name, stream_messages = streams[0]
            for message_id, message_data_raw_redis in stream_messages:
                if not websocket.client_state.CONNECTED:
                    return
                    
                # Convert raw Redis data to a standard dict
                redis_dict = {}
                for k, v in message_data_raw_redis.items():
                    key = k.decode() if isinstance(k, bytes) else k
                    value_str = v.decode() if isinstance(v, bytes) else v
                    
                    # Parse 'data' field if it's JSON
                    if key == 'data':
                        try:
                            redis_dict[key] = json.loads(value_str)
                        except json.JSONDecodeError:
                            redis_dict[key] = value_str
                    elif key == 'pad_id' and value_str == 'None':
                         redis_dict[key] = None
                    else:
                        redis_dict[key] = value_str
                
                try:
                    # Create WebSocketMessage and send to client (if not from this connection)
                    message_to_send = WebSocketMessage(**redis_dict)
                    
                    if message_to_send.connection_id != connection_id and websocket.client_state.CONNECTED:
                        await websocket.send_text(message_to_send.model_dump_json())
                except Exception as e:
                    print(f"Error sending message from Redis: {e}")
                
                last_id = message_id
                
        except Exception as e:
            if websocket.client_state.CONNECTED:
                print(f"Error in Redis stream consumer for {stream_key}: {e}")
            return


async def consume_pointer_updates(redis_client: aioredis.Redis, pad_id: UUID, 
                                websocket: WebSocket, connection_id: str):
    """Consumes pointer updates from Redis pub/sub channel and forwards them to the client."""
    channel = f"{POINTER_CHANNEL_PREFIX}{pad_id}"
    pubsub = redis_client.pubsub()
    
    try:
        await pubsub.subscribe(channel)
        
        # Process messages as they arrive
        while websocket.client_state.CONNECTED:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            
            if message and message["type"] == "message":
                try:
                    # Parse the message data
                    message_data = json.loads(message["data"])
                    pointer_message = WebSocketMessage(**message_data)
                    
                    # Only forward messages from other connections
                    if pointer_message.connection_id != connection_id and websocket.client_state.CONNECTED:
                        await websocket.send_text(message["data"])
                except Exception as e:
                    print(f"Error processing pointer update: {e}")

            # Prevent CPU hogging
            await asyncio.sleep(0)
    
    except Exception as e:
        if websocket.client_state.CONNECTED:
            print(f"Error in pointer update consumer for {pad_id}: {e}")
    finally:
        # Clean up the subscription
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
        except Exception:
            pass


async def add_connection(redis_client: aioredis.Redis, pad_id: UUID, user_id: str, 
                         username: str, connection_id: str) -> None:
    """Add a user connection to the pad users hash in Redis."""
    key = f"pad:users:{pad_id}"
    try:
        # Get existing user data if any
        user_data_str = await redis_client.hget(key, user_id)
        
        if user_data_str:
            user_data = json.loads(user_data_str)
            # Add the connection ID if it doesn't exist
            if connection_id not in user_data["connections"]:
                user_data["connections"].append(connection_id)
        else:
            # Create new user data
            user_data = {
                "username": username,
                "connections": [connection_id]
            }
        
        # Update the hash in Redis
        await redis_client.hset(key, user_id, json.dumps(user_data))
        # Set expiry on the hash
        await redis_client.expire(key, PAD_USERS_EXPIRY)
    except Exception as e:
        print(f"Error adding connection to Redis: {e}")

async def remove_connection(redis_client: aioredis.Redis, pad_id: UUID, user_id: str, 
                           connection_id: str) -> None:
    """Remove a user connection from the pad users hash in Redis."""
    key = f"pad:users:{pad_id}"
    try:
        # Get existing user data
        user_data_str = await redis_client.hget(key, user_id)
        
        if user_data_str:
            user_data = json.loads(user_data_str)
            
            # Remove the connection
            if connection_id in user_data["connections"]:
                user_data["connections"].remove(connection_id)
            
            # If there are still connections, update the user data
            if user_data["connections"]:
                await redis_client.hset(key, user_id, json.dumps(user_data))
            else:
                # If no connections left, remove the user from the hash
                await redis_client.hdel(key, user_id)
            
            # Refresh expiry on the hash if it still exists
            if await redis_client.exists(key):
                await redis_client.expire(key, PAD_USERS_EXPIRY)
    except Exception as e:
        print(f"Error removing connection from Redis: {e}")

async def get_connected_users(redis_client: aioredis.Redis, pad_id: UUID) -> List[Dict[str, str]]:
    """Get all connected users from the pad users hash as a list of dicts with user_id and username."""
    key = f"pad:users:{pad_id}"
    try:
        # Get all users from the hash
        all_users = await redis_client.hgetall(key)
        
        # Convert to list of dicts with user_id and username
        connected_users = []
        for user_id, user_data_str in all_users.items():
            user_id_str = user_id.decode() if isinstance(user_id, bytes) else user_id
            user_data = json.loads(user_data_str.decode() if isinstance(user_data_str, bytes) else user_data_str)
            connected_users.append({
                "user_id": user_id_str,
                "username": user_data["username"]
            })
        
        return connected_users
    except Exception as e:
        print(f"Error getting connected users from Redis: {e}")
        return []

@ws_router.websocket("/ws/pad/{pad_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    pad_id: UUID,
    user: Optional[UserSession] = Depends(get_ws_user)
):
    """WebSocket endpoint for pad collaboration."""
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return

    connection_id = None  # Initialize connection_id before try block
    redis_client = None  # Initialize redis_client before try block

    try:
        # Create a database session for the WebSocket connection
        async with async_session() as session:
            # Check initial pad access
            pad_access = PadAccess()
            try:
                pad, _ = await pad_access(pad_id, user, session)
            except HTTPException as e:
                await websocket.close(code=e.status_code, reason=e.detail)
                return

            # Accept the connection and set up
            await websocket.accept()
            connection_id = str(uuid.uuid4())
            stream_key = f"pad:stream:{pad_id}"
            redis_client = await RedisClient.get_instance()

            await add_connection(redis_client, pad_id, str(user.id), user.username, connection_id)
            connected_users = await get_connected_users(redis_client, pad_id)

            # Send connected message to client with connected users info
            connected_msg = WebSocketMessage(
                type="connected",
                pad_id=str(pad_id),
                user_id=str(user.id),
                connection_id=connection_id,
                data={
                    "collaboratorsList": connected_users
                }
            )
            await websocket.send_text(connected_msg.model_dump_json())
            
            # Broadcast user joined message
            join_event_data = {"username": user.username}
            join_message = WebSocketMessage(
                type="user_joined",
                pad_id=str(pad_id),
                user_id=str(user.id),
                connection_id=connection_id,
                data=join_event_data
            )
            await publish_event_to_redis(redis_client, stream_key, join_message)
            
            # Handle incoming messages from client
            async def handle_websocket_messages():
                while websocket.client_state.CONNECTED:
                    try:
                        data = await websocket.receive_text()
                        await _handle_received_data(data, pad_id, user, redis_client, stream_key, connection_id, session)
                    except WebSocketDisconnect as e:
                        print(f"WebSocket disconnected for user {str(user.id)[:5]} conn {connection_id[:5]}: {e.reason}")
                        break
                    except json.JSONDecodeError as e:
                        print(f"Invalid JSON received from {connection_id[:5]}: {e}")
                        await websocket.send_text(WebSocketMessage(
                            type="error",
                            pad_id=str(pad_id),
                            data={"message": "Invalid message format. Please send valid JSON."}
                        ).model_dump_json())
                    except Exception as e:
                        print(f"Error in WebSocket connection for {connection_id[:5]}: {e}")
                        break

            # Set up tasks for message handling
            ws_task = asyncio.create_task(handle_websocket_messages())
            redis_task = asyncio.create_task(
                consume_redis_stream(redis_client, stream_key, websocket, connection_id, last_id='$')
            )
            pointer_task = asyncio.create_task(
                consume_pointer_updates(redis_client, pad_id, websocket, connection_id)
            )
            auth_task = asyncio.create_task(
                periodic_auth_check(websocket, pad_id, user, redis_client, stream_key, connection_id, session)
            )
            
            # Wait for any task to complete
            done, pending = await asyncio.wait(
                [ws_task, redis_task, pointer_task, auth_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # Cancel pending tasks
            for task in pending:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
                
    except Exception as e:
        print(f"Error in WebSocket connection: {e}")
        
    finally:
        if connection_id:  # Only try to clean up if connection_id was set
            
            # Remove the connection from Redis
            if redis_client:
                try:
                    await remove_connection(redis_client, pad_id, str(user.id), connection_id)
                except Exception as e:
                    print(f"Error removing connection from Redis: {e}")
                
                # Send user left message
                try:
                    leave_message = WebSocketMessage(
                        type="user_left",
                        pad_id=str(pad_id),
                        user_id=str(user.id),
                        connection_id=connection_id,
                        data={}
                    )
                    await publish_event_to_redis(redis_client, stream_key, leave_message)
                except Exception as e:
                    print(f"Error publishing leave message: {e}")
        
        # Close the WebSocket if still connected
        if websocket.client_state.CONNECTED:
            try:
                await websocket.close()
            except Exception:
                pass
