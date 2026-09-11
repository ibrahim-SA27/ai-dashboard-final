import logging
from typing import AsyncGenerator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

logger = logging.getLogger(__name__)

# Base Declarative Model
Base = declarative_base()

# --- Synchronous PostgreSQL / SQLite Engine (for migrations & tooling) ---
sync_db_url = settings.DATABASE_URL
sync_kwargs = {}
if sync_db_url.startswith("sqlite"):
    sync_kwargs["connect_args"] = {"check_same_thread": False}
else:
    sync_kwargs["pool_pre_ping"] = True
    sync_kwargs["pool_size"] = 10
    sync_kwargs["max_overflow"] = 20

try:
    engine = create_engine(sync_db_url, **sync_kwargs)
except Exception as e:
    logger.warning(f"Sync connection fallback: {e}")
    fallback_sync_url = "sqlite:///./effluent_local.db"
    engine = create_engine(fallback_sync_url, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# --- Asynchronous Engine (for high-throughput async FastAPI operations) ---
async_db_url = settings.ASYNC_DATABASE_URL
# Ensure proper async dialect prefix
if async_db_url.startswith("postgresql://"):
    async_db_url = async_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

async_kwargs = {"echo": False}
if async_db_url.startswith("sqlite"):
    if not async_db_url.startswith("sqlite+aiosqlite"):
        async_db_url = async_db_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    async_kwargs["connect_args"] = {"check_same_thread": False}
else:
    async_kwargs["pool_pre_ping"] = True
    async_kwargs["pool_size"] = 10
    async_kwargs["max_overflow"] = 20

try:
    async_engine = create_async_engine(async_db_url, **async_kwargs)
except Exception as e:
    logger.warning(f"Async engine connection fallback: {e}")
    fallback_async_url = "sqlite+aiosqlite:///./effluent_local.db"
    async_engine = create_async_engine(
        fallback_async_url, connect_args={"check_same_thread": False}
    )

# Asynchronous Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an asynchronous PostgreSQL session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_db():
    """Dependency that provides a synchronous database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def init_async_tables():
    """Asynchronously creates all database tables."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def create_tables():
    """Synchronously initializes tables in database."""
    Base.metadata.create_all(bind=engine)

