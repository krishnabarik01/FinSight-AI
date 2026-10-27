"""
FinSight AI — Recommendation Engine Phase 4 Unit Tests
Verifies:
(a) two clearly different profiles produce different top lists
(b) changing only budget changes the number of picks or allocation
(c) changing only preferred_categories changes ranking
(d) every quiz option value maps to a known tag
(e) allocation sums to 100
"""

import pytest
from app.models.schemas import InvestorProfileOut
from app.ai.recommender import generate_personalized_recommendations
from app.api.onboarding import ONBOARDING_QUESTIONS
from app.services.canonical_mapping import (
    VALID_EXPERIENCE_LEVELS,
    VALID_FINANCIAL_OBJECTIVES,
    VALID_INVESTMENT_HORIZONS,
    VALID_RISK_TOLERANCES,
    VALID_BUDGETS,
    VALID_PREFERRED_CATEGORIES,
    VALID_MAX_LOSS_PCTS,
    VALID_LIQUIDITY_NEEDS,
    matches_preferred_category
)
from app.services.providers.stocks_provider import INSTRUMENTS_LIST

def _build_profile(**kwargs) -> InvestorProfileOut:
    defaults = {
        "id": "test-prof",
        "user_id": "test-user-id",
        "experience_level": "Beginner",
        "financial_objective": "Wealth Creation",
        "investment_horizon": "3-5 Years",
        "risk_tolerance": "Moderate",
        "approximate_budget": "₹10,000 - ₹50,000",
        "preferred_categories": ["Large Cap Equities", "Index ETFs"],
        "product_interests": ["Equities", "ETFs"],
        "max_loss_tolerance_pct": 8.0,
        "liquidity_need": "Medium",
        "is_completed": True
    }
    defaults.update(kwargs)
    return InvestorProfileOut(**defaults)


def test_every_quiz_option_value_maps_to_known_tag():
    """Requirement (d): every quiz option value maps to a known canonical enum/tag."""
    q_map = {q["id"]: q for q in ONBOARDING_QUESTIONS}

    # 1. Experience
    for opt in q_map["experience_level"]["options"]:
        assert opt["value"] in VALID_EXPERIENCE_LEVELS

    # 2. Objective
    for opt in q_map["financial_objective"]["options"]:
        assert opt["value"] in VALID_FINANCIAL_OBJECTIVES

    # 3. Horizon
    for opt in q_map["investment_horizon"]["options"]:
        assert opt["value"] in VALID_INVESTMENT_HORIZONS

    # 4. Risk
    for opt in q_map["risk_tolerance"]["options"]:
        assert opt["value"] in VALID_RISK_TOLERANCES

    # 5. Budget
    for opt in q_map["approximate_budget"]["options"]:
        assert opt["value"] in VALID_BUDGETS

    # 6. Categories
    for opt in q_map["preferred_categories"]["options"]:
        assert opt["value"] in VALID_PREFERRED_CATEGORIES
        # Ensure at least one instrument in universe matches each category
        matching = [inst for inst in INSTRUMENTS_LIST if matches_preferred_category(inst, opt["value"])]
        assert len(matching) > 0, f"No instrument matches canonical category: {opt['value']}"

    # 7. Max Loss
    for opt in q_map["max_loss_tolerance_pct"]["options"]:
        assert float(opt["value"]) in VALID_MAX_LOSS_PCTS

    # 8. Liquidity Need
    for opt in q_map["liquidity_need"]["options"]:
        assert opt["value"] in VALID_LIQUIDITY_NEEDS


@pytest.mark.anyio
async def test_two_different_profiles_produce_different_top_lists():
    """Requirement (a): Conservative/<1 year/micro budget vs Aggressive/5+ years/large budget."""
    conservative_profile = _build_profile(
        experience_level="Beginner",
        financial_objective="Capital Preservation",
        investment_horizon="< 1 Year",
        risk_tolerance="Conservative",
        approximate_budget="< ₹10,000",
        preferred_categories=["Precious Metals", "Index ETFs"],
        max_loss_tolerance_pct=5.0,
        liquidity_need="High"
    )

    aggressive_profile = _build_profile(
        experience_level="Experienced",
        financial_objective="Short-Term Growth",
        investment_horizon="5+ Years",
        risk_tolerance="Aggressive",
        approximate_budget="> ₹2,00,000",
        preferred_categories=["Large Cap Equities"],
        max_loss_tolerance_pct=12.0,
        liquidity_need="Low"
    )

    res_cons = await generate_personalized_recommendations(conservative_profile)
    res_aggr = await generate_personalized_recommendations(aggressive_profile)

    cons_symbols = [c.symbol for c in res_cons.candidates]
    aggr_symbols = [c.symbol for c in res_aggr.candidates]

    assert cons_symbols != aggr_symbols, "Different investor profiles must produce distinct top lists"
    # Conservative micro-budget should have fewer picks than aggressive large-budget
    assert len(cons_symbols) < len(aggr_symbols)


@pytest.mark.anyio
async def test_changing_only_budget_changes_pick_count_or_allocation():
    """Requirement (b): changing only budget changes the number of picks or allocation."""
    micro_profile = _build_profile(
        approximate_budget="< ₹10,000"
    )
    large_profile = _build_profile(
        approximate_budget="> ₹2,00,000"
    )

    res_micro = await generate_personalized_recommendations(micro_profile)
    res_large = await generate_personalized_recommendations(large_profile)

    assert len(res_micro.candidates) != len(res_large.candidates)
    assert len(res_micro.candidates) == 3
    assert len(res_large.candidates) == 8


@pytest.mark.anyio
async def test_changing_only_preferred_categories_changes_ranking():
    """Requirement (c): changing only preferred_categories changes ranking."""
    metals_profile = _build_profile(
        preferred_categories=["Precious Metals"]
    )
    equities_profile = _build_profile(
        preferred_categories=["Large Cap Equities"]
    )

    res_metals = await generate_personalized_recommendations(metals_profile)
    res_equities = await generate_personalized_recommendations(equities_profile)

    metals_top = [c.symbol for c in res_metals.candidates[:3]]
    equities_top = [c.symbol for c in res_equities.candidates[:3]]

    # Ensure rank order changes when preference changes
    assert metals_top != equities_top

    # Metals recommendation should favor Gold / Silver
    gold_or_silver = any("GOLD" in s or "SILVER" in s for s in metals_top)
    assert gold_or_silver, "Precious metals preference should rank gold/silver at top"


@pytest.mark.anyio
async def test_suggested_allocations_sum_to_100():
    """Requirement (e): allocation sums to exactly 100."""
    test_profiles = [
        _build_profile(approximate_budget="< ₹10,000"),
        _build_profile(approximate_budget="₹10,000 - ₹50,000"),
        _build_profile(approximate_budget="₹50,000 - ₹2,00,000"),
        _build_profile(approximate_budget="> ₹2,00,000")
    ]

    for prof in test_profiles:
        res = await generate_personalized_recommendations(prof)
        total_alloc = round(sum(c.suggested_allocation_pct for c in res.candidates), 1)
        assert total_alloc == 100.0, f"Expected 100.0% allocation, got {total_alloc}"
