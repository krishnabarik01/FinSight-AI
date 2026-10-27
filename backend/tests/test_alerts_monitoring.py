import asyncio
import uuid
import pytest
from sqlalchemy import select, delete

from app.database.connection import get_background_session
from app.database.models import Holding, AlertRule, AlertEvent, UserSettings, VoiceLog
from app.services.monitor import run_portfolio_monitoring_cycle, _ALERT_COOLDOWNS

def test_alert_rule_crud_lifecycle(client, make_user):
    """Creating an alert rule via POST /api/alerts/rules appears in GET and can be deleted."""
    user = make_user()

    create_resp = client.post("/api/alerts/rules", headers=user["headers"], json={
        "symbol": "RELIANCE.NS",
        "rule_type": "STOP_LOSS",
        "threshold": 2700.0,
        "condition": "LESS_THAN",
        "is_active": True,
        "enable_voice_call": True,
        "enable_email": True
    })
    assert create_resp.status_code == 200
    rule = create_resp.json()
    rule_id = rule["id"]
    assert rule["symbol"] == "RELIANCE.NS"
    assert rule["threshold"] == 2700.0
    assert rule["condition"] == "LESS_THAN"

    # List rules
    list_resp = client.get("/api/alerts/rules", headers=user["headers"])
    assert list_resp.status_code == 200
    rules = list_resp.json()
    assert any(r["id"] == rule_id for r in rules)

    # Delete rule
    del_resp = client.delete(f"/api/alerts/rules/{rule_id}", headers=user["headers"])
    assert del_resp.status_code == 200
    assert del_resp.json()["rule_id"] == rule_id

    # Verify rule is gone
    after_list = client.get("/api/alerts/rules", headers=user["headers"]).json()
    assert not any(r["id"] == rule_id for r in after_list)

@pytest.mark.parametrize("invalid_payload", [
    {"rule_type": "STOP_LOSS", "threshold": 100.0, "condition": "LESS_THAN"}, # Missing symbol
    {"symbol": "RELIANCE.NS", "threshold": 100.0, "condition": "LESS_THAN"},          # Missing rule_type
    {"symbol": "RELIANCE.NS", "rule_type": "STOP_LOSS", "threshold": "not_a_float", "condition": "LESS_THAN"}, # Bad threshold
])
def test_invalid_alert_rule_payloads_rejected(client, make_user, invalid_payload):
    """Malformed or incomplete alert rule payloads are rejected with 422 Unprocessable Entity."""
    user = make_user()
    resp = client.post("/api/alerts/rules", headers=user["headers"], json=invalid_payload)
    assert resp.status_code == 422

@pytest.mark.anyio
async def test_monitoring_cycle_empty_db_returns_zero():
    """When no holdings exist in the database, the monitoring cycle returns processed=0 and alerts_generated=0."""
    async with get_background_session() as session:
        await session.execute(delete(Holding))
        await session.commit()

    res = await run_portfolio_monitoring_cycle()
    assert res == {"processed": 0, "alerts_generated": 0}

@pytest.mark.anyio
async def test_monitoring_cycle_stop_loss_breach_triggers_critical_alert(client, make_user, monkeypatch, mock_stock_data_builder):
    """When a stock's current price falls at or below its configured stop-loss, a CRITICAL STOP_LOSS_BREACH alert is created."""
    user = make_user()
    sym = f"SL_{uuid.uuid4().hex[:6].upper()}"

    # Add holding with stop_loss=90.0, purchase_price=100.0
    client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": sym,
        "quantity": 10.0,
        "purchase_price": 100.0,
        "stop_loss": 90.0
    })

    # Mock market price below stop_loss at 85.0
    quote = mock_stock_data_builder(symbol=sym, current_price=85.0, rsi_14=42.0, volatility_annual=25.0)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))

    cycle_res = await run_portfolio_monitoring_cycle()
    assert cycle_res["alerts_generated"] >= 1

    async with get_background_session() as session:
        evt_res = await session.execute(select(AlertEvent).where(AlertEvent.user_id == user["id"], AlertEvent.symbol == sym))
        alert = evt_res.scalar_one_or_none()
        assert alert is not None
        assert alert.alert_type == "STOP_LOSS_BREACH"
        assert alert.severity == "CRITICAL"
        assert alert.current_price == 85.0

