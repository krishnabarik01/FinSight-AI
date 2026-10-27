"""
FinSight AI — Test Suite for Metal Portfolio Integration (Gold & Silver)
Tests addition, retrieval, update, deletion, P&L mathematics, transactions,
validation, and co-existence of Stocks, Gold, and Silver in the Portfolio Manager.
"""

import pytest
from app.services.metal_portfolio import get_metal_price_quote


def test_metal_price_quote_service_gold_and_silver():
    """Verify metal price quotes reuse genuine market rates for Gold and Silver purities."""
    g24 = get_metal_price_quote("GOLD", "24K")
    assert g24["metal_type"] == "GOLD"
    assert g24["purity"] == "24K"
    assert g24["current_price"] > 0.0
    assert g24["currency"] == "INR"

    g22 = get_metal_price_quote("GOLD", "22K")
    assert g22["metal_type"] == "GOLD"
    assert g22["purity"] == "22K"
    assert g22["current_price"] > 0.0
    assert g22["current_price"] < g24["current_price"]

    g18 = get_metal_price_quote("GOLD", "18K")
    assert g18["purity"] == "18K"
    assert g18["current_price"] < g22["current_price"]

    s999 = get_metal_price_quote("SILVER", "999")
    assert s999["metal_type"] == "SILVER"
    assert s999["purity"] == "999"
    assert s999["current_price"] > 0.0

    s925 = get_metal_price_quote("SILVER", "925")
    assert s925["metal_type"] == "SILVER"
    assert s925["purity"] == "925"
    assert s925["current_price"] < s999["current_price"]


def test_add_gold_holding_and_verify_calculations(client, make_user):
    """Adding Gold holding stores grams and purchase price per gram, calculating exact P&L."""
    user = make_user()

    # Add 15 grams of 24K Gold at 12000 INR/gram
    resp = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "GOLD",
        "purity": "24K",
        "quantity": 15.0,
        "purchase_price": 12000.0,
        "purchase_date": "2026-05-10",
        "notes": "Physical Sovereign Gold Sovereign / Bullion Bar"
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["asset_type"] == "GOLD"
    assert data["metal_type"] == "GOLD"
    assert data["purity"] == "24K"
    assert data["quantity"] == 15.0
    assert data["purchase_price"] == 12000.0
    assert data["invested_value"] == 15.0 * 12000.0  # 180,000 INR
    assert data["current_price"] > 0.0
    expected_current_val = round(15.0 * data["current_price"], 2)
    assert data["current_value"] == expected_current_val
    expected_pnl = round(expected_current_val - 180000.0, 2)
    assert data["unrealized_pnl"] == expected_pnl

    # Verify summary endpoint reflects metal holding
    sum_resp = client.get("/api/portfolio", headers=user["headers"])
    assert sum_resp.status_code == 200
    summary = sum_resp.json()
    assert summary["holdings_count"] == 1
    assert summary["total_invested"] == 180000.0
    assert summary["total_value"] == expected_current_val
    assert summary["total_pnl"] == expected_pnl


def test_add_silver_holding_and_verify_calculations(client, make_user):
    """Adding Silver holding stores grams and purchase price per gram, calculating exact P&L."""
    user = make_user()

    # Add 500 grams of Silver 999 at 150 INR/gram
    resp = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "SILVER",
        "purity": "999",
        "quantity": 500.0,
        "purchase_price": 150.0,
        "purchase_date": "2026-06-15",
        "notes": "500g Silver Bullion Bar"
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["asset_type"] == "SILVER"
    assert data["metal_type"] == "SILVER"
    assert data["purity"] == "999"
    assert data["quantity"] == 500.0
    assert data["purchase_price"] == 150.0
    assert data["invested_value"] == 500.0 * 150.0  # 75,000 INR
    assert data["current_price"] > 0.0
    expected_current_val = round(500.0 * data["current_price"], 2)
    assert data["current_value"] == expected_current_val
    expected_pnl = round(expected_current_val - 75000.0, 2)
    assert data["unrealized_pnl"] == expected_pnl


