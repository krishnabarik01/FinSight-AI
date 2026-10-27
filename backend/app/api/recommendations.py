"""
FinSight AI — Personalized Investment Recommendations API
Serves tailored investment candidates based on the user's investor profile and Groww market data.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UserOut, RecommendationsResponse, InvestorProfileOut
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.database.models import InvestorProfile
from app.ai.recommender import generate_personalized_recommendations

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])

@router.get("", response_model=RecommendationsResponse)
async def get_recommendations(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Returns 5-10 personalized investment candidates tailored to the user's profile,
    featuring transparent pros/cons, risk assessments, indicator summaries, and forecast scenarios.
    """
    stmt = select(InvestorProfile).where(InvestorProfile.user_id == current_user.id)
    res = await db.execute(stmt)
    profile = res.scalar_one_or_none()

    if profile:
        profile_out = InvestorProfileOut(
            id=profile.id,
            user_id=profile.user_id,
            experience_level=profile.experience_level,
            financial_objective=profile.financial_objective,
            investment_horizon=profile.investment_horizon,
            risk_tolerance=profile.risk_tolerance,
            approximate_budget=profile.approximate_budget,
            preferred_categories=[c.strip() for c in (profile.preferred_categories or "").split(",") if c.strip()],
            product_interests=[p.strip() for p in (profile.product_interests or "").split(",") if p.strip()],
            max_loss_tolerance_pct=float(profile.max_loss_tolerance_pct),
            liquidity_need=profile.liquidity_need,
            is_completed=bool(profile.is_completed),
            created_at=str(profile.created_at),
            updated_at=str(profile.updated_at)
        )
    else:
        # Balanced starter profile default
        profile_out = InvestorProfileOut(
            id="default-profile",
            user_id=current_user.id,
            experience_level="Beginner",
            financial_objective="Wealth Creation",
            investment_horizon="3-5 Years",
            risk_tolerance="Moderate",
            approximate_budget="₹10,000 - ₹50,000",
            preferred_categories=["Large Cap Equities", "Index ETFs", "Digital Gold"],
            product_interests=["Equities", "ETFs", "Gold"],
            max_loss_tolerance_pct=8.0,
            liquidity_need="Medium",
            is_completed=False
        )

    return await generate_personalized_recommendations(profile_out)
