import asyncio
import logging
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any, Optional

from app.services.providers.metals_provider import metals_provider

router = APIRouter(prefix="/api/metals", tags=["metals"])

@router.get("/silver/snapshot")
async def get_silver_market_snapshot(
    city: Optional[str] = Query(None, description="Target Indian city for domestic retail rates (defaults to Visakhapatnam)"),
    force_refresh: bool = Query(False, description="If true, bypasses in-memory cache to sync fresh live rates")
) -> Dict[str, Any]:
    return await metals_provider.get_metal_snapshot("silver", city=city, force_refresh=force_refresh)

@router.get("/silver/history")
async def get_silver_price_history(
    city: Optional[str] = Query(None, description="Target Indian city for domestic silver history (defaults to Visakhapatnam)"),
    period: str = Query("1mo", description="Historical lookback: 5d, 1mo, 3mo, 6mo, 1y, 2y"),
    interval: str = Query("1d", description="Interval"),
    force_refresh: bool = Query(False, description="If true, bypasses cache to refresh history")
) -> Dict[str, Any]:
    return await metals_provider.get_metal_history("silver", city=city, period=period, interval=interval, force_refresh=force_refresh)

@router.get("/{metal}/risk")
@router.get("/{metal}/risks")
@router.get("/{metal}/risk-analysis")
async def get_metal_risk_analysis(
    metal: str,
    force_refresh: bool = Query(False, description="If true, bypasses in-memory cache to recalculate fresh risk analysis")
) -> Dict[str, Any]:
    clean_metal = metal.lower().strip()
    if clean_metal not in ("gold", "silver"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metal '{metal}'. Supported values are 'gold' and 'silver'."
        )
    return await metals_provider.get_risk_analysis(clean_metal, force_refresh=force_refresh)

@router.get("/{metal}/prediction")
@router.get("/{metal}/predictions")
async def get_metal_predictions(
    metal: str,
    force_refresh: bool = Query(False, description="If true, bypasses in-memory cache to generate fresh predictions")
) -> Dict[str, Any]:
    clean_metal = metal.lower().strip()
    if clean_metal not in ("gold", "silver"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metal '{metal}'. Supported values are 'gold' and 'silver'."
        )
    return await metals_provider.get_predictions(clean_metal, force_refresh=force_refresh)
