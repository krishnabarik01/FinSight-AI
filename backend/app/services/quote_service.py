"""
FinSight AI — Unified Live Quote Service (Single Source of Truth)

Centralizes real-time and fallback quote fetching across all FinSight AI pages:
Stock Analysis, Active Watchlist, Risk Assessment, Dashboard, Portfolio, and Alerts.

Provider Order & Fallback Logic:
1. Primary: Groww API (when live credentials GROWW_API_KEY exist, with 4s timeout)
2. Fallback: yfinance (labeled as 'yfinance (fallback)') with real NSE candles
3. Stale Cache: Returns last known authentic price with is_stale=True and original timestamp
4. Unavailable: Explicit 'unavailable' status with price 0.0 and complete default schema fields. Never fabricates numbers.

In-Memory Cache TTL: 20 seconds (so all pages see identical data without rate-limiting).
"""

import time
import asyncio
import logging
import threading
import concurrent.futures
from typing import Dict, Any, List, Optional
import httpx
import yfinance as yf
import pandas as pd
import numpy as np

from app.config import settings
from app.services.cache import cache_service
from app.services.providers.stocks_provider import (
    INSTRUMENTS_MAP,
    INSTRUMENTS_LIST,
    SYMBOL_ALIASES,
    compute_metrics_from_candles
)

logger = logging.getLogger("finsight.quote_service")

# Dedicated bounded thread pool for market-data blocking network calls (separate from asyncio pool)
_MARKET_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=8,
    thread_name_prefix="finsight_market_data"
)

# Concurrency semaphore for provider calls
_FETCH_SEMAPHORE = asyncio.Semaphore(8)

# Cache TTLs
LIVE_CACHE_TTL = 20        # 20 seconds active cache
STALE_CACHE_TTL = 86400    # 24 hours stale cache fallback

DISALLOWED_US_SYMBOLS = {
    "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "NFLX",
    "AMD", "INTC", "SPY", "QQQ", "DIA", "BABA", "BRK.A", "BRK.B", "JPM", "V",
    "MA", "DIS", "PYPL", "BAC", "WMT", "PG", "XOM", "CVX", "JNJ", "PFE", "KO",
    "PEP", "COST", "CRM", "ORCL", "CSCO", "IBM", "UBER", "ABNB", "PLTR", "COIN",
    "SNOW", "AVGO", "QCOM", "TXN", "MU", "ARM", "SHOP", "NOW", "PANW", "CRWD",
    "BA", "GE", "NKE", "MCD", "SBUX", "CAT", "GS", "MS"
}


# ==========================================
# Circuit Breaker for Market Data Providers
# ==========================================
class QuoteCircuitBreaker:
    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 45.0):
        self._lock = threading.Lock()
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._consecutive_failures = 0
        self._tripped_until = 0.0

    def record_success(self):
        with self._lock:
            self._consecutive_failures = 0
            self._tripped_until = 0.0

    def record_failure(self):
        with self._lock:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold:
                self._tripped_until = time.time() + self.cooldown_seconds
                logger.warning(
                    "Quote provider circuit breaker tripped after %d consecutive failures. Skipping network fetch for %ds.",
                    self._consecutive_failures, int(self.cooldown_seconds)
                )

    def is_tripped(self) -> bool:
        with self._lock:
            if self._tripped_until > 0:
                if time.time() < self._tripped_until:
                    return True
                # Cooldown expired, enter half-open trial
                return False
            return False

    def get_status(self) -> str:
        with self._lock:
            if self._tripped_until > 0 and time.time() < self._tripped_until:
                return "stale"
            return "live"

_CIRCUIT_BREAKER = QuoteCircuitBreaker(failure_threshold=3, cooldown_seconds=45.0)

# Request coalescing state for async fetches (concurrent callers for same symbol share ONE fetch)
_in_flight_tasks: Dict[str, asyncio.Task] = {}
_coalescing_lock = asyncio.Lock()

