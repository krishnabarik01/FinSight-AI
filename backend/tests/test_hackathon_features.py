"""
Tests for FinSight AI Hackathon Features:
- Groww API Market-Data Service & Status Diagnostics
- Investor Onboarding Questionnaire & Profile Persistence
- Personalized Investment Recommendations Engine
- Persistent Watchlist Database Layer
- Beginner Learning Resources & Market Literacy
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_auth_token():
    email = f"hackathon_{uuid.uuid4().hex[:6]}@example.com"
    reg = client.post("/api/auth/register", json={
        "name": "Hackathon User",
        "email": email,
        "password": "strongPassword123!",
        "phone": "+919876543210"
    })
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_groww_api_integration_status_and_search():
    # 1. Check Groww status diagnostics
    res = client.get("/api/stocks/groww/status")
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "Groww API"
    assert "supported_features" in data
    assert "setup_instructions" in data

    # 2. Search for Indian stocks (SBI, Reliance, TCS)
    search_res = client.get("/api/stocks/search?q=SBI")
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert len(search_data) >= 1
    assert any("SBIN" in item["symbol"] for item in search_data)

    # 3. Retrieve stock detail for SBIN
    stock_res = client.get("/api/stocks/SBIN")
    assert stock_res.status_code == 200
    stock_data = stock_res.json()
    assert stock_data["symbol"] in ["SBIN", "SBIN.NS"]
    assert stock_data["currency"] == "INR"
    assert stock_data["current_price"] > 0
    assert "data_source" in stock_data
    assert "data_status" in stock_data

def test_investor_onboarding_questions_and_profile():
    auth_headers = get_auth_token()

    # 1. Fetch questionnaire
    q_res = client.get("/api/onboarding/questions")
    assert q_res.status_code == 200
    q_data = q_res.json()
    assert q_data["total_questions"] >= 5
    assert any(q["id"] == "risk_tolerance" for q in q_data["questions"])

    # 2. Submit onboarding profile
    profile_payload = {
        "experience_level": "Beginner",
        "financial_objective": "Wealth Creation",
        "investment_horizon": "3-5 Years",
        "risk_tolerance": "Moderate",
        "approximate_budget": "₹10,000 - ₹50,000",
        "preferred_categories": ["Large Cap Equities", "Index ETFs", "Digital Gold"],
        "product_interests": ["Equities", "ETFs", "Gold"],
        "max_loss_tolerance_pct": 8.0,
        "liquidity_need": "Medium"
    }
    post_res = client.post("/api/onboarding/profile", json=profile_payload, headers=auth_headers)
    assert post_res.status_code == 200
    saved = post_res.json()
    assert saved["risk_tolerance"] == "Moderate"
    assert saved["is_completed"] is True

    # 3. Get profile
    get_res = client.get("/api/onboarding/profile", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["experience_level"] == "Beginner"

def test_personalized_recommendations_engine():
    auth_headers = get_auth_token()

    res = client.get("/api/recommendations", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_candidates"] >= 5
    assert len(data["candidates"]) >= 5

    # Check candidate structure
    first = data["candidates"][0]
    assert "symbol" in first
    assert "current_price" in first
    assert "suitability_score" in first
    assert "match_reasons" in first
    assert len(first["match_reasons"]) >= 1
    assert "pros" in first
    assert "cons" in first
    assert "forecast_scenarios" in first
    assert "disclaimer" in data

def test_persistent_watchlist_crud():
    auth_headers = get_auth_token()

    # 1. Get initial watchlist
    res = client.get("/api/watchlist", headers=auth_headers)
    assert res.status_code == 200
    initial_list = res.json()
    assert isinstance(initial_list, list)

    # 2. Add an instrument with target and stop-loss
    add_res = client.post(
        "/api/watchlist",
        json={"symbol": "INFY", "target_price": 2100.0, "stop_loss": 1750.0, "notes": "Core IT growth thesis"},
        headers=auth_headers
    )
    assert add_res.status_code == 200
    item = add_res.json()
    assert item["symbol"] == "INFY"
    assert item["target_price"] == 2100.0

    # 3. Update target price
    update_res = client.put(
        f"/api/watchlist/{item['id']}",
        json={"target_price": 2200.0, "stop_loss": 1780.0, "notes": "Updated targets"},
        headers=auth_headers
    )
    assert update_res.status_code == 200

    # 4. Delete item
    del_res = client.delete(f"/api/watchlist/{item['id']}", headers=auth_headers)
    assert del_res.status_code == 200

def test_beginner_learning_resources():
    # 1. Modules
    mod_res = client.get("/api/education/modules")
    assert mod_res.status_code == 200
    assert mod_res.json()["total_modules"] >= 5

    # 2. Glossary
    gloss_res = client.get("/api/education/glossary")
    assert gloss_res.status_code == 200
    assert gloss_res.json()["total_terms"] >= 5

def test_indian_stocks_supported_and_us_stocks_rejected():
    auth_headers = get_auth_token()

    # 1. Verify Indian stocks (RELIANCE.NS, TCS.NS, INFY.NS) can be searched and selected
    for sym in ["RELIANCE.NS", "TCS.NS", "INFY.NS"]:
        # Detail endpoint
        det_res = client.get(f"/api/stocks/{sym}")
        assert det_res.status_code == 200, f"Failed to get detail for {sym}"
        data = det_res.json()
        assert data["currency"] == "INR"
        assert data["current_price"] > 0

        # Predictions endpoint
        pred_res = client.get(f"/api/stocks/{sym}/predictions")
        assert pred_res.status_code == 200

        # Risk analysis endpoint
        risk_res = client.get(f"/api/stocks/{sym}/risk-analysis")
        assert risk_res.status_code == 200

    # 2. Verify search for Indian stocks
    for q in ["RELIANCE", "TCS", "INFY"]:
        search_res = client.get(f"/api/stocks/search?q={q}")
        assert search_res.status_code == 200
        assert len(search_res.json()) >= 1

    # 3. Verify US stocks (AAPL, NVDA, MSFT) are rejected by stocks detail with HTTP 400
    for us_sym in ["AAPL", "NVDA", "MSFT", "TSLA"]:
        res = client.get(f"/api/stocks/{us_sym}")
        assert res.status_code == 400, f"Expected 400 for US stock {us_sym}, got {res.status_code}"
        assert "Unsupported symbol" in res.json()["detail"]
        assert "NSE/BSE" in res.json()["detail"]

        pred_res = client.get(f"/api/stocks/{us_sym}/predictions")
        assert pred_res.status_code == 400

        risk_res = client.get(f"/api/stocks/{us_sym}/risk-analysis")
        assert risk_res.status_code == 400

    # 4. Verify search for US tickers returns empty results (not offered)
    for us_sym in ["AAPL", "NVDA", "MSFT", "TSLA"]:
        search_res = client.get(f"/api/stocks/search?q={us_sym}")
        assert search_res.status_code == 200
        assert len(search_res.json()) == 0

    # 5. Verify adding US stocks to portfolio holdings is rejected with HTTP 400
    bad_hold = client.post("/api/portfolio/holdings", json={
        "symbol": "AAPL",
        "quantity": 10,
        "purchase_price": 200.0
    }, headers=auth_headers)
    assert bad_hold.status_code == 400
    assert "Unsupported symbol" in bad_hold.json()["detail"]

    # 6. Verify adding US stocks to watchlist is rejected with HTTP 400
    bad_watch = client.post("/api/watchlist", json={
        "symbol": "MSFT",
        "target_price": 450.0
    }, headers=auth_headers)
    assert bad_watch.status_code == 400
    assert "Unsupported symbol" in bad_watch.json()["detail"]

    # 7. Verify creating alert rules for US stocks is rejected with HTTP 400
    bad_alert = client.post("/api/alerts/rules", json={
        "symbol": "NVDA",
        "rule_type": "STOP_LOSS",
        "threshold": 115.0,
        "condition": "LESS_THAN"
    }, headers=auth_headers)
    assert bad_alert.status_code == 400
    assert "Unsupported symbol" in bad_alert.json()["detail"]
