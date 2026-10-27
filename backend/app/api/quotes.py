"""
FinSight AI — Unified Quotes API Endpoint

Provides single source of truth for:
1. Batch quotes: GET /api/quotes?symbols=SBIN,TCS,RELIANCE,...
2. Single quote: GET /api/quotes/{symbol}

All FinSight AI pages (Stock Analysis, Active Watchlist, Risk Assessment,
Portfolio, Dashboard) consume quotes through this unified pipeline.
"""

import logging
from fastapi import APIRouter, Query, HTTPException
from typing import List, Dict, Any, Optional
from app.services.quote_service import get_live_quote, get_batch_quotes, normalize_symbol

logger = logging.getLogger("finsight.quotes_api")

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

@router.get("", response_model=List[Dict[str, Any]])
async def get_quotes(
    symbols: str = Query(..., description="Comma-separated symbols list (e.g. 'SBIN,RELIANCE,TCS')"),
    force_refresh: bool = Query(False, description="Bypass in-memory cache and force live fetch")
):
    """
    Fetches real-time quotes for multiple Indian stocks and ETFs in parallel.
    Uses Groww API with yfinance fallback, cached for 15-30s.
    """
    if not symbols or not symbols.strip():
        return []

    raw_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not raw_list:
        return []

    try:
        return await get_batch_quotes(raw_list, force_refresh=force_refresh)
    except Exception as e:
        logger.exception("Error in batch quotes endpoint: %s", e)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to fetch quotes", "detail": str(e)}
        )

@router.get("/{symbol}", response_model=Dict[str, Any])
async def get_quote(
    symbol: str,
    force_refresh: bool = Query(False, description="Bypass in-memory cache and force live fetch")
):
    """
    Fetches single real-time quote for an Indian stock or ETF.
    """
    try:
        clean = normalize_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid symbol", "detail": str(e)})

    try:
        quote = await get_live_quote(clean, force_refresh=force_refresh)
        if not quote:
            raise HTTPException(
                status_code=404,
                detail={"error": "Not Found", "detail": f"Stock data for {symbol} not found"}
            )
        return quote
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error fetching single quote for %s: %s", symbol, e)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to fetch quote", "detail": str(e)}
        )
