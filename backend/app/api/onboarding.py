"""
FinSight AI — Investor Onboarding & Profiling API
Provides 5-10 beginner-friendly profiling questions, persists answers,
and feeds into personalized guidance and recommendation engines.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UserOut, InvestorProfileCreate, InvestorProfileUpdate, InvestorProfileOut
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.database.models import InvestorProfile, User

logger = logging.getLogger("finsight.onboarding")

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

ONBOARDING_QUESTIONS = [
    {
        "id": "experience_level",
        "question": "What is your current stock market investing experience?",
        "description": "Helps us calibrate educational explanations and indicator complexity.",
        "options": [
            {"value": "Beginner", "label": "Complete Beginner", "hint": "I have never invested or bought a stock/ETF before"},
            {"value": "Intermediate", "label": "Some Experience (1-3 years)", "hint": "I have invested in mutual funds, SIPs, or a few bluechip stocks"},
            {"value": "Experienced", "label": "Active Investor (3+ years)", "hint": "I understand fundamental ratios, charts, and manage my own portfolio"}
        ],
        "default": "Beginner"
    },
    {
        "id": "financial_objective",
        "question": "What is your primary financial objective?",
        "description": "Aligns investment discovery with your personal goals.",
        "options": [
            {"value": "Wealth Creation", "label": "Long-Term Wealth Creation", "hint": "Compounding capital over multiple years through equities and index ETFs"},
            {"value": "Capital Preservation", "label": "Capital Preservation & Low Risk", "hint": "Protecting savings from inflation with gold and defensive bluechips"},
            {"value": "Retirement Planning", "label": "Retirement & Passive Income", "hint": "Steady dividend yields, index funds, and balanced asset allocation"},
            {"value": "Short-Term Growth", "label": "Short-Term Tactical Growth", "hint": "Taking calculated opportunities across 6-12 month horizons"}
        ],
        "default": "Wealth Creation"
    },
    {
        "id": "investment_horizon",
        "question": "What is your planned investment time horizon?",
        "description": "Different assets perform best over different holding durations.",
        "options": [
            {"value": "< 1 Year", "label": "Short Term (< 1 Year)", "hint": "Higher liquidity need, sensitive to market drawdowns"},
            {"value": "1-3 Years", "label": "Medium Term (1-3 Years)", "hint": "Balanced growth and volatility absorption"},
            {"value": "3-5 Years", "label": "Long Term (3-5 Years)", "hint": "Ideal for Indian equity compounding and ETFs"},
            {"value": "5+ Years", "label": "Very Long Term (5+ Years)", "hint": "Highest ability to ride out market cycles and maximize compounding"}
        ],
        "default": "3-5 Years"
    },
    {
        "id": "risk_tolerance",
        "question": "How comfortable are you with price volatility and temporary market dips?",
        "description": "Your risk tolerance is key to avoiding panic selling during corrections.",
        "options": [
            {"value": "Conservative", "label": "Conservative / Low Risk", "hint": "I get anxious if my investment drops by more than 5-7%"},
            {"value": "Moderate", "label": "Moderate / Balanced Risk", "hint": "I can tolerate standard 10-15% market fluctuations for reasonable returns"},
            {"value": "Aggressive", "label": "Aggressive / Growth Focused", "hint": "I accept 20%+ drawdowns in pursuit of higher long-term upside"}
        ],
        "default": "Moderate"
    },
    {
        "id": "approximate_budget",
        "question": "What is your planned initial investment budget?",
        "description": "Determines optimal diversification and position sizing.",
        "options": [
            {"value": "< ₹10,000", "label": "Micro (< ₹10,000)", "hint": "Best suited for low-cost ETFs and fractional share accumulation"},
            {"value": "₹10,000 - ₹50,000", "label": "Starter (₹10,000 - ₹50,000)", "hint": "Allows 3-5 well-diversified core holdings"},
            {"value": "₹50,000 - ₹2,00,000", "label": "Growth (₹50,000 - ₹2,00,000)", "hint": "Full multi-asset basket across stocks, ETFs, and precious metals"},
            {"value": "> ₹2,00,000", "label": "Institutional (> ₹2,00,000)", "hint": "Comprehensive portfolio with advanced hedging and sector rotation"}
        ],
        "default": "₹10,000 - ₹50,000"
    },
    {
        "id": "preferred_categories",
        "question": "Which investment categories are you most interested in exploring?",
        "description": "Select the asset classes that fit your interest (multi-select supported).",
        "options": [
            {"value": "Large Cap Equities", "label": "Bluechip Large Caps (SBI, Reliance, TCS, HDFC)", "hint": "Stable market leaders with strong institutional backing"},
            {"value": "Index ETFs", "label": "NIFTY 50 Index ETFs (NIFTYBEES)", "hint": "Instant diversification across India's top 50 companies"},
            {"value": "Precious Metals", "label": "Digital Gold & Silver (GOLDBEES, SILVERBEES)", "hint": "Inflation hedge and portfolio stabilizer"},
            {"value": "Dividend Yield", "label": "High-Dividend Stocks (ITC, PSUs)", "hint": "Regular cash flows and lower volatility"}
        ],
        "default": ["Large Cap Equities", "Index ETFs", "Precious Metals"]
    },
    {
        "id": "max_loss_tolerance_pct",
        "question": "What is your acceptable stop-loss threshold before reviewing an exit?",
        "description": "Sets the default automated alert baseline for your holdings.",
        "options": [
            {"value": 5.0, "label": "Tight Guardrail (-5%)", "hint": "Strict stop-loss; triggers early warnings"},
            {"value": 8.0, "label": "Standard Buffer (-8%)", "hint": "Recommended baseline for Indian equities and ETFs"},
            {"value": 12.0, "label": "Wide Leeway (-12%)", "hint": "Allows volatile growth stocks room to breathe"}
        ],
        "default": 8.0
    },
    {
        "id": "liquidity_need",
        "question": "Do you anticipate needing access to these funds unexpectedly?",
        "description": "Ensures you maintain sufficient liquidity buffer outside the market.",
        "options": [
            {"value": "Low", "label": "Low Need (Locked for goal)", "hint": "Funds are committed strictly for the long term"},
            {"value": "Medium", "label": "Moderate Need", "hint": "Might need emergency partial withdrawal with 1-2 days notice"},
            {"value": "High", "label": "High Liquidity Requirement", "hint": "Keep higher allocation in liquid index ETFs and gold"}
        ],
        "default": "Medium"
    }
]

@router.get("/questions")
async def get_questions():
    """Returns the complete beginner investor onboarding questionnaire schema."""
    return {
        "title": "FinSight AI Investor Profiling Questionnaire",
        "description": "Help us understand your investment background, objectives, and risk appetite.",
        "total_questions": len(ONBOARDING_QUESTIONS),
        "questions": ONBOARDING_QUESTIONS
    }

@router.get("/profile", response_model=InvestorProfileOut)
async def get_profile(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Retrieves the authenticated user's investor profile or creates default."""
    stmt = select(InvestorProfile).where(InvestorProfile.user_id == current_user.id)
    res = await db.execute(stmt)
    profile = res.scalar_one_or_none()

    if not profile:
        profile = InvestorProfile(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            experience_level="Beginner",
            financial_objective="Wealth Creation",
            investment_horizon="3-5 Years",
            risk_tolerance="Moderate",
            approximate_budget="₹10,000 - ₹50,000",
            preferred_categories="Large Cap Equities, Index ETFs, Digital Gold",
            product_interests="Equities, ETFs, Gold, Silver",
            max_loss_tolerance_pct=8.0,
            liquidity_need="Medium",
            is_completed=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(profile)
        await db.flush()

    return InvestorProfileOut(
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
        created_at=profile.created_at.isoformat() if isinstance(profile.created_at, datetime) else str(profile.created_at),
        updated_at=profile.updated_at.isoformat() if isinstance(profile.updated_at, datetime) else str(profile.updated_at)
    )

@router.post("/profile", response_model=InvestorProfileOut)
async def update_profile(
    payload: InvestorProfileCreate,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Saves or updates the user's questionnaire answers and investor profile."""
    stmt = select(InvestorProfile).where(InvestorProfile.user_id == current_user.id)
    res = await db.execute(stmt)
    profile = res.scalar_one_or_none()

    categories_str = ", ".join(payload.preferred_categories) if payload.preferred_categories else "Large Cap Equities, Index ETFs"
    products_str = ", ".join(payload.product_interests) if payload.product_interests else "Equities, ETFs, Gold"

    now_dt = datetime.now(timezone.utc)

    if not profile:
        profile = InvestorProfile(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            experience_level=payload.experience_level,
            financial_objective=payload.financial_objective,
            investment_horizon=payload.investment_horizon,
            risk_tolerance=payload.risk_tolerance,
            approximate_budget=payload.approximate_budget,
            preferred_categories=categories_str,
            product_interests=products_str,
            max_loss_tolerance_pct=payload.max_loss_tolerance_pct,
            liquidity_need=payload.liquidity_need,
            is_completed=True,
            created_at=now_dt,
            updated_at=now_dt
        )
        db.add(profile)
    else:
        profile.experience_level = payload.experience_level
        profile.financial_objective = payload.financial_objective
        profile.investment_horizon = payload.investment_horizon
        profile.risk_tolerance = payload.risk_tolerance
        profile.approximate_budget = payload.approximate_budget
        profile.preferred_categories = categories_str
        profile.product_interests = products_str
        profile.max_loss_tolerance_pct = payload.max_loss_tolerance_pct
        profile.liquidity_need = payload.liquidity_need
        profile.is_completed = True
        profile.updated_at = now_dt

    await db.flush()

    return InvestorProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        experience_level=profile.experience_level,
        financial_objective=profile.financial_objective,
        investment_horizon=profile.investment_horizon,
        risk_tolerance=profile.risk_tolerance,
        approximate_budget=profile.approximate_budget,
        preferred_categories=payload.preferred_categories,
        product_interests=payload.product_interests,
        max_loss_tolerance_pct=float(profile.max_loss_tolerance_pct),
        liquidity_need=profile.liquidity_need,
        is_completed=bool(profile.is_completed),
        created_at=profile.created_at.isoformat() if isinstance(profile.created_at, datetime) else str(profile.created_at),
        updated_at=profile.updated_at.isoformat() if isinstance(profile.updated_at, datetime) else str(profile.updated_at)
    )
