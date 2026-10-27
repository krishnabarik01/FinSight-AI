"""
FinSight AI — Alerts API Router (Thin Router)
Validates input and delegates alert query, dismissal, rule management, and manual monitoring to alert_service.
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UserOut, AlertRuleCreate, AlertRuleOut, AlertEventOut
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.services.alert_service import alert_service
from app.services.market_data import get_stock_data

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

@router.get("", response_model=List[AlertEventOut])
async def get_alerts(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.get_alerts(db=db, user_id=current_user.id)

@router.post("/{alert_id}/dismiss")
async def dismiss_alert(
    alert_id: str,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.dismiss_alert(db=db, user_id=current_user.id, alert_id=alert_id)

@router.get("/rules", response_model=List[AlertRuleOut])
async def get_alert_rules(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.get_rules(db=db, user_id=current_user.id)

@router.post("/rules", response_model=AlertRuleOut)
async def create_alert_rule(
    req: AlertRuleCreate,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.create_rule(db=db, user_id=current_user.id, req=req)

@router.delete("/rules/{rule_id}")
async def delete_alert_rule(
    rule_id: str,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.delete_rule(db=db, user_id=current_user.id, rule_id=rule_id)

@router.post("/check-now")
async def trigger_manual_check(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.trigger_manual_check(db=db, user_id=current_user.id)

@router.post("/evaluate")
async def evaluate_alerts(
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.evaluate_alerts(db=db)

@router.get("/sell-signals")
async def get_sell_signals(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    return await alert_service.get_sell_signals(db=db, user_id=current_user.id)

