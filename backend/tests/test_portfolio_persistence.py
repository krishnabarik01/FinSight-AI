import uuid
import pytest
from sqlalchemy import select

from app.database.connection import get_background_session
from app.database.models import Holding, Transaction, Portfolio

def test_add_holding_appears_in_portfolio_summary_with_correct_pnl(client, make_user, monkeypatch, mock_stock_data_builder):
    """Adding an Indian holding via POST /api/portfolio/holdings reflects accurately in portfolio summary and P&L totals."""
    user = make_user()
    
    # Mock stock quote for RELIANCE.NS at price 3000.0
    mock_quote = mock_stock_data_builder(symbol="RELIANCE.NS", current_price=3000.0, change_pct=2.5)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", lambda sym: mock_quote)

    add_resp = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "RELIANCE.NS",
        "quantity": 10.0,
        "purchase_price": 2800.0,
        "purchase_date": "2026-06-01",
        "stop_loss": 2600.0,
        "target_price": 3400.0,
        "notes": "Core Indian energy & telecom position"
    })
    assert add_resp.status_code == 200
    holding_data = add_resp.json()
    assert holding_data["symbol"] == "RELIANCE.NS"
    assert holding_data["quantity"] == 10.0
    assert holding_data["invested_value"] == 28000.0
    assert holding_data["current_value"] == 30000.0
    assert holding_data["unrealized_pnl"] == 2000.0
    assert round(holding_data["pnl_percentage"], 2) == 7.14

    summary_resp = client.get("/api/portfolio", headers=user["headers"])
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["holdings_count"] == 1
    assert summary["total_invested"] == 28000.0
    assert summary["total_value"] == 30000.0
    assert summary["total_pnl"] == 2000.0

def test_adding_same_symbol_creates_separate_rows(client, make_user, monkeypatch, mock_stock_data_builder):
    """Adding the same symbol multiple times creates distinct holding rows per current application behavior."""
    user = make_user()
    mock_quote = mock_stock_data_builder(symbol="RELIANCE.NS", current_price=2900.0)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", lambda sym: mock_quote)

    resp1 = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "RELIANCE.NS",
        "quantity": 10.0,
        "purchase_price": 2800.0
    })
    assert resp1.status_code == 200
    h1_id = resp1.json()["id"]

    resp2 = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "RELIANCE.NS",
        "quantity": 5.0,
        "purchase_price": 2850.0
    })
    assert resp2.status_code == 200
    h2_id = resp2.json()["id"]

    assert h1_id != h2_id

    summary = client.get("/api/portfolio", headers=user["headers"]).json()
    assert summary["holdings_count"] == 2
    holding_ids = [h["id"] for h in summary["holdings"]]
    assert h1_id in holding_ids
    assert h2_id in holding_ids

def test_update_holding_persists_changes(client, make_user, monkeypatch, mock_stock_data_builder):
    """Updating holding quantity, stop-loss, and target price persists across queries."""
    user = make_user()
    mock_quote = mock_stock_data_builder(symbol="TCS.NS", current_price=4100.0)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", lambda sym: mock_quote)

    add_resp = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "TCS.NS",
        "quantity": 20.0,
        "purchase_price": 3900.0,
        "stop_loss": 3700.0,
        "target_price": 4500.0
    })
    assert add_resp.status_code == 200
    holding_id = add_resp.json()["id"]

    # Update parameters
    put_resp = client.put(f"/api/portfolio/holdings/{holding_id}", headers=user["headers"], json={
        "quantity": 30.0,
        "stop_loss": 3800.0,
        "target_price": 4750.0,
        "notes": "Increased position sizing"
    })
    assert put_resp.status_code == 200
    assert put_resp.json()["updated_id"] == holding_id

    # Verify updated values in portfolio summary
    summary = client.get("/api/portfolio", headers=user["headers"]).json()
    updated = next(h for h in summary["holdings"] if h["id"] == holding_id)
    assert updated["quantity"] == 30.0
    assert updated["stop_loss"] == 3800.0
    assert updated["target_price"] == 4750.0

def test_delete_holding_removes_record(client, make_user, monkeypatch, mock_stock_data_builder):
    """Deleting a holding removes it from portfolio, and deleting a non-existent id returns 404."""
    user = make_user()
    mock_quote = mock_stock_data_builder(symbol="INFY.NS", current_price=1850.0)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", lambda sym: mock_quote)

    add_resp = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "INFY.NS",
        "quantity": 15.0,
        "purchase_price": 1800.0
    })
    assert add_resp.status_code == 200
    holding_id = add_resp.json()["id"]

    del_resp = client.delete(f"/api/portfolio/holdings/{holding_id}", headers=user["headers"])
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_id"] == holding_id

    summary = client.get("/api/portfolio", headers=user["headers"]).json()
    assert summary["holdings_count"] == 0

    # Deleting non-existent ID returns 404
    del_nonexistent = client.delete("/api/portfolio/holdings/non-existent-uuid-12345", headers=user["headers"])
    assert del_nonexistent.status_code == 404

