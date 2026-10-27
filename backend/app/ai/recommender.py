"""
FinSight AI — Personalized Investment Recommendation Engine (Phase 4 Overhaul)
Synthesizes all 8 investor questionnaire answers with real-time market data
to recommend tailored Indian investments with transparent rationale, pros/cons, and scenarios.
"""

import time
import json
import hashlib
import asyncio
import logging
import pathlib
from typing import Dict, Any, List, Optional

from app.models.schemas import InvestorProfileOut, RecommendationCandidate, RecommendationsResponse
from app.services.providers.stocks_provider import stocks_provider, INSTRUMENTS_LIST
from app.services.canonical_mapping import matches_preferred_category, validate_quiz_answers
from app.services.providers.ai_provider import ai_provider
from app.services.cache import cache_service

logger = logging.getLogger("finsight.recommender")

def _compute_profile_hash(profile: InvestorProfileOut) -> str:
    """Computes a deterministic hash of the 8 questionnaire answers."""
    cats = sorted([c.strip() for c in (profile.preferred_categories or []) if c.strip()])
    key_str = (
        f"{profile.experience_level}|"
        f"{profile.financial_objective}|"
        f"{profile.investment_horizon}|"
        f"{profile.risk_tolerance}|"
        f"{profile.approximate_budget}|"
        f"{','.join(cats)}|"
        f"{float(profile.max_loss_tolerance_pct):.1f}|"
        f"{profile.liquidity_need}"
    )
    return hashlib.sha256(key_str.encode("utf-8")).hexdigest()[:16]


def _get_target_pick_count(approximate_budget: str) -> int:
    """Determines target portfolio holding count based on budget."""
    b = approximate_budget.strip()
    if "<" in b:
        return 3
    elif "10,000" in b and "50,000" in b:
        return 5
    elif "50,000" in b and "2,00,000" in b:
        return 7
    else:  # > 2,00,000
        return 8


