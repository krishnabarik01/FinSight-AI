import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.silver_data import (
    fetch_nebula_metals_silver,
    get_silver_snapshot,
    get_silver_history,
    store_domestic_silver_snapshot,
    _query_domestic_silver_records,
    _SILVER_CACHE
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_silver_caches():
    _SILVER_CACHE.clear()
    yield
    _SILVER_CACHE.clear()


def _generate_synthetic_silver_history(days: int = 100) -> pd.DataFrame:
    """Helper generating deterministic synthetic historical dataframe for tests."""
    dates = pd.date_range(end="2026-10-26", periods=days, freq="B")
    t = np.linspace(0, 10, days)
    # Reasonable synthetic silver prices around 30 - 55 USD/oz
    prices = 35.0 + 10.0 * np.sin(t) + np.linspace(0, 8.0, days)
    df = pd.DataFrame({
        "Open": prices * 0.99,
        "High": prices * 1.01,
        "Low": prices * 0.98,
        "Close": prices,
        "Volume": 45000
    }, index=dates)
    return df


def test_silver_snapshot_offline_mocked():
    """Verify silver snapshot operates with offline / synthetic yfinance fixtures."""
    silver_df = _generate_synthetic_silver_history(10)
    dates = silver_df.index
    columns = pd.MultiIndex.from_tuples([
        ("Close", "SI=F"), ("Close", "INR=X"),
        ("High", "SI=F"), ("High", "INR=X"),
        ("Low", "SI=F"), ("Low", "INR=X"),
        ("Open", "SI=F"), ("Open", "INR=X"),
        ("Volume", "SI=F"), ("Volume", "INR=X")
    ], names=["Price", "Ticker"])
    batch_df = pd.DataFrame(index=dates, columns=columns)
    batch_df[("Close", "SI=F")] = 54.00
    batch_df[("Close", "INR=X")] = 95.00
    batch_df[("High", "SI=F")] = 54.50
    batch_df[("High", "INR=X")] = 95.10
    batch_df[("Low", "SI=F")] = 53.50
    batch_df[("Low", "INR=X")] = 94.90
    batch_df[("Open", "SI=F")] = 53.80
    batch_df[("Open", "INR=X")] = 94.95
    batch_df[("Volume", "SI=F")] = 30000
    batch_df[("Volume", "INR=X")] = 0

    with patch("app.services.silver_data.fetch_nebula_metals_silver", return_value=None), \
         patch("yfinance.download", return_value=batch_df):
        res = get_silver_snapshot()

    assert res["status"] == "available"
    assert res["silver_symbol"] == "SI=F"
    assert res["price_usd_per_oz"] == 54.00
    assert "COMEX Futures" in res["data_source"]
    assert res["inr_per_kg_forex_parity"] > 0
    assert res["city"] == "Visakhapatnam"


def test_silver_snapshot_unavailable_when_offline_or_empty():
    """Verify that when feeds are offline and yfinance returns empty, status is 'unavailable'."""
    empty_df = pd.DataFrame()

    with patch("app.services.silver_data.fetch_nebula_metals_silver", return_value=None), \
         patch("yfinance.download", return_value=empty_df):
        res = get_silver_snapshot()

    assert res["status"] == "unavailable"
    assert "unavailable" in res["message"].lower()
    assert "price_usd_per_oz" not in res


def test_nebula_metals_live_silver_snapshot_parsing():
    """Verify Nebula Metals real-time feed parses Silver base, GST breakdown, and city metadata."""
    mock_nebula_payload = {
        "success": True,
        "date": "2026-10-26",
        "city": "Vishakhapatnam",
        "market": "Indian Market",
        "timestamp": "2026-10-26T15:44:22.419Z",
        "prices": {
            "silver": {
                "basePricePerGram": 222.08,
                "gstAmountPerGram": 6.66,
                "finalPricePerGram": 228.74,
                "pricePerGram": 228.74,
                "pricePerKg": 228743,
                "currency": "INR"
            }
        },
        "metadata": {
            "sources_used": ["Nebula Metals engine NME-2"],
            "confidence": "medium",
            "validation_passed": True,
            "gst_included": True,
            "source_details": {
                "engine": {
                    "rate_type": "live",
                    "stale": False,
                    "spot_usd_oz": 54.361,
                    "usd_inr": 95.1855,
                    "import_duty": 0.15,
                    "retail_spread": 0.136,
                    "city_differential": 0.022
                }
            }
        },
        "validation_notes": "Silver calibrated with 15% duty and 3% GST."
    }

    with patch("app.services.silver_data.fetch_nebula_metals_silver", return_value=mock_nebula_payload):
        res = get_silver_snapshot(city="Visakhapatnam")

    assert res["status"] == "available"
    assert "Nebula Metals" in res["data_source"]
    assert res["city"] == "Visakhapatnam"
    assert res["price_per_kg"] == 228743.0
    assert res["price_per_gram"] == 228.74
    assert res["base_price_1g"] == 222.08
    assert res["gst_amount_1g"] == 6.66
    assert res["domestic_rates"]["purities"]["silver999"]["price_per_kg"] == 228743.0
    assert res["domestic_rates"]["purities"]["silver925"]["purity_pct"] == 92.5
    assert res["international_benchmarks"]["global_spot_usd_oz"] == 54.361
    assert res["currency"] == "INR"


def test_nebula_metals_silver_rate_limit_or_error_fallback():
    """Verify that when Nebula Metals returns None, it cleanly falls back to COMEX."""
    silver_df = _generate_synthetic_silver_history(10)
    dates = silver_df.index
    columns = pd.MultiIndex.from_tuples([
        ("Close", "SI=F"), ("Close", "INR=X"),
        ("High", "SI=F"), ("High", "INR=X"),
        ("Low", "SI=F"), ("Low", "INR=X"),
        ("Open", "SI=F"), ("Open", "INR=X"),
        ("Volume", "SI=F"), ("Volume", "INR=X")
    ], names=["Price", "Ticker"])
    batch_df = pd.DataFrame(index=dates, columns=columns)
    batch_df[("Close", "SI=F")] = 52.00
    batch_df[("Close", "INR=X")] = 95.00
    batch_df[("High", "SI=F")] = 52.50
    batch_df[("High", "INR=X")] = 95.10
    batch_df[("Low", "SI=F")] = 51.50
    batch_df[("Low", "INR=X")] = 94.90
    batch_df[("Open", "SI=F")] = 51.80
    batch_df[("Open", "INR=X")] = 94.95
    batch_df[("Volume", "SI=F")] = 30000
    batch_df[("Volume", "INR=X")] = 0

    with patch("app.services.silver_data.fetch_nebula_metals_silver", return_value=None), \
         patch("yfinance.download", return_value=batch_df):
        res = get_silver_snapshot()

    assert res["status"] == "available"
    assert res["price_usd_per_oz"] == 52.00
    assert "COMEX Futures" in res["data_source"]
    assert res["domestic_rates"] is None


def test_silver_history_domestic_snapshots():
    """Verify silver history returns genuine Indian domestic records with GST breakdown."""
    mock_nebula_payload = {
        "success": True,
        "date": "2026-10-26",
        "city": "Vishakhapatnam",
        "market": "Indian Market",
        "prices": {
            "silver": {
                "basePricePerGram": 222.08,
                "gstAmountPerGram": 6.66,
                "finalPricePerGram": 228.74,
                "pricePerGram": 228.74,
                "pricePerKg": 228743,
                "currency": "INR"
            }
        },
        "metadata": {"gst_included": True}
    }

    with patch("app.services.silver_data.fetch_nebula_metals_silver", return_value=mock_nebula_payload):
        res = get_silver_history(city="Visakhapatnam", period="1mo", force_refresh=True)

    assert res["status"] == "available"
    assert "Nebula Metals" in res["data_source"]
    assert res["gst_included"] is True
    assert res["city"] == "Visakhapatnam"
    assert "total_records_for_city" in res
    assert len(res["records"]) > 0
    rec = next(r for r in res["records"] if r["date"] == mock_nebula_payload["date"])
    assert rec["price_per_kg"] == 228743.0
    assert rec["base_price_1g"] == 222.08
    assert rec["gst_amount_1g"] == 6.66
    assert rec["gst_included"] is True


def test_metals_silver_api_endpoints_integration():
    """Verify HTTP GET /api/metals/silver/* endpoints return 200 with structured responses."""
    silver_df = _generate_synthetic_silver_history(120)

    dates = silver_df.index
    columns = pd.MultiIndex.from_tuples([
        ("Close", "SI=F"), ("Close", "INR=X"),
        ("High", "SI=F"), ("High", "INR=X"),
        ("Low", "SI=F"), ("Low", "INR=X"),
        ("Open", "SI=F"), ("Open", "INR=X"),
        ("Volume", "SI=F"), ("Volume", "INR=X")
    ], names=["Price", "Ticker"])
    batch_df = pd.DataFrame(index=dates, columns=columns)
    batch_df[("Close", "SI=F")] = 53.50
    batch_df[("Close", "INR=X")] = 95.10
    batch_df[("High", "SI=F")] = 54.00
    batch_df[("High", "INR=X")] = 95.20
    batch_df[("Low", "SI=F")] = 53.00
    batch_df[("Low", "INR=X")] = 95.00
    batch_df[("Open", "SI=F")] = 53.20
    batch_df[("Open", "INR=X")] = 95.05
    batch_df[("Volume", "SI=F")] = 50000
    batch_df[("Volume", "INR=X")] = 0

    mock_nebula = {
        "success": True,
        "date": "2026-10-26",
        "city": "Vishakhapatnam",
        "market": "Indian Market",
        "prices": {
            "silver": {
                "basePricePerGram": 222.08,
                "gstAmountPerGram": 6.66,
                "finalPricePerGram": 228.74,
                "pricePerGram": 228.74,
                "pricePerKg": 228743,
                "currency": "INR"
            }
        },
        "metadata": {
            "source_details": {
                "engine": {"spot_usd_oz": 54.36, "usd_inr": 95.18, "import_duty": 0.15, "retail_spread": 0.136}
            }
        }
    }

    with patch("app.services.silver_data.fetch_nebula_metals_silver", return_value=mock_nebula), \
         patch("yfinance.download", return_value=batch_df):

        # 1. Silver snapshot endpoint
        snap_res = client.get("/api/metals/silver/snapshot?city=Visakhapatnam")
        assert snap_res.status_code == 200
        snap_data = snap_res.json()
        assert snap_data["status"] == "available"
        assert snap_data["price_per_kg"] == 228743.0
        assert "Nebula Metals" in snap_data["data_source"]
        assert snap_data["city"] == "Visakhapatnam"

        # 2. Silver history endpoint
        hist_res = client.get("/api/metals/silver/history?city=Visakhapatnam&period=1mo")
        assert hist_res.status_code == 200
        hist_data = hist_res.json()
        assert hist_data["status"] == "available"
        assert len(hist_data["records"]) > 0
        assert hist_data["records"][0]["price_per_kg"] > 0
        assert hist_data["records"][0]["gst_included"] is True
