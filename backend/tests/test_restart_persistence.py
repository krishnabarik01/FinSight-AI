import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func

from app.main import app
from app.database.connection import db_manager, get_background_session
from app.database.models import User, Holding, Transaction, AlertRule, AlertEvent, UserSettings, Base
from app.services.monitor import run_portfolio_monitoring_cycle

@pytest.mark.anyio
async def test_full_portfolio_and_alerts_survive_application_restart(client, make_user, monkeypatch, mock_stock_data_builder):
    """
    Verifies that all entity data (User, Holding, Transaction, AlertRule, UserSettings, AlertEvent)
    fully survives an application restart / disconnection cycle against the SQLite file.
    """
    # 1. Register a user
    user_email = f"restart_{uuid.uuid4().hex[:10]}@finsight-test.ai"
    raw_pass = "DurablePassword2026!"
    reg_resp = client.post("/api/auth/register", json={
        "name": "Durable Investor",
        "email": user_email,
        "password": raw_pass,
        "phone": "+14155554321"
    })
    assert reg_resp.status_code == 200
    token1 = reg_resp.json()["access_token"]
    user_id = reg_resp.json()["user"]["id"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 2. Add holding
    add_h_resp = client.post("/api/portfolio/holdings", headers=headers1, json={
        "symbol": "RELIANCE.NS",
        "company_name": "Reliance Industries Limited",
        "quantity": 25.0,
        "purchase_price": 2840.0,
        "stop_loss": 2700.0,
        "target_price": 3200.0,
        "notes": "Pre-restart core position"
    })
    assert add_h_resp.status_code == 200
    holding_id = add_h_resp.json()["id"]

    # 3. Retrieve recorded transaction ID
    txs_resp1 = client.get("/api/portfolio/transactions", headers=headers1)
    assert txs_resp1.status_code == 200
    txs1 = txs_resp1.json()
    assert len(txs1) >= 1
    tx_id = txs1[0]["id"]

    # 4. Create alert rule
    add_r_resp = client.post("/api/alerts/rules", headers=headers1, json={
        "symbol": "RELIANCE.NS",
        "rule_type": "STOP_LOSS",
        "threshold": 2700.0,
        "condition": "LESS_THAN"
    })
    assert add_r_resp.status_code == 200
    rule_id = add_r_resp.json()["id"]

    # 5. Update settings
    put_set_resp = client.put("/api/settings", headers=headers1, json={
        "risk_tolerance": "Aggressive",
        "default_stop_loss_pct": 9.5,
        "voice_calls_enabled": True
    })
    assert put_set_resp.status_code == 200

    # 6. Run monitoring cycle to generate an AlertEvent
    quote_sl = mock_stock_data_builder(symbol="RELIANCE.NS", current_price=2650.0)
    monkeypatch.setattr("app.services.monitor.get_stock_data", lambda s: quote_sl if s == "RELIANCE.NS" else mock_stock_data_builder(symbol=s))
    cycle_res = await run_portfolio_monitoring_cycle()
    assert cycle_res["alerts_generated"] >= 1

    alerts_resp1 = client.get("/api/alerts", headers=headers1)
    assert alerts_resp1.status_code == 200
    event_id = alerts_resp1.json()[0]["id"]

    # -------------------------------------------------------------------------
    # 7. SIMULATE APPLICATION RESTART
    # Disconnect database manager, reset internal engine/pool, and launch new TestClient lifespan
    # -------------------------------------------------------------------------
    await db_manager.disconnect()
    db_manager.engine = None
    db_manager.session_factory = None
    db_manager.is_connected = False

    # Start brand-new client with fresh lifespan execution against the exact same SQLite database
    monkeypatch.setattr("app.config.settings.MONITORING_INTERVAL_SECONDS", 999999)
    with TestClient(app) as client_post_restart:
        # A. Verify login with original credentials succeeds
        login_resp = client_post_restart.post("/api/auth/login", json={
            "email": user_email,
            "password": raw_pass
        })
        assert login_resp.status_code == 200
        new_token = login_resp.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {new_token}"}

        # B. Verify holdings survived with identical ID, attributes and numeric values
        summary2 = client_post_restart.get("/api/portfolio", headers=headers2).json()
        survived_holding = next((h for h in summary2["holdings"] if h["id"] == holding_id), None)
        assert survived_holding is not None
        assert survived_holding["symbol"] == "RELIANCE.NS"
        assert survived_holding["quantity"] == 25.0
        assert survived_holding["purchase_price"] == 2840.0
        assert survived_holding["stop_loss"] == 2700.0
        assert survived_holding["target_price"] == 3200.0

        # C. Verify transactions survived with identical ID
        txs2 = client_post_restart.get("/api/portfolio/transactions", headers=headers2).json()
        assert any(t["id"] == tx_id and t["symbol"] == "RELIANCE.NS" for t in txs2)

        # D. Verify alert rules survived with identical ID
        rules2 = client_post_restart.get("/api/alerts/rules", headers=headers2).json()
        survived_rule = next((r for r in rules2 if r["id"] == rule_id), None)
        assert survived_rule is not None
        assert survived_rule["symbol"] == "RELIANCE.NS"
        assert survived_rule["threshold"] == 2700.0

        # E. Verify user settings survived with identical customized preferences
        settings2 = client_post_restart.get("/api/settings", headers=headers2).json()
        assert settings2["risk_tolerance"] == "Aggressive"
        assert settings2["default_stop_loss_pct"] == 9.5
        assert settings2["voice_calls_enabled"] is True

        # F. Verify monitoring AlertEvent survived restart
        alerts2 = client_post_restart.get("/api/alerts", headers=headers2).json()
        assert any(a["id"] == event_id for a in alerts2)

@pytest.mark.anyio
async def test_metadata_create_all_is_idempotent_and_non_destructive():
    """Validates that running Base.metadata.create_all on an existing database never truncates or alters existing records."""
    test_user_id = str(uuid.uuid4())
    test_email = f"idempotent_{uuid.uuid4().hex[:8]}@finsight.ai"

    # Add a user to database
    async with get_background_session() as session:
        user = User(
            id=test_user_id,
            name="Idempotency Check",
            email=test_email,
            password_hash="hashed_secret_2026",
        )
        session.add(user)
        await session.commit()

    # Re-run Base.metadata.create_all on the active engine
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Confirm user row is intact
    async with get_background_session() as session:
        res = await session.execute(select(User).where(User.id == test_user_id))
        queried_user = res.scalar_one_or_none()
        assert queried_user is not None
        assert queried_user.email == test_email
        assert queried_user.password_hash == "hashed_secret_2026"
