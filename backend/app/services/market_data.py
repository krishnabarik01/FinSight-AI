"""
FinSight AI — Market Data Service
Powered by Groww API as the exclusive external stock market data provider.
Provides quotes, historical OHLC candles, technical indicators, and transparent status labeling.
"""

import time
import logging
import threading
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

from app.services.groww_service import groww_service, clean_indian_symbol
from app.services.currency import normalize_quote_to_inr, get_usdinr_exchange_rate

logger = logging.getLogger("finsight.market_data")

# Memory cache with TTL
_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 180  # 3 minutes

# Indices Cache
_INDICES_CACHE: Dict[str, Any] = {
    "data": None,
    "time": 0.0
}
INDICES_CACHE_TTL = 120  # 120 seconds

# Concurrency lock
_IN_FLIGHT_LOCKS: Dict[str, threading.Lock] = {}
_IN_FLIGHT_MUTEX = threading.Lock()

def _get_symbol_lock(sym: str) -> threading.Lock:
    with _IN_FLIGHT_MUTEX:
        clean = sym.upper().strip()
        if clean not in _IN_FLIGHT_LOCKS:
            _IN_FLIGHT_LOCKS[clean] = threading.Lock()
        return _IN_FLIGHT_LOCKS[clean]

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute RSI, MACD, SMAs, Bollinger Bands, ATR, Support & Resistance."""
    if df.empty or len(df) < 5:
        return df

    # Standardize column names if needed
    for col in ['close', 'open', 'high', 'low', 'volume']:
        if col in df.columns and col.capitalize() not in df.columns:
            df[col.capitalize()] = df[col]

    close = df['Close']
    high = df['High']
    low = df['Low']

    # 1. RSI (14 or smaller if shorter series)
    window_rsi = min(14, len(df))
    delta = close.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=window_rsi).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=window_rsi).mean()
    rs = gain / (loss + 1e-9)
    df['RSI_14'] = 100 - (100 / (1 + rs))
    df['RSI_14'] = df['RSI_14'].fillna(50.0)

    # 2. Moving Averages
    df['SMA_20'] = close.rolling(window=min(20, len(df))).mean().bfill()
    df['SMA_50'] = close.rolling(window=min(50, len(df))).mean().bfill()
    df['SMA_200'] = close.rolling(window=min(200, len(df))).mean().bfill()

    # 3. MACD (12, 26, 9)
    ema_12 = close.ewm(span=min(12, len(df)), adjust=False).mean()
    ema_26 = close.ewm(span=min(26, len(df)), adjust=False).mean()
    df['MACD'] = ema_12 - ema_26
    df['MACD_Signal'] = df['MACD'].ewm(span=min(9, len(df)), adjust=False).mean()
    df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']

    # 4. Bollinger Bands (20, 2)
    rolling_mean_20 = close.rolling(window=min(20, len(df))).mean().bfill()
    rolling_std_20 = close.rolling(window=min(20, len(df))).std().fillna(close * 0.02)
    df['BB_Upper'] = rolling_mean_20 + (rolling_std_20 * 2)
    df['BB_Lower'] = rolling_mean_20 - (rolling_std_20 * 2)
    df['BB_Middle'] = rolling_mean_20

    # 5. ATR (14)
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    df['ATR_14'] = tr.rolling(window=min(14, len(df))).mean().bfill()

    # 6. Volatility (Annualized)
    log_ret = np.log((close / close.shift(1)).replace(0, np.nan))
    df['Volatility_Annual'] = (log_ret.rolling(window=min(20, len(df))).std() * np.sqrt(252) * 100).fillna(22.0)

    return df

def fetch_and_cache_info(symbol: str) -> Dict[str, Any]:
    """Retrieves instrument profile from Groww catalog."""
    quote = groww_service.get_quote(symbol)
    return {
        "shortName": quote.get("company_name"),
        "longName": quote.get("company_name"),
        "currency": quote.get("currency", "INR"),
        "exchange": quote.get("exchange", "NSE"),
        "marketCap": quote.get("market_cap"),
        "trailingPE": quote.get("pe_ratio", 20.0),
        "forwardPE": quote.get("forward_pe", 18.0),
        "profitMargins": (quote.get("profit_margin", 15.0) or 15.0) / 100.0,
        "debtToEquity": quote.get("debt_to_equity", 0.5),
        "beta": quote.get("beta", 1.0)
    }

def search_symbols(query: str) -> List[Dict[str, Any]]:
    """Search stock market instruments via Groww market-data service."""
    return groww_service.search_instruments(query)

def get_stock_data(symbol: str) -> Dict[str, Any]:
    """
    Fetch quote, financial metadata, and calculated technical indicators
    using the unified single source of truth.
    """
    from app.services.quote_service import get_live_quote_sync
    return get_live_quote_sync(symbol)

def get_stock_history(symbol: str, period: str = "1mo", interval: str = "1d") -> List[Dict[str, Any]]:
    """
    Returns authentic historical OHLC bars with calculated technical indicators.
    """
    from app.services.quote_service import get_stock_history_sync
    return get_stock_history_sync(symbol, period=period, interval=interval)

def get_indices_overview() -> List[Dict[str, Any]]:
    """Return major Indian market indices via Groww market-data service."""
    now = time.time()
    if _INDICES_CACHE["data"] is not None and (now - _INDICES_CACHE["time"]) < INDICES_CACHE_TTL:
        return _INDICES_CACHE["data"]

    indices = groww_service.get_market_indices()
    _INDICES_CACHE["data"] = indices
    _INDICES_CACHE["time"] = now
    return indices