@pytest.mark.anyio
async def test_monitoring_cycle_target_price_reached_triggers_alert(client, make_user, monkeypatch, mock_stock_data_builder):
    """When a stock's current price hits or exceeds its target price, a TARGET_PROFIT_REACHED alert is created."""
    user = make_user()
    sym = f"TP_{uuid.uuid4().hex[:6].upper()}"

    client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": sym,
        "quantity": 15.0,
        "purchase_price": 100.0,
        "target_price": 125.0
    })

    quote = mock_stock_data_builder(symbol=sym, current_price=130.0, rsi_14=65.0, volatility_annual=22.0)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))

    cycle_res = await run_portfolio_monitoring_cycle()
    assert cycle_res["alerts_generated"] >= 1

    async with get_background_session() as session:
        evt_res = await session.execute(select(AlertEvent).where(AlertEvent.user_id == user["id"], AlertEvent.symbol == sym))
        alert = evt_res.scalar_one_or_none()
        assert alert is not None
        assert alert.alert_type == "TARGET_PROFIT_REACHED"
        assert alert.severity == "HIGH"
        assert alert.current_price == 130.0

@pytest.mark.anyio
async def test_monitoring_cycle_default_seven_percent_stop_loss(client, make_user, monkeypatch, mock_stock_data_builder):
    """A holding without an explicit stop-loss triggers a default stop-loss breach alert when loss reaches or exceeds 7%."""
    user = make_user()
    sym = f"DEF_{uuid.uuid4().hex[:6].upper()}"

    # No stop_loss passed
    client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": sym,
        "quantity": 10.0,
        "purchase_price": 100.0,
        "stop_loss": None
    })

    # Loss is 8% (current price 92.0)
    quote = mock_stock_data_builder(symbol=sym, current_price=92.0, rsi_14=45.0)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))

    cycle_res = await run_portfolio_monitoring_cycle()
    assert cycle_res["alerts_generated"] >= 1

    async with get_background_session() as session:
        evt_res = await session.execute(select(AlertEvent).where(AlertEvent.user_id == user["id"], AlertEvent.symbol == sym))
        alert = evt_res.scalar_one_or_none()
        assert alert is not None
        assert alert.alert_type == "STOP_LOSS_BREACH"
        assert "7.00%" in alert.triggered_condition or "P&L: -8.00%" in alert.triggered_condition

@pytest.mark.anyio
async def test_monitoring_cycle_volatility_and_rsi_spike_alerts(client, make_user, monkeypatch, mock_stock_data_builder):
    """Elevated annualized volatility (>38%) and extreme RSI (>76) generate VOLATILITY_SPIKE and TECHNICAL_OVERBOUGHT alerts."""
    user = make_user()
    sym = f"VOL_{uuid.uuid4().hex[:6].upper()}"

    client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": sym,
        "quantity": 5.0,
        "purchase_price": 100.0
    })

    # Quote with normal price but volatility 42.0 (>38.0) and RSI 78.5 (>76.0)
    quote = mock_stock_data_builder(symbol=sym, current_price=105.0, volatility_annual=42.0, rsi_14=78.5)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))

    await run_portfolio_monitoring_cycle()

    async with get_background_session() as session:
        evt_res = await session.execute(select(AlertEvent).where(AlertEvent.user_id == user["id"], AlertEvent.symbol == sym))
        alerts = evt_res.scalars().all()
        alert_types = [a.alert_type for a in alerts]
        assert "VOLATILITY_SPIKE" in alert_types
        assert "TECHNICAL_OVERBOUGHT" in alert_types

@pytest.mark.anyio
async def test_monitoring_cycle_cooldown_suppression(client, make_user, monkeypatch, mock_stock_data_builder):
    """An immediate second cycle does not produce duplicate alerts until cooldown expires or is cleared."""
    user = make_user()
    sym = f"COOL_{uuid.uuid4().hex[:6].upper()}"

    client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": sym,
        "quantity": 10.0,
        "purchase_price": 100.0,
        "stop_loss": 90.0
    })

    quote = mock_stock_data_builder(symbol=sym, current_price=80.0)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))

    # First cycle triggers alert
    res1 = await run_portfolio_monitoring_cycle()
    assert res1["alerts_generated"] >= 1

    # Second cycle immediately after: suppressed by cooldown
    res2 = await run_portfolio_monitoring_cycle()
    assert res2["alerts_generated"] == 0

    # Clear cooldown: triggers again
    _ALERT_COOLDOWNS.clear()
    res3 = await run_portfolio_monitoring_cycle()
    assert res3["alerts_generated"] >= 1

