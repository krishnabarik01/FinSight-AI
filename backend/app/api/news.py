from fastapi import APIRouter, Query
from typing import List, Optional, Dict, Any
from app.services.news_service import get_market_news

router = APIRouter(prefix="/api/news", tags=["news"])

@router.get("")
async def get_news(
    symbol: Optional[str] = Query(None, description="Optional ticker filter"),
    category: Optional[str] = Query(None, description="Market, Industry, Company")
):
    news_items = get_market_news(symbol=symbol, category=category)
    return news_items
