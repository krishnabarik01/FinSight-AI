import asyncio
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any, Optional

from app.config import settings
from app.services.providers.metals_provider import metals_provider

router = APIRouter(prefix="/api/gold", tags=["gold"])

@router.get("/snapshot")
async def get_gold_market_snapshot(
    city: Optional[str] = Query(None, description="Target Indian city for domestic retail rates (defaults to Visakhapatnam)"),
    force_refresh: bool = Query(False, description="If true, bypasses in-memory cache to sync fresh live rates")
):
    return await metals_provider.get_metal_snapshot("gold", city=city, force_refresh=force_refresh)

@router.get("/cities")
async def get_gold_supported_cities():
    cities = await metals_provider.get_cities()
    return {
        "status": "available",
        "default_city": settings.NEBULA_DEFAULT_CITY or "Visakhapatnam",
        "total": len(cities),
        "cities": cities
    }

@router.get("/history")
async def get_gold_price_history(
    city: Optional[str] = Query(None, description="Target Indian city for domestic gold history (defaults to Visakhapatnam)"),
    period: str = Query("1mo", description="Historical lookback: 5d, 1mo, 3mo, 6mo, 1y, 2y"),
    interval: str = Query("1d", description="Interval"),
    force_refresh: bool = Query(False, description="If true, bypasses cache to refresh history")
):
    return await metals_provider.get_metal_history("gold", city=city, period=period, interval=interval, force_refresh=force_refresh)

@router.get("/predictions")
async def get_gold_ai_predictions():
    return await metals_provider.get_predictions("gold")
