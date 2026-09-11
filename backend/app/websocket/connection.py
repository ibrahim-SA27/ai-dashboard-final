import json
import logging
from typing import List, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections for real-time sensor streaming."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcasts a telemetry payload to all currently connected clients."""
        if not self.active_connections:
            return

        payload_str = json.dumps(message, default=str)
        stale_connections: List[WebSocket] = []

        for connection in self.active_connections:
            try:
                await connection.send_text(payload_str)
            except Exception as e:
                logger.warning(f"Failed to send telemetry update to client: {e}")
                stale_connections.append(connection)

        # Remove dead/broken connections
        for stale in stale_connections:
            if stale in self.active_connections:
                self.active_connections.remove(stale)

    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        """Sends a direct message to a specific client connection."""
        try:
            await websocket.send_text(json.dumps(message, default=str))
        except Exception as e:
            logger.warning(f"Error sending personal message: {e}")


ws_manager = ConnectionManager()
