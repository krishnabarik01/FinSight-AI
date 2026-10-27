import pytest
import uuid
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app

client = TestClient(app)

def get_auth_token():
    email = f"user_{uuid.uuid4().hex[:6]}@example.com"
    reg = client.post("/api/auth/register", json={
        "name": "Integration User",
        "email": email,
        "password": "strongPassword123!",
        "phone": "+14155551111"
    })
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_portfolio_summary_default():
    headers = get_auth_token()
    res = client.get("/api/portfolio", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_invested" in data
    assert "total_value" in data
    assert "portfolio_risk_score" in data
    assert "holdings" in data

def test_holdings_crud_flow():
    headers = get_auth_token()
    
    # Add holding
    add_res = client.post("/api/portfolio/holdings", headers=headers, json={
        "symbol": "RELIANCE.NS",
        "quantity": 10,
        "purchase_price": 2840.0,
        "purchase_date": "2026-06-01",
        "stop_loss": 2700.0,
        "target_price": 3200.0,
        "notes": "Tech holding"
    })
    assert add_res.status_code == 200
    holding = add_res.json()
    holding_id = holding["id"]
    assert holding["symbol"] == "RELIANCE.NS"
    assert holding["quantity"] == 10.0
    assert holding["invested_value"] == 28400.0

    # Update holding
    up_res = client.put(f"/api/portfolio/holdings/{holding_id}", headers=headers, json={
        "quantity": 20,
        "stop_loss": 2750.0
    })
    assert up_res.status_code == 200
    assert up_res.json()["updated_id"] == holding_id

    # Verify transactions recorded automatically
    tx_res = client.get("/api/portfolio/transactions", headers=headers)
    assert tx_res.status_code == 200
    txs = tx_res.json()
    assert len(txs) >= 1
    assert any(t["symbol"] == "RELIANCE.NS" and t["type"] == "BUY" for t in txs)

    # Delete holding
    del_res = client.delete(f"/api/portfolio/holdings/{holding_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["deleted_id"] == holding_id

def test_alerts_and_rules_api():
    headers = get_auth_token()

    # Create rule
    rule_res = client.post("/api/alerts/rules", headers=headers, json={
        "symbol": "TCS.NS",
        "rule_type": "STOP_LOSS",
        "threshold": 3800.0,
        "condition": "LESS_THAN",
        "is_active": True,
        "enable_voice_call": True,
        "enable_email": True
    })
    assert rule_res.status_code == 200
    rule = rule_res.json()
    rule_id = rule["id"]
    assert rule["symbol"] == "TCS.NS"

    # List rules
    list_res = client.get("/api/alerts/rules", headers=headers)
    assert list_res.status_code == 200
    assert any(r["id"] == rule_id for r in list_res.json())

    # Delete rule
    del_res = client.delete(f"/api/alerts/rules/{rule_id}", headers=headers)
    assert del_res.status_code == 200

    # Get alert events
    events_res = client.get("/api/alerts", headers=headers)
    assert events_res.status_code == 200
    events = events_res.json()
    assert isinstance(events, list)

def test_user_settings_api():
    headers = get_auth_token()

    # Get settings
    get_res = client.get("/api/settings", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert "risk_tolerance" in data

    # Update settings
    put_res = client.put("/api/settings", headers=headers, json={
        "risk_tolerance": "Aggressive",
        "default_stop_loss_pct": 8.5,
        "voice_calls_enabled": True
    })
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["risk_tolerance"] == "Aggressive"
    assert updated["default_stop_loss_pct"] == 8.5

def test_dashboard_summary_api():
    headers = get_auth_token()
    res = client.get("/api/dashboard/summary", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "portfolio_summary" in data
    assert "market_indices" in data
    assert "holdings" in data

def test_voice_logs_api():
    headers = get_auth_token()
    res = client.get("/api/voice/logs", headers=headers)
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)