@pytest.mark.anyio
async def test_monitoring_alerts_only_created_for_holding_owner(client, make_user, monkeypatch, mock_stock_data_builder):
    """Alerts generated during the monitoring cycle are assigned strictly to the holding's owner."""
    user_a = make_user(name="Owner User")
    user_b = make_user(name="Unrelated User")
    sym = f"OWN_{uuid.uuid4().hex[:6].upper()}"

    client.post("/api/portfolio/holdings", headers=user_a["headers"], json={
        "symbol": sym,
        "quantity": 10.0,
        "purchase_price": 100.0,
        "stop_loss": 90.0
    })

    quote = mock_stock_data_builder(symbol=sym, current_price=82.0)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))

    await run_portfolio_monitoring_cycle()

    async with get_background_session() as session:
        res_a = await session.execute(select(AlertEvent).where(AlertEvent.user_id == user_a["id"], AlertEvent.symbol == sym))
        assert res_a.scalar_one_or_none() is not None

        res_b = await session.execute(select(AlertEvent).where(AlertEvent.user_id == user_b["id"], AlertEvent.symbol == sym))
        assert res_b.scalar_one_or_none() is None

@pytest.mark.anyio
async def test_voice_call_dispatch_requires_consent_enabled_and_phone(client, make_user, monkeypatch, mock_stock_data_builder):
    """Voice call alerting triggers only when voice_calls_enabled, consent, and phone number are all present; creates VoiceLog."""
    user_consented = make_user(name="Consented User", phone="+14155558888")
    user_unconsented = make_user(name="Unconsented User", phone="+14155557777")

    # Configure User A settings with consent and enabled
    client.put("/api/settings", headers=user_consented["headers"], json={
        "voice_calls_enabled": True,
        "voice_consent_given": True,
        "phone_number": "+14155558888"
    })

    # Configure User B settings with consent=False
    client.put("/api/settings", headers=user_unconsented["headers"], json={
        "voice_calls_enabled": True,
        "voice_consent_given": False,
        "phone_number": "+14155557777"
    })

    sym_a = f"VA_{uuid.uuid4().hex[:4].upper()}"
    sym_b = f"VB_{uuid.uuid4().hex[:4].upper()}"

    client.post("/api/portfolio/holdings", headers=user_consented["headers"], json={"symbol": sym_a, "quantity": 5.0, "purchase_price": 100.0, "stop_loss": 90.0})
    client.post("/api/portfolio/holdings", headers=user_unconsented["headers"], json={"symbol": sym_b, "quantity": 5.0, "purchase_price": 100.0, "stop_loss": 90.0})

    def mock_quotes(s):
        if s in [sym_a, sym_b]:
            return mock_stock_data_builder(symbol=s, current_price=80.0)
        return mock_stock_data_builder(symbol=s)

    monkeypatch.setattr("app.services.monitor.get_stock_data", mock_quotes)

    # Track voice call invocations
    voice_calls_made = []
    async def mock_call(to_phone, company_name, symbol, price, alert_reason, **kwargs):
        voice_calls_made.append({"to_phone": to_phone, "symbol": symbol})
        return {
            "call_id": f"CA_{uuid.uuid4().hex[:8]}",
            "status": "completed",
            "spoken_message": "Alert message",
            "duration_seconds": 25,
            "timestamp": "2026-06-01T12:00:00Z"
        }
    monkeypatch.setattr("app.services.monitor.voice_provider.dispatch_voice_call", mock_call)

    await run_portfolio_monitoring_cycle()

    # User A had consent -> received call
    called_phones = [c["to_phone"] for c in voice_calls_made]
    assert "+14155558888" in called_phones

    # User B had NO consent -> did NOT receive call
    assert "+14155557777" not in called_phones

    # Verify VoiceLog row in DB
    async with get_background_session() as session:
        log_res = await session.execute(select(VoiceLog).where(VoiceLog.user_id == user_consented["id"]))
        assert log_res.scalar_one_or_none() is not None

        no_log_res = await session.execute(select(VoiceLog).where(VoiceLog.user_id == user_unconsented["id"]))
        assert no_log_res.scalar_one_or_none() is None