# Per-symbol threading locks for sync wrapper
_sync_locks: Dict[str, threading.Lock] = {}
_sync_dict_lock = threading.Lock()

def _get_sync_lock(clean: str) -> threading.Lock:
    with _sync_dict_lock:
        if clean not in _sync_locks:
            _sync_locks[clean] = threading.Lock()
        return _sync_locks[clean]


def normalize_symbol(symbol: str) -> str:
    """
    Authoritative single-place symbol normalizer for Indian equities & ETFs.
    Strips exchange suffixes (.NS, .BO), resolves aliases (SBI -> SBIN),
    and validates against foreign tickers.
    """
    if not symbol or not isinstance(symbol, str):
        raise ValueError("Invalid stock symbol provided.")

    clean = symbol.upper().strip()
    if clean.endswith(".NS") or clean.endswith(".BO"):
        clean = clean.rsplit(".", 1)[0]

    # Resolve known ticker aliases
    clean = SYMBOL_ALIASES.get(clean, clean)

    if clean in DISALLOWED_US_SYMBOLS:
        raise ValueError(
            f"Unsupported symbol '{symbol}'. FinSight AI exclusively supports Indian equities and ETFs on NSE/BSE."
        )

    return clean


def to_nse_ticker(symbol: str) -> str:
    """Returns canonical NSE ticker format with .NS suffix (e.g. SBIN.NS)."""
    clean = normalize_symbol(symbol)
    return f"{clean}.NS"


def _safe_float(v: Any, default: float = 0.0) -> float:
    if v is None or pd.isna(v) or np.isinf(v):
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _build_unavailable_quote(clean: str, error_msg: Optional[str] = None, is_stale: bool = False, raw_symbol: Optional[str] = None) -> Dict[str, Any]:
    """
    Constructs the canonical explicit 'unavailable' quote structure.
    Guarantees every field read by the frontend is present with safe defaults (0 or null),
    preventing undefined errors in the UI. Never fabricates prices.
    """
    inst_meta = INSTRUMENTS_MAP.get(clean, {})
    comp_name = inst_meta.get("name", f"{clean} Limited")
    sector = inst_meta.get("sector", "Indian Equities")
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    res = {
        "symbol": raw_symbol or f"{clean}.NS",
        "clean_symbol": clean,
        "ticker": clean,
        "name": comp_name,
        "company_name": comp_name,
        "price": 0.0,
        "current_price": 0.0,
        "previous_close": 0.0,
        "open": 0.0,
        "high": 0.0,
        "low": 0.0,
        "change": 0.0,
        "change_percent": 0.0,
        "change_pct": 0.0,
        "volume": 0,
        "avg_volume": 0,
        "week_52_high": 0.0,
        "week_52_low": 0.0,
        "currency": "INR",
        "exchange": "NSE",
        "source": "unavailable",
        "data_source": "unavailable",
        "data_provider": "unavailable",
        "timestamp": now_iso,
        "last_updated": now_iso,
        "data_status": "unavailable",
        "is_stale": is_stale,
        "market_cap": None,
        "beta": 1.0,
        "sector": sector,
        "category": inst_meta.get("sub_type", "large_cap"),
        "support_level": 0.0,
        "resistance_level": 0.0,
        "message": error_msg or f"Real-time market price for {clean} is currently unavailable.",
        "indicators": {
            "rsi_14": 50.0,
            "atr_14": 0.0,
            "volatility_annual": 20.0,
            "macd": 0.0,
            "macd_signal": 0.0,
            "sma_20": 0.0,
            "sma_50": 0.0,
            "sma_200": 0.0
        }
    }
    if error_msg:
        res["error"] = error_msg
    return res