def test_coexistence_of_stock_gold_and_silver(client, make_user, monkeypatch, mock_stock_data_builder):
    """Verifies that Stocks, Gold, and Silver comfortably coexist in the portfolio summary and allocations."""
    user = make_user()

    mock_quote = mock_stock_data_builder(symbol="TCS.NS", current_price=4000.0)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", lambda sym: mock_quote)

    # 1. Add Stock
    r_stock = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "TCS.NS",
        "quantity": 10.0,
        "purchase_price": 3800.0,
        "sector": "Information Technology"
    })
    assert r_stock.status_code == 200

    # 2. Add Gold
    r_gold = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "GOLD",
        "purity": "22K",
        "quantity": 20.0,
        "purchase_price": 11000.0
    })
    assert r_gold.status_code == 200

    # 3. Add Silver
    r_silver = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "SILVER",
        "purity": "925",
        "quantity": 250.0,
        "purchase_price": 140.0
    })
    assert r_silver.status_code == 200

    # Retrieve combined summary
    summary_resp = client.get("/api/portfolio", headers=user["headers"])
    assert summary_resp.status_code == 200
    summary = summary_resp.json()

    assert summary["holdings_count"] == 3
    asset_types = [h["asset_type"] for h in summary["holdings"]]
    assert "STOCK" in asset_types
    assert "GOLD" in asset_types
    assert "SILVER" in asset_types

    # Transactions recorded
    tx_resp = client.get("/api/portfolio/transactions", headers=user["headers"])
    assert tx_resp.status_code == 200
    txs = tx_resp.json()
    assert len(txs) >= 3


def test_metal_validation_negative_or_invalid_values(client, make_user):
    """Validation rejects invalid metal types, invalid purities, and non-positive numbers."""
    user = make_user()

    # Invalid metal type (e.g. Copper)
    resp1 = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "PLATINUM",
        "purity": "999",
        "quantity": 10.0,
        "purchase_price": 3000.0
    })
    assert resp1.status_code == 400

    # Invalid purity for Gold (e.g. 10K)
    resp2 = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "GOLD",
        "purity": "10K",
        "quantity": 10.0,
        "purchase_price": 5000.0
    })
    assert resp2.status_code == 400

    # Negative quantity
    resp3 = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "GOLD",
        "purity": "24K",
        "quantity": -5.0,
        "purchase_price": 12000.0
    })
    assert resp3.status_code == 422 or resp3.status_code == 400

    # Zero purchase price
    resp4 = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "SILVER",
        "purity": "999",
        "quantity": 100.0,
        "purchase_price": 0.0
    })
    assert resp4.status_code == 422 or resp4.status_code == 400


def test_metal_holding_edit_and_delete(client, make_user):
    """Verifies that editing quantity, purchase price, or purity and deleting metal holdings works seamlessly."""
    user = make_user()

    # Add 10g Gold 24K
    r_add = client.post("/api/portfolio/holdings/metal", headers=user["headers"], json={
        "metal_type": "GOLD",
        "purity": "24K",
        "quantity": 10.0,
        "purchase_price": 12000.0
    })
    assert r_add.status_code == 200
    h_id = r_add.json()["id"]

    # Edit holding: change quantity to 25g, purchase price to 12100, and purity to 22K
    r_put = client.put(f"/api/portfolio/holdings/{h_id}", headers=user["headers"], json={
        "quantity": 25.0,
        "purchase_price": 12100.0,
        "purity": "22K"
    })
    assert r_put.status_code == 200
    assert r_put.json()["updated_id"] == h_id

    # Verify update in summary
    summary = client.get("/api/portfolio", headers=user["headers"]).json()
    updated = next(h for h in summary["holdings"] if h["id"] == h_id)
    assert updated["quantity"] == 25.0
    assert updated["purchase_price"] == 12100.0
    assert updated["purity"] == "22K"
    assert updated["symbol"] == "GOLD-22K"

    # Delete holding
    r_del = client.delete(f"/api/portfolio/holdings/{h_id}", headers=user["headers"])
    assert r_del.status_code == 200

    summary_after = client.get("/api/portfolio", headers=user["headers"]).json()
    assert summary_after["holdings_count"] == 0
