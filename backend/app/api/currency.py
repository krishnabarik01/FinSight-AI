import asyncio
from fastapi import APIRouter
from app.services.currency import get_usdinr_exchange_rate

router = APIRouter(prefix="/api/currency", tags=["currency"])

@router.get("/rates")
async def get_currency_rates():
    """
    Returns the latest USD/INR exchange rate, provider source, and timestamp.
    Used by frontend components to accurately convert or display currency equivalencies.
    """
    rate_info = await asyncio.to_thread(get_usdinr_exchange_rate)
    return rate_info
