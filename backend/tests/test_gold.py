import os
import sys
import pytest
import numpy as np
import pandas as pd
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app
from app.services.gold_data import (
    get_gold_snapshot,
    get_gold_history,
    fetch_nebula_metals_cities,
    fetch_nebula_metals_gold,
    _GOLD_CACHE,
    _CITIES_CACHE,
    TROY_OZ_TO_GRAMS
)
from app.ai.gold_predictor import generate_gold_predictions, _GOLD_PREDICTIONS_CACHE

client = TestClient(app)

def _generate_synthetic_gold_history(days=200):
    """Generates synthetic price data for offline testing."""
    dates = pd.date_range(end=pd.Timestamp.now(), periods=days, freq="D")
    base_price = 2650.0
    returns = np.sin(np.linspace(0, 10, days)) * 0.01 + 0.0005
    prices = [base_price]
    for r in returns[1:]:
        prices.append(prices[-1] * (1.0 + r))
    prices = np.array(prices)

    df = pd.DataFrame({
        "Open": prices * 0.998,
        "High": prices * 1.008,
        "Low": prices * 0.993,
        "Close": prices,
        "Volume": np.random.randint(50000, 200000, size=days)
    }, index=dates)
    return df

@pytest.fixture(autouse=True)
def clear_gold_caches():
    _GOLD_CACHE.clear()
    _CITIES_CACHE["data"] = None
    _CITIES_CACHE["time"] = 0.0
    _GOLD_PREDICTIONS_CACHE["data"] = None
    _GOLD_PREDICTIONS_CACHE["time"] = 0.0
    yield
    _GOLD_CACHE.clear()
    _CITIES_CACHE["data"] = None
    _CITIES_CACHE["time"] = 0.0
    _GOLD_PREDICTIONS_CACHE["data"] = None
    _GOLD_PREDICTIONS_CACHE["time"] = 0.0

def test_gold_snapshot_offline_mocked():
    """Verify gold snapshot calculation and theoretical forex parity with mocked yfinance download when Nebula is offline."""
    gold_df = _generate_synthetic_gold_history(10)

    dates = gold_df.index
    columns = pd.MultiIndex.from_tuples([
        ("Close", "GC=F"), ("Close", "INR=X"),
        ("High", "GC=F"), ("High", "INR=X"),
        ("Low", "GC=F"), ("Low", "INR=X"),
        ("Open", "GC=F"), ("Open", "INR=X"),
        ("Volume", "GC=F"), ("Volume", "INR=X")
    ], names=["Price", "Ticker"])

    batch_df = pd.DataFrame(index=dates, columns=columns)
    batch_df[("Close", "GC=F")] = 2700.00
    batch_df[("Close", "INR=X")] = 86.50
    batch_df[("High", "GC=F")] = 2715.00
    batch_df[("High", "INR=X")] = 86.60
    batch_df[("Low", "GC=F")] = 2690.00
    batch_df[("Low", "INR=X")] = 86.40
    batch_df[("Open", "GC=F")] = 2695.00
    batch_df[("Open", "INR=X")] = 86.45
    batch_df[("Volume", "GC=F")] = 125000
    batch_df[("Volume", "INR=X")] = 0

    with patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=None), \
         patch("yfinance.download", return_value=batch_df):
        res = get_gold_snapshot()

    assert res["status"] == "available"
    assert res["price_usd_per_oz"] == 2700.00
    assert res["usdinr_rate"] == 86.50
    expected_parity = round((2700.00 / TROY_OZ_TO_GRAMS) * 10.0 * 86.50, 2)
    assert res["inr_per_10g_forex_parity"] == expected_parity
    assert "conversion_formula" in res
    assert res["gold_symbol"] == "GC=F"

def test_gold_snapshot_unavailable_when_offline_or_empty():
    """Verify that empty yfinance data returns explicit unavailable status without fabricated prices."""
    empty_df = pd.DataFrame()
    with patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=None), \
         patch("yfinance.download", return_value=empty_df):
        res = get_gold_snapshot()

    assert res["status"] == "unavailable"
    assert "unavailable" in res["message"].lower()
    assert "price_usd_per_oz" not in res