@pytest.mark.parametrize("invalid_payload", [
    {"symbol": "RELIANCE.NS", "quantity": -5.0, "purchase_price": 2800.0},
    {"symbol": "RELIANCE.NS", "quantity": 0.0, "purchase_price": 2800.0},
    {"symbol": "RELIANCE.NS", "quantity": 10.0, "purchase_price": 0.0},
    {"symbol": "RELIANCE.NS", "quantity": 10.0, "purchase_price": -25.0},
])
def test_invalid_holding_quantity_or_price_rejected(client, make_user, invalid_payload):
    """Holdings with non-positive quantity or non-positive purchase price are rejected with 422."""
    user = make_user()
    resp = client.post("/api/portfolio/holdings", headers=user["headers"], json=invalid_payload)
    assert resp.status_code == 422

def test_empty_symbol_holding_rejected(client, make_user):
    """Adding a holding with an empty symbol should be rejected with 422 Unprocessable Entity or 400."""
    user = make_user()
    resp = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "",
        "quantity": 10.0,
        "purchase_price": 100.0
    })
    assert resp.status_code in [400, 422]

def test_transactions_recorded_automatically_for_holdings(client, make_user, monkeypatch, mock_stock_data_builder):
    """Adding a holding automatically records an audit BUY transaction with accurate amounts and dates."""
    user = make_user()
    mock_quote = mock_stock_data_builder(symbol="HDFCBANK.NS", current_price=1650.0)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", lambda sym: mock_quote)

    add_resp = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "HDFCBANK.NS",
        "quantity": 8.0,
        "purchase_price": 1600.0,
        "purchase_date": "2026-06-15"
    })
    assert add_resp.status_code == 200

    tx_resp = client.get("/api/portfolio/transactions", headers=user["headers"])
    assert tx_resp.status_code == 200
    transactions = tx_resp.json()
    assert len(transactions) >= 1

    tx = next((t for t in transactions if t["symbol"] == "HDFCBANK.NS"), None)
    assert tx is not None
    assert tx["type"] == "BUY"
    assert tx["quantity"] == 8.0
    assert tx["price"] == 1600.0
    assert tx["total_amount"] == 12800.0
    assert tx["date"] == "2026-06-15"

@pytest.mark.anyio
async def test_direct_db_verification_of_committed_rows(client, make_user, monkeypatch, mock_stock_data_builder):
    """Direct database queries verify holding and transaction rows are genuinely committed to SQLite."""
    user = make_user()
    mock_quote = mock_stock_data_builder(symbol="ICICIBANK.NS", current_price=1250.0)
    monkeypatch.setattr("app.api.portfolio.get_stock_data", lambda sym: mock_quote)

    add_resp = client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": "ICICIBANK.NS",
        "quantity": 12.0,
        "purchase_price": 1200.0,
        "stop_loss": 1100.0,
        "target_price": 1400.0
    })
    assert add_resp.status_code == 200
    holding_id = add_resp.json()["id"]

    # Verify directly via background session
    async with get_background_session() as session:
        h_res = await session.execute(select(Holding).where(Holding.id == holding_id))
        db_holding = h_res.scalar_one_or_none()
        assert db_holding is not None
        assert db_holding.symbol == "ICICIBANK.NS"
        assert db_holding.quantity == 12.0
        assert db_holding.purchase_price == 1200.0
        assert db_holding.stop_loss == 1100.0
        assert db_holding.user_id == user["id"]

        t_res = await session.execute(select(Transaction).where(Transaction.user_id == user["id"]))
        db_tx = t_res.scalar_one_or_none()
        assert db_tx is not None
        assert db_tx.symbol == "ICICIBANK.NS"
        assert db_tx.total_amount == 14400.0

def test_performance_endpoint_does_not_crash_empty_portfolio(client, make_user):
    """Calling /api/portfolio/performance for a user with zero holdings succeeds cleanly without crashing."""
    user = make_user()
    perf_resp = client.get("/api/portfolio/performance?range_filter=1M", headers=user["headers"])
    assert perf_resp.status_code == 200
    perf = perf_resp.json()
    assert "performance_series" in perf
    assert len(perf["performance_series"]) > 0
    assert perf["current_value"] > 0
    assert "benchmark_symbol" in perf
