import pytest
import numpy as np
import pandas as pd
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.ai.metal_risk_engine import evaluate_metal_risk, _METALS_RISK_CACHE

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_metal_risk_cache():
    _METALS_RISK_CACHE["gold"]["data"] = None
    _METALS_RISK_CACHE["gold"]["time"] = 0.0
    _METALS_RISK_CACHE["silver"]["data"] = None
    _METALS_RISK_CACHE["silver"]["time"] = 0.0
    yield
    _METALS_RISK_CACHE["gold"]["data"] = None
    _METALS_RISK_CACHE["gold"]["time"] = 0.0
    _METALS_RISK_CACHE["silver"]["data"] = None
    _METALS_RISK_CACHE["silver"]["time"] = 0.0


def _generate_synthetic_history(days: int = 100, base_price: float = 2700.0) -> pd.DataFrame:
    """Helper generating deterministic synthetic historical dataframe for metals."""
    dates = pd.date_range(end="2026-10-26", periods=days, freq="B")
    t = np.linspace(0, 10, days)
    prices = base_price + (base_price * 0.05) * np.sin(t) + np.linspace(0, base_price * 0.02, days)
    df = pd.DataFrame({
        "Open": prices * 0.995,
        "High": prices * 1.01,
        "Low": prices * 0.99,
        "Close": prices,
        "Volume": 50000
    }, index=dates)
    return df


def test_gold_risk_analysis_mocked():
    """Verify Gold risk assessment calculates valid multi-tier metrics using mocked feeds."""
    mock_gold_snap = {
        "status": "available",
        "gold_symbol": "XAU",
        "commodity_name": "Gold Bullion (Visakhapatnam, Andhra Pradesh)",
        "inr_per_10g_estimate": 78500.0,
        "inr_per_10g_forex_parity": 68000.0,
        "usdinr_rate": 86.85,
        "price_usd_per_oz": 2720.0,
        "gold_to_silver_ratio": 77.5,
        "karats": {
            "24k_10g": 78500.0,
            "22k_10g": 72000.0
        },
        "international_benchmarks": {
            "global_spot_usd_oz": 2720.0,
            "usdinr_rate": 86.85,
            "import_duty_pct": 15.0
        }
    }

    gold_df = _generate_synthetic_history(90, base_price=2720.0)
    inr_df = _generate_synthetic_history(90, base_price=86.85)

    mock_gold_ticker = MagicMock()
    mock_gold_ticker.history.return_value = gold_df
    mock_inr_ticker = MagicMock()
    mock_inr_ticker.history.return_value = inr_df

    def mock_ticker_init(ticker_symbol):
        if "GC=F" in ticker_symbol:
            return mock_gold_ticker
        return mock_inr_ticker

    with patch("app.ai.metal_risk_engine.get_gold_snapshot", return_value=mock_gold_snap), \
         patch("yfinance.Ticker", side_effect=mock_ticker_init):
        res = evaluate_metal_risk("gold")

    assert res["status"] == "available"
    assert res["symbol"] == "XAU"
    assert res["company_name"] == "Gold (24K, Visakhapatnam)"
    assert res["current_price"] == 78500.0
    assert res["currency"] == "INR"
    assert res["overall_classification"] in ("Low Risk", "Moderate Risk", "High Risk")
    assert 0.0 <= res["risk_score"] <= 100.0
    assert len(res["rationale"]) > 10

    # Verify High Risk Tier
    high = res["high_risk_tier"]
    assert "volatility_score" in high
    assert 0.0 <= high["volatility_score"] <= 100.0
    assert high["atr_14"] > 0
    assert 0.0 <= high["rsi_14"] <= 100.0
    assert "short_term_momentum" in high
    assert high["support_level"] > 0
    assert high["resistance_level"] >= high["support_level"]
    assert high["breakdown_risk"] in ("Elevated", "Moderate", "Low")
    assert len(high["potential_triggers"]) >= 2
    assert len(high["exit_conditions"]) >= 2
    assert "market_insight" in high
    assert high["market_insight"]["status_badge"] in ("Bullish", "Bearish", "Sideways", "Uncertain")

    # Verify Moderate Risk Tier
    mod = res["moderate_risk_tier"]
    assert "technical_score" in mod
    assert 0.0 <= mod["technical_score"] <= 100.0
    assert "usdinr_trend" in mod
    assert "spot_vs_domestic_parity" in mod
    assert mod["gold_to_silver_ratio"] is not None
    assert len(mod["opportunities"]) >= 2
    assert len(mod["risks"]) >= 2
    assert "market_insight" in mod

    # Verify Low Risk Tier
    low = res["low_risk_tier"]
    assert "one_year_max_drawdown" in low
    assert low["one_year_max_drawdown"] >= 0.0
    assert "long_term_annualized_volatility" in low
    assert "usdinr_correlation" in low
    assert "currency_hedge_effectiveness" in low
    assert "import_duty_and_gst_risk" in low
    assert len(low["long_term_risk_factors"]) >= 2
    assert "market_insight" in low


