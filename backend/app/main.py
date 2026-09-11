import asyncio
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import create_tables, get_db
from app.routes import auth_router, sensors_router, alerts_router, analytics_router
from app.websocket.connection import ws_manager
from app.models.sensor import SensorReading
from sqlalchemy.orm import Session
from sqlalchemy import desc

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("effluent_scada")

# Rate Limiting
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_DEFAULT])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context for startup and graceful shutdown."""
    logger.info(f"Starting {settings.APP_NAME}...")
    # Initialize DB tables
    try:
        create_tables()
        logger.info("Database tables verified/initialized successfully.")
    except Exception as e:
        logger.error(f"Error during database initialization: {e}")

    yield

    logger.info("Shutting down Effluent SCADA backend service...")


app = FastAPI(
    title="Industrial Effluent Monitoring and Harmful Water Detection System",
    description=(
        "Production-ready SCADA backend providing high-frequency sensor telemetry ingestion, "
        "automated pollution scoring, real-time WebSocket broadcasting, role-based JWT authentication, "
        "and industrial Gmail alert dispatch."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth_router)
app.include_router(sensors_router)
app.include_router(alerts_router)
app.include_router(analytics_router)


@app.get("/", summary="Root System Status")
def root():
    return {
        "system": settings.APP_NAME,
        "status": "OPERATIONAL",
        "version": "1.0.0",
        "websocket_endpoint": "/ws/realtime",
        "docs": "/docs",
    }


@app.get("/api/health", summary="Health Check")
def health_check():
    return {
        "status": "healthy",
        "active_ws_connections": len(ws_manager.active_connections),
        "email_alerts_enabled": settings.ENABLE_EMAIL_ALERTS,
    }


@app.websocket("/ws/realtime")
async def websocket_realtime_endpoint(websocket: WebSocket):
    """
    Real-Time WebSocket Stream (/ws/realtime)
    - Broadcasts live sensor readings to connected clients immediately upon arrival.
    - Sends the most recent reading immediately upon connection.
    - Keeps connection alive and responds to client ping messages.
    """
    await ws_manager.connect(websocket)

    # Send current baseline / latest reading immediately on connect
    try:
        from app.database import SessionLocal
        db: Session = SessionLocal()
        latest = db.query(SensorReading).order_by(desc(SensorReading.timestamp)).first()
        if latest:
            initial_payload = {
                "id": latest.id,
                "timestamp": latest.timestamp.isoformat(),
                "ph": round(latest.ph, 2),
                "tds": round(latest.tds, 1),
                "turbidity": round(latest.turbidity, 1),
                "temperature": round(latest.temperature, 1),
                "flow_rate": round(latest.flow_rate, 2),
                "pollution_score": round(latest.pollution_score, 1),
                "status": latest.status.value,
            }
            await websocket.send_text(json.dumps(initial_payload, default=str))
        db.close()
    except Exception as e:
        logger.warning(f"Could not send initial snapshot to WebSocket client: {e}")

    try:
        while True:
            # Listen for client heartbeat/messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "timestamp": msg.get("timestamp")}))
            except Exception:
                # If plain text ping or keepalive
                if data.strip().lower() == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket client exception: {e}")
        ws_manager.disconnect(websocket)