@pytest.mark.anyio
async def test_monitoring_cycle_resilient_to_individual_stock_quote_failure(client, make_user, monkeypatch, mock_stock_data_builder):
    """If fetching market data for one symbol raises an exception, other holdings are still processed without cycle crashing."""
    user = make_user()
    sym_fail = f"ERR_{uuid.uuid4().hex[:4].upper()}"
    sym_ok = f"OK_{uuid.uuid4().hex[:4].upper()}"

    client.post("/api/portfolio/holdings", headers=user["headers"], json={"symbol": sym_fail, "quantity": 5.0, "purchase_price": 100.0, "stop_loss": 90.0})
    client.post("/api/portfolio/holdings", headers=user["headers"], json={"symbol": sym_ok, "quantity": 5.0, "purchase_price": 100.0, "stop_loss": 90.0})

    def buggy_get_stock_data(s):
        if s == sym_fail:
            raise RuntimeError("Upstream Market API 503 Service Unavailable")
        if s == sym_ok:
            return mock_stock_data_builder(symbol=sym_ok, current_price=80.0)
        return mock_stock_data_builder(symbol=s)

    monkeypatch.setattr("app.services.monitor.get_stock_data", buggy_get_stock_data)

    cycle_res = await run_portfolio_monitoring_cycle()
    assert cycle_res["alerts_generated"] >= 1

    # sym_ok alert was generated despite sym_fail error
    async with get_background_session() as session:
        evt_res = await session.execute(select(AlertEvent).where(AlertEvent.user_id == user["id"], AlertEvent.symbol == sym_ok))
        assert evt_res.scalar_one_or_none() is not None

def test_alerts_api_endpoints_flow(client, make_user, monkeypatch, mock_stock_data_builder):
    """Validates /api/alerts/evaluate, GET /api/alerts, POST /api/alerts/{id}/dismiss, and GET /api/alerts/sell-signals."""
    user = make_user()
    sym = f"FLOW_{uuid.uuid4().hex[:4].upper()}"

    client.post("/api/portfolio/holdings", headers=user["headers"], json={
        "symbol": sym,
        "quantity": 10.0,
        "purchase_price": 100.0,
        "stop_loss": 90.0
    })

    quote = mock_stock_data_builder(symbol=sym, current_price=82.0)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))
    monkeypatch.setattr("app.api.alerts.get_stock_data", lambda s: quote if s == sym else mock_stock_data_builder(symbol=s))

    # 1. Trigger evaluation via endpoint
    eval_resp = client.post("/api/alerts/evaluate")
    assert eval_resp.status_code == 200
    assert "alerts_generated" in eval_resp.json()

    # 2. Get alerts list
    alerts_resp = client.get("/api/alerts", headers=user["headers"])
    assert alerts_resp.status_code == 200
    alerts = alerts_resp.json()
    assert len(alerts) >= 1
    target_alert = next((a for a in alerts if a["symbol"] == sym), alerts[0])
    alert_id = target_alert["id"]

    # 3. Dismiss alert
    dismiss_resp = client.post(f"/api/alerts/{alert_id}/dismiss", headers=user["headers"])
    assert dismiss_resp.status_code == 200
    assert dismiss_resp.json()["status"] == "success"

    # 4. Sell signals
    signals_resp = client.get("/api/alerts/sell-signals", headers=user["headers"])
    assert signals_resp.status_code == 200
    signals = signals_resp.json()
    assert len(signals) >= 1
    assert "signal" in signals[0]

def test_lifespan_starts_and_cancels_monitor_task_cleanly():
    """Application lifespan context creates background monitor task on startup and cancels it cleanly on shutdown."""
    from fastapi.testclient import TestClient
    from app.main import app
    import app.main as main_mod

    created_tasks = []
    orig_create_task = asyncio.create_task

    def tracked_create_task(coro, **kwargs):
        task = orig_create_task(coro, **kwargs)
        created_tasks.append(task)
        return task

    main_mod.asyncio.create_task = tracked_create_task
    try:
        with TestClient(app):
            assert len(created_tasks) >= 1
            monitor_task = created_tasks[-1]
            assert not monitor_task.done()

        # Context exited: task should now be cancelled or done
        assert monitor_task.done()
    finally:
        main_mod.asyncio.create_task = orig_create_task
