"""
FinSight AI — Metals Provider Interface
Single access point for precious metals market data, risk evaluation, and ML predictions.
Uses Nebula Metals API as primary source; COMEX futures as labelled fallback.
"""

import asyncio
from typing import Dict, Any, List, Optional
from app.services.metals.service import metals_service

class MetalsProvider:
    """Unified provider interface for precious metals operations."""

    async def get_metal_snapshot(
        self,
        metal: str,
        city: Optional[str] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(
            metals_service.get_snapshot,
            metal=metal,
            city=city,
            force_refresh=force_refresh
        )

    async def get_metal_history(
        self,
        metal: str,
        city: Optional[str] = None,
        period: str = "1mo",
        interval: str = "1d",
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(
            metals_service.get_history,
            metal=metal,
            city=city,
            period=period,
            interval=interval,
            force_refresh=force_refresh
        )

    async def get_cities(self) -> List[str]:
        return await asyncio.to_thread(metals_service.get_cities)

    async def get_risk_analysis(self, metal: str, force_refresh: bool = False) -> Dict[str, Any]:
        from app.ai.metal_risk_engine import evaluate_metal_risk
        return await asyncio.to_thread(
            evaluate_metal_risk,
            metal=metal,
            force_refresh=force_refresh
        )

    async def get_predictions(self, metal: str, force_refresh: bool = False) -> Dict[str, Any]:
        from app.ai.metal_prediction_engine import generate_metal_predictions
        return await asyncio.to_thread(
            generate_metal_predictions,
            metal=metal,
            force_refresh=force_refresh
        )

metals_provider = MetalsProvider()