def test_nebula_metals_live_snapshot_parsing():
    """Verify Nebula Metals real-time feed parses 24K, 22K, 18K, 14K karats, GST breakdown, and city metadata."""
    mock_nebula_payload = {
        "success": True,
        "date": "2026-10-26",
        "city": "Visakhapatnam",
        "market": "Indian Market",
        "timestamp": "2026-10-26T12:55:05.268Z",
        "prices": {
            "gold24k": {
                "basePricePerGram": 14248,
                "gstAmountPerGram": 427,
                "finalPricePerGram": 14675,
                "pricePerGram": 14675,
                "priceFor10g": 146751,
                "priceFor100g": 1467510,
                "currency": "INR"
            },
            "gold22k": {
                "basePricePerGram": 13061,
                "gstAmountPerGram": 392,
                "finalPricePerGram": 13453,
                "pricePerGram": 13453,
                "priceFor10g": 134527,
                "priceFor100g": 1345270,
                "currency": "INR"
            },
            "gold18k": {
                "basePricePerGram": 10686,
                "gstAmountPerGram": 320,
                "finalPricePerGram": 11006,
                "pricePerGram": 11006,
                "priceFor10g": 110064,
                "priceFor100g": 1100640,
                "currency": "INR"
            },
            "gold14k": {
                "basePricePerGram": 8335,
                "gstAmountPerGram": 250,
                "finalPricePerGram": 8585,
                "pricePerGram": 8585,
                "priceFor10g": 85849,
                "priceFor100g": 858490,
                "currency": "INR"
            }
        },
        "metadata": {
            "sources_used": ["Nebula Metals engine NME-2"],
            "confidence": "high",
            "validation_passed": True,
            "gst_included": True,
            "source_details": {
                "engine": {
                    "rate_type": "live",
                    "stale": False,
                    "spot_usd_oz": 4021.20,
                    "usd_inr": 94.95,
                    "import_duty": 0.15,
                    "retail_spread": 0.009
                }
            }
        },
        "validation_notes": "24K calibrated with 15% duty and 3% GST."
    }

    with patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=mock_nebula_payload):
        res = get_gold_snapshot(city="Visakhapatnam")

    assert res["status"] == "available"
    assert "Nebula Metals" in res["data_source"]
    assert res["city"] == "Visakhapatnam"
    assert res["inr_per_10g_estimate"] == 146751.0
    assert res["karats"]["24k_10g"] == 146751.0
    assert res["karats"]["22k_10g"] == 134527.0
    assert res["karats"]["18k_10g"] == 110064.0
    assert res["karats"]["14k_10g"] == 85849.0
    assert res["domestic_rates"]["purities"]["24k"]["gst_amount_per_g"] == 427
    assert res["domestic_rates"]["purities"]["24k"]["final_price_per_g"] == 14675.0
    assert res["international_benchmarks"]["global_spot_usd_oz"] == 4021.20
    assert res["currency"] == "INR"

def test_nebula_metals_rate_limit_or_error_fallback():
    """Verify that when Nebula Metals returns None (rate limit or network error), it cleanly falls back to COMEX."""
    gold_df = _generate_synthetic_gold_history(10)
    dates = gold_df.index
    columns = pd.MultiIndex.from_tuples([
        ("Close", "GC=F"), ("Close", "INR=X"),
        ("High", "GC=F"), ("High", "INR=X"),
        ("Low", "GC=F"), ("Low", "INR=X"),
        ("Open", "GC=F"), ("Open", "INR=X"),
        ("Volume", "GC=F"), ("Volume", "INR=X")
    ], names=["Price", "Ticker"])
    batch_df = pd.DataFrame(index=dates, columns=columns)
    batch_df[("Close", "GC=F")] = 2750.00
    batch_df[("Close", "INR=X")] = 87.00
    batch_df[("High", "GC=F")] = 2760.00
    batch_df[("High", "INR=X")] = 87.10
    batch_df[("Low", "GC=F")] = 2740.00
    batch_df[("Low", "INR=X")] = 86.90
    batch_df[("Open", "GC=F")] = 2745.00
    batch_df[("Open", "INR=X")] = 86.95
    batch_df[("Volume", "GC=F")] = 90000
    batch_df[("Volume", "INR=X")] = 0

    with patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=None), \
         patch("yfinance.download", return_value=batch_df):
        res = get_gold_snapshot()

    assert res["status"] == "available"
    assert res["price_usd_per_oz"] == 2750.00
    assert "COMEX Futures" in res["data_source"]
    assert res["domestic_rates"] is None

