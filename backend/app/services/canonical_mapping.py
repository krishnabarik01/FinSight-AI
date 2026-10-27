"""
FinSight AI — Canonical Questionnaire & Instrument Mapping
Provides single source of truth for:
1. Valid quiz answers across all 8 onboarding questions.
2. Canonical matching rules connecting user answers to instrument attributes.
"""

from typing import Dict, Any, List, Set

VALID_EXPERIENCE_LEVELS: Set[str] = {"Beginner", "Intermediate", "Experienced"}
VALID_FINANCIAL_OBJECTIVES: Set[str] = {
    "Wealth Creation",
    "Capital Preservation",
    "Retirement Planning",
    "Short-Term Growth"
}
VALID_INVESTMENT_HORIZONS: Set[str] = {"< 1 Year", "1-3 Years", "3-5 Years", "5+ Years"}
VALID_RISK_TOLERANCES: Set[str] = {"Conservative", "Moderate", "Aggressive"}
VALID_BUDGETS: Set[str] = {"< ₹10,000", "₹10,000 - ₹50,000", "₹50,000 - ₹2,00,000", "> ₹2,00,000"}
VALID_PREFERRED_CATEGORIES: Set[str] = {
    "Large Cap Equities",
    "Index ETFs",
    "Precious Metals",
    "Dividend Yield"
}
VALID_MAX_LOSS_PCTS: Set[float] = {5.0, 8.0, 12.0}
VALID_LIQUIDITY_NEEDS: Set[str] = {"Low", "Medium", "High"}

def validate_quiz_answers(profile_data: Dict[str, Any]) -> Dict[str, Any]:
    """Validates that all quiz answers conform to canonical enum options."""
    errors = []

    exp = profile_data.get("experience_level")
    if exp and exp not in VALID_EXPERIENCE_LEVELS:
        errors.append(f"Invalid experience_level: '{exp}'")

    obj = profile_data.get("financial_objective")
    if obj and obj not in VALID_FINANCIAL_OBJECTIVES:
        errors.append(f"Invalid financial_objective: '{obj}'")

    horiz = profile_data.get("investment_horizon")
    if horiz and horiz not in VALID_INVESTMENT_HORIZONS:
        errors.append(f"Invalid investment_horizon: '{horiz}'")

    risk = profile_data.get("risk_tolerance")
    if risk and risk not in VALID_RISK_TOLERANCES:
        errors.append(f"Invalid risk_tolerance: '{risk}'")

    budget = profile_data.get("approximate_budget")
    if budget and budget not in VALID_BUDGETS:
        errors.append(f"Invalid approximate_budget: '{budget}'")

    cats = profile_data.get("preferred_categories", [])
    if isinstance(cats, list):
        for c in cats:
            if c not in VALID_PREFERRED_CATEGORIES:
                errors.append(f"Invalid category in preferred_categories: '{c}'")

    loss = profile_data.get("max_loss_tolerance_pct")
    if loss is not None:
        try:
            floss = float(loss)
            if floss not in VALID_MAX_LOSS_PCTS and not (3.0 <= floss <= 25.0):
                errors.append(f"Invalid max_loss_tolerance_pct: {loss}")
        except (ValueError, TypeError):
            errors.append(f"Invalid max_loss_tolerance_pct: {loss}")

    liq = profile_data.get("liquidity_need")
    if liq and liq not in VALID_LIQUIDITY_NEEDS:
        errors.append(f"Invalid liquidity_need: '{liq}'")

    if errors:
        raise ValueError("; ".join(errors))
    return profile_data


def matches_preferred_category(instrument: Dict[str, Any], category: str) -> bool:
    """
    Evaluates whether an instrument matches a user-selected preferred category.
    Single canonical definition used across recommendation engine and discovery filters.
    """
    asset_type = instrument.get("asset_type", "equity").lower()
    sub_type = instrument.get("sub_type", "").lower()
    cap_class = instrument.get("cap_class", "large").lower()
    dividend_flag = bool(instrument.get("dividend_yield_flag", False))
    sector = instrument.get("sector", "").lower()

    if category == "Large Cap Equities":
        return asset_type == "equity" and cap_class in ("mega", "large")
    elif category == "Index ETFs":
        return sub_type == "index_etf" or (asset_type == "etf" and "index" in sector)
    elif category == "Precious Metals":
        return asset_type == "commodity_etf" or sub_type == "commodity_etf" or "commodity" in sector or "gold" in sector or "silver" in sector
    elif category == "Dividend Yield":
        return dividend_flag or sub_type == "dividend"
    return False
