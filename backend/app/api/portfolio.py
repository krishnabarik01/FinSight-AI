"""
FinSight AI — Portfolio API Router (Thin Router)
Validates input and delegates all portfolio calculation and persistence to portfolio_service.
"""

from typing import List, Dict, Any, Optional, Union
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import (
    UserOut,
    HoldingCreate,
    HoldingsBatchCreate,
    HoldingUpdate,
    MetalHoldingCreate,
    HoldingOut,
    PortfolioSummaryOut
)
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.services.portfolio_service import portfolio_service
from app.services.metal_portfolio import get_metal_price_quote
from app.services.market_data import get_stock_data

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

@router.get("", response_model=PortfolioSummaryOut)
async def get_portfolio_summary(
    portfolio_id: Optional[str] = None,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await portfolio_service.get_summary(db=db, user_id=current_user.id, portfolio_id=portfolio_id)

@router.post("/holdings", response_model=HoldingOut)
async def add_holding(
    req: HoldingCreate,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await portfolio_service.add_stock_holding(db=db, user_id=current_user.id, req=req)

@router.post("/holdings/batch", response_model=List[HoldingOut])
async def add_holdings_batch(
    req: Union[HoldingsBatchCreate, List[HoldingCreate]],
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    items = req.holdings if isinstance(req, HoldingsBatchCreate) else req
    return await portfolio_service.add_stock_holdings_batch(db=db, user_id=current_user.id, items=items)

@router.post("/holdings/metal", response_model=HoldingOut)
async def add_metal_holding(
    req: MetalHoldingCreate,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await portfolio_service.add_metal_holding(db=db, user_id=current_user.id, req=req)

@router.get("/metal-quote")
async def get_metal_quote_endpoint(
    metal: str = Query(..., description="GOLD or SILVER"),
    purity: str = Query("24K", description="Purity e.g. 24K, 22K, 18K, 999, 925")
):
    import asyncio
    return await asyncio.to_thread(get_metal_price_quote, metal, purity)

@router.put("/holdings/{holding_id}", response_model=Dict[str, Any])
async def update_holding(
    holding_id: str,
    req: HoldingUpdate,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await portfolio_service.update_holding(db=db, user_id=current_user.id, holding_id=holding_id, req=req)

@router.delete("/holdings/{holding_id}", response_model=Dict[str, Any])
async def delete_holding(
    holding_id: str,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await portfolio_service.delete_holding(db=db, user_id=current_user.id, holding_id=holding_id)

@router.get("/performance")
async def get_portfolio_performance(
    range_filter: str = Query("1M", description="1D, 1W, 1M, 3M, 6M, 1Y, ALL"),
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await portfolio_service.get_performance(db=db, user_id=current_user.id, range_filter=range_filter)

@router.get("/transactions")
async def get_transactions(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await portfolio_service.get_transactions(db=db, user_id=current_user.id)