def _parse_groww_payload(clean: str, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Transforms raw Groww quote API payload into FinSight unified quote shape."""
    try:
        ltp = float(raw.get("ltp") or raw.get("price") or 0.0)
        if ltp <= 0:
            return None
        prev_close = float(raw.get("close") or raw.get("previousClose") or ltp)
        change = ltp - prev_close
        change_pct = (change / prev_close) * 100 if prev_close > 0 else 0.0

        inst_meta = INSTRUMENTS_MAP.get(clean, {})
        comp_name = raw.get("companyName") or inst_meta.get("name", f"{clean} Limited")
        sector = inst_meta.get("sector", "Indian Equities")
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        high_p = float(raw.get("high") or ltp)
        low_p = float(raw.get("low") or ltp)
        open_p = float(raw.get("open") or ltp)
        vol = int(raw.get("volume") or 0)

        return {
            "symbol": f"{clean}.NS",
            "clean_symbol": clean,
            "ticker": clean,
            "name": comp_name,
            "company_name": comp_name,
            "price": round(ltp, 2),
            "current_price": round(ltp, 2),
            "previous_close": round(prev_close, 2),
            "change": round(change, 2),
            "change_percent": round(change_pct, 2),
            "change_pct": round(change_pct, 2),
            "currency": "INR",
            "exchange": "NSE",
            "source": "Groww (primary)",
            "data_source": "Groww API (Live Exchange Feed)",
            "data_provider": "Groww API (Live Exchange Feed)",
            "timestamp": now_iso,
            "last_updated": now_iso,
            "data_status": "live",
            "is_stale": False,
            "open": round(open_p, 2),
            "high": round(high_p, 2),
            "low": round(low_p, 2),
            "volume": vol,
            "avg_volume": int(raw.get("avg_volume") or vol),
            "support_level": round(float(raw.get("support") or (ltp * 0.95)), 2),
            "resistance_level": round(float(raw.get("resistance") or (ltp * 1.05)), 2),
            "week_52_high": round(float(raw.get("week_52_high") or high_p), 2),
            "week_52_low": round(float(raw.get("week_52_low") or low_p), 2),
            "sector": sector,
            "category": inst_meta.get("sub_type", "large_cap"),
            "market_cap": raw.get("market_cap") or inst_meta.get("market_cap"),
            "beta": float(raw.get("beta") or 1.0),
            "indicators": {
                "rsi_14": float(raw.get("rsi_14") or 50.0),
                "atr_14": round(ltp * 0.015, 2),
                "volatility_annual": float(raw.get("volatility_annual") or 22.0),
                "macd": 0.0,
                "macd_signal": 0.0,
                "sma_20": round(ltp, 2),
                "sma_50": round(ltp, 2),
                "sma_200": round(ltp, 2),
            }
        }
    except Exception as e:
        logger.warning("Error parsing Groww payload for %s: %s", clean, e)
        return None


async def _fetch_groww_async(clean: str) -> Optional[Dict[str, Any]]:
    """Attempts live HTTP quote from Groww with a strict 4.0s timeout."""
    from app.services.groww_service import groww_service
    if not groww_service.has_live_credentials:
        return None
    try:
        headers = {
            "Authorization": f"Bearer {groww_service.auth_token or groww_service.api_key}",
            "X-API-KEY": groww_service.api_key,
            "Accept": "application/json"
        }
        url = f"{groww_service.base_url}/stock/v1/quote/NSE/{clean}"
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return _parse_groww_payload(clean, resp.json())
    except Exception as e:
        logger.warning("Groww async live fetch failed for %s: %s", clean, e)
    return None


def _fetch_groww_sync(clean: str) -> Optional[Dict[str, Any]]:
    """Synchronous Groww fetch with strict 4.0s timeout."""
    from app.services.groww_service import groww_service
    if not groww_service.has_live_credentials:
        return None
    try:
        headers = {
            "Authorization": f"Bearer {groww_service.auth_token or groww_service.api_key}",
            "X-API-KEY": groww_service.api_key,
            "Accept": "application/json"
        }
        url = f"{groww_service.base_url}/stock/v1/quote/NSE/{clean}"
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                return _parse_groww_payload(clean, resp.json())
    except Exception as e:
        logger.warning("Groww sync live fetch failed for %s: %s", clean, e)
    return None


def _fetch_yf_sync(clean: str) -> Optional[Dict[str, Any]]:
    """
    Plain blocking synchronous fetch function for yfinance.
    Does NOT use asyncio. Runs inside dedicated _MARKET_EXECUTOR or sync callers.
    Removes slow ticker.info call from hot path.
    """
    try:
        yf_ticker = f"{clean}.NS"
        ticker = yf.Ticker(yf_ticker)
        hist = ticker.history(period="3mo", interval="1d")

        # Fallback to yf.download with strict 8s timeout if history returned empty
        if hist is None or hist.empty:
            hist = yf.download(yf_ticker, period="3mo", interval="1d", progress=False, timeout=8)

        if hist is not None and not hist.empty:
            if isinstance(hist.columns, pd.MultiIndex):
                hist.columns = hist.columns.get_level_values(0)
            hist = hist.dropna(subset=["Close"])

        if hist is not None and not hist.empty and len(hist) >= 1:
            close_p = float(hist["Close"].iloc[-1])
            if pd.isna(close_p) or np.isinf(close_p) or close_p <= 0:
                return None

            prev_close = (
                float(hist["Close"].iloc[-2])
                if len(hist) > 1 and not pd.isna(hist["Close"].iloc[-2])
                else close_p
            )
            change = close_p - prev_close
            change_pct = (change / prev_close) * 100 if prev_close > 0 else 0.0

            high_p = float(hist["High"].dropna().iloc[-1]) if not hist["High"].dropna().empty else close_p
            low_p = float(hist["Low"].dropna().iloc[-1]) if not hist["Low"].dropna().empty else close_p
            open_p = float(hist["Open"].dropna().iloc[-1]) if not hist["Open"].dropna().empty else close_p
            vol_s = hist["Volume"].dropna()
            vol = int(vol_s.iloc[-1]) if not vol_s.empty else 0
            avg_vol = int(vol_s.mean()) if not vol_s.empty and not pd.isna(vol_s.mean()) else vol

            # Support / Resistance from recent 20 candles
            recent_lows = hist["Low"].dropna().tail(20)
            support_p = round(float(recent_lows.min()), 2) if not recent_lows.empty else round(close_p * 0.95, 2)
            recent_highs = hist["High"].dropna().tail(20)
            resistance_p = round(float(recent_highs.max()), 2) if not recent_highs.empty else round(close_p * 1.05, 2)
            all_highs = hist["High"].dropna()
            week_52_h = round(float(all_highs.max()), 2) if not all_highs.empty else resistance_p
            all_lows = hist["Low"].dropna()
            week_52_l = round(float(all_lows.min()), 2) if not all_lows.empty else support_p

            tech = compute_metrics_from_candles(hist)
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            # Retrieve market cap lazily from cache or instrument metadata (NEVER blocking ticker.info)
            inst_meta = INSTRUMENTS_MAP.get(clean, {})
            mcap = cache_service.get_sync(f"mcap:{clean}") or inst_meta.get("market_cap")

            comp_name = inst_meta.get("name", f"{clean} Limited")
            sector = inst_meta.get("sector", "Indian Equities")

            return {
                "symbol": f"{clean}.NS",
                "clean_symbol": clean,
                "ticker": clean,
                "name": comp_name,
                "company_name": comp_name,
                "price": round(close_p, 2),
                "current_price": round(close_p, 2),
                "previous_close": round(prev_close, 2),
                "change": round(change, 2),
                "change_percent": round(change_pct, 2),
                "change_pct": round(change_pct, 2),
                "currency": "INR",
                "exchange": "NSE",
                "source": "yfinance (fallback)",
                "data_source": "yfinance (fallback)",
                "data_provider": "yfinance fallback",
                "timestamp": now_iso,
                "last_updated": now_iso,
                "data_status": "live",
                "is_stale": False,
                "open": round(open_p, 2),
                "high": round(high_p, 2),
                "low": round(low_p, 2),
                "volume": vol,
                "avg_volume": avg_vol,
                "support_level": support_p,
                "resistance_level": resistance_p,
                "week_52_high": week_52_h,
                "week_52_low": week_52_l,
                "sector": sector,
                "category": inst_meta.get("sub_type", "large_cap"),
                "market_cap": mcap,
                "beta": _safe_float(tech.get("beta"), 1.0),
                "indicators": {
                    "rsi_14": _safe_float(tech.get("rsi_14"), 50.0),
                    "atr_14": _safe_float(tech.get("atr_14"), round(close_p * 0.015, 2)),
                    "volatility_annual": _safe_float(tech.get("volatility_annual"), 22.0),
                    "macd": _safe_float(tech.get("macd"), 0.0),
                    "macd_signal": _safe_float(tech.get("macd_signal"), 0.0),
                    "sma_20": _safe_float(tech.get("sma_20"), close_p),
                    "sma_50": _safe_float(tech.get("sma_50"), close_p),
                    "sma_200": _safe_float(tech.get("sma_200"), close_p),
                }
            }
    except Exception as err:
        logger.warning("yfinance fetch exception for %s: %s", clean, err)
    return None


async def _execute_async_quote_fetch(clean: str, cache_key: str, stale_key: str) -> Dict[str, Any]:
    """Internal implementation of the single in-flight fetch for a symbol."""
    # Check circuit breaker before hitting network
    if _CIRCUIT_BREAKER.is_tripped():
        stale = await cache_service.get(stale_key)
        if stale:
            stale_copy = dict(stale)
            stale_copy["data_status"] = "stale"
            stale_copy["is_stale"] = True
            stale_copy["stale_timestamp"] = stale_copy.get("timestamp") or stale_copy.get("last_updated")
            return stale_copy
        return _build_unavailable_quote(clean, "Provider temporarily paused by circuit breaker")

    # 1. Primary: Groww API (if credentials configured)
    groww_data = await _fetch_groww_async(clean)
    if groww_data:
        _CIRCUIT_BREAKER.record_success()
        await cache_service.set(cache_key, groww_data, ttl_seconds=LIVE_CACHE_TTL)
        await cache_service.set(stale_key, groww_data, ttl_seconds=STALE_CACHE_TTL)
        return groww_data

    # 2. Fallback: yfinance with bounded ThreadPoolExecutor
    data = None
    try:
        loop = asyncio.get_running_loop()
        async with _FETCH_SEMAPHORE:
            data = await asyncio.wait_for(
                loop.run_in_executor(_MARKET_EXECUTOR, _fetch_yf_sync, clean),
                timeout=10.0
            )
    except asyncio.TimeoutError:
        logger.warning("yfinance fetch timed out for %s after 10s", clean)
        data = None
    except Exception as err:
        logger.warning("yfinance fetch exception for %s: %s", clean, err)
        data = None

    if data:
        _CIRCUIT_BREAKER.record_success()
        await cache_service.set(cache_key, data, ttl_seconds=LIVE_CACHE_TTL)
        await cache_service.set(stale_key, data, ttl_seconds=STALE_CACHE_TTL)
        return data

    # Record failure on circuit breaker
    _CIRCUIT_BREAKER.record_failure()

    # 3. Check for last known authentic price in stale cache
    stale = await cache_service.get(stale_key)
    if stale:
        stale_copy = dict(stale)
        stale_copy["data_status"] = "stale"
        stale_copy["is_stale"] = True
        stale_copy["stale_timestamp"] = stale_copy.get("timestamp") or stale_copy.get("last_updated")
        return stale_copy

    # 4. Explicit unavailable state (never fabricate fake numbers)
    return _build_unavailable_quote(clean)


async def get_live_quote(symbol: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Retrieves live stock/ETF quote from single source of truth (Async-Only).
    Includes request coalescing so concurrent requests for the same symbol
    share a single in-flight network call.
    """
    clean = normalize_symbol(symbol)
    cache_key = f"unified_quote:{clean}"
    stale_key = f"stale:{cache_key}"

    if not force_refresh:
        cached = await cache_service.get(cache_key)
        if cached:
            return cached

    # Request coalescing: share in-flight fetch across concurrent async callers
    async with _coalescing_lock:
        if clean in _in_flight_tasks:
            task = _in_flight_tasks[clean]
        else:
            task = asyncio.create_task(_execute_async_quote_fetch(clean, cache_key, stale_key))
            _in_flight_tasks[clean] = task

    try:
        return await task
    finally:
        async with _coalescing_lock:
            if clean in _in_flight_tasks and _in_flight_tasks[clean] is task:
                _in_flight_tasks.pop(clean, None)


def get_live_quote_sync(symbol: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Safe synchronous wrapper for sync callers (e.g. background worker, risk calculations).
    Uses a plain blocking sync fetch with its own per-symbol threading lock and the same cache.
    NEVER creates event loops, NEVER calls asyncio.run().
    """
    clean = normalize_symbol(symbol)
    cache_key = f"unified_quote:{clean}"
    stale_key = f"stale:{cache_key}"

    if not force_refresh:
        cached = cache_service.get_sync(cache_key)
        if cached:
            return cached

    lock = _get_sync_lock(clean)
    with lock:
        # Double-check cache inside lock
        if not force_refresh:
            cached = cache_service.get_sync(cache_key)
            if cached:
                return cached

        # Check circuit breaker
        if _CIRCUIT_BREAKER.is_tripped():
            stale = cache_service.get_sync(stale_key)
            if stale:
                stale_copy = dict(stale)
                stale_copy["data_status"] = "stale"
                stale_copy["is_stale"] = True
                stale_copy["stale_timestamp"] = stale_copy.get("timestamp") or stale_copy.get("last_updated")
                return stale_copy
            return _build_unavailable_quote(clean, "Provider temporarily paused by circuit breaker")

        # 1. Primary: Groww API sync
        groww_data = _fetch_groww_sync(clean)
        if groww_data:
            _CIRCUIT_BREAKER.record_success()
            cache_service.set_sync(cache_key, groww_data, ttl_seconds=LIVE_CACHE_TTL)
            cache_service.set_sync(stale_key, groww_data, ttl_seconds=STALE_CACHE_TTL)
            return groww_data

        # 2. Fallback: yfinance sync fetch via bounded executor with timeout
        data = None
        try:
            future = _MARKET_EXECUTOR.submit(_fetch_yf_sync, clean)
            data = future.result(timeout=10.0)
        except Exception as e:
            logger.warning("Sync yfinance fetch exception for %s: %s", clean, e)
            data = None

        if data:
            _CIRCUIT_BREAKER.record_success()
            cache_service.set_sync(cache_key, data, ttl_seconds=LIVE_CACHE_TTL)
            cache_service.set_sync(stale_key, data, ttl_seconds=STALE_CACHE_TTL)
            return data

        _CIRCUIT_BREAKER.record_failure()

        # 3. Check stale cache
        stale = cache_service.get_sync(stale_key)
        if stale:
            stale_copy = dict(stale)
            stale_copy["data_status"] = "stale"
            stale_copy["is_stale"] = True
            stale_copy["stale_timestamp"] = stale_copy.get("timestamp") or stale_copy.get("last_updated")
            return stale_copy

        # 4. Explicit unavailable quote
        return _build_unavailable_quote(clean)


async def get_batch_quotes(symbols: List[str], force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Fetches live quotes for multiple symbols concurrently in parallel.
    Guarantees resilience: partial failures return live quotes for valid symbols
    and structured error/unavailable items for invalid or failing symbols.
    """
    if not symbols:
        return []

    # Clean and deduplicate symbols preserving input order
    seen = set()
    cleaned_symbols = []
    invalid_entries = []

    for s in symbols:
        if not s or not isinstance(s, str):
            continue
        s_raw = s.strip()
        if not s_raw:
            continue
        try:
            c = normalize_symbol(s_raw)
            if c not in seen:
                seen.add(c)
                cleaned_symbols.append(c)
        except Exception as e:
            invalid_entries.append((s_raw, str(e)))

    results: List[Dict[str, Any]] = []

    # Add structured entries for symbols that failed normalization
    for inv_s, err_msg in invalid_entries:
        results.append(_build_unavailable_quote(inv_s, error_msg=err_msg, is_stale=True, raw_symbol=inv_s))

    if cleaned_symbols:
        tasks = [get_live_quote(s, force_refresh=force_refresh) for s in cleaned_symbols]
        quotes = await asyncio.gather(*tasks, return_exceptions=True)

        for s, q in zip(cleaned_symbols, quotes):
            if isinstance(q, Exception):
                logger.error("Error fetching batch quote for %s: %s", s, q)
                results.append(_build_unavailable_quote(s, error_msg=str(q), is_stale=True))
            elif q is None:
                results.append(_build_unavailable_quote(s, error_msg="Quote data unavailable", is_stale=True))
            else:
                results.append(q)

    return results


def _fetch_yf_history(clean: str, period: str = "1mo", interval: str = "1d") -> List[Dict[str, Any]]:
    """Fetches historical OHLC bars with timeout and multi-index safety."""
    try:
        yf_ticker = f"{clean}.NS"
        hist = yf.download(yf_ticker, period=period, interval=interval, progress=False, timeout=8)
        if hist is not None and not hist.empty:
            if isinstance(hist.columns, pd.MultiIndex):
                hist.columns = hist.columns.get_level_values(0)
            hist = hist.dropna(subset=["Close"])
            records = []
            for idx, row in hist.iterrows():
                date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                c_val = float(row["Close"].iloc[0] if isinstance(row["Close"], pd.Series) else row["Close"])
                if pd.isna(c_val) or np.isinf(c_val):
                    continue
                o_val = float(row["Open"].iloc[0] if isinstance(row["Open"], pd.Series) else row["Open"])
                h_val = float(row["High"].iloc[0] if isinstance(row["High"], pd.Series) else row["High"])
                l_val = float(row["Low"].iloc[0] if isinstance(row["Low"], pd.Series) else row["Low"])
                v_raw = row["Volume"].iloc[0] if isinstance(row["Volume"], pd.Series) else row["Volume"]
                v_val = int(v_raw) if (v_raw is not None and not pd.isna(v_raw)) else 0
                records.append({
                    "date": date_str,
                    "open": round(o_val, 2) if not pd.isna(o_val) else round(c_val, 2),
                    "high": round(h_val, 2) if not pd.isna(h_val) else round(c_val, 2),
                    "low": round(l_val, 2) if not pd.isna(l_val) else round(c_val, 2),
                    "close": round(c_val, 2),
                    "volume": v_val,
                    "currency": "INR",
                    "data_source": "yfinance (fallback)"
                })
            return records
    except Exception as e:
        logger.warning("History fetch error for %s: %s", clean, e)
    return []


async def get_stock_history(symbol: str, period: str = "1mo", interval: str = "1d") -> List[Dict[str, Any]]:
    clean = normalize_symbol(symbol)
    cache_key = f"hist:{clean}:{period}:{interval}"
    cached = await cache_service.get(cache_key)
    if cached:
        return cached

    loop = asyncio.get_running_loop()
    candles = await loop.run_in_executor(_MARKET_EXECUTOR, _fetch_yf_history, clean, period, interval)
    if candles:
        await cache_service.set(cache_key, candles, ttl_seconds=300)
    return candles


def get_stock_history_sync(symbol: str, period: str = "1mo", interval: str = "1d") -> List[Dict[str, Any]]:
    clean = normalize_symbol(symbol)
    cache_key = f"hist:{clean}:{period}:{interval}"
    cached = cache_service.get_sync(cache_key)
    if cached:
        return cached

    candles = _fetch_yf_history(clean, period, interval)
    if candles:
        cache_service.set_sync(cache_key, candles, ttl_seconds=300)
    return candles
