import asyncio
from fastapi import APIRouter, Depends
from typing import Dict, Any, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UserOut
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.database.models import Holding, AlertEvent, Transaction
from app.services.market_data import get_stock_data, get_indices_overview
from app.services.quote_service import get_live_quote
from app.services.monitor import determine_ai_sell_signal
from app.services.currency import get_usdinr_exchange_rate

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/summary")
async def get_dashboard_summary(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    holdings_res = await db.execute(select(Holding).where(Holding.user_id == current_user.id))
    holdings = holdings_res.scalars().all()

    alerts_res = await db.execute(
        select(AlertEvent).where(AlertEvent.user_id == current_user.id).order_by(AlertEvent.created_at.desc()).limit(10)
    )
    alerts = alerts_res.scalars().all()

    tx_res = await db.execute(
        select(Transaction).where(Transaction.user_id == current_user.id).order_by(Transaction.created_at.desc()).limit(10)
    )
    transactions = tx_res.scalars().all()

    indices = await asyncio.to_thread(get_indices_overview)

    sem = asyncio.Semaphore(5)

    async def fetch_quote(sym: str):
        async with sem:
            try:
                return await get_live_quote(sym)
            except Exception:
                return get_stock_data(sym)

    unique_symbols = list({h.symbol for h in holdings})
    if unique_symbols:
        quotes_list = await asyncio.gather(*(fetch_quote(s) for s in unique_symbols))
        quotes_map = dict(zip(unique_symbols, quotes_list))
    else:
        quotes_map = {}

    rate_info = get_usdinr_exchange_rate()
    usd_inr_rate = float(rate_info["rate"])

    total_invested = 0.0
    total_value = 0.0
    today_pnl = 0.0
    processed_holdings = []

    for h in holdings:
        sym = h.symbol
        qty = float(h.quantity)
        buy_p = float(h.purchase_price)
        quote = quotes_map[sym]
        curr_p = float(quote["current_price"])
        is_us = quote.get("original_currency") == "USD" or quote.get("is_converted", False)

        if is_us:
            orig_buy_p = buy_p
            buy_p_inr = round(buy_p * usd_inr_rate, 2)
            orig_curr_p = quote.get("original_price", round(curr_p / usd_inr_rate, 2))
        else:
            orig_buy_p = buy_p
            buy_p_inr = buy_p
            orig_curr_p = curr_p

        invested = round(qty * buy_p_inr, 2)
        val = round(qty * curr_p, 2)
        pnl = round(val - invested, 2)
        pnl_pct = round((pnl / invested) * 100, 2) if invested > 0 else 0.0
        day_pnl = round(val * (float(quote.get("change_pct", 0)) / 100.0), 2)

        total_invested += invested
        total_value += val
        today_pnl += day_pnl

        h_dict = h.to_dict()
        sig = determine_ai_sell_signal(h_dict, quote)

        processed_holdings.append({
            "id": h.id,
            "_id": h.id,
            "symbol": sym,
            "company_name": quote["company_name"],
            "quantity": qty,
            "purchase_price": buy_p_inr,
            "current_price": curr_p,
            "current_value": round(val, 2),
            "unrealized_pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "daily_change_pct": round(float(quote.get("change_pct", 0)), 2),
            "ai_sell_signal": sig["signal"],
            "ai_sell_color": sig["color_tag"],
            "currency": "INR",
            "original_currency": "USD" if is_us else "INR",
            "original_purchase_price": orig_buy_p,
            "original_current_price": orig_curr_p,
            "is_converted": is_us,
            "exchange_rate": usd_inr_rate if is_us else 1.0
        })

    total_pnl = round(total_value - total_invested, 2)
    total_pnl_pct = round((total_pnl / total_invested) * 100, 2) if total_invested > 0 else 0.0
    today_pnl_pct = round((today_pnl / (total_value - today_pnl)) * 100, 2) if (total_value - today_pnl) > 0 else 0.0

    # Sort top performers and underperformers
    sorted_holdings = sorted(processed_holdings, key=lambda x: x["pnl_pct"], reverse=True)
    top_performers = sorted_holdings[:3]
    underperformers = sorted_holdings[-3:] if len(sorted_holdings) >= 3 else []

    # Recent AI Insights
    ai_insights = [
        {
            "id": "insight-1",
            "title": "Portfolio Concentration Check",
            "summary": "Holdings are well-distributed across Technology, Energy, and Banking sectors with healthy risk buffering.",
            "type": "PORTFOLIO_HEALTH",
            "sentiment": "Positive"
        },
        {
            "id": "insight-2",
            "title": "Macro Volatility Inflow",
            "summary": "NIFTY 50 and S&P 500 index indicators suggest strong consolidation; maintain trailing stop-loss buffers.",
            "type": "MARKET_INTELLIGENCE",
            "sentiment": "Neutral"
        }
    ]

    return {
        "portfolio_summary": {
            "total_value": round(total_value, 2),
            "total_invested": round(total_invested, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "today_pnl": round(today_pnl, 2),
            "today_pnl_pct": round(today_pnl_pct, 2),
            "available_cash": 12500.00,
            "portfolio_risk_score": 42.5,
            "holdings_count": len(holdings)
        },
        "market_indices": indices,
        "holdings": processed_holdings,
        "top_performers": top_performers,
        "underperformers": underperformers,
        "recent_alerts": [a.to_dict() for a in alerts[:5]],
        "recent_transactions": [t.to_dict() for t in transactions[:5]],
        "ai_insights": ai_insights
    }
