import pytest
import numpy as np
import pandas as pd
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.ai.metal_prediction_engine import generate_metal_predictions, _METALS_PREDICTIONS_CACHE

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_metal_predictions_cache():
    _METALS_PREDICTIONS_CACHE["gold"]["data"] = None
    _METALS_PREDICTIONS_CACHE["gold"]["time"] = 0.0
    _METALS_PREDICTIONS_CACHE["silver"]["data"] = None
    _METALS_PREDICTIONS_CACHE["silver"]["time"] = 0.0
    yield
    _METALS_PREDICTIONS_CACHE["gold"]["data"] = None
    _METALS_PREDICTIONS_CACHE["gold"]["time"] = 0.0
    _METALS_PREDICTIONS_CACHE["silver"]["data"] = None
    _METALS_PREDICTIONS_CACHE["silver"]["time"] = 0.0


def _generate_synthetic_history(days: int = 100, base_price: float = 2700.0) -> pd.DataFrame:
    """Helper generating deterministic synthetic historical dataframe for tests."""
    dates = pd.date_range(end="2026-10-26", periods=days, freq="B")
    t = np.linspace(0, 10, days)
    prices = base_price + (base_price * 0.04) * np.sin(t) + np.linspace(0, base_price * 0.02, days)
    df = pd.DataFrame({
        "Open": prices * 0.995,
        "High": prices * 1.01,
        "Low": prices * 0.99,
        "Close": prices,
        "Volume": 50000
    }, index=dates)
    return df


def test_gold_predictions_structure_and_horizons():
    """Verify Gold prediction generates expected horizons, prices in INR/10g, and validation metrics."""
    mock_gold_snap = {
        "status": "available",
        "gold_symbol": "XAU",
        "commodity_name": "Gold Bullion (Visakhapatnam, Andhra Pradesh)",
        "inr_per_10g_estimate": 78500.0,
        "usdinr_rate": 86.85,
        "price_usd_per_oz": 2720.0
    }

    gold_df = _generate_synthetic_history(100, base_price=2720.0)
    inr_df = _generate_synthetic_history(100, base_price=86.85)

    mock_gold_ticker = MagicMock()
    mock_gold_ticker.history.return_value = gold_df
    mock_inr_ticker = MagicMock()
    mock_inr_ticker.history.return_value = inr_df

    def mock_ticker_init(ticker_symbol):
        if "GC=F" in ticker_symbol:
            return mock_gold_ticker
        return mock_inr_ticker

    with patch("app.ai.metal_prediction_engine.get_gold_snapshot", return_value=mock_gold_snap), \
         patch("yfinance.Ticker", side_effect=mock_ticker_init):
        res = generate_metal_predictions("gold")

    assert res["status"] == "available"
    assert res["symbol"] == "XAU"
    assert res["company_name"] == "Gold (24K, Visakhapatnam)"
    assert res["current_price"] == 78500.0
    assert res["currency"] == "INR"
    assert res["unit"] == "INR per 10g (24K)"
    assert res["overall_signal"] in ("Bullish", "Bearish", "Neutral")
    assert 50.0 <= res["signal_conviction"] <= 100.0

    # Horizons check
    assert len(res["horizons"]) == 3
    horizons = [h["horizon"] for h in res["horizons"]]
    assert "1 Day" in horizons
    assert "1 Week" in horizons
    assert "1 Month" in horizons

    for h in res["horizons"]:
        assert h["predicted_price"] > 0
        assert h["confidence_interval_low"] <= h["confidence_interval_high"]
        assert 50.0 <= h["confidence_score"] <= 100.0
        assert h["bias"] in ("Bullish", "Bearish", "Neutral")

    # Feature Importance check
    assert "feature_importance" in res
    assert len(res["feature_importance"]) > 3
    assert all("feature" in f and "importance_pct" in f for f in res["feature_importance"])

    # Model metrics check
    assert "model_metrics" in res
    metrics = res["model_metrics"]
    assert "directional_accuracy_pct" in metrics
    assert "rmse" in metrics
    assert "mae" in metrics
    assert "r2_score" in metrics

    # Theses check
    assert len(res["technical_summary"]) > 10
    assert len(res["fundamental_summary"]) > 10