def test_gold_history_domestic_snapshots():
    """Verify gold history returns genuine Indian domestic 24K records with GST breakdown."""
    mock_nebula_payload = {
        "success": True,
        "date": "2026-10-26",
        "city": "Visakhapatnam",
        "market": "Indian Market",
        "prices": {
            "gold24k": {
                "basePricePerGram": 14248,
                "gstAmountPerGram": 427,
                "finalPricePerGram": 14675,
                "pricePerGram": 14675,
                "priceFor10g": 146751,
                "currency": "INR"
            },
            "gold22k": {"priceFor10g": 134527},
            "gold18k": {"priceFor10g": 110064},
            "gold14k": {"priceFor10g": 85849}
        },
        "metadata": {"gst_included": True}
    }

    with patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=mock_nebula_payload):
        res = get_gold_history(city="Visakhapatnam", period="1mo", force_refresh=True)

    assert res["status"] == "available"
    assert "Nebula Metals" in res["data_source"]
    assert res["gst_included"] is True
    assert res["city"] == "Visakhapatnam"
    assert "total_records_for_city" in res
    assert len(res["records"]) > 0
    rec = next(r for r in res["records"] if r["date"] == mock_nebula_payload["date"])
    assert rec["price_24k_10g"] == 146751.0
    assert rec["base_price_24k_1g"] == 14248.0
    assert rec["gst_amount_24k_1g"] == 427.0
    assert rec["gst_included"] is True

def test_gold_history_empty_fallback():
    """Verify gold history handles empty city snapshot scenario gracefully without fabricating prices."""
    with patch("app.services.gold_data._query_domestic_gold_records", return_value=[]), \
         patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=None), \
         patch("app.services.gold_data._get_calibrated_domestic_history", return_value=[]):
        res = get_gold_history(city="NonExistentCity", period="1mo")

    assert res["status"] == "available"
    assert res["records"] == []
    assert res["total_records_for_city"] == 0
    assert "coverage_note" in res

def test_gold_predictor_walk_forward_metrics():
    """
    Verify gold ML predictions enforce:
    - Walk-forward validation metrics
    - Real R^2 (no artificial floor)
    - Comparison against naive baseline (RMSE comparison)
    - Unclamped directional accuracy
    - Educational disclaimer
    """
    df_2y = _generate_synthetic_gold_history(250)
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = df_2y

    with patch("yfinance.Ticker", return_value=mock_ticker):
        res = generate_gold_predictions()

    assert res["status"] == "available"
    assert res["disclaimer"] == "Educational only, not financial advice."
    assert "overall_walk_forward_r2" in res
    assert isinstance(res["overall_walk_forward_r2"], float)
    assert len(res["horizons"]) == 3

    for h in res["horizons"]:
        assert h["horizon"] in ["1 Day", "1 Week", "1 Month"]
        assert "predicted_price_usd" in h
        assert "predicted_price_inr_10g" in h
        metrics = h["walk_forward_metrics"]
        assert "real_r2" in metrics
        assert "model_rmse" in metrics
        assert "naive_rmse" in metrics
        assert "rmse_vs_naive_pct" in metrics
        assert "unclamped_directional_accuracy_pct" in metrics
        assert "validation_folds_evaluated" in metrics
        assert metrics["validation_folds_evaluated"] > 0

def test_gold_predictor_unavailable_when_insufficient_data():
    """Verify gold predictor refuses to generate fake predictions when data is insufficient."""
    short_df = _generate_synthetic_gold_history(20)
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = short_df

    with patch("yfinance.Ticker", return_value=mock_ticker):
        res = generate_gold_predictions()

    assert res["status"] == "unavailable"
    assert len(res["horizons"]) == 0
    assert "Insufficient" in res["reason"]
    assert res["disclaimer"] == "Educational only, not financial advice."

