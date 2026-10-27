import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

ALL_PERIODS = ["5d", "1mo", "3mo", "6mo", "1y", "2y"]

def test_gold_history_all_time_range_filters():
    """Verify gold history supports all 6 time-range filters with real observations and fluctuations."""
    for period in ALL_PERIODS:
        response = client.get(f"/api/gold/history?period={period}&city=Visakhapatnam")
        assert response.status_code == 200, f"Failed for gold period {period}"
        data = response.json()
        assert data["status"] == "available"
        assert data["city"] == "Visakhapatnam"
        assert data["gst_included"] is True
        assert data["primary_unit"] == "price_24k_10g"
        assert len(data["records"]) > 0, f"No records returned for gold period {period}"

        # Observations must be chronological
        dates = [r["date"] for r in data["records"]]
        assert dates == sorted(dates), f"Dates not chronological for gold period {period}"

        # Every record must have valid finite positive price and timestamp
        for r in data["records"]:
            assert r["date"] is not None
            assert r.get("timestamp") is not None
            assert r["price_24k_10g"] > 0
            assert r["price"] > 0
            assert r["city"] == "Visakhapatnam"
            assert r["currency"] == "INR"

        # Check fluctuations: not a single flat price across multi-month range
        if period in ["1mo", "3mo", "6mo", "1y", "2y"]:
            prices = [r["price_24k_10g"] for r in data["records"]]
            assert len(prices) >= 15, f"Expected multi-day history, got {len(prices)} for {period}"
            assert len(set(prices)) > 1, f"Flat/duplicate price detected for gold period {period}"


def test_silver_history_all_time_range_filters():
    """Verify silver history supports all 6 time-range filters with real observations and valid keys."""
    for period in ALL_PERIODS:
        response = client.get(f"/api/metals/silver/history?period={period}&city=Visakhapatnam")
        assert response.status_code == 200, f"Failed for silver period {period}"
        data = response.json()
        assert data["status"] == "available"
        assert data["city"] == "Visakhapatnam"
        assert data["gst_included"] is True
        assert data["primary_unit"] == "price_per_kg"
        assert len(data["records"]) > 0, f"No records returned for silver period {period}"

        dates = [r["date"] for r in data["records"]]
        assert dates == sorted(dates), f"Dates not chronological for silver period {period}"

        # Every record must contain price_silver_1kg (for frontend Recharts Area), price_per_kg, and price
        for r in data["records"]:
            assert r["date"] is not None
            assert r.get("timestamp") is not None
            assert r["price_silver_1kg"] > 0
            assert r["price_per_kg"] > 0
            assert r["price"] > 0
            assert r["city"] == "Visakhapatnam"
            assert r["currency"] == "INR"

        if period in ["1mo", "3mo", "6mo", "1y", "2y"]:
            prices = [r["price_silver_1kg"] for r in data["records"]]
            assert len(prices) >= 15, f"Expected multi-day history, got {len(prices)} for {period}"
            assert len(set(prices)) > 1, f"Flat/duplicate price detected for silver period {period}"


def test_gold_and_silver_datasets_are_independent():
    """Verify gold and silver history return completely distinct metal series."""
    rg = client.get("/api/gold/history?period=1mo")
    rs = client.get("/api/metals/silver/history?period=1mo")

    assert rg.status_code == 200
    assert rs.status_code == 200

    g_data = rg.json()
    s_data = rs.json()

    assert g_data["commodity_name"] != s_data["commodity_name"]
    assert g_data["primary_unit"] == "price_24k_10g"
    assert s_data["primary_unit"] == "price_per_kg"

    g_latest = g_data["records"][-1]["price_24k_10g"]
    s_latest = s_data["records"][-1]["price_silver_1kg"]

    # Gold 10g is typically ~140,000 INR; Silver 1kg is typically ~220,000 INR
    assert g_latest != s_latest
    assert "gold" in g_data.get("metal", "gold").lower()
    assert "silver" in s_data.get("metal", "silver").lower()


def test_gold_and_silver_empty_responses():
    """Verify backend handles empty provider responses gracefully without fabricating bogus data."""
    from app.services.gold_data import _GOLD_CACHE
    from app.services.silver_data import _SILVER_CACHE
    _GOLD_CACHE.clear()
    _SILVER_CACHE.clear()

    with patch("app.services.gold_data._query_domestic_gold_records", return_value=[]), \
         patch("app.services.gold_data.fetch_nebula_metals_gold", return_value=None), \
         patch("app.services.gold_data._get_calibrated_domestic_history", return_value=[]):
        res = client.get("/api/gold/history?city=NonExistentCity&period=1mo&force_refresh=true")
        assert res.status_code == 200
        data = res.json()
        assert data["records"] == []

    with patch("app.services.silver_data._query_domestic_silver_records", return_value=[]), \
         patch("app.services.silver_data.fetch_nebula_metals_silver", return_value=None), \
         patch("app.services.silver_data._get_calibrated_domestic_silver_history", return_value=[]):
        res = client.get("/api/metals/silver/history?city=NonExistentCity&period=1mo&force_refresh=true")
        assert res.status_code == 200
        data = res.json()
        assert data["records"] == []


def test_independent_failure_isolation():
    """Verify an error/outage in silver provider does not crash gold, and vice versa."""
    # Silver failing
    with patch("app.services.silver_data.get_silver_history", side_effect=Exception("Silver API down")):
        res_gold = client.get("/api/gold/history?period=1mo")
        assert res_gold.status_code == 200
        assert len(res_gold.json()["records"]) > 0

    # Gold failing
    with patch("app.services.gold_data.get_gold_history", side_effect=Exception("Gold API down")):
        res_silver = client.get("/api/metals/silver/history?period=1mo")
        assert res_silver.status_code == 200
        assert len(res_silver.json()["records"]) > 0
