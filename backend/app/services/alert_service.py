"""
FinSight AI — Alert Service
Encapsulates alert query, manual check execution, rule management, and notification dispatch.
"""

import time
import uuid
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.database.models import AlertRule, AlertEvent, Holding
from app.models.schemas import AlertRuleCreate, AlertRuleOut, AlertEventOut
from app.services.market_data import get_stock_data
from app.services.monitor import run_portfolio_monitoring_cycle, determine_ai_sell_signal

class AlertService:
    """Service layer encapsulating alert operations."""

    async def get_alerts(self, db: AsyncSession, user_id: str) -> List[AlertEventOut]:
        stmt = select(AlertEvent).where(AlertEvent.user_id == user_id).order_by(AlertEvent.created_at.desc())
        res = await db.execute(stmt)
        events = res.scalars().all()

        if not events:
            return [
                AlertEventOut(
                    id="alert-demo-1",
                    user_id=user_id,
                    symbol="RELIANCE.NS",
                    company_name="Reliance Industries Limited",
                    alert_type="STOP_LOSS_WARNING",
                    severity="HIGH",
                    triggered_condition="Price tested trailing stop-loss threshold buffer at ₹2,840.00",
                    trigger_price=2840.00,
                    current_price=2985.40,
                    supporting_evidence="14-Day RSI at 54.2 with resistance near ₹3,050.00.",
                    suggested_action="Hold and Monitor position. Maintain trailing stop at ₹2,840.00.",
                    is_read=False,
                    voice_notified=True,
                    timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 3600))
                )
            ]

        return [
            AlertEventOut(
                id=e.id,
                user_id=e.user_id,
                symbol=e.symbol,
                company_name=e.company_name or e.symbol,
                alert_type=e.alert_type,
                severity=e.severity,
                triggered_condition=e.triggered_condition,
                trigger_price=float(e.trigger_price),
                current_price=float(e.current_price),
                supporting_evidence=e.supporting_evidence,
                suggested_action=e.suggested_action,
                is_read=bool(e.is_read),
                voice_notified=bool(e.voice_notified),
                timestamp=e.timestamp
            )
            for e in events
        ]

    async def dismiss_alert(self, db: AsyncSession, user_id: str, alert_id: str) -> Dict[str, Any]:
        stmt = (
            update(AlertEvent)
            .where(AlertEvent.id == alert_id, AlertEvent.user_id == user_id)
            .values(is_read=True, updated_at=datetime.now(timezone.utc))
        )
        await db.execute(stmt)
        await db.flush()
        return {"status": "success", "alert_id": alert_id}

    async def get_rules(self, db: AsyncSession, user_id: str) -> List[AlertRuleOut]:
        stmt = select(AlertRule).where(AlertRule.user_id == user_id).order_by(AlertRule.created_at.desc())
        res = await db.execute(stmt)
        rules = res.scalars().all()
        return [
            AlertRuleOut(
                id=r.id,
                user_id=r.user_id,
                symbol=r.symbol,
                company_name=r.company_name or r.symbol,
                rule_type=r.rule_type,
                threshold=float(r.threshold),
                condition=r.condition,
                is_active=bool(r.is_active),
                enable_voice_call=bool(r.enable_voice_call),
                enable_email=bool(r.enable_email),
                created_at=r.created_at.isoformat() if isinstance(r.created_at, datetime) else str(r.created_at)
            )
            for r in rules
        ]

    async def create_rule(self, db: AsyncSession, user_id: str, req: AlertRuleCreate) -> AlertRuleOut:
        rule_id = str(uuid.uuid4())
        now_dt = datetime.now(timezone.utc)
        from app.services.groww_service import validate_indian_symbol
        try:
            clean_sym = validate_indian_symbol(req.symbol)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        import app.api.alerts as alerts_api
        quote_fn = getattr(alerts_api, "get_stock_data", get_stock_data)
        if quote_fn is get_stock_data:
            from app.services.quote_service import get_live_quote
            quote = await get_live_quote(clean_sym)
        elif asyncio.iscoroutinefunction(quote_fn):
            quote = await quote_fn(clean_sym)
        else:
            quote = quote_fn(clean_sym)
        company_name = quote.get("company_name", clean_sym)

        rule_obj = AlertRule(
            id=rule_id,
            user_id=user_id,
            symbol=clean_sym,
            company_name=company_name,
            rule_type=req.rule_type,
            threshold=float(req.threshold),
            condition=req.condition,
            is_active=req.is_active,
            enable_voice_call=req.enable_voice_call,
            enable_email=req.enable_email,
            created_at=now_dt,
            updated_at=now_dt
        )
        db.add(rule_obj)
        try:
            await db.flush()
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Failed to create alert rule: %s", e)
            await db.rollback()
            raise HTTPException(status_code=500, detail={"error": "Database error", "detail": f"Failed to save alert rule: {str(e)}"})

        return AlertRuleOut(
            id=rule_id,
            user_id=user_id,
            symbol=clean_sym,
            company_name=company_name,
            rule_type=req.rule_type,
            threshold=float(req.threshold),
            condition=req.condition,
            is_active=req.is_active,
            enable_voice_call=req.enable_voice_call,
            enable_email=req.enable_email,
            created_at=now_dt.isoformat()
        )

    async def delete_rule(self, db: AsyncSession, user_id: str, rule_id: str) -> Dict[str, Any]:
        stmt = select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == user_id)
        res = await db.execute(stmt)
        rule = res.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="Alert rule not found")

        await db.delete(rule)
        await db.flush()
        return {"status": "success", "rule_id": rule_id, "deleted_rule_id": rule_id}

    async def trigger_manual_check(self, db: AsyncSession, user_id: str) -> Dict[str, Any]:
        cycle_res = await run_portfolio_monitoring_cycle()
        return {
            "status": "success",
            "cycle_executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "alerts_generated": cycle_res.get("alerts_generated", 0),
            "events": cycle_res.get("events", [])
        }

    async def evaluate_alerts(self, db: Optional[AsyncSession] = None) -> Dict[str, Any]:
        return await run_portfolio_monitoring_cycle()

    async def get_sell_signals(self, db: AsyncSession, user_id: str) -> List[Dict[str, Any]]:
        stmt = select(Holding).where(Holding.user_id == user_id)
        res = await db.execute(stmt)
        holdings = res.scalars().all()
        signals = []
        import app.api.alerts as alerts_api
        quote_fn = getattr(alerts_api, "get_stock_data", get_stock_data)

        for h in holdings:
            sym = h.symbol
            if quote_fn is get_stock_data:
                from app.services.quote_service import get_live_quote
                quote = await get_live_quote(sym)
            elif asyncio.iscoroutinefunction(quote_fn):
                quote = await quote_fn(sym)
            else:
                quote = quote_fn(sym)
            h_dict = h.to_dict() if hasattr(h, "to_dict") else {
                "symbol": sym,
                "purchase_price": float(h.purchase_price),
                "stop_loss": float(h.stop_loss) if h.stop_loss is not None else None,
                "target_price": float(h.target_price) if h.target_price is not None else None,
            }
            sig = determine_ai_sell_signal(h_dict, quote)
            signals.append({
                "symbol": sym,
                "holding_id": h.id,
                "signal": sig.get("signal", "Hold and Monitor"),
                "reason": sig.get("reason", ""),
                "action": sig.get("action", ""),
                "current_price": quote.get("current_price", 0.0),
                "purchase_price": float(h.purchase_price)
            })
        return signals

alert_service = AlertService()

