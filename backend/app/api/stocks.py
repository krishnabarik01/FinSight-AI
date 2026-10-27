import asyncio
from fastapi import APIRouter, Query, HTTPException
from typing import List, Dict, Any, Optional
from app.services.providers.stocks_provider import stocks_provider, validate_indian_symbol
from app.services.groww_service import groww_service
from app.ai.risk_engine import evaluate_three_level_risk
from app.ai.predictor import generate_stock_predictions

router = APIRouter(prefix="/api/stocks", tags=["stocks"])

@router.get("/search")
async def search(q: str = Query("", description="Symbol or company name")):
    return await stocks_provider.search_stocks(q)

@router.get("/indices")
async def get_indices():
    return await stocks_provider.get_indices()

@router.get("/groww/status")
async def get_groww_status():
    return groww_service.get_integration_overview()

@router.get("/{symbol}")
async def get_stock_detail(symbol: str, force_refresh: bool = False):
    try:
        valid_sym = validate_indian_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await stocks_provider.get_stock_quote(valid_sym, force_refresh=force_refresh)
    if not data or data.get("data_status") == "unavailable" and data.get("current_price", 0) <= 0:
        # Check if basic info exists
        if not data:
            raise HTTPException(status_code=404, detail=f"Stock data for {symbol} not found")
    return data

@router.get("/{symbol}/history")
async def get_history(
    symbol: str,
    period: str = Query("1mo", description="1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max"),
    interval: str = Query("1d", description="1m, 5m, 1h, 1d, 1wk")
):
    try:
        valid_sym = validate_indian_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    history = await stocks_provider.get_stock_history(valid_sym, period=period, interval=interval)
    return history

@router.get("/{symbol}/risk-analysis")
async def get_risk_analysis(symbol: str):
    try:
        valid_sym = validate_indian_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    analysis = await asyncio.to_thread(evaluate_three_level_risk, valid_sym)
    return analysis

@router.get("/{symbol}/predictions")
async def get_predictions(symbol: str):
    try:
        valid_sym = validate_indian_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    predictions = await asyncio.to_thread(generate_stock_predictions, valid_sym)
    return predictions
