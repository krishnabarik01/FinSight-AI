import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.currency import (
    get_usdinr_exchange_rate,
    convert_usd_to_inr,
    normalize_quote_to_inr,
    DEFAULT_FALLBACK_USDINR_RATE
)

def test_get_usdinr_exchange_rate():
    rate_info = get_usdinr_exchange_rate()
    assert isinstance(rate_info, dict)
    assert "rate" in rate_info
    assert rate_info["rate"] > 0
    assert rate_info["currency_pair"] == "USD/INR"
    assert rate_info["base_currency"] == "USD"
    assert rate_info["target_currency"] == "INR"
    assert rate_info["source"] is not None

def test_exchange_rate_caching():
    r1 = get_usdinr_exchange_rate()
    r2 = get_usdinr_exchange_rate()
    assert r1["rate"] == r2["rate"]
    assert r2["is_cached"] is True

def test_convert_usd_to_inr():
    test_rate = 86.50
    assert convert_usd_to_inr(100.0, rate=test_rate) == 8650.00
    assert convert_usd_to_inr(1.0, rate=test_rate) == 86.50
    assert convert_usd_to_inr(0.0, rate=test_rate) == 0.00
    assert convert_usd_to_inr(None) is None

def test_normalize_quote_indian_stock():
    # Indian stock denominated in INR - must NEVER be double converted
    indian_quote = {
        "symbol": "RELIANCE.NS",
        "company_name": "Reliance Industries Limited",
        "currency": "INR",
        "exchange": "NSE",
        "current_price": 2840.50,
        "previous_close": 2800.00,
        "change": 40.50,
        "change_pct": 1.45,
        "market_cap": 19200000000000,
        "pe_ratio": 26.5,
        "indicators": {
            "rsi_14": 58.2,
            "atr_14": 42.10,
            "volatility_annual": 21.4
        }
    }
    normalized = normalize_quote_to_inr(indian_quote)
    assert normalized["currency"] == "INR"
    assert normalized["original_currency"] == "INR"
    assert normalized["current_price"] == 2840.50
    assert normalized["price_inr"] == 2840.50
    assert normalized["is_converted"] is False
    assert normalized["exchange_rate"] == 1.0
    # Dimensionless metrics preserved
    assert normalized["change_pct"] == 1.45
    assert normalized["pe_ratio"] == 26.5
    assert normalized["indicators"]["rsi_14"] == 58.2
    assert normalized["indicators"]["volatility_annual"] == 21.4

def test_normalize_quote_us_stock():
    # US stock denominated in USD - converted to INR with original USD preserved
    us_quote = {
        "symbol": "AAPL",
        "company_name": "Apple Inc.",
        "currency": "USD",
        "exchange": "NASDAQ",
        "current_price": 235.40,
        "previous_close": 230.00,
        "change": 5.40,
        "change_pct": 2.35,
        "market_cap": 3500000000000,
        "pe_ratio": 34.2,
        "support_level": 220.00,
        "resistance_level": 245.00,
        "indicators": {
            "rsi_14": 62.5,
            "atr_14": 3.80,
            "volatility_annual": 23.1
        }
    }
    rate_info = {"rate": 86.85, "source": "Test Forex Mock", "last_updated": "2026-10-26T00:00:00Z"}
    normalized = normalize_quote_to_inr(us_quote, rate_info=rate_info)

    assert normalized["currency"] == "INR"
    assert normalized["original_currency"] == "USD"
    assert normalized["is_converted"] is True
    assert normalized["exchange_rate"] == 86.85
    assert normalized["original_price"] == 235.40
    # Converted monetary price
    expected_inr_price = round(235.40 * 86.85, 2)
    assert normalized["current_price"] == expected_inr_price
    assert normalized["price_inr"] == expected_inr_price
    # Support & Resistance converted
    assert normalized["support_level"] == round(220.00 * 86.85, 2)
    assert normalized["resistance_level"] == round(245.00 * 86.85, 2)
    # Dimensionless metrics strictly untouched
    assert normalized["change_pct"] == 2.35
    assert normalized["pe_ratio"] == 34.2
    assert normalized["indicators"]["rsi_14"] == 62.5
    assert normalized["indicators"]["volatility_annual"] == 23.1
    # ATR converted (ATR is in price units)
    assert normalized["indicators"]["atr_14"] == round(3.80 * 86.85, 2)

def test_percentage_return_mathematical_invariance():
    # Mathematical proof that percentage returns and risk metrics are identical:
    # (P_curr * R - P_buy * R) / (P_buy * R) == (P_curr - P_buy) / P_buy
    buy_usd = 215.50
    curr_usd = 235.40
    rate = 86.85

    buy_inr = buy_usd * rate
    curr_inr = curr_usd * rate

    return_usd = ((curr_usd - buy_usd) / buy_usd) * 100
    return_inr = ((curr_inr - buy_inr) / buy_inr) * 100

    assert pytest.approx(return_usd, rel=1e-5) == return_inr

def test_currency_api_endpoint():
    client = TestClient(app)
    resp = client.get("/api/currency/rates")
    assert resp.status_code == 200
    data = resp.json()
    assert "rate" in data
    assert data["rate"] > 0
    assert data["currency_pair"] == "USD/INR"
    assert data["target_currency"] == "INR"
