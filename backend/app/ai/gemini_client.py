import os
import json
import hashlib
import asyncio
import logging
import socket
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger("finsight.gemini")

# Prefer IPv4 on Windows to avoid slow dual-stack IPv6 SSL handshake timeouts
try:
    _orig_getaddrinfo = socket.getaddrinfo
    def _prefer_ipv4_getaddrinfo(*args, **kwargs):
        res = _orig_getaddrinfo(*args, **kwargs)
        v4 = [r for r in res if r[0] == socket.AF_INET]
        return v4 if v4 else res
    socket.getaddrinfo = _prefer_ipv4_getaddrinfo
except Exception:
    pass

DISCLAIMER_TEXT = "Educational information only; not SEBI-registered investment advice. Past performance does not guarantee future results."

class RecommendationExplanation(BaseModel):
    why_it_fits: str
    key_drivers: List[str]
    disclaimer: str = DISCLAIMER_TEXT

class MarketInsightResponse(BaseModel):
    headline: str
    narrative: str
    key_risks: List[str]
    disclaimer: str = DISCLAIMER_TEXT

class MetalOutlookResponse(BaseModel):
    outlook: str
    key_driver: str
    domestic_factor: str
    disclaimer: str = DISCLAIMER_TEXT

class GeminiClient:
    def __init__(self):
        self._client = None
        self._init_client()

    def _init_client(self):
        if settings.GEMINI_API_KEY:
            try:
                from google import genai
                from google.genai import types
                http_opts = types.HttpOptions(timeout=12.0)
                self._client = genai.Client(api_key=settings.GEMINI_API_KEY, http_options=http_opts)
                logger.info("GeminiClient initialized with model %s", settings.GEMINI_MODEL)
            except Exception as e:
                logger.warning("Failed to initialize Google GenAI SDK: %s", e)
                self._client = None

    def _hash_input(self, prefix: str, data: Any) -> str:
        s = json.dumps(data, sort_keys=True, default=str)
        h = hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]
        return f"gemini:{prefix}:{h}"

    async def _generate_with_retry(self, prompt: str, schema: Optional[Any] = None, max_retries: int = 2) -> Optional[str]:
        if not self._client:
            self._init_client()
        if not self._client:
            return None

        from google.genai import types

        for attempt in range(max_retries):
            try:
                config_kwargs = {}
                if schema:
                    config_kwargs["response_mime_type"] = "application/json"
                    config_kwargs["response_schema"] = schema

                config = types.GenerateContentConfig(**config_kwargs)

                # Blocking SDK call wrapped in asyncio.to_thread with timeout
                def _call():
                    return self._client.models.generate_content(
                        model=settings.GEMINI_MODEL,
                        contents=prompt,
                        config=config
                    )

                response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=14.0)
                if response and response.text:
                    return response.text
            except asyncio.TimeoutError:
                logger.warning("Gemini API call timed out after 14s (attempt %d/%d)", attempt + 1, max_retries)
            except Exception as e:
                logger.warning("Gemini API call failed (attempt %d/%d): %s", attempt + 1, max_retries, e)
                if "429" in str(e) or "ResourceExhausted" in str(e):
                    await asyncio.sleep(1.5 * (attempt + 1))
                else:
                    await asyncio.sleep(0.5)

        return None

    async def explain_recommendation(
        self,
        symbol: str,
        company_name: str,
        user_profile: Dict[str, Any],
        score_breakdown: Dict[str, Any],
        indicators: Dict[str, Any]
    ) -> str:
        """
        Explains why this instrument fits the user's questionnaire profile using only verified numbers.
        """
        cache_key = self._hash_input("rec", {
            "symbol": symbol,
            "profile": user_profile,
            "scores": score_breakdown,
            "rsi": indicators.get("rsi"),
            "vol": indicators.get("volatility")
        })
        cached = await cache_service.get(cache_key)
        if cached:
            return cached

        # Template fallback
        risk_tol = user_profile.get("risk_tolerance", "Moderate")
        horizon = user_profile.get("investment_horizon", "3-5 years")
        asset_type = indicators.get("asset_type", "equity")
        vol = indicators.get("volatility", 18.0)
        rsi = indicators.get("rsi", 50.0)

        template_explanation = (
            f"{company_name} ({symbol}) aligns with your {risk_tol} risk preference and {horizon} horizon. "
            f"It exhibits an annualized volatility of {vol:.1f}% and an RSI(14) of {rsi:.1f}, "
            f"providing structured exposure suited to your target allocation."
        )

        prompt = (
            f"You are a disciplined financial analyst explaining a personalized portfolio pick. "
            f"DO NOT invent any prices, market caps, or returns. Use ONLY the computed figures provided.\n"
            f"Instrument: {company_name} ({symbol})\n"
            f"User Profile: Risk={risk_tol}, Horizon={horizon}, Experience={user_profile.get('experience_level')}\n"
            f"Computed Metrics: Annual Volatility={vol:.1f}%, RSI(14)={rsi:.1f}, Asset Type={asset_type}\n"
            f"Scoring Breakdown: {json.dumps(score_breakdown)}\n"
            f"Task: Write 2 concise sentences explaining why this instrument fits this specific user's answers.\n"
            f"Always include the disclaimer: '{DISCLAIMER_TEXT}'"
        )

        raw = await self._generate_with_retry(prompt)
        if raw and raw.strip():
            result = raw.strip()
            if DISCLAIMER_TEXT not in result:
                result = f"{result}\n\n*Note: {DISCLAIMER_TEXT}*"
            await cache_service.set(cache_key, result, ttl_seconds=600)
            return result

        fallback = f"{template_explanation}\n\n*Note: {DISCLAIMER_TEXT}*"
        await cache_service.set(cache_key, fallback, ttl_seconds=600)
        return fallback

    async def generate_market_insight(self, tier: str, market_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates an AI market insight box explaining current indices and risk environment.
        """
        cache_key = self._hash_input("market_box", {"tier": tier, "data": market_data})
        cached = await cache_service.get(cache_key)
        if cached:
            return cached

        nifty_pnl = market_data.get("nifty_change_pct", 0.0)
        vix = market_data.get("vix", 14.5)

        # Template fallback
        template = {
            "tier": tier,
            "headline": f"Indian Markets Regime: Nifty {nifty_pnl:+.2f}%",
            "narrative": (
                f"Markets are trading with volatility (VIX: {vix:.1f}). "
                f"For {tier.lower()} investors, disciplined position sizing and risk management remain optimal."
            ),
            "key_risks": ["Short-term index fluctuation", "Global macro cues"],
            "disclaimer": DISCLAIMER_TEXT
        }

        prompt = (
            f"Summarize the current Indian stock market tone for a {tier} retail investor. "
            f"Use ONLY these numbers: Nifty 50 change: {nifty_pnl:+.2f}%, India VIX: {vix:.1f}.\n"
            f"DO NOT invent forecasts or prices. Provide a structured response with headline, narrative (max 40 words), and 2 key risks."
        )

        raw = await self._generate_with_retry(prompt, schema=MarketInsightResponse)
        if raw:
            try:
                parsed = json.loads(raw)
                parsed["tier"] = tier
                parsed["disclaimer"] = DISCLAIMER_TEXT
                await cache_service.set(cache_key, parsed, ttl_seconds=600)
                return parsed
            except Exception:
                pass

        await cache_service.set(cache_key, template, ttl_seconds=600)
        return template

    async def generate_metals_insight(
        self,
        metal: str,
        city: str,
        domestic_price: float,
        spot_usd_oz: float,
        trend: str,
        risk_metrics: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generates metals outlook and domestic Indian bullion analysis.
        """
        metal_cap = metal.capitalize()
        cache_key = self._hash_input("metals", {
            "metal": metal,
            "city": city,
            "price": domestic_price,
            "spot": spot_usd_oz,
            "trend": trend,
            "vol": risk_metrics.get("annual_volatility")
        })
        cached = await cache_service.get(cache_key)
        if cached:
            return cached

        vol = risk_metrics.get("annual_volatility", 16.5)
        var95 = risk_metrics.get("var_95", 2.2)

        template = {
            "metal": metal,
            "city": city,
            "outlook": f"{metal_cap} in {city} is trading at Rs. {domestic_price:,.0f} with a {trend.lower()} trajectory.",
            "key_driver": f"Global spot is ${spot_usd_oz:,.2f}/oz with 1-day 95% Value-at-Risk of {var95:.2f}%.",
            "domestic_factor": "Domestic bullion rates reflect import duties (15%) and local GST (3%).",
            "disclaimer": DISCLAIMER_TEXT
        }

        prompt = (
            f"Explain {metal_cap} physical bullion dynamics in India based on computed data.\n"
            f"City: {city}, Domestic Retail Price: Rs. {domestic_price:,.0f}, Global Spot: ${spot_usd_oz:.2f}/oz, "
            f"Trend: {trend}, Annual Volatility: {vol:.1f}%, 95% Daily VaR: {var95:.2f}%.\n"
            f"Do NOT invent numbers. Explain the interaction of spot movements, import duties, and domestic retail demand in 2-3 sentences."
        )

        raw = await self._generate_with_retry(prompt, schema=MetalOutlookResponse)
        if raw:
            try:
                parsed = json.loads(raw)
                parsed["metal"] = metal
                parsed["city"] = city
                parsed["disclaimer"] = DISCLAIMER_TEXT
                await cache_service.set(cache_key, parsed, ttl_seconds=600)
                return parsed
            except Exception:
                pass

        await cache_service.set(cache_key, template, ttl_seconds=600)
        return template

gemini_client = GeminiClient()
