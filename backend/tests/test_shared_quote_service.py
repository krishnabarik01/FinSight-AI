import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.services.quote_service import (
    normalize_symbol,
    get_live_quote,
    get_batch_quotes,
)
from app.services.cache import cache_service

client = TestClient(app)

def test_symbol_normalization():
    # Aliases
    assert normalize_symbol("SBI") == "SBIN"
    assert normalize_symbol("sbi") == "SBIN"
    assert normalize_symbol("SBI.NS") == "SBIN"
    assert normalize_symbol("TATAMOTOR") == "TATAMOTORS"
    assert normalize_symbol("TATAMOTORS.NS") == "TATAMOTORS"
    assert normalize_symbol("MID150BEES") == "MID150BEES"
    assert normalize_symbol("mid150bees.ns") == "MID150BEES"

    # US tickers rejected
    with pytest.raises(ValueError):
        normalize_symbol("AAPL")
    with pytest.raises(ValueError):
        normalize_symbol("MSFT")

@pytest.mark.anyio
async def test_get_live_quote_shape_and_cache():
    test_sym = "SBIN"

    quote1 = await get_live_quote(test_sym)
    assert quote1 is not None
    # Check required fields
    for field in ["symbol", "name", "price", "change", "change_percent", "currency", "source", "timestamp"]:
        assert field in quote1, f"Missing field {field} in quote"

    assert quote1["currency"] == "INR"
    assert quote1["price"] > 0
    assert quote1["price"] != 501.50  # Must never be fake 501.50
    assert quote1["clean_symbol"] == "SBIN"
    assert quote1["symbol"] == "SBIN.NS"

    # Verify cache returns same data within TTL
    quote2 = await get_live_quote(test_sym)
    assert quote2["price"] == quote1["price"]
    assert quote2["timestamp"] == quote1["timestamp"]

def test_get_batch_quotes_endpoint():
    symbols = ["SBIN", "RELIANCE", "TCS", "MID150BEES"]
    res = client.get(f"/api/quotes?symbols={','.join(symbols)}")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == len(symbols)

    prices = [item["price"] for item in data]
    # Verify no two different stocks have the same price unless genuinely true
    assert len(set(prices)) > 1
    for item in data:
        assert item["price"] > 0
        assert item["currency"] == "INR"
        assert item["source"] in ["Groww API (Live Exchange Feed)", "yfinance (fallback)"]
        assert item["price"] != 501.50 or item["clean_symbol"] not in ["SBIN", "RELIANCE", "TCS"]

@pytest.mark.anyio
async def test_fallback_and_stale_cache_behavior(monkeypatch):
    test_clean = "TCS"
    cache_key = f"unified_quote:{test_clean}"
    stale_key = f"stale:{cache_key}"

    # Pre-populate a known stale quote
    stale_data = {
        "symbol": "TCS.NS",
        "clean_symbol": "TCS",
        "name": "Tata Consultancy Services Ltd",
        "company_name": "Tata Consultancy Services Ltd",
        "price": 3800.0,
        "current_price": 3800.0,
        "change": 15.0,
        "change_percent": 0.40,
        "change_pct": 0.40,
        "currency": "INR",
        "source": "yfinance (fallback)",
        "timestamp": "2026-10-27T10:00:00Z",
        "last_updated": "2026-10-27T10:00:00Z",
        "data_status": "live",
        "is_stale": False
    }
    await cache_service.set(stale_key, stale_data, ttl_seconds=3600)
    await cache_service.delete(cache_key)

    # Simulate live fetch failure
    import yfinance as yf
    def failing_history(*args, **kwargs):
        import pandas as pd
        return pd.DataFrame()

    monkeypatch.setattr(yf.Ticker, "history", failing_history)

    # Fetch should fallback to stale cache
    fallback_quote = await get_live_quote("TCS")
    assert fallback_quote["price"] == 3800.0
    assert fallback_quote["data_status"] == "stale"
    assert fallback_quote["is_stale"] is True
    assert fallback_quote["stale_timestamp"] == "2026-10-27T10:00:00Z"

@pytest.mark.anyio
async def test_failure_unavailable_when_no_cache(monkeypatch):
    test_clean = "UNKNOWNSTOCK"
    cache_key = f"unified_quote:{test_clean}"
    stale_key = f"stale:{cache_key}"
    await cache_service.delete(cache_key)
    await cache_service.delete(stale_key)

    import yfinance as yf
    def failing_history(*args, **kwargs):
        import pandas as pd
        return pd.DataFrame()

    monkeypatch.setattr(yf.Ticker, "history", failing_history)

    res = await get_live_quote("UNKNOWNSTOCK")
    assert res["data_status"] == "unavailable"
    assert res["price"] == 0.0  # Never invent 501.50

def test_batch_quotes_resilience_success_partial_and_total_failure():
    # 1. Success case: All valid symbols
    res_success = client.get("/api/quotes?symbols=SBIN,RELIANCE")
    assert res_success.status_code == 200
    data_success = res_success.json()
    assert isinstance(data_success, list)
    assert len(data_success) == 2
    for item in data_success:
        assert item["price"] > 0
        assert item["clean_symbol"] in ["SBIN", "RELIANCE"]
        assert item["data_status"] in ["live", "cached"]
        assert not item.get("is_stale", False)

    # 2. Partial failure case: Mix of valid Indian equity and disallowed/invalid symbol
    res_partial = client.get("/api/quotes?symbols=SBIN,AAPL")
    assert res_partial.status_code == 200
    data_partial = res_partial.json()
    assert isinstance(data_partial, list)
    assert len(data_partial) == 2

    valid_items = [d for d in data_partial if d["clean_symbol"] == "SBIN"]
    assert len(valid_items) == 1
    assert valid_items[0]["price"] > 0

    failed_items = [d for d in data_partial if d["symbol"] == "AAPL" or d["clean_symbol"] == "AAPL"]
    assert len(failed_items) == 1
    assert failed_items[0]["data_status"] == "unavailable"
    assert failed_items[0]["is_stale"] is True
    assert "error" in failed_items[0]

    # 3. Total failure case: All disallowed/invalid symbols
    res_total = client.get("/api/quotes?symbols=AAPL,MSFT")
    assert res_total.status_code == 200
    data_total = res_total.json()
    assert isinstance(data_total, list)
    assert len(data_total) == 2
    for item in data_total:
        assert item["data_status"] == "unavailable"
        assert item["is_stale"] is True
        assert item["price"] == 0.0
        assert "error" in item
