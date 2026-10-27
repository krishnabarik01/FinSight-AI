"""
FinSight AI — Unified AI Provider Interface
Single access point for AI text generation, explanations, and summaries.
Never fabricates financial figures or market prices.
"""

from typing import Dict, Any, List, Optional
from app.ai.gemini_client import gemini_client, DISCLAIMER_TEXT

class AIProvider:
    """Provider interface for AI explanations and market insights."""
    
    async def explain_recommendation(
        self,
        symbol: str,
        company_name: str,
        user_profile: Dict[str, Any],
        score_breakdown: Dict[str, Any],
        indicators: Dict[str, Any]
    ) -> str:
        return await gemini_client.explain_recommendation(
            symbol=symbol,
            company_name=company_name,
            user_profile=user_profile,
            score_breakdown=score_breakdown,
            indicators=indicators
        )

    async def get_market_insight(self, tier: str, market_data: Dict[str, Any]) -> Dict[str, Any]:
        return await gemini_client.generate_market_insight(tier=tier, market_data=market_data)

    async def get_metals_insight(
        self,
        metal: str,
        city: str,
        domestic_price: float,
        spot_usd_oz: float,
        trend: str,
        risk_metrics: Dict[str, Any]
    ) -> Dict[str, Any]:
        return await gemini_client.generate_metals_insight(
            metal=metal,
            city=city,
            domestic_price=domestic_price,
            spot_usd_oz=spot_usd_oz,
            trend=trend,
            risk_metrics=risk_metrics
        )

    def get_disclaimer(self) -> str:
        return DISCLAIMER_TEXT

ai_provider = AIProvider()
