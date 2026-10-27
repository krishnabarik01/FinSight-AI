import os
import re
import logging
import pathlib
from typing import Optional, List
from pydantic import BaseModel, model_validator
from dotenv import load_dotenv

logger = logging.getLogger("finsight.config")

# Search workspace root and backend directory for .env
_current_dir = pathlib.Path(__file__).resolve().parent
_root_env = _current_dir.parent.parent / ".env"
_backend_env = _current_dir.parent / ".env"

if _root_env.exists():
    load_dotenv(dotenv_path=_root_env, override=True)
if _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env, override=True)
load_dotenv(override=True)

class Settings(BaseModel):
    APP_NAME: str = "FinSight AI"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = os.getenv("APP_ENV", "dev").lower()
    
    # Secret Key for JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # CORS Allowed Origins
    ALLOWED_ORIGINS: List[str] = [
        o.strip() for o in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://finsight-ai-1-n7mt.onrender.com"
        ).split(",") if o.strip()
    ]

    # Real-Time Precious Metals API Configuration (Nebula Metals)
    NEBULA_API_KEY: str = os.getenv("NEBULA_API_KEY", "")
    NEBULA_API_URL: str = os.getenv("NEBULA_API_URL", "https://workspace.nebulaapi.com")
    NEBULA_DEFAULT_CITY: str = os.getenv("NEBULA_DEFAULT_CITY", "Visakhapatnam")

    # Groww API Configuration (Primary stock market data provider)
    GROWW_API_KEY: str = os.getenv("GROWW_API_KEY", "")
    GROWW_API_SECRET: str = os.getenv("GROWW_API_SECRET", "")
    GROWW_AUTH_TOKEN: str = os.getenv("GROWW_AUTH_TOKEN", "")
    GROWW_API_URL: str = os.getenv("GROWW_API_URL", "https://api.groww.in/v1")

    # Gemini AI Integration
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    # Cache Configuration (Optional Redis URL)
    REDIS_URL: str = os.getenv("REDIS_URL", "")

    # PostgreSQL / Supabase connection URLs
    DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL")
    SYNC_DATABASE_URL: Optional[str] = os.getenv("SYNC_DATABASE_URL")

    # Database Pool Settings
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "10"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "20"))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    DB_POOL_RECYCLE: int = int(os.getenv("DB_POOL_RECYCLE", "300"))
    DB_ECHO: bool = os.getenv("DB_ECHO", "false").lower() in ("true", "1", "yes")

    # Twilio voice settings (Optional)
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER: str = os.getenv("TWILIO_PHONE_NUMBER", "")

    # Monitoring
    MONITORING_INTERVAL_SECONDS: int = int(os.getenv("MONITORING_INTERVAL_SECONDS", "60"))
    DEFAULT_COOLDOWN_MINUTES: int = 30

    @model_validator(mode="after")
    def validate_security_settings(self):
        # In non-dev mode, SECRET_KEY must be provided and not be an insecure default
        if self.APP_ENV != "dev":
            if not self.SECRET_KEY or self.SECRET_KEY == "finsight_ai_super_secret_jwt_key_2026_financial_platform_sec":
                raise ValueError("SECURITY ERROR: In non-dev environments (APP_ENV != 'dev'), SECRET_KEY must be explicitly set and not use default values!")
        else:
            if not self.SECRET_KEY:
                self.SECRET_KEY = "dev-insecure-secret-key-finsight-ai-2026-development-only"
                logger.warning("No SECRET_KEY set. Using local development fallback key because APP_ENV=dev.")
        return self

    def get_async_database_url(self) -> str:
        """
        Returns normalized async database URL with appropriate driver.
        Postgres (Supabase) in prod; SQLite fallback only when APP_ENV=dev.
        """
        raw_url = self.DATABASE_URL
        if not raw_url or "your_project_ref" in raw_url or "your_password_here" in raw_url or raw_url.startswith("sqlite"):
            if self.APP_ENV != "dev":
                raise ValueError(
                    f"CRITICAL: Production DATABASE_URL missing or unconfigured. Cannot start in '{self.APP_ENV}' mode without a valid PostgreSQL database."
                )
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = pathlib.Path(base_dir) / "data" / "finsight_local.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
            logger.warning("*******************************************************************************")
            logger.warning("NOTICE: Running with local SQLite fallback database (%s).", db_path.as_posix())
            logger.warning("Active database: SQLite (APP_ENV=dev). Never use in production!")
            logger.warning("*******************************************************************************")
            return f"sqlite+aiosqlite:///{db_path.as_posix()}"

        # Normalize postgres / postgresql schemes to asyncpg
        if raw_url.startswith("postgres://"):
            return raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
            return raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return raw_url

    def get_sync_database_url(self) -> str:
        """
        Returns normalized synchronous database URL for Alembic migrations.
        """
        raw_url = self.SYNC_DATABASE_URL or self.DATABASE_URL
        if not raw_url or "your_project_ref" in raw_url or "your_password_here" in raw_url:
            if self.APP_ENV != "dev":
                raise ValueError(
                    f"CRITICAL: Production SYNC_DATABASE_URL missing in '{self.APP_ENV}' mode."
                )
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = pathlib.Path(base_dir) / "data" / "finsight_local.db"
            return f"sqlite:///{db_path.as_posix()}"

        if "+asyncpg" in raw_url:
            return raw_url.replace("+asyncpg", "", 1)
        if raw_url.startswith("postgres://"):
            return raw_url.replace("postgres://", "postgresql://", 1)
        return raw_url

    def is_supabase_pooler(self) -> bool:
        url = self.DATABASE_URL or ""
        return ":6543" in url or "pooler.supabase.com" in url

settings = Settings()
