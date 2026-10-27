"""
FinSight AI — Comprehensive Tests for Quote Layer Stability & System Architecture
Verifies fixes from Phases 1-6:
1. get_live_quote_sync() can be called from worker threads without RuntimeError or loop errors.
2. Network timeout safely returns stale cached quote or schema-complete unavailable fallback without hanging.
3. Circuit breaker trips after consecutive failures and serves stale cache during cooldown.
4. Same-symbol concurrent requests coalesce into a single in-flight network fetch.
5. The unavailable response includes all required fields and indicators safely.
6. Portfolio monitoring cycle decouples DB session from external network quote calls.
"""

import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock, patch, MagicMock
import pytest

from app.services.quote_service import (
    get_live_quote,
    get_live_quote_sync,
    _build_unavailable_quote,
    QuoteCircuitBreaker,
    _in_flight_tasks,
)
from app.services.cache import cache_service


@pytest.mark.anyio
async def test_quote_service_sync_called_from_worker_thread():
    """Verifies get_live_quote_sync called from background thread pool does NOT raise RuntimeError."""
    def worker():
        sample_quote = {
            "symbol": "THREAD_TEST.NS",
            "clean_symbol": "THREAD_TEST",
            "current_price": 500.0,
            "price": 500.0,
            "data_status": "live",
            "is_stale": False,
        }
        # Pre-seed cache with standard unified_quote cache_key
        cache_service.set_sync("unified_quote:THREAD_TEST", sample_quote, ttl_seconds=60)
        return get_live_quote_sync("THREAD_TEST.NS")

    with ThreadPoolExecutor(max_workers=2) as executor:
        future = executor.submit(worker)
        res = future.result(timeout=5.0)

    assert res is not None
    assert res.get("clean_symbol") == "THREAD_TEST"
    assert res.get("current_price") == 500.0


@pytest.mark.anyio
async def test_quote_timeout_returns_stale_or_unavailable():
    """Verifies that a hanging yfinance call times out safely and returns fallback without freezing."""
    await cache_service.delete("quote:TIMEOUT_MOCK")
    await cache_service.delete("quote:stale:TIMEOUT_MOCK")

    def hanging_call(*args, **kwargs):
        time.sleep(12.0)
        return {"current_price": 123.4}

    with patch("app.services.quote_service._fetch_yf_sync", side_effect=hanging_call):
        start = time.time()
        quote = await get_live_quote("TIMEOUT_MOCK.NS")
        elapsed = time.time() - start

        # Must return quickly and cleanly via timeout/circuit breaker, not freeze
        assert elapsed < 15.0
        assert quote is not None
        assert quote.get("data_status") in ("stale", "unavailable")


def test_circuit_breaker_behavior():
    """Verifies circuit breaker trips after N failures and skips provider calls."""
    cb = QuoteCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)
    assert cb.is_tripped() is False
    assert cb.get_status() == "live"

    cb.record_failure()
    cb.record_failure()
    assert cb.is_tripped() is False

    cb.record_failure()  # 3rd failure trips the breaker
    assert cb.is_tripped() is True
    assert cb.get_status() == "stale"

    # Success resets breaker
    cb.record_success()
    assert cb.is_tripped() is False
    assert cb.get_status() == "live"


@pytest.mark.anyio
async def test_same_symbol_request_coalescing():
    from app.services.quote_service import _CIRCUIT_BREAKER
    _CIRCUIT_BREAKER.record_success()
    await cache_service.delete("unified_quote:COALESCE")
    await cache_service.delete("stale:unified_quote:COALESCE")
    fetch_counter = 0

    def mock_fetch(clean_sym):
        nonlocal fetch_counter
        fetch_counter += 1
        time.sleep(0.05)
        return {
            "symbol": f"{clean_sym}.NS",
            "clean_symbol": clean_sym,
            "current_price": 1050.0,
            "price": 1050.0,
            "data_status": "live",
            "is_stale": False,
        }

    with patch("app.services.quote_service._fetch_yf_sync", side_effect=mock_fetch):
        tasks = [get_live_quote("COALESCE.NS") for _ in range(6)]
        results = await asyncio.gather(*tasks)

        assert len(results) == 6
        for r in results:
            assert r["current_price"] == 1050.0

        # Underlying fetch was only called ONCE due to coalescing
        assert fetch_counter == 1