def test_silver_risk_analysis_mocked():
    """Verify Silver risk assessment calculates valid multi-tier metrics using mocked feeds."""
    mock_silver_snap = {
        "status": "available",
        "silver_symbol": "XAG",
        "commodity_name": "Silver Bullion (Visakhapatnam, Andhra Pradesh)",
        "price_per_kg": 98500.0,
        "inr_per_kg": 98500.0,
        "inr_per_kg_forex_parity": 82000.0,
        "usdinr_rate": 86.85,
        "price_usd_per_oz": 34.50,
        "gold_to_silver_ratio": 78.8,
        "international_benchmarks": {
            "global_spot_usd_oz": 34.50,
            "usdinr_rate": 86.85,
            "import_duty_pct": 15.0
        }
    }

    silver_df = _generate_synthetic_history(90, base_price=34.50)
    inr_df = _generate_synthetic_history(90, base_price=86.85)

    mock_silver_ticker = MagicMock()
    mock_silver_ticker.history.return_value = silver_df
    mock_inr_ticker = MagicMock()
    mock_inr_ticker.history.return_value = inr_df

    def mock_ticker_init(ticker_symbol):
        if "SI=F" in ticker_symbol:
            return mock_silver_ticker
        return mock_inr_ticker

    with patch("app.ai.metal_risk_engine.get_silver_snapshot", return_value=mock_silver_snap), \
         patch("yfinance.Ticker", side_effect=mock_ticker_init):
        res = evaluate_metal_risk("silver")

    assert res["status"] == "available"
    assert res["symbol"] == "XAG"
    assert res["company_name"] == "Silver 999 (Visakhapatnam)"
    assert res["current_price"] == 98500.0
    assert res["currency"] == "INR"
    assert res["overall_classification"] in ("Low Risk", "Moderate Risk", "High Risk")
    assert 0.0 <= res["risk_score"] <= 100.0
    assert len(res["rationale"]) > 10

    # Verify silver tiers
    assert "high_risk_tier" in res
    assert "moderate_risk_tier" in res
    assert "low_risk_tier" in res
    assert res["high_risk_tier"]["atr_14"] > 0
    assert res["moderate_risk_tier"]["technical_score"] >= 0.0
    assert res["low_risk_tier"]["one_year_max_drawdown"] >= 0.0


def test_metal_risk_invalid_metal_returns_400():
    """Verify requesting an unsupported metal returns HTTP 400."""
    response = client.get("/api/metals/copper/risk-analysis")
    assert response.status_code == 400
    err = response.json()
    assert "Invalid metal" in (err.get("detail") or "")


def test_metal_risk_missing_domestic_prices_unavailable():
    """Verify that when domestic snapshot is offline/unavailable, endpoint reports status='unavailable'."""
    with patch("app.ai.metal_risk_engine.get_gold_snapshot", return_value={"status": "unavailable", "message": "Feed offline"}):
        res = evaluate_metal_risk("gold")

    assert res["status"] == "unavailable"
    assert "unavailable" in res["message"].lower()
    assert res["symbol"] == "XAU"


def test_metal_risk_missing_historical_data_unavailable():
    """Verify that when historical data is missing or empty, status='unavailable' without fabrication."""
    mock_gold_snap = {
        "status": "available",
        "inr_per_10g_estimate": 78500.0,
        "karats": {"24k_10g": 78500.0}
    }
    empty_df = pd.DataFrame()

    mock_ticker = MagicMock()
    mock_ticker.history.return_value = empty_df

    with patch("app.ai.metal_risk_engine.get_gold_snapshot", return_value=mock_gold_snap), \
         patch("yfinance.Ticker", return_value=mock_ticker), \
         patch("yfinance.download", return_value=empty_df):
        res = evaluate_metal_risk("gold")

    assert res["status"] == "unavailable"
    assert "historical" in res["message"].lower()


def test_metals_risk_analysis_endpoint_integration():
    """Verify HTTP GET /api/metals/gold/risk-analysis & /silver/risk-analysis integration."""
    mock_gold_snap = {
        "status": "available",
        "gold_symbol": "XAU",
        "inr_per_10g_estimate": 78900.0,
        "karats": {"24k_10g": 78900.0},
        "usdinr_rate": 86.85,
        "price_usd_per_oz": 2730.0,
        "international_benchmarks": {"global_spot_usd_oz": 2730.0, "usdinr_rate": 86.85}
    }

    gold_df = _generate_synthetic_history(90, base_price=2730.0)
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = gold_df

    with patch("app.ai.metal_risk_engine.get_gold_snapshot", return_value=mock_gold_snap), \
         patch("yfinance.Ticker", return_value=mock_ticker):
        resp = client.get("/api/metals/gold/risk-analysis")

    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "XAU"
    assert data["company_name"] == "Gold (24K, Visakhapatnam)"
    assert data["current_price"] == 78900.0
    assert "high_risk_tier" in data
    assert "moderate_risk_tier" in data
    assert "low_risk_tier" in data


def test_metals_risk_cache_behavior():
    """Verify that evaluate_metal_risk caches results and serves cached data within TTL."""
    mock_gold_snap = {
        "status": "available",
        "gold_symbol": "XAU",
        "inr_per_10g_estimate": 78000.0,
        "karats": {"24k_10g": 78000.0},
        "usdinr_rate": 86.85,
        "price_usd_per_oz": 2700.0
    }
    gold_df = _generate_synthetic_history(80, base_price=2700.0)
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = gold_df

    with patch("app.ai.metal_risk_engine.get_gold_snapshot", return_value=mock_gold_snap) as mock_snap, \
         patch("yfinance.Ticker", return_value=mock_ticker):
        res1 = evaluate_metal_risk("gold")
        res2 = evaluate_metal_risk("gold")

    assert res1["current_price"] == res2["current_price"]
    assert mock_snap.call_count == 1  # Second call served from cache
