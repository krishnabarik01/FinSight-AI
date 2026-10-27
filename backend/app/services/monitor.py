import time
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_background_session
from app.database.models import Holding, AlertRule, AlertEvent, UserSettings, VoiceLog
from app.services.market_data import get_stock_data
from app.notifications.voice_provider import voice_provider

logger = logging.getLogger("finsight.monitor")

# In-memory cooldown tracking: f"{user_id}_{symbol}_{rule_type}" -> timestamp
_ALERT_COOLDOWNS: Dict[str, float] = {}
_INITIAL_RESTORE_DONE = False

ALERT_TYPE_TO_RULE_TYPE = {
    "STOP_LOSS_BREACH": "STOP_LOSS",
    "TARGET_PROFIT_REACHED": "TARGET_PRICE",
    "VOLATILITY_SPIKE": "VOLATILITY_SPIKE",
    "TECHNICAL_OVERBOUGHT": "RSI_OVERBOUGHT"
}

async def _run_portfolio_monitoring_cycle_internal() -> Dict[str, Any]:
    """
    Internal portfolio monitoring cycle with decoupled DB session & network calls:
    Order:
      1. Read holdings, settings, and restore cooldowns from DB (once at startup/restart), then close session.
      2. Fetch real market quotes outside of any DB session.
      3. Evaluate alert conditions in-memory and open a second short DB session only to persist alerts.
    """
    global _INITIAL_RESTORE_DONE
    now_ts = time.time()
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # =========================================================================
    # Step 1: Read holdings, user settings, and restore cooldowns from DB
    # =========================================================================
    async with get_background_session() as read_session:
        holdings_res = await read_session.execute(select(Holding))
        raw_holdings = holdings_res.scalars().all()

        if not raw_holdings:
            return {"processed": 0, "alerts_generated": 0}

        # Snapshot holding attributes before session is closed
        holdings_snapshot = []
        user_ids = set()
        for h in raw_holdings:
            user_ids.add(h.user_id)
            holdings_snapshot.append({
                "id": h.id,
                "user_id": h.user_id,
                "symbol": h.symbol,
                "quantity": float(h.quantity),
                "purchase_price": float(h.purchase_price),
                "stop_loss": float(h.stop_loss) if h.stop_loss is not None else None,
                "target_price": float(h.target_price) if h.target_price is not None else None,
            })

        # Load user settings for all relevant users
        settings_map: Dict[str, Dict[str, Any]] = {}
        if user_ids:
            us_res = await read_session.execute(
                select(UserSettings).where(UserSettings.user_id.in_(list(user_ids)))
            )
            for us in us_res.scalars().all():
                settings_map[us.user_id] = {
                    "cooldown_mins": us.cooldown_period_minutes if us.cooldown_period_minutes else 30,
                    "voice_enabled": bool(us.voice_calls_enabled),
                    "user_phone": us.phone_number,
                    "voice_consent": bool(us.voice_consent_given),
                }

        # Restore cooldowns once on startup/restart so duplicate alerts are never created across restarts
        if not _INITIAL_RESTORE_DONE:
            _INITIAL_RESTORE_DONE = True
            try:
                cutoff = now_dt - timedelta(hours=24)
                recent_alerts_res = await read_session.execute(
                    select(AlertEvent.user_id, AlertEvent.symbol, AlertEvent.alert_type, AlertEvent.created_at)
                    .where(AlertEvent.created_at >= cutoff)
                )
                for u_id, sym, a_type, cr_at in recent_alerts_res.all():
                    r_type = ALERT_TYPE_TO_RULE_TYPE.get(a_type, a_type)
                    key = f"{u_id}_{sym}_{r_type}"
                    cr_ts = cr_at.timestamp() if hasattr(cr_at, "timestamp") else now_ts
                    if key not in _ALERT_COOLDOWNS or cr_ts > _ALERT_COOLDOWNS[key]:
                        _ALERT_COOLDOWNS[key] = cr_ts
            except Exception as e:
                logger.warning("Could not restore alert cooldowns from DB: %s", e)

    # =========================================================================
    # Step 2: Fetch market quotes asynchronously (OUTSIDE any DB session)
    # =========================================================================
    import app.services.monitor as monitor_module
    quote_fn = getattr(monitor_module, "get_stock_data", get_stock_data)
    is_mocked = (quote_fn is not get_stock_data) or (getattr(quote_fn, "__module__", "") != "app.services.market_data")

    sem = asyncio.Semaphore(5)

    async def fetch_quote(sym_str: str):
        async with sem:
            try:
                if is_mocked:
                    if asyncio.iscoroutinefunction(quote_fn):
                        return await quote_fn(sym_str)
                    res = quote_fn(sym_str)
                    if asyncio.iscoroutine(res):
                        return await res
                    return res
                else:
                    from app.services.quote_service import get_live_quote
                    return await get_live_quote(sym_str)
            except Exception as e:
                logger.error(f"Error fetching quote for {sym_str} in monitor cycle: {e}")
                return None

    unique_symbols = list({h["symbol"] for h in holdings_snapshot})
    quotes_list = await asyncio.gather(*(fetch_quote(s) for s in unique_symbols))
    quotes_map = {s: q for s, q in zip(unique_symbols, quotes_list) if q is not None}

    # =========================================================================
    # Step 3: Evaluate alert rules and build alert docs
    # =========================================================================
    alerts_to_persist: List[AlertEvent] = []
    voice_logs_to_persist: List[VoiceLog] = []

    for h in holdings_snapshot:
        user_id = h["user_id"]
        symbol = h["symbol"]
        buy_price = h["purchase_price"]
        stop_loss = h["stop_loss"]
        target_price = h["target_price"]

        try:
            quote = quotes_map.get(symbol)
            if not quote:
                continue
            curr_price = float(quote.get("current_price") or quote.get("price") or 0.0)
            if curr_price <= 0:
                continue
            indicators = quote.get("indicators") or {}
            rsi = float(indicators.get("rsi_14", 50.0))
            volatility = float(indicators.get("volatility_annual", 25.0))

            user_cfg = settings_map.get(user_id, {
                "cooldown_mins": 30,
                "voice_enabled": False,
                "user_phone": None,
                "voice_consent": False
            })
            cooldown_mins = user_cfg["cooldown_mins"]
            voice_enabled = user_cfg["voice_enabled"]
            user_phone = user_cfg["user_phone"]
            voice_consent = user_cfg["voice_consent"]

            def is_cooled_down(r_type: str) -> bool:
                key = f"{user_id}_{symbol}_{r_type}"
                last_time = _ALERT_COOLDOWNS.get(key, 0)
                if (now_ts - last_time) < (cooldown_mins * 60):
                    return False
                return True

            def mark_triggered(r_type: str):
                key = f"{user_id}_{symbol}_{r_type}"
                _ALERT_COOLDOWNS[key] = now_ts

            is_us = quote.get("original_currency") == "USD" or quote.get("is_converted", False)
            rate = float(quote.get("exchange_rate", 1.0)) if is_us else 1.0
            buy_price_adj = (buy_price * rate) if (is_us and buy_price < 2000) else buy_price
            stop_loss_adj = (stop_loss * rate) if (stop_loss and is_us and stop_loss < 2000) else stop_loss
            target_price_adj = (target_price * rate) if (target_price and is_us and target_price < 2000) else target_price

            comp_name = quote.get("company_name") or quote.get("name") or symbol

            # 1. Check Stop-Loss
            pnl_pct = ((curr_price - buy_price_adj) / buy_price_adj) * 100 if buy_price_adj else 0
            sl_triggered = False
            if stop_loss_adj and curr_price <= stop_loss_adj:
                sl_triggered = True
            elif pnl_pct <= -7.0 and not stop_loss_adj:
                sl_triggered = True

            if sl_triggered and is_cooled_down("STOP_LOSS"):
                mark_triggered("STOP_LOSS")
                event_id = str(uuid.uuid4())
                alert_doc = AlertEvent(
                    id=event_id,
                    user_id=user_id,
                    symbol=symbol,
                    company_name=comp_name,
                    alert_type="STOP_LOSS_BREACH",
                    severity="CRITICAL",
                    triggered_condition=f"Price {curr_price:.2f} fell below stop-loss boundary (P&L: {pnl_pct:.2f}%)",
                    trigger_price=stop_loss_adj or (buy_price_adj * 0.93),
                    current_price=curr_price,
                    supporting_evidence=f"RSI reading at {rsi:.1f} indicates negative momentum with 14-day ATR at {indicators.get('atr_14', 0):.2f}.",
                    suggested_action="Review Sell to preserve capital; reassess position risk sizing.",
                    is_read=False,
                    voice_notified=False,
                    timestamp=now_iso,
                    created_at=now_dt,
                    updated_at=now_dt
                )

                # Voice call dispatch
                if voice_enabled and voice_consent and user_phone:
                    call_res = await voice_provider.dispatch_voice_call(
                        to_phone=user_phone,
                        company_name=comp_name,
                        symbol=symbol,
                        price=curr_price,
                        alert_reason=f"Stop-loss breached at {curr_price:.2f} ({pnl_pct:.1f}% loss)"
                    )
                    alert_doc.voice_notified = True
                    voice_logs_to_persist.append(VoiceLog(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        call_id=call_res.get("call_id"),
                        symbol=symbol,
                        status=call_res.get("status"),
                        to_phone=user_phone,
                        message=call_res.get("spoken_message"),
                        duration_seconds=int(call_res.get("duration_seconds", 30)),
                        timestamp=call_res.get("timestamp") or now_iso,
                        created_at=now_dt,
                        updated_at=now_dt
                    ))

                alerts_to_persist.append(alert_doc)

            # 2. Check Target Price
            tp_triggered = False
            if target_price_adj and curr_price >= target_price_adj:
                tp_triggered = True
            elif pnl_pct >= 20.0 and not target_price_adj:
                tp_triggered = True

            if tp_triggered and is_cooled_down("TARGET_PRICE"):
                mark_triggered("TARGET_PRICE")
                alert_doc = AlertEvent(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    symbol=symbol,
                    company_name=comp_name,
                    alert_type="TARGET_PROFIT_REACHED",
                    severity="HIGH",
                    triggered_condition=f"Price {curr_price:.2f} reached profit target (P&L: +{pnl_pct:.2f}%)",
                    trigger_price=target_price_adj or (buy_price_adj * 1.20),
                    current_price=curr_price,
                    supporting_evidence=f"Stock has appreciated +{pnl_pct:.2f}%. Resistance ceiling is at {quote.get('resistance_level', curr_price * 1.05):.2f}.",
                    suggested_action="Evaluate partial profit taking or tighten trailing stop-loss.",
                    is_read=False,
                    voice_notified=False,
                    timestamp=now_iso,
                    created_at=now_dt,
                    updated_at=now_dt
                )
                alerts_to_persist.append(alert_doc)

            # 3. Volatility Spike Warning
            if volatility > 38.0 and is_cooled_down("VOLATILITY_SPIKE"):
                mark_triggered("VOLATILITY_SPIKE")
                alert_doc = AlertEvent(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    symbol=symbol,
                    company_name=comp_name,
                    alert_type="VOLATILITY_SPIKE",
                    severity="MEDIUM",
                    triggered_condition=f"Annualized volatility escalated to {volatility:.1f}% (threshold 38%)",
                    trigger_price=38.0,
                    current_price=curr_price,
                    supporting_evidence=f"ATR expanded to {indicators.get('atr_14', 0):.2f}. Single-day swing: {quote.get('change_pct', 0):+.2f}%.",
                    suggested_action="Hold and monitor. Avoid adding to position during elevated turbulence.",
                    is_read=False,
                    voice_notified=False,
                    timestamp=now_iso,
                    created_at=now_dt,
                    updated_at=now_dt
                )
                alerts_to_persist.append(alert_doc)

            # 4. RSI Overbought Warning
            if rsi > 76.0 and is_cooled_down("RSI_OVERBOUGHT"):
                mark_triggered("RSI_OVERBOUGHT")
                alert_doc = AlertEvent(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    symbol=symbol,
                    company_name=comp_name,
                    alert_type="TECHNICAL_OVERBOUGHT",
                    severity="MEDIUM",
                    triggered_condition=f"14-Day RSI reached {rsi:.1f} (Overbought boundary: 75.0)",
                    trigger_price=75.0,
                    current_price=curr_price,
                    supporting_evidence=f"Technical momentum is overextended. Mean reversion risk elevated near {quote.get('resistance_level', curr_price * 1.05):.2f}.",
                    suggested_action="Review Sell or lock in partial gains.",
                    is_read=False,
                    voice_notified=False,
                    timestamp=now_iso,
                    created_at=now_dt,
                    updated_at=now_dt
                )
                alerts_to_persist.append(alert_doc)

        except Exception as e:
            logger.error(f"Error evaluating holding {symbol}: {e}")

    # =========================================================================
    # Step 4: Short dedicated write session to persist new alerts and voice logs
    # =========================================================================
    if alerts_to_persist or voice_logs_to_persist:
        async with get_background_session() as write_session:
            for alert_doc in alerts_to_persist:
                write_session.add(alert_doc)
            for v_log in voice_logs_to_persist:
                write_session.add(v_log)
            await write_session.commit()

    return {"processed": len(holdings_snapshot), "alerts_generated": len(alerts_to_persist)}