def test_silver_predictions_structure_and_units():
    """Verify Silver prediction generates expected horizons and price in INR/kg."""
    mock_silver_snap = {
        "status": "available",
        "silver_symbol": "XAG",
        "commodity_name": "Silver Bullion (Visakhapatnam, Andhra Pradesh)",
        "price_per_kg": 96500.0,
        "usdinr_rate": 86.85,
        "price_usd_per_oz": 34.50
    }

    silver_df = _generate_synthetic_history(100, base_price=34.50)
    inr_df = _generate_synthetic_history(100, base_price=86.85)

    mock_silver_ticker = MagicMock()
    mock_silver_ticker.history.return_value = silver_df
    mock_inr_ticker = MagicMock()
    mock_inr_ticker.history.return_value = inr_df

    def mock_ticker_init(ticker_symbol):
        if "SI=F" in ticker_symbol:
            return mock_silver_ticker
        return mock_inr_ticker

    with patch("app.ai.metal_prediction_engine.get_silver_snapshot", return_value=mock_silver_snap), \
         patch("yfinance.Ticker", side_effect=mock_ticker_init):
        res = generate_metal_predictions("silver")

    assert res["status"] == "available"
    assert res["symbol"] == "XAG"
    assert res["company_name"] == "Silver 999 (Visakhapatnam)"
    assert res["current_price"] == 96500.0
    assert res["unit"] == "INR per kg (999)"
    assert len(res["horizons"]) == 3


def test_metal_predictions_invalid_metal_returns_400():
    """Verify endpoint rejects unsupported metals with HTTP 400."""
    resp = client.get("/api/metals/platinum/prediction")
    assert resp.status_code == 400
    assert "Invalid metal" in resp.json().get("detail", "")


def test_metal_predictions_missing_domestic_price():
    """Verify endpoint returns status='unavailable' when domestic snapshot fails without fabricating prices."""
    with patch("app.ai.metal_prediction_engine.get_gold_snapshot", return_value={"status": "unavailable", "message": "Downstream feed down"}):
        res = generate_metal_predictions("gold")

    assert res["status"] == "unavailable"
    assert "unavailable" in res["message"].lower()


def test_metal_predictions_missing_history():
    """Verify endpoint returns status='unavailable' when historical bars are insufficient."""
    mock_snap = {
        "status": "available",
        "inr_per_10g_estimate": 78000.0
    }
    empty_df = pd.DataFrame()
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = empty_df

    with patch("app.ai.metal_prediction_engine.get_gold_snapshot", return_value=mock_snap), \
         patch("yfinance.Ticker", return_value=mock_ticker), \
         patch("yfinance.download", return_value=empty_df):
        res = generate_metal_predictions("gold")

    assert res["status"] == "unavailable"


def test_metal_predictions_cache_behavior():
    """Verify predictions are cached for 5 minutes and served from cache."""
    mock_snap = {
        "status": "available",
        "inr_per_10g_estimate": 78000.0,
        "usdinr_rate": 86.85
    }
    df = _generate_synthetic_history(80, base_price=2700.0)
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = df

    with patch("app.ai.metal_prediction_engine.get_gold_snapshot", return_value=mock_snap) as mock_s, \
         patch("yfinance.Ticker", return_value=mock_ticker):
        res1 = generate_metal_predictions("gold")
        res2 = generate_metal_predictions("gold")

    assert res1["current_price"] == res2["current_price"]
    assert mock_s.call_count == 1


def test_metal_predictions_endpoint_integration():
    """Verify HTTP GET /api/metals/gold/prediction returns HTTP 200 with complete schema."""
    mock_snap = {
        "status": "available",
        "gold_symbol": "XAU",
        "inr_per_10g_estimate": 78200.0,
        "usdinr_rate": 86.85
    }
    df = _generate_synthetic_history(80, base_price=2710.0)
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = df

    with patch("app.ai.metal_prediction_engine.get_gold_snapshot", return_value=mock_snap), \
         patch("yfinance.Ticker", return_value=mock_ticker):
        resp = client.get("/api/metals/gold/prediction")

    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "XAU"
    assert data["company_name"] == "Gold (24K, Visakhapatnam)"
    assert "horizons" in data
    assert "feature_importance" in data
    assert "model_metrics" in data


def test_existing_stock_predictions_intact():
    """Verify existing stock predictions endpoint remains fully functional."""
    resp = client.get("/api/stocks/RELIANCE.NS/predictions")
    assert resp.status_code == 200
    data = resp.json()
    assert "RELIANCE" in data["symbol"]
    assert "horizons" in data
    assert len(data["horizons"]) >= 1
