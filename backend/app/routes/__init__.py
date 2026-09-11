from app.routes.auth import router as auth_router
from app.routes.sensors import router as sensors_router
from app.routes.alerts import router as alerts_router
from app.routes.analytics import router as analytics_router

__all__ = [
    "auth_router",
    "sensors_router",
    "alerts_router",
    "analytics_router",
]