async def run_portfolio_monitoring_cycle() -> Dict[str, Any]:
    """
    Evaluates all active holdings and rules against real market metrics.
    Protected with a 30s cycle timeout so slow providers can never freeze the loop.
    """
    try:
        return await asyncio.wait_for(_run_portfolio_monitoring_cycle_internal(), timeout=30.0)
    except asyncio.TimeoutError:
        logger.warning("Portfolio monitoring cycle timed out after 30s. Aborting cycle cleanly.")
        return {"processed": 0, "alerts_generated": 0, "timed_out": True}
    except Exception as e:
        logger.error("Unexpected error in portfolio monitoring cycle: %s", e)
        return {"processed": 0, "alerts_generated": 0, "error": str(e)}


def determine_ai_sell_signal(holding: Dict[str, Any], quote: Dict[str, Any]) -> Dict[str, Any]:
    """Generates an explainable AI Sell Signal for a holding."""
    curr_price = float(quote.get("current_price") or quote.get("price") or 0.0)
    buy_price = float(holding.get("purchase_price", curr_price))
    is_us = quote.get("original_currency") == "USD" or quote.get("is_converted", False)
    if is_us and buy_price < 2000 and curr_price > 5000:
        buy_price = buy_price * float(quote.get("exchange_rate", 1.0))
    pnl_pct = ((curr_price - buy_price) / buy_price) * 100 if buy_price else 0.0
    indicators = quote.get("indicators") or {}
    rsi = float(indicators.get("rsi_14", 50.0))
    volatility = float(indicators.get("volatility_annual", 25.0))
    support = float(quote.get("support_level") or (curr_price * 0.95 if curr_price > 0 else 0.0))

    if curr_price < support or pnl_pct < -8.0 or (rsi < 35 and volatility > 35):
        signal = "Review Sell"
        confidence = 82.0
        rationale = f"Holding breached primary support floor or has sustained -{abs(pnl_pct):.1f}% drawdown with deteriorating momentum."
        color = "red"
    elif pnl_pct > 25.0 and rsi > 72.0:
        signal = "Take Profit"
        confidence = 78.0
        rationale = f"Position shows +{pnl_pct:.1f}% gains with RSI overextended at {rsi:.1f}. Favorable window to secure partial profits."
        color = "amber"
    elif volatility > 32.0 or (rsi > 65 and pnl_pct < 0):
        signal = "Hold and Monitor"
        confidence = 65.0
        rationale = f"Market volatility is elevated ({volatility:.1f}%). Retain position with active stop-loss monitoring."
        color = "blue"
    else:
        signal = "No Immediate Signal"
        confidence = 58.0
        rationale = "Holding metrics and momentum are within normal operating variance."
        color = "emerald"

    return {
        "signal": signal,
        "confidence_pct": confidence,
        "rationale": rationale,
        "color_tag": color,
        "pnl_pct": round(pnl_pct, 2)
    }
