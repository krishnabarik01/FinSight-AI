"""
FinSight AI — Persistent Watchlist API
Enables users to track Indian equities, ETFs, and metals with target prices,
stop-loss levels, and real-time Groww quote hydration stored in the database.
"""

import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Union
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UserOut, WatchlistAdd, WatchlistBatchAdd, WatchlistBatchDelete, WatchlistUpdate, WatchlistItem
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.database.models import WatchlistItemModel
from app.services.quote_service import get_live_quote, get_batch_quotes, normalize_symbol

logger = logging.getLogger("finsight.watchlist")

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

@router.get("", response_model=List[WatchlistItem])
async def get_watchlist(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Retrieves all watchlist items for the authenticated user hydrated with real-time market data."""
    try:
        stmt = (
            select(WatchlistItemModel)
            .where(WatchlistItemModel.user_id == current_user.id)
            .order_by(WatchlistItemModel.created_at.desc())
        )
        res = await db.execute(stmt)
        raw_items = res.scalars().all()
        items = list(raw_items)

        # If new user has an empty watchlist, pre-seed with essential Indian starter instruments
        if not items:
            seed_symbols = [
                ("SBIN", "State Bank of India", "Large Cap Banking"),
                ("RELIANCE", "Reliance Industries Limited", "Large Cap Conglomerate"),
                ("NIFTYBEES", "Nippon India ETF Nifty BeES", "Index ETF"),
                ("GOLDBEES", "Nippon India ETF Gold BeES", "Commodity ETF")
            ]
            now_dt = datetime.now(timezone.utc)
            created_items = []
            for sym, name, cat in seed_symbols:
                w = WatchlistItemModel(
                    id=str(uuid.uuid4()),
                    user_id=current_user.id,
                    symbol=sym,
                    company_name=name,
                    category=cat,
                    target_price=None,
                    stop_loss=None,
                    created_at=now_dt,
                    updated_at=now_dt
                )
                db.add(w)
                created_items.append(w)
            try:
                await db.flush()
                items = created_items
            except Exception as seed_err:
                logger.warning("Failed to pre-seed default watchlist items: %s. Rolling back.", seed_err)
                await db.rollback()
                stmt = (
                    select(WatchlistItemModel)
                    .where(WatchlistItemModel.user_id == current_user.id)
                    .order_by(WatchlistItemModel.created_at.desc())
                )
                res = await db.execute(stmt)
                items = list(res.scalars().all())

        # Hydrate with quotes concurrently using batch quotes
        unique_syms = list({item.symbol for item in items if item.symbol})
        quotes_list: List[Dict[str, Any]] = []
        if unique_syms:
            try:
                quotes_list = await asyncio.wait_for(get_batch_quotes(unique_syms), timeout=15.0)
            except Exception as q_err:
                logger.warning("Batch quote hydration failed in get_watchlist: %s", q_err)
                quotes_list = []

        quotes_map: Dict[str, Dict[str, Any]] = {}
        for q in quotes_list:
            if not isinstance(q, dict):
                continue
            clean = q.get("clean_symbol") or q.get("ticker") or q.get("symbol", "").replace(".NS", "").replace(".BO", "")
            if clean:
                quotes_map[clean.upper()] = q
            sym = q.get("symbol")
            if sym:
                quotes_map[sym.upper()] = q

        output = []
        for item in items:
            sym_key = (item.symbol or "").upper().strip()
            try:
                norm_key = normalize_symbol(sym_key)
            except Exception:
                norm_key = sym_key

            quote = (
                quotes_map.get(sym_key)
                or quotes_map.get(norm_key)
                or quotes_map.get(f"{norm_key}.NS")
                or quotes_map.get(f"{sym_key}.NS")
                or {}
            )

            curr_price = float(quote.get("price") or quote.get("current_price") or 0.0)
            change_pct = float(quote.get("change_percent") or quote.get("change_pct") or 0.0)
            change_val = float(quote.get("change") or 0.0)
            vol = int(quote.get("volume") or 1000000)
            indicators = quote.get("indicators", {})
            rsi = float(indicators.get("rsi_14", 50.0))
            volatility = float(indicators.get("volatility_annual", 22.0))
            source = quote.get("source") or quote.get("data_source") or "yfinance (fallback)"
            last_updated = quote.get("timestamp") or quote.get("last_updated") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            data_status = quote.get("data_status") or ("live" if curr_price > 0 else "unavailable")
            is_stale = bool(quote.get("is_stale", False) or curr_price == 0.0)

            risk_level = "High Risk" if volatility > 35 else ("Low Risk" if volatility < 22 else "Moderate Risk")

            output.append(WatchlistItem(
                id=item.id,
                user_id=item.user_id,
                symbol=item.symbol,
                company_name=item.company_name or quote.get("company_name", item.symbol),
                category=item.category,
                price=round(curr_price, 2),
                change=round(change_val, 2),
                change_pct=round(change_pct, 2),
                volume=vol,
                risk_level=risk_level,
                rsi=round(rsi, 1),
                target_price=float(item.target_price) if item.target_price is not None else None,
                stop_loss=float(item.stop_loss) if item.stop_loss is not None else None,
                notes=item.notes,
                added_at=item.created_at.strftime("%Y-%m-%d %H:%M") if hasattr(item.created_at, "strftime") else str(item.created_at)[:16],
                source=source,
                data_source=source,
                timestamp=last_updated,
                last_updated=last_updated,
                data_status=data_status,
                is_stale=is_stale
            ))

        return output
    except Exception as e:
        logger.exception("Error in get_watchlist: %s", e)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to fetch watchlist", "detail": str(e)}
        )

@router.post("", response_model=WatchlistItem)
async def add_to_watchlist(
    payload: WatchlistAdd,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    try:
        clean_sym = normalize_symbol(payload.symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check duplicate
    stmt = select(WatchlistItemModel).where(
        WatchlistItemModel.user_id == current_user.id,
        WatchlistItemModel.symbol == clean_sym
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"{clean_sym} is already in your watchlist")

    quote = await get_live_quote(clean_sym)
    comp_name = quote.get("name") or quote.get("company_name") or clean_sym
    category = quote.get("category", "Equities")

    now_dt = datetime.now(timezone.utc)
    new_item = WatchlistItemModel(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        symbol=clean_sym,
        company_name=comp_name,
        category=category,
        target_price=payload.target_price,
        stop_loss=payload.stop_loss,
        notes=payload.notes,
        created_at=now_dt,
        updated_at=now_dt
    )
    db.add(new_item)
    try:
        await db.flush()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to add to watchlist: %s", e)
        await db.rollback()
        raise HTTPException(status_code=500, detail={"error": "Database error", "detail": f"Failed to add to watchlist: {str(e)}"})

    curr_price = float(quote.get("price") or quote.get("current_price") or 0.0)
    change_pct = float(quote.get("change_percent") or quote.get("change_pct") or 0.0)
    change_val = float(quote.get("change") or 0.0)
    vol = int(quote.get("volume") or 1000000)
    indicators = quote.get("indicators", {})
    rsi = float(indicators.get("rsi_14", 50.0))
    volatility = float(indicators.get("volatility_annual", 22.0))
    risk_level = "High Risk" if volatility > 35 else ("Low Risk" if volatility < 22 else "Moderate Risk")
    source = quote.get("source") or quote.get("data_source") or "yfinance (fallback)"
    last_updated = quote.get("timestamp") or quote.get("last_updated") or now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    return WatchlistItem(
        id=new_item.id,
        user_id=new_item.user_id,
        symbol=new_item.symbol,
        company_name=comp_name,
        category=category,
        price=round(curr_price, 2),
        change=round(change_val, 2),
        change_pct=round(change_pct, 2),
        volume=vol,
        risk_level=risk_level,
        rsi=round(rsi, 1),
        target_price=payload.target_price,
        stop_loss=payload.stop_loss,
        notes=payload.notes,
        added_at=new_item.created_at.strftime("%Y-%m-%d %H:%M"),
        source=source,
        data_source=source,
        timestamp=last_updated,
        last_updated=last_updated,
        data_status=quote.get("data_status", "live"),
        is_stale=bool(quote.get("is_stale", False))
    )

@router.put("/{item_id}")
async def update_watchlist_item(
    item_id: str,
    payload: WatchlistUpdate,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Updates target-price or stop-loss on a watchlist item."""
    stmt = (
        update(WatchlistItemModel)
        .where(WatchlistItemModel.id == item_id, WatchlistItemModel.user_id == current_user.id)
        .values(
            target_price=payload.target_price,
            stop_loss=payload.stop_loss,
            notes=payload.notes,
            updated_at=datetime.now(timezone.utc)
        )
    )
    res = await db.execute(stmt)
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    await db.flush()
    return {"status": "success", "id": item_id}

@router.post("/batch", response_model=List[WatchlistItem])
async def add_to_watchlist_batch(
    payload: Union[WatchlistBatchAdd, List[WatchlistAdd]],
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Adds multiple instruments to the watchlist in a single database transaction."""
    items = payload.items if isinstance(payload, WatchlistBatchAdd) else payload
    if not items:
        raise HTTPException(status_code=400, detail={"error": "Validation Error", "detail": "Watchlist items list cannot be empty"})

    valid_items = []
    seen_in_batch = set()
    for idx, it in enumerate(items):
        if not it.symbol or not str(it.symbol).strip():
            continue
        try:
            norm_sym = normalize_symbol(it.symbol)
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail={"error": "Validation Error", "detail": f"Row {idx + 1} ({it.symbol}): {str(e)}", "row_index": idx}
            )

        if norm_sym in seen_in_batch:
            continue
        seen_in_batch.add(norm_sym)
        valid_items.append((norm_sym, it))

    if not valid_items:
        raise HTTPException(status_code=400, detail={"error": "Validation Error", "detail": "No valid symbols provided"})

    # Check for existing items for user
    existing_stmt = select(WatchlistItemModel.symbol).where(
        WatchlistItemModel.user_id == current_user.id,
        WatchlistItemModel.symbol.in_([s for s, _ in valid_items])
    )
    existing_res = await db.execute(existing_stmt)
    existing_symbols = set(existing_res.scalars().all())

    # Add items that are not already present
    new_to_add = [(s, it) for s, it in valid_items if s not in existing_symbols]

    now_dt = datetime.now(timezone.utc)
    new_models = []
    for clean_sym, it in new_to_add:
        m = WatchlistItemModel(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            symbol=clean_sym,
            company_name=clean_sym,
            category="Equities",
            target_price=it.target_price,
            stop_loss=it.stop_loss,
            notes=it.notes,
            created_at=now_dt,
            updated_at=now_dt
        )
        db.add(m)
        new_models.append(m)

    await db.flush()

    symbols_to_quote = [m.symbol for m in new_models]
    quotes_list = []
    if symbols_to_quote:
        try:
            quotes_list = await asyncio.wait_for(get_batch_quotes(symbols_to_quote), timeout=15.0)
        except Exception:
            quotes_list = []

    quotes_map = {}
    for q in quotes_list:
        if isinstance(q, dict):
            if q.get("clean_symbol"):
                quotes_map[q["clean_symbol"].upper()] = q
            if q.get("symbol"):
                quotes_map[q["symbol"].upper()] = q

    output = []
    for m in new_models:
        sym_key = m.symbol.upper()
        clean_key = sym_key.replace(".NS", "").replace(".BO", "")
        quote = quotes_map.get(sym_key) or quotes_map.get(clean_key) or {}

        curr_price = float(quote.get("price") or quote.get("current_price") or 0.0)
        change_pct = float(quote.get("change_percent") or quote.get("change_pct") or 0.0)
        change_val = float(quote.get("change") or 0.0)
        vol = int(quote.get("volume") or 1000000)
        indicators = quote.get("indicators", {})
        rsi = float(indicators.get("rsi_14", 50.0))
        volatility = float(indicators.get("volatility_annual", 22.0))
        risk_level = "High Risk" if volatility > 35 else ("Low Risk" if volatility < 22 else "Moderate Risk")
        source = quote.get("source") or quote.get("data_source") or "Groww (primary)"
        last_updated = quote.get("timestamp") or quote.get("last_updated") or now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        output.append(WatchlistItem(
            id=m.id,
            user_id=m.user_id,
            symbol=m.symbol,
            company_name=quote.get("name") or quote.get("company_name") or m.company_name or m.symbol,
            category=quote.get("category", m.category or "Equities"),
            price=round(curr_price, 2),
            change=round(change_val, 2),
            change_pct=round(change_pct, 2),
            volume=vol,
            risk_level=risk_level,
            rsi=round(rsi, 1),
            target_price=m.target_price,
            stop_loss=m.stop_loss,
            notes=m.notes,
            added_at=m.created_at.strftime("%Y-%m-%d %H:%M"),
            source=source,
            data_source=source,
            timestamp=last_updated,
            last_updated=last_updated,
            data_status=quote.get("data_status", "live" if curr_price > 0 else "unavailable"),
            is_stale=bool(quote.get("is_stale", False) or curr_price == 0.0)
        ))

    return output

@router.delete("/batch", response_model=Dict[str, Any])
@router.post("/batch-delete", response_model=Dict[str, Any])
async def remove_watchlist_batch(
    payload: Union[WatchlistBatchDelete, List[str]],
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Deletes multiple watchlist items by ID or symbol."""
    ids = payload.ids if isinstance(payload, WatchlistBatchDelete) else payload
    if not ids:
        return {"status": "success", "deleted_count": 0}

    stmt = delete(WatchlistItemModel).where(
        WatchlistItemModel.user_id == current_user.id,
        (WatchlistItemModel.id.in_(ids)) | (WatchlistItemModel.symbol.in_([str(i).upper().strip() for i in ids]))
    )
    res = await db.execute(stmt)
    await db.flush()
    return {"status": "success", "deleted_count": res.rowcount}

@router.delete("/{item_id}")
async def remove_from_watchlist(
    item_id: str,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Removes an item from the user's watchlist by ID or by symbol."""
    stmt = delete(WatchlistItemModel).where(
        WatchlistItemModel.user_id == current_user.id,
        (WatchlistItemModel.id == item_id) | (WatchlistItemModel.symbol == item_id.upper().strip())
    )
    res = await db.execute(stmt)
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    await db.flush()
    return {"status": "success", "removed": item_id}