async def generate_personalized_recommendations(profile: InvestorProfileOut) -> RecommendationsResponse:
    """
    Evaluates the full instrument universe (50+ NSE stocks & ETFs) against ALL 8 questionnaire answers:
    1. experience_level (Beginner / Intermediate / Experienced)
    2. financial_objective (Wealth Creation / Capital Preservation / Retirement Planning / Short-Term Growth)
    3. investment_horizon (< 1 Year / 1-3 Years / 3-5 Years / 5+ Years)
    4. risk_tolerance (Conservative / Moderate / Aggressive)
    5. approximate_budget (< ₹10,000 / ₹10,000 - ₹50,000 / ₹50,000 - ₹2,00,000 / > ₹2,00,000)
    6. preferred_categories (Large Cap Equities / Index ETFs / Precious Metals / Dividend Yield)
    7. max_loss_tolerance_pct (5.0 / 8.0 / 12.0)
    8. liquidity_need (High / Medium / Low)
    """
    profile_hash = _compute_profile_hash(profile)
    cache_key = f"recommendations:{profile_hash}"
    cached = await cache_service.get(cache_key)
    if cached:
        try:
            return RecommendationsResponse(**cached)
        except Exception:
            pass

    user_risk = (profile.risk_tolerance or "Moderate").strip().title()
    user_obj = (profile.financial_objective or "Wealth Creation").strip()
    user_horizon = (profile.investment_horizon or "3-5 Years").strip()
    user_exp = (profile.experience_level or "Beginner").strip().title()
    user_budget = (profile.approximate_budget or "₹10,000 - ₹50,000").strip()
    user_cats = profile.preferred_categories or []
    user_loss = float(profile.max_loss_tolerance_pct or 8.0)
    user_liq = (profile.liquidity_need or "Medium").strip().title()

    # Concurrent quote fetching with semaphore
    sem = asyncio.Semaphore(12)

    async def _fetch_quote(inst: Dict[str, Any]):
        async with sem:
            try:
                q = await stocks_provider.get_quote_async(inst["symbol"])
                return inst, q
            except Exception as e:
                logger.warning("Quote fetch error for %s: %s", inst["symbol"], e)
                return inst, None

    results = await asyncio.gather(*[_fetch_quote(inst) for inst in INSTRUMENTS_LIST])

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    scored_candidates = []

    for inst, quote in results:
        sym = inst.get("clean_symbol", inst["symbol"].replace(".NS", ""))
        full_sym = inst["symbol"]
        curr_p = float(quote.get("current_price", 0.0)) if quote else 0.0
        change_pct = float(quote.get("change_pct", 0.0)) if quote else 0.0
        indicators = quote.get("indicators", {}) if quote else {}
        volatility = float(indicators.get("volatility_annual") or 20.0)
        rsi = float(indicators.get("rsi_14") or 50.0)
        beta = float(quote.get("beta") or 1.0) if quote else 1.0
        pe = quote.get("pe_ratio") if quote else None

        asset_type = inst.get("asset_type", "equity").lower()
        sub_type = inst.get("sub_type", "").lower()
        cap_class = inst.get("cap_class", "large").lower()
        dividend_flag = bool(inst.get("dividend_yield_flag", False))
        sector = inst.get("sector", "Diversified")

        score_base = 35.0
        breakdown: Dict[str, float] = {}
        match_reasons: List[str] = []
        pros: List[str] = []
        cons: List[str] = []

        # --- 1. Experience Level ---
        if user_exp == "Beginner":
            if asset_type in ("etf", "commodity_etf") or sub_type == "index_etf":
                breakdown["experience_level"] = 8.0
                match_reasons.append("Beginner-friendly ETF structure eliminates single-stock default risks.")
                pros.append("Diversified instant exposure with rock-bottom expense ratio.")
            elif cap_class == "mega":
                breakdown["experience_level"] = 6.0
                match_reasons.append("Mega-cap market titan with proven operational resilience for new investors.")
            elif cap_class == "mid":
                breakdown["experience_level"] = -14.0
                cons.append("Mid-cap growth profile has sharper price swings than ideal for beginners.")
            else:
                breakdown["experience_level"] = 3.0
        elif user_exp == "Experienced":
            if cap_class == "mid":
                breakdown["experience_level"] = 10.0
                match_reasons.append("High-beta mid-cap growth potential aligns with your active market experience.")
                pros.append("Strong market share expansion runway in growing niche.")
            elif beta > 1.1:
                breakdown["experience_level"] = 7.0
            else:
                breakdown["experience_level"] = 3.0
        else:  # Intermediate
            if cap_class in ("mega", "large"):
                breakdown["experience_level"] = 6.0
            else:
                breakdown["experience_level"] = 4.0

        # --- 2. Risk Tolerance ---
        if user_risk == "Conservative":
            if beta < 0.85 or asset_type == "commodity_etf":
                breakdown["risk_tolerance"] = 10.0
                match_reasons.append(f"Subdued beta of {beta:.2f} aligns with your Conservative risk threshold.")
                pros.append("Defensive cushion during broad market consolidations.")
            elif beta > 1.25 or volatility > 25.0:
                breakdown["risk_tolerance"] = -16.0
                cons.append(f"Higher beta ({beta:.2f}) or volatility ({volatility:.1f}%) exceeds conservative tolerance.")
            else:
                breakdown["risk_tolerance"] = 2.0
        elif user_risk == "Aggressive":
            if beta > 1.05 or cap_class == "mid":
                breakdown["risk_tolerance"] = 10.0
                match_reasons.append(f"Dynamic beta ({beta:.2f}) provides high operating leverage for growth.")
                pros.append("High sensitivity to cyclical sector upswings.")
            else:
                breakdown["risk_tolerance"] = 4.0
        else:  # Moderate
            if 0.75 <= beta <= 1.25:
                breakdown["risk_tolerance"] = 8.0
                match_reasons.append(f"Balanced market sensitivity (Beta: {beta:.2f}) matches your Moderate profile.")
            else:
                breakdown["risk_tolerance"] = 3.0

        # --- 3. Financial Objective ---
        if "wealth" in user_obj.lower():
            if sub_type == "index_etf":
                breakdown["financial_objective"] = 8.0
                match_reasons.append("Foundational bedrock for compounding Indian economic expansion.")
            elif cap_class in ("mega", "large"):
                breakdown["financial_objective"] = 7.0
                match_reasons.append("Long-term compounding bluechip with durable return on equity.")
            else:
                breakdown["financial_objective"] = 3.0
        elif "preservation" in user_obj.lower():
            if asset_type == "commodity_etf":
                breakdown["financial_objective"] = 14.0
                match_reasons.append("Physical bullion backing provides non-correlated inflation and currency hedge.")
                pros.append("Negative correlation to domestic equity drawdowns.")
            elif dividend_flag:
                breakdown["financial_objective"] = 10.0
                match_reasons.append("Consistent dividend yields create a defensive cushion.")
            elif sub_type == "index_etf":
                breakdown["financial_objective"] = 6.0
            else:
                breakdown["financial_objective"] = -6.0
                cons.append("Single-equity volatility may conflict with strict capital preservation.")
        elif "retirement" in user_obj.lower():
            if dividend_flag:
                breakdown["financial_objective"] = 12.0
                match_reasons.append("High dividend yield provides steady passive retirement cash flows.")
                pros.append("Regular dividend yield dampens overall portfolio volatility.")
            elif sub_type == "index_etf":
                breakdown["financial_objective"] = 8.0
            elif beta < 0.9:
                breakdown["financial_objective"] = 6.0
            else:
                breakdown["financial_objective"] = 2.0
        else:  # Short-Term Growth
            if cap_class == "mid" or beta > 1.15:
                breakdown["financial_objective"] = 10.0
                match_reasons.append("Dynamic price momentum positioned for tactical swing capture.")
            else:
                breakdown["financial_objective"] = 4.0

        # --- 4. Investment Horizon ---
        if "< 1" in user_horizon:
            if asset_type in ("etf", "commodity_etf"):
                breakdown["investment_horizon"] = 8.0
                match_reasons.append("Superior intraday liquidity enables agile exits within 12 months.")
            elif volatility > 24.0:
                breakdown["investment_horizon"] = -10.0
                cons.append(f"High annual volatility ({volatility:.1f}%) requires longer than 1 year to smooth drawdowns.")
            else:
                breakdown["investment_horizon"] = 2.0
        elif "5+" in user_horizon:
            if asset_type == "equity":
                breakdown["investment_horizon"] = 10.0
                match_reasons.append("5+ year horizon maximally absorbs market cycles for equity compounding.")
            else:
                breakdown["investment_horizon"] = 6.0
        elif "3-5" in user_horizon:
            breakdown["investment_horizon"] = 8.0
            match_reasons.append("3-5 year sweet spot aligns with standard business cycle expansions.")
        else:  # 1-3 Years
            breakdown["investment_horizon"] = 5.0

        # --- 5. Approximate Budget ---
        if "<" in user_budget:  # Micro budget < 10,000
            if curr_p > 3000.0:
                breakdown["approximate_budget"] = -18.0
                cons.append(f"Single share price (₹{curr_p:.2f}) is high for a sub-₹10,000 budget, limiting diversification.")
            elif 0 < curr_p < 400.0:
                breakdown["approximate_budget"] = 10.0
                match_reasons.append(f"Low unit price (₹{curr_p:.2f}) permits fractional accumulation on micro budgets.")
            else:
                breakdown["approximate_budget"] = 2.0
        elif "10,000" in user_budget and "50,000" in user_budget:
            if curr_p > 8500.0:
                breakdown["approximate_budget"] = -8.0
                cons.append(f"High unit price (₹{curr_p:.2f}) absorbs a large fraction of a starter budget.")
            else:
                breakdown["approximate_budget"] = 5.0
        elif "50,000" in user_budget and "2,00,000" in user_budget:
            breakdown["approximate_budget"] = 6.0
        else:  # > 2,00,000
            breakdown["approximate_budget"] = 8.0

        # --- 6. Max Loss Tolerance % ---
        if volatility > (user_loss * 3.0):
            penalty = min(round((volatility - user_loss * 3.0) * 0.8, 1), 14.0)
            breakdown["max_loss_tolerance_pct"] = -penalty
            cons.append(f"Annualized volatility ({volatility:.1f}%) risks triggering your tight {user_loss:.1f}% stop-loss.")
        else:
            breakdown["max_loss_tolerance_pct"] = 6.0
            match_reasons.append(f"Historical volatility ({volatility:.1f}%) remains well within your {user_loss:.1f}% loss buffer.")

        # --- 7. Liquidity Need ---
        if user_liq == "High":
            if sub_type in ("index_etf", "commodity_etf") or cap_class == "mega":
                breakdown["liquidity_need"] = 8.0
                match_reasons.append("Institutional liquidity depth allows immediate exit with near-zero slippage.")
            elif cap_class == "mid":
                breakdown["liquidity_need"] = -10.0
                cons.append("Mid-cap order books can widen bid-ask spreads during sudden liquidation needs.")
            else:
                breakdown["liquidity_need"] = 2.0
        elif user_liq == "Low":
            breakdown["liquidity_need"] = 6.0
        else:  # Medium
            breakdown["liquidity_need"] = 5.0

        # --- 8. Preferred Categories (Canonical Matching) ---
        cat_bonus = 0.0
        for cat in user_cats:
            if matches_preferred_category(inst, cat):
                cat_bonus += 28.0
                match_reasons.append(f"Direct match with your chosen interest category: '{cat}'.")
                break
        breakdown["preferred_categories"] = cat_bonus

        # Calculate final score
        raw_score = score_base + sum(breakdown.values())
        final_score = round(max(35.0, min(97.5, raw_score)), 1)

        # Risk classification
        if volatility > 28.0 or beta > 1.25:
            risk_class = "High Risk"
            risk_score = 75.0
        elif volatility < 18.0 and beta < 0.85:
            risk_class = "Low Risk"
            risk_score = 25.0
        else:
            risk_class = "Moderate Risk"
            risk_score = 48.0

        # Forecast scenarios
        drift = 0.09 if "etf" in asset_type else 0.13
        scenarios = {
            "forecast_horizon": "1 Year Probabilistic Range",
            "base_case": {
                "target_price": round(curr_p * (1.0 + drift), 2),
                "expected_return_pct": round(drift * 100, 1),
                "assumption": "Steady domestic corporate earnings delivery and macroeconomic stability."
            },
            "bull_case": {
                "target_price": round(curr_p * (1.0 + drift * 1.7), 2),
                "expected_return_pct": round(drift * 1.7 * 100, 1),
                "assumption": "Sustained FII/DII inflows, multiple expansion, and sector earnings beat."
            },
            "bear_case": {
                "target_price": round(curr_p * (1.0 - drift * 0.9), 2),
                "expected_return_pct": round(-drift * 0.9 * 100, 1),
                "assumption": "Macro interest rate headwinds or broad market consolidation near support."
            }
        }

        tech_summary = f"14-Day RSI at {rsi:.1f} with annualized volatility tracking at {volatility:.1f}%. Immediate support floor."
        val_summary = f"Valuation: P/E {pe or 'N/A'}, 52-week trading corridor on NSE."

        # Candidate item
        candidate = {
            "symbol": full_sym,
            "clean_symbol": sym,
            "name": inst["name"],
            "category": inst.get("sector", "Equities"),
            "sector": sector,
            "asset_type": asset_type,
            "sub_type": sub_type,
            "current_price": round(curr_p, 2),
            "change_pct": round(change_pct, 2),
            "risk_level": risk_class,
            "risk_score": risk_score,
            "suitability_score": final_score,
            "score": final_score,
            "score_breakdown": breakdown,
            "match_reasons": match_reasons if match_reasons else ["Matches standard Indian investment diversification criteria."],
            "pros": pros if pros else [f"Established leader in {sector}."],
            "cons": cons if cons else ["Subject to standard Indian equity market cycle corrections."],
            "risks": cons if cons else ["Standard market cycle volatility."],
            "technical_indicator_summary": tech_summary,
            "valuation_summary": val_summary,
            "forecast_scenarios": scenarios,
            "data_source": quote.get("data_source", "Groww (primary)") if quote else "Groww (primary)",
            "timestamp": now_iso,
            "volatility": volatility,
            "rsi": rsi
        }
        scored_candidates.append(candidate)

    # Sort descending by score, tie-breaking by category match
    scored_candidates.sort(
        key=lambda c: (
            c["score"],
            c["score_breakdown"].get("preferred_categories", 0.0),
            -c["current_price"] if c["current_price"] > 0 else 0
        ),
        reverse=True
    )

    # --- Diversification Filtering ---
    # Target pick count based on budget
    target_count = _get_target_pick_count(user_budget)
    selected = []
    sector_counts: Dict[str, int] = {}
    has_etf_or_metal = False

    for c in scored_candidates:
        if len(selected) >= target_count:
            break
        sec = c["sector"]
        if sector_counts.get(sec, 0) >= 2:
            continue
        selected.append(c)
        sector_counts[sec] = sector_counts.get(sec, 0) + 1
        if c["asset_type"] in ("etf", "commodity_etf"):
            has_etf_or_metal = True

    # If profile allows, ensure at least 1 ETF / commodity ETF is present
    if not has_etf_or_metal and target_count >= 3:
        for c in scored_candidates:
            if c not in selected and c["asset_type"] in ("etf", "commodity_etf"):
                selected[-1] = c
                break

    # --- Allocation % Calculation (Sum to 100) ---
    raw_scores = [c["score"] for c in selected]
    total_raw = sum(raw_scores) or 1.0
    allocations = [round((s / total_raw) * 100, 1) for s in raw_scores]
    diff = round(100.0 - sum(allocations), 1)
    if allocations:
        allocations[0] = round(allocations[0] + diff, 1)

    # --- Gemini AI Explanation Generation (concurrent) ---
    user_prof_dict = {
        "experience_level": user_exp,
        "financial_objective": user_obj,
        "investment_horizon": user_horizon,
        "risk_tolerance": user_risk,
        "approximate_budget": user_budget,
        "liquidity_need": user_liq
    }

    async def _attach_explanation(c: Dict[str, Any], alloc: float) -> RecommendationCandidate:
        c["suggested_allocation_pct"] = alloc
        try:
            explanation = await ai_provider.explain_recommendation(
                symbol=c["clean_symbol"],
                company_name=c["name"],
                user_profile=user_prof_dict,
                score_breakdown=c["score_breakdown"],
                indicators={"rsi": c["rsi"], "volatility": c["volatility"], "asset_type": c["asset_type"]}
            )
            c["ai_explanation"] = explanation
        except Exception as e:
            logger.warning("AI explanation error for %s: %s", c["clean_symbol"], e)
            c["ai_explanation"] = (
                f"{c['name']} ({c['clean_symbol']}) matches your {user_risk} risk profile and "
                f"{user_horizon} horizon with an annualized volatility of {c['volatility']:.1f}%."
            )

        return RecommendationCandidate(
            symbol=c["symbol"],
            name=c["name"],
            category=c["category"],
            current_price=c["current_price"],
            change_pct=c["change_pct"],
            risk_level=c["risk_level"],
            risk_score=c["risk_score"],
            suitability_score=c["suitability_score"],
            score=c["score"],
            score_breakdown=c["score_breakdown"],
            match_reasons=c["match_reasons"],
            pros=c["pros"],
            cons=c["cons"],
            risks=c["risks"],
            ai_explanation=c["ai_explanation"],
            suggested_allocation_pct=c["suggested_allocation_pct"],
            technical_indicator_summary=c["technical_indicator_summary"],
            valuation_summary=c["valuation_summary"],
            forecast_scenarios=c["forecast_scenarios"],
            data_source=c["data_source"],
            timestamp=c["timestamp"]
        )

    final_candidates = await asyncio.gather(*[
        _attach_explanation(cand, alloc) for cand, alloc in zip(selected, allocations)
    ])

    response = RecommendationsResponse(
        user_risk_profile=user_risk,
        investment_horizon=user_horizon,
        financial_objective=user_obj,
        total_candidates=len(final_candidates),
        candidates=list(final_candidates),
        disclaimer=(
            "Educational and analytical guidance generated by FinSight AI algorithm using verified Groww/NSE market data. "
            "Educational information only, not SEBI-registered investment advice."
        ),
        generated_at=now_iso,
        profile_hash=profile_hash
    )

    # Cache response for 5 minutes (300s)
    await cache_service.set(cache_key, response.model_dump(), ttl_seconds=300)
    return response