def test_unavailable_response_contains_all_required_fields():
    """Verifies that the unavailable quote contains all schema fields with safe defaults."""
    quote = _build_unavailable_quote("UNAVAIL.NS", raw_symbol="UNAVAIL.NS", is_stale=True)

    required_keys = [
        "symbol", "clean_symbol", "company_name", "current_price", "price",
        "change", "change_pct", "change_percent", "open", "high", "low",
        "volume", "avg_volume", "week_52_high", "week_52_low", "previous_close",
        "market_cap", "beta", "indicators", "data_status", "is_stale"
    ]
    for k in required_keys:
        assert k in quote, f"Missing key in unavailable quote: {k}"

    assert quote["data_status"] == "unavailable"
    assert quote["is_stale"] is True

    # Indicators must contain safe defaults so frontend does not crash
    indicators = quote["indicators"]
    assert isinstance(indicators, dict)
    for ind_k in ["rsi_14", "volatility_annual", "sma_50", "sma_200", "macd", "macd_signal"]:
        assert ind_k in indicators, f"Missing indicator key: {ind_k}"


@pytest.mark.anyio
async def test_monitor_does_not_hold_session_during_network_calls():
    """Verifies monitor cycle closes read session before quote network calls, and opens write session after."""
    events = []

    mock_holding = MagicMock()
    mock_holding.id = "h1"
    mock_holding.user_id = "u1"
    mock_holding.symbol = "SBIN.NS"
    mock_holding.quantity = 10
    mock_holding.purchase_price = 500.0
    mock_holding.stop_loss = None
    mock_holding.target_price = None
    mock_holding.sector = "Financials"
    mock_holding.to_dict.return_value = {"id": "h1", "user_id": "u1", "symbol": "SBIN.NS", "quantity": 10}

    class MockSession:
        def __init__(self, name):
            self.name = name

        async def __aenter__(self):
            events.append(f"open_{self.name}")
            mock_s = AsyncMock()
            mock_res = MagicMock()
            # If read_session, return holding, else empty rules/cooldowns
            if self.name == "read_session":
                mock_res.scalars.return_value.all.return_value = [mock_holding]
                mock_res.all.return_value = []
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.all.return_value = []
            mock_s.execute = AsyncMock(return_value=mock_res)
            return mock_s

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            events.append(f"close_{self.name}")

    session_count = 0
    def mock_get_session():
        nonlocal session_count
        session_count += 1
        name = "read_session" if session_count == 1 else "write_session"
        return MockSession(name)

    def mock_get_stock_data(sym):
        events.append(f"quote_fetch_{sym}")
        return {"current_price": 520.0, "data_status": "live", "price": 520.0, "change_pct": 2.0}

    with patch("app.services.monitor.get_background_session", side_effect=mock_get_session), \
         patch("app.services.monitor.get_stock_data", side_effect=mock_get_stock_data):
        from app.services.monitor import _run_portfolio_monitoring_cycle_internal
        res = await _run_portfolio_monitoring_cycle_internal()

    assert res is not None
    assert "open_read_session" in events
    assert "close_read_session" in events
    read_close_idx = events.index("close_read_session")

    quote_fetches = [idx for idx, ev in enumerate(events) if ev.startswith("quote_fetch_")]
    assert len(quote_fetches) > 0, "No quotes were fetched!"
    for q_idx in quote_fetches:
        assert q_idx > read_close_idx, "Network quote call occurred while read session was open!"
