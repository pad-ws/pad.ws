from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Dict, Any
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["collaboration"]
)

class ConnectionManager:
    def __init__(self):
        # Stores active connections: room_id -> list of WebSockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        logger.info(f"Client {websocket.client.host}:{websocket.client.port} connected to room '{room_id}'. Clients in room: {len(self.active_connections[room_id])}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections and websocket in self.active_connections[room_id]:
            self.active_connections[room_id].remove(websocket)
            logger.info(f"Client {websocket.client.host}:{websocket.client.port} disconnected from room '{room_id}'. Clients in room: {len(self.active_connections.get(room_id, []))}")
            if not self.active_connections[room_id]:
                del self.active_connections[room_id] # Clean up empty room
                logger.info(f"Room '{room_id}' is now empty and removed.")

    async def broadcast(self, message: str, room_id: str, sender: WebSocket):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                if connection != sender:
                    try:
                        await connection.send_text(message)
                    except Exception as e:
                        logger.error(f"Error broadcasting to client in room '{room_id}': {e}")
                        # Optionally, handle broken connections by disconnecting them
                        # self.disconnect(connection, room_id)

manager = ConnectionManager()

@router.websocket("/collab/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"Room '{room_id}': Received from {websocket.client.host}:{websocket.client.port}: {data[:150]}...")
            await manager.broadcast(data, room_id, websocket)
    except WebSocketDisconnect:
        logger.info(f"WebSocketDisconnect for client {websocket.client.host}:{websocket.client.port} in room '{room_id}'.")
    except Exception as e:
        logger.error(f"Unexpected error for client {websocket.client.host}:{websocket.client.port} in room '{room_id}': {e}")
    finally:
        # Ensure disconnection in all cases (normal disconnect, error, etc.)
        manager.disconnect(websocket, room_id)
