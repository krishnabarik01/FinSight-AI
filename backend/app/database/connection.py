import logging
from typing import AsyncGenerator, Optional, Dict, Any
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
    AsyncEngine
)
from sqlalchemy import text
from sqlalchemy.pool import NullPool, QueuePool

from app.config import settings
from app.database.models import Base

logger = logging.getLogger("finsight.database")

class DatabaseManager:
    def __init__(self):
        self.engine: Optional[AsyncEngine] = None
        self.session_factory: Optional[async_sessionmaker[AsyncSession]] = None
        self.is_connected: bool = False
        self.dialect_name: str = "unknown"
        self.is_postgres: bool = False

    async def connect(self) -> None:
        """
        Initializes the async SQLAlchemy engine and sessionmaker.
        Configures connection pooling, pre-ping checks, and driver-specific options.
        """
        async_url = settings.get_async_database_url()
        self.is_postgres = "postgresql" in async_url

        connect_args: Dict[str, Any] = {}
        engine_kwargs: Dict[str, Any] = {
            "echo": settings.DB_ECHO,
        }

        if self.is_postgres:
            # PostgreSQL / Supabase connection pooling configuration
            engine_kwargs.update({
                "pool_size": settings.DB_POOL_SIZE,
                "max_overflow": settings.DB_MAX_OVERFLOW,
                "pool_timeout": settings.DB_POOL_TIMEOUT,
                "pool_recycle": settings.DB_POOL_RECYCLE,
                "pool_pre_ping": True,
            })

            # Check if connecting through Supabase Transaction Pooler (port 6543 / pooler.supabase.com)
            # Transaction poolers require statement_cache_size=0 for asyncpg to avoid prepared statement conflicts
            if settings.is_supabase_pooler():
                connect_args["statement_cache_size"] = 0
                logger.info("Supabase transaction pooler detected; asyncpg prepared statement caching disabled.")

            # SSL mode for Supabase
            if "supabase.co" in async_url or "pooler.supabase.com" in async_url:
                if "ssl" not in connect_args and "ssl=" not in async_url:
                    connect_args["ssl"] = "require"

            engine_kwargs["connect_args"] = connect_args
        elif "sqlite" in async_url:
            connect_args["check_same_thread"] = False
            connect_args["timeout"] = 10
            engine_kwargs["connect_args"] = connect_args
            # SQLite does not use standard QueuePool
            engine_kwargs["poolclass"] = NullPool

        try:
            self.engine = create_async_engine(async_url, **engine_kwargs)
            self.session_factory = async_sessionmaker(
                bind=self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=False
            )

            # Test connection with health check query
            async with self.engine.begin() as conn:
                res = await conn.execute(text("SELECT 1"))
                res.scalar()
                self.dialect_name = self.engine.dialect.name
                self.is_connected = True

                # Configure SQLite Write-Ahead Logging (WAL) and busy timeout to avoid 'database is locked' errors
                if not self.is_postgres:
                    try:
                        await conn.execute(text("PRAGMA journal_mode=WAL;"))
                        await conn.execute(text("PRAGMA busy_timeout=10000;"))
                    except Exception as pragma_err:
                        logger.warning("Could not set SQLite WAL pragma: %s", pragma_err)

                # NOTE: Alembic migrations remain the authoritative source of truth for production database schemas.
                # Base.metadata.create_all and _run_safe_migrations are kept safe, non-destructive, and idempotent
                # to support rapid local prototyping and test suites.
                await conn.run_sync(Base.metadata.create_all)
                await self._run_safe_migrations(conn)

            safe_url = self._mask_url(async_url)
            active_db_label = "PostgreSQL (Supabase)" if self.is_postgres else "SQLite (WAL mode enabled)"
            logger.info("Active database: %s at %s", active_db_label, safe_url)
        except Exception as e:
            self.is_connected = False
            safe_url = self._mask_url(async_url)
            logger.critical("Failed to connect to database at %s: %s", safe_url, str(e))
            raise

    async def _run_safe_migrations(self, conn) -> None:
        """
        Executes non-destructive schema migrations to ensure columns for metal holdings
        (asset_type, metal_type, purity) exist without altering or deleting existing records.
        """
        try:
            if self.is_postgres:
                await conn.execute(text("ALTER TABLE holdings ADD COLUMN IF NOT EXISTS asset_type VARCHAR(20) DEFAULT 'STOCK';"))
                await conn.execute(text("ALTER TABLE holdings ADD COLUMN IF NOT EXISTS metal_type VARCHAR(20);"))
                await conn.execute(text("ALTER TABLE holdings ADD COLUMN IF NOT EXISTS purity VARCHAR(20);"))
                await conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS asset_type VARCHAR(20) DEFAULT 'STOCK';"))
            else:
                res = await conn.execute(text("PRAGMA table_info(holdings);"))
                h_cols = {row[1] for row in res.fetchall()}
                if h_cols:
                    if "asset_type" not in h_cols:
                        await conn.execute(text("ALTER TABLE holdings ADD COLUMN asset_type VARCHAR(20) DEFAULT 'STOCK';"))
                    if "metal_type" not in h_cols:
                        await conn.execute(text("ALTER TABLE holdings ADD COLUMN metal_type VARCHAR(20);"))
                    if "purity" not in h_cols:
                        await conn.execute(text("ALTER TABLE holdings ADD COLUMN purity VARCHAR(20);"))

                res_tx = await conn.execute(text("PRAGMA table_info(transactions);"))
                tx_cols = {row[1] for row in res_tx.fetchall()}
                if tx_cols:
                    if "asset_type" not in tx_cols:
                        await conn.execute(text("ALTER TABLE transactions ADD COLUMN asset_type VARCHAR(20) DEFAULT 'STOCK';"))

            await conn.execute(text("UPDATE holdings SET asset_type = 'STOCK' WHERE asset_type IS NULL;"))
            await conn.execute(text("UPDATE transactions SET asset_type = 'STOCK' WHERE asset_type IS NULL;"))
        except Exception as e:
            logger.warning("Safe migration check warning: %s", str(e))

    async def disconnect(self) -> None:
        """Gracefully disposes the connection pool."""
        if self.engine:
            await self.engine.dispose()
            self.is_connected = False
            logger.info("Database connection pool disposed cleanly.")

    async def check_health(self) -> Dict[str, Any]:
        """Runs a ping query to verify database liveness."""
        if not self.engine or not self.is_connected:
            try:
                await self.connect()
            except Exception as e:
                return {"status": "unhealthy", "error": f"Database not connected: {e}"}
        try:
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
                return {
                    "status": "healthy",
                    "dialect": self.dialect_name,
                    "is_postgres": self.is_postgres,
                    "pool_size": settings.DB_POOL_SIZE if self.is_postgres else 1
                }
        except Exception as e:
            logger.error("Database health check ping failed: %s", str(e))
            return {"status": "unhealthy", "error": str(e)}

    @staticmethod
    def _mask_url(url: str) -> str:
        """Masks database password in connection string for safe logging."""
        import re
        return re.sub(r":([^:@]+)@", ":****@", url)

db_manager = DatabaseManager()

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency yielding an isolated AsyncSession per request.
    Handles commit on normal exit and rollback on exception.
    """
    if db_manager.session_factory is None:
        await db_manager.connect()

    async with db_manager.session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

@asynccontextmanager
async def get_background_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager providing a safe, scoped AsyncSession for background services and scripts.
    Guarantees session cleanup, commit, and rollback without sharing state across concurrent workers.
    """
    if db_manager.session_factory is None:
        await db_manager.connect()

    async with db_manager.session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
