import os
import sys
import uuid
import tempfile
import pathlib
import pytest
from typing import Dict, Any, Generator

# 1. Capture original environment before any overrides
_ORIGINAL_DATABASE_URL = os.environ.get("DATABASE_URL")

# Create temporary SQLite directory and file immediately before app modules are imported
_TEMP_SESSION_DIR = tempfile.TemporaryDirectory(prefix="finsight_test_db_")
_TEMP_DB_PATH = pathlib.Path(_TEMP_SESSION_DIR.name) / "test_finsight.db"
_TEMP_DB_URL = f"sqlite+aiosqlite:///{_TEMP_DB_PATH.as_posix()}"

# Set DATABASE_URL environment variable BEFORE any app module import
os.environ["DATABASE_URL"] = _TEMP_DB_URL

# Ensure backend root is in sys.path
backend_root = str(pathlib.Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

# Import config and app after environment is configured
from app.config import settings
settings.DATABASE_URL = _TEMP_DB_URL
from app.main import app
from app.database.connection import db_manager, get_background_session
from app.notifications.voice_provider import voice_provider
import app.services.monitor as monitor_module

@pytest.fixture(scope="session")
def anyio_backend() -> str:
    """Explicitly declare asyncio as the anyio async backend."""
    return "asyncio"

@pytest.fixture(scope="session", autouse=True)
def temp_database_lifecycle(tmp_path_factory) -> Generator[pathlib.Path, None, None]:
    """
    Session-level fixture managing the temporary SQLite file lifecycle.
    Guarantees that the real database (finsight_local.db) is never touched.
    Restores the original environment at test completion.
    """
    yield _TEMP_DB_PATH

    # Teardown: restore environment
    if _ORIGINAL_DATABASE_URL is not None:
        os.environ["DATABASE_URL"] = _ORIGINAL_DATABASE_URL
        settings.DATABASE_URL = _ORIGINAL_DATABASE_URL
    else:
        os.environ.pop("DATABASE_URL", None)
        settings.DATABASE_URL = None

    try:
        _TEMP_SESSION_DIR.cleanup()
    except Exception:
        pass

@pytest.fixture
def temp_db_path() -> pathlib.Path:
    """Returns the pathlib.Path to the currently active temporary SQLite database file."""
    return _TEMP_DB_PATH

@pytest.fixture
def client(monkeypatch) -> Generator[Any, None, None]:
    """
    Provides a FastAPI TestClient wrapped in a lifespan context manager.
    Initializes database schema and seed data cleanly on startup and tears down on shutdown.
    """
    from fastapi.testclient import TestClient

    # Set very large monitoring interval so background task does not interfere with test flow
    monkeypatch.setattr(settings, "MONITORING_INTERVAL_SECONDS", 999999)

    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def make_user(client):
    """
    Helper fixture to register a new user with a unique UUID email,
    returning user metadata, bearer token, and pre-formatted authorization headers.
    """
    def _create_user(
        name: str = "Test User",
        password: str = "SecurePass123!",
        phone: str = "+14155551234"
    ) -> Dict[str, Any]:
        unique_email = f"test_{uuid.uuid4().hex[:12]}@finsight-test.ai"
        response = client.post("/api/auth/register", json={
            "name": name,
            "email": unique_email,
            "password": password,
            "phone": phone
        })
        assert response.status_code == 200, f"make_user failed: {response.text}"
        data = response.json()
        token = data["access_token"]
        return {
            "id": data["user"]["id"],
            "name": name,
            "email": unique_email,
            "password": password,
            "phone": phone,
            "token": token,
            "headers": {"Authorization": f"Bearer {token}"},
            "user": data["user"]
        }
    return _create_user

@pytest.fixture(autouse=True)
def reset_alert_cooldowns():
    """
    Resets the module-level _ALERT_COOLDOWNS dictionary in app.services.monitor
    both before and after every test to guarantee test isolation.
    """
    monitor_module._ALERT_COOLDOWNS.clear()
    yield
    monitor_module._ALERT_COOLDOWNS.clear()

@pytest.fixture
def mock_stock_data_builder():
    """
    Factory fixture to produce customized mock quote payloads
    for fine-grained risk and alert testing.
    """
    def _builder(
        symbol: str = "RELIANCE.NS",
        current_price: float = 2985.40,
        company_name: str = "Reliance Industries Limited",
        rsi_14: float = 54.2,
        volatility_annual: float = 21.5,
        atr_14: float = 45.0,
        support_level: float = 2840.0,
        resistance_level: float = 3100.0,
        change_pct: float = 1.0,
        sector: str = "Energy & Conglomerate"
    ) -> Dict[str, Any]:
        return {
            "symbol": symbol.upper(),
            "company_name": company_name,
            "currency": "USD",
            "exchange": "NASDAQ",
            "current_price": float(current_price),
            "previous_close": round(float(current_price) * 0.99, 2),
            "change": round(float(current_price) * 0.01, 2),
            "change_pct": float(change_pct),
            "support_level": float(support_level),
            "resistance_level": float(resistance_level),
            "sector": sector,
            "indicators": {
                "rsi_14": float(rsi_14),
                "volatility_annual": float(volatility_annual),
                "atr_14": float(atr_14),
                "macd": 1.25,
                "macd_signal": 1.05,
                "sma_20": float(current_price * 0.99),
                "sma_50": float(current_price * 0.97),
                "sma_200": float(current_price * 0.92)
            }
        }
    return _builder

@pytest.fixture(autouse=True)
def mock_external_providers(monkeypatch, mock_stock_data_builder):
    """
    Autouse fixture that safely mocks get_stock_data and voice_provider.
    Guarantees no external internet calls to yfinance or Twilio occur.
    Individual tests can further override get_stock_data via monkeypatch.
    """
    def _default_get_stock_data(symbol: str) -> Dict[str, Any]:
        return mock_stock_data_builder(symbol=symbol, current_price=200.0)

    monkeypatch.setattr("app.services.market_data.get_stock_data", _default_get_stock_data)
    monkeypatch.setattr("app.services.monitor.get_stock_data", _default_get_stock_data)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", _default_get_stock_data)
    monkeypatch.setattr("app.api.alerts.get_stock_data", _default_get_stock_data)

    async def _mock_dispatch_voice_call(to_phone: str, company_name: str, symbol: str, price: float, alert_reason: str, **kwargs):
        return {
            "call_id": f"CA_mock_{uuid.uuid4().hex[:12]}",
            "status": "completed",
            "mode": "test_mock",
            "to_phone": to_phone,
            "spoken_message": f"Test voice alert for {symbol} at {price}",
            "duration_seconds": 30,
            "timestamp": "2026-06-01T12:00:00Z"
        }

    monkeypatch.setattr(voice_provider, "dispatch_voice_call", _mock_dispatch_voice_call)
    monkeypatch.setattr("app.services.monitor.voice_provider.dispatch_voice_call", _mock_dispatch_voice_call)
