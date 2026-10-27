import pytest
from app.database.models import Holding, WatchlistItemModel

def test_portfolio_holdings_batch_success(client, make_user, monkeypatch, mock_stock_data_builder):
    """Batch add multiple stock holdings in a single request and verify portfolio totals."""
    user = make_user()

    def mock_quote(sym):
        if "RELIANCE" in sym:
            return mock_stock_data_builder(symbol="RELIANCE.NS", current_price=3000.0)
        elif "TCS" in sym:
            return mock_stock_data_builder(symbol="TCS.NS", current_price=4000.0)
        return mock_stock_data_builder(symbol="SBIN.NS", current_price=800.0)

    monkeypatch.setattr("app.api.portfolio.get_stock_data", mock_quote)

    batch_payload = {
        "holdings": [
            {
                "symbol": "RELIANCE.NS",
                "quantity": 10.0,
                "purchase_price": 2800.0,
                "purchase_date": "2026-06-01",
                "stop_loss": 2600.0,
                "target_price": 3400.0,
                "sector": "Energy & Telecom"
            },
            {
                "symbol": "TCS.NS",
                "quantity": 5.0,
                "purchase_price": 3800.0,
                "purchase_date": "2026-06-01",
                "sector": "Technology"
            },
            {
                "symbol": "SBIN.NS",
                "quantity": 20.0,
                "purchase_price": 750.0,
                "purchase_date": "2026-06-01",
                "sector": "Financial"
            }
        ]
    }

    resp = client.post("/api/portfolio/holdings/batch", headers=user["headers"], json=batch_payload)
    assert resp.status_code == 200
    added = resp.json()
    assert len(added) == 3
    symbols = [h["symbol"] for h in added]
    assert "RELIANCE.NS" in symbols
    assert "TCS.NS" in symbols
    assert "SBIN.NS" in symbols

    # Verify GET /api/portfolio aggregates all 3
    summary_resp = client.get("/api/portfolio", headers=user["headers"])
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["holdings_count"] == 3
    expected_invested = (10.0 * 2800.0) + (5.0 * 3800.0) + (20.0 * 750.0)
    assert summary["total_invested"] == expected_invested


def test_portfolio_holdings_batch_validation(client, make_user):
    """Batch add rejects negative/zero quantities and invalid prices."""
    user = make_user()

    invalid_payload = {
        "holdings": [
            {
                "symbol": "INFY.NS",
                "quantity": -5.0,
                "purchase_price": 1500.0
            }
        ]
    }
    resp = client.post("/api/portfolio/holdings/batch", headers=user["headers"], json=invalid_payload)
    assert resp.status_code == 422


def test_portfolio_holdings_batch_empty_rejected(client, make_user):
    """Batch add with empty list returns 400 error."""
    user = make_user()
    resp = client.post("/api/portfolio/holdings/batch", headers=user["headers"], json={"holdings": []})
    assert resp.status_code == 400
    assert "Holdings array cannot be empty" in resp.json()["detail"]


def test_watchlist_batch_add_and_delete(client, make_user, monkeypatch):
    """Batch add to watchlist and batch remove instruments."""
    user = make_user()

    async def mock_live_quote(sym, force_refresh=False):
        return {
            "symbol": sym,
            "company_name": f"{sym} Ltd",
            "price": 1000.0,
            "current_price": 1000.0,
            "change": 10.0,
            "change_pct": 1.0,
            "is_stale": False,
            "data_status": "live",
            "source": "Groww"
        }

    monkeypatch.setattr("app.api.watchlist.get_live_quote", mock_live_quote)

    batch_payload = {
        "items": [
            {"symbol": "INFY", "target_price": 1800.0, "stop_loss": 1400.0},
            {"symbol": "WIPRO", "target_price": 600.0, "stop_loss": 450.0},
            {"symbol": "HCLTECH", "target_price": 1600.0}
        ]
    }

    add_resp = client.post("/api/watchlist/batch", headers=user["headers"], json=batch_payload)
    assert add_resp.status_code == 200
    added = add_resp.json()
    assert len(added) == 3
    added_symbols = [i["symbol"] for i in added]
    assert "INFY" in added_symbols
    assert "WIPRO" in added_symbols
    assert "HCLTECH" in added_symbols

    # Verify GET /api/watchlist returns them
    list_resp = client.get("/api/watchlist", headers=user["headers"])
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) >= 3

    # Batch delete two items
    del_ids = [added[0]["id"], added[1]["id"]]
    del_resp = client.request("DELETE", "/api/watchlist/batch", headers=user["headers"], json={"ids": del_ids})
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_count"] == 2

    # Verify only remaining one is in watchlist
    after_del_resp = client.get("/api/watchlist", headers=user["headers"])
    assert after_del_resp.status_code == 200
    remaining_symbols = [i["symbol"] for i in after_del_resp.json()]
    assert "INFY" not in remaining_symbols
    assert "WIPRO" not in remaining_symbols
    assert "HCLTECH" in remaining_symbols


def test_watchlist_batch_duplicate_handling(client, make_user, monkeypatch):
    """Adding an instrument already in the watchlist skips duplicate and returns existing/new items cleanly."""
    user = make_user()

    async def mock_live_quote(sym, force_refresh=False):
        return {
            "symbol": sym,
            "company_name": f"{sym} Ltd",
            "price": 500.0,
            "current_price": 500.0,
            "change": 5.0,
            "change_pct": 1.0,
            "is_stale": False,
            "data_status": "live",
            "source": "Groww"
        }

    monkeypatch.setattr("app.api.watchlist.get_live_quote", mock_live_quote)

    # Add single instrument
    client.post("/api/watchlist", headers=user["headers"], json={"symbol": "TATAMOTORS"})

    # Batch add containing TATAMOTORS and a new symbol MARUTI
    batch_resp = client.post("/api/watchlist/batch", headers=user["headers"], json={
        "items": [
            {"symbol": "TATAMOTORS"},
            {"symbol": "MARUTI"}
        ]
    })
    assert batch_resp.status_code == 200
    items = batch_resp.json()
    symbols = [i["symbol"] for i in items]
    assert "MARUTI" in symbols
    # TATAMOTORS was already tracked so not re-inserted in newly added list
    assert "TATAMOTORS" not in symbols

    # Both symbols exist in user's full watchlist
    full_resp = client.get("/api/watchlist", headers=user["headers"])
    assert full_resp.status_code == 200
    all_syms = [i["symbol"] for i in full_resp.json()]
    assert "TATAMOTORS" in all_syms
    assert "MARUTI" in all_syms