def test_gold_api_endpoints_integration():
    """Verify HTTP GET /api/gold/* endpoints return 200 with structured responses."""
    gold_df = _generate_synthetic_gold_history(120)

    dates = gold_df.index
    columns = pd.MultiIndex.from_tuples([
        ("Close", "GC=F"), ("Close", "INR=X"),
        ("High", "GC=F"), ("High", "INR=X"),
        ("Low", "GC=F"), ("Low", "INR=X"),
        ("Open", "GC=F"), ("Open", "INR=X"),
        ("Volume", "GC=F"), ("Volume", "INR=X")
    ], names=["Price", "Ticker"])
    batch_df = pd.DataFrame(index=dates, columns=columns)
    batch_df[("Close", "GC=F")] = 2710.50
    batch_df[("Close", "INR=X")] = 86.60
    batch_df[("High", "GC=F")] = 2720.00
    batch_df[("High", "INR=X")] = 86.70
    batch_df[("Low", "GC=F")] = 2700.00
    batch_df[("Low", "INR=X")] = 86.50
    batch_df[("Open", "GC=F")] = 2705.00
    batch_df[("Open", "INR=X")] = 86.55
    batch_df[("Volume", "GC=F")] = 180000
    batch_df[("Volume", "INR=X")] = 0

    mock_ticker = MagicMock()
    mock_ticker.history.return_value = gold_df

    mock_nebula = {
        "success": True,
        "date": "2026-10-26",
        "city": "Visakhapatnam",
        "market": "Indian Market",
        "prices": {
            "gold24k": {"priceFor10g": 146751, "finalPricePerGram": 14675, "basePricePerGram": 14248, "gstAmountPerGram": 427},
            "gold22k": {"priceFor10g": 134527, "finalPricePerGram": 13453, "basePricePerGram": 13061, "gstAmountPerGram": 392},
            "gold18k": {"priceFor10g": 110064, "finalPricePerGram": 11006, "basePricePerGram": 10686, "gstAmountPerGram": 320},
            "gold14k": {"priceFor10g": 85849, "finalPricePerGram": 8585, "basePricePerGram": 8335, "gstAmountPerGram": 250}
        },
        "metadata": {
            "source_details": {
                "engine": {"spot_usd_oz": 4021.20, "usd_inr": 94.95, "import_duty": 0.15, "retail_spread": 0.009}
            }
        }
    }

    with patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=mock_nebula), \
         patch("yfinance.download", return_value=batch_df), \
         patch("yfinance.Ticker", return_value=mock_ticker):

        # 1. Snapshot endpoint
        snap_res = client.get("/api/gold/snapshot?city=Visakhapatnam")
        assert snap_res.status_code == 200
        snap_data = snap_res.json()
        assert snap_data["status"] == "available"
        assert snap_data["inr_per_10g_estimate"] == 146751.0
        assert "Nebula Metals" in snap_data["data_source"]

        # 2. Cities catalog endpoint
        cities_res = client.get("/api/gold/cities")
        assert cities_res.status_code == 200
        cities_data = cities_res.json()
        assert cities_data["status"] == "available"
        assert "Visakhapatnam" in cities_data["cities"]

        # 3. History endpoint
        hist_res = client.get("/api/gold/history?city=Visakhapatnam&period=1mo")
        assert hist_res.status_code == 200
        hist_data = hist_res.json()
        assert hist_data["status"] == "available"
        assert len(hist_data["records"]) > 0
        assert hist_data["records"][0]["price_24k_10g"] > 0
        assert hist_data["records"][0]["gst_included"] is True

        # 4. Predictions endpoint
        pred_res = client.get("/api/gold/predictions")
        assert pred_res.status_code == 200
        pred_data = pred_res.json()
        assert pred_data["status"] == "available"
        assert pred_data["disclaimer"] == "Educational only, not financial advice."
