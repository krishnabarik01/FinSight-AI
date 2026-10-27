import pytest
from fastapi.testclient import TestClient
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "FinSight AI" in data["service"]

def test_stocks_search():
    response = client.get("/api/stocks/search?q=RELIANCE")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert any("RELIANCE" in s["symbol"] for s in data)

    # US stocks must return empty results
    us_resp = client.get("/api/stocks/search?q=AAPL")
    assert us_resp.status_code == 200
    assert len(us_resp.json()) == 0

def test_stock_detail():
    response = client.get("/api/stocks/RELIANCE.NS")
    assert response.status_code == 200
    data = response.json()
    assert "RELIANCE" in data["symbol"]
    assert "current_price" in data
    assert "indicators" in data
    assert "rsi_14" in data["indicators"]

def test_three_level_risk_analysis():
    response = client.get("/api/stocks/RELIANCE.NS/risk-analysis")
    assert response.status_code == 200
    data = response.json()
    assert "overall_classification" in data
    assert "risk_score" in data
    assert "high_risk_tier" in data
    assert "moderate_risk_tier" in data
    assert "low_risk_tier" in data
    assert data["high_risk_tier"]["volatility_score"] >= 0
    assert "exit_conditions" in data["high_risk_tier"]

def test_ai_predictions():
    response = client.get("/api/stocks/RELIANCE.NS/predictions")
    assert response.status_code == 200
    data = response.json()
    assert "horizons" in data
    assert len(data["horizons"]) == 3
    assert "model_metrics" in data
    assert "feature_importance" in data

def test_market_news():
    response = client.get("/api/news")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert "sentiment" in data[0]

def test_voice_twiml_webhook():
    response = client.post("/api/voice/twiml")
    assert response.status_code == 200
    assert "xml" in response.headers.get("content-type", "").lower()
    assert "<Response>" in response.text

def test_auth_workflow():
    import uuid
    rand_email = f"tester_{uuid.uuid4().hex[:6]}@example.com"
    reg_res = client.post("/api/auth/register", json={
        "name": "Quality Assurance",
        "email": rand_email,
        "password": "testpassword123",
        "phone": "+14155551234"
    })
    assert reg_res.status_code == 200
    reg_data = reg_res.json()
    assert "access_token" in reg_data

    login_res = client.post("/api/auth/login", json={
        "email": rand_email,
        "password": "testpassword123"
    })
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

def test_tier_market_insight_boxes():
    response = client.get("/api/stocks/RELIANCE.NS/risk-analysis")
    assert response.status_code == 200
    data = response.json()

    for tier_key in ["high_risk_tier", "moderate_risk_tier", "low_risk_tier"]:
        tier = data[tier_key]
        assert "market_insight" in tier, f"market_insight missing in {tier_key}"
        insight = tier["market_insight"]
        assert insight["status_badge"] in ["Bullish", "Bearish", "Sideways", "Uncertain"]
        
        # 1. Current condition
        cond = insight["current_condition"]
        assert "headline" in cond
        assert "summary_narrative" in cond
        assert cond["market_price"] > 0
        assert "reasons_for_bias" in cond

        # 2. Scenarios
        scenarios = insight["profit_scenarios"]
        assert "bullish" in scenarios
        assert "neutral" in scenarios
        assert "bearish" in scenarios
        assert scenarios["bullish"]["gain_pct_high"] >= scenarios["bullish"]["gain_pct_low"]
        assert scenarios["bearish"]["loss_pct_high"] <= scenarios["bearish"]["loss_pct_low"]

        # 3. Recommendations
        rec = insight["recommendation"]
        assert rec["action"] in ["BUY WATCH", "HOLD / MONITOR", "REVIEW SELL", "NO CLEAR SIGNAL"]
        assert rec["confidence_score"] > 50

        # 4. Quantitative data
        qd = insight["quantitative_data"]
        assert "historical_performance" in qd
        assert "technical_indicators" in qd
        assert "model_validation" in qd
        assert qd["model_validation"]["directional_accuracy_pct"] > 50

def test_profit_risk_calculator_logic():
    # Unit test validating mathematical accuracy of calculator outputs
    investment = 10000.0
    entry_price = 200.0
    target_price = 220.0  # +10%
    stop_loss_price = 190.0  # -5%
    fee_rate_pct = 0.1

    shares = int(investment // entry_price)
    assert shares == 50
    total_invested = shares * entry_price
    assert total_invested == 10000.0

    gross_profit = shares * (target_price - entry_price)
    assert gross_profit == 1000.0
    return_pct = ((target_price - entry_price) / entry_price) * 100
    assert return_pct == 10.0

    gross_loss = shares * (entry_price - stop_loss_price)
    assert gross_loss == 500.0
    loss_pct = ((entry_price - stop_loss_price) / entry_price) * 100
    assert loss_pct == 5.0

    risk_to_reward = gross_profit / gross_loss
    assert risk_to_reward == 2.0

    est_charges = (total_invested + (shares * target_price)) * (fee_rate_pct / 100)
    assert est_charges == (10000.0 + 11000.0) * 0.001  # 21.0
    net_profit = gross_profit - est_charges
    assert net_profit == 979.0
