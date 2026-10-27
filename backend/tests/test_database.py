import pytest
import uuid
import os
import sys
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import db_manager, get_background_session
from app.database.models import (
    User,
    UserSettings,
    Portfolio,
    Holding,
    Transaction,
    AlertRule,
    AlertEvent,
    VoiceLog
)
from app.api.auth import hash_password, verify_password, create_access_token

@pytest.fixture(autouse=True)
async def ensure_db():
    """Ensure database connection is initialized before running tests."""
    await db_manager.connect()
    yield
    # Cleanup handled on shutdown

@pytest.mark.anyio
async def test_database_connection_and_health():
    """Validates database connection and liveness check."""
    health = await db_manager.check_health()
    assert health["status"] == "healthy"
    assert db_manager.is_connected is True

@pytest.mark.anyio
async def test_user_registration_and_password_hashing():
    """Validates user creation with deterministic secure SHA-256 password hash."""
    test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    raw_pass = "SecurePass2026!"
    hashed = hash_password(raw_pass)

    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

    async with get_background_session() as session:
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            name="Test User",
            email=test_email,
            password_hash=hashed,
            phone="+14155559999",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(user)
        await session.flush()

        # Query back
        res = await session.execute(select(User).where(User.id == user_id))
        fetched = res.scalar_one_or_none()
        assert fetched is not None
        assert fetched.email == test_email
        assert fetched.password_hash == hashed
        assert fetched.to_dict()["id"] == user_id

@pytest.mark.anyio
async def test_duplicate_user_email_rejection():
    """Ensures unique constraint on user email enforces integrity."""
    unique_email = f"unique_{uuid.uuid4().hex[:8]}@example.com"
    async with get_background_session() as session:
        u1 = User(
            id=str(uuid.uuid4()),
            name="User One",
            email=unique_email,
            password_hash="hash1",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(u1)
        await session.flush()

        u2 = User(
            id=str(uuid.uuid4()),
            name="User Two",
            email=unique_email,
            password_hash="hash2",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(u2)
        with pytest.raises(Exception):
            await session.flush()
        await session.rollback()

@pytest.mark.anyio
async def test_portfolio_crud_and_holdings():
    """Validates full CRUD on portfolio and holdings with numeric precision."""
    async with get_background_session() as session:
        user_id = str(uuid.uuid4())
        session.add(User(
            id=user_id,
            name="Portfolio Trader",
            email=f"trader_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="hash",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        ))
        await session.flush()

        # 1. Create Portfolio
        port_id = str(uuid.uuid4())
        portfolio = Portfolio(
            id=port_id,
            user_id=user_id,
            name="Tactical Growth Portfolio",
            benchmark="^NSEI",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(portfolio)
        await session.flush()

        # 2. Add Holding
        holding_id = str(uuid.uuid4())
        holding = Holding(
            id=holding_id,
            user_id=user_id,
            portfolio_id=port_id,
            symbol="NVDA",
            company_name="NVIDIA Corp",
            sector="Semiconductors",
            quantity=15.0,
            purchase_price=120.50,
            purchase_date="2026-05-01",
            stop_loss=110.00,
            target_price=160.00,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(holding)
        await session.flush()

        # 3. Update Holding
        holding.quantity = 25.0
        holding.stop_loss = 115.00
        await session.flush()

        res = await session.execute(select(Holding).where(Holding.id == holding_id))
        updated_h = res.scalar_one_or_none()
        assert updated_h.quantity == 25.0
        assert updated_h.stop_loss == 115.00

        # 4. Delete Holding
        await session.delete(updated_h)
        await session.flush()

        del_res = await session.execute(select(Holding).where(Holding.id == holding_id))
        assert del_res.scalar_one_or_none() is None

@pytest.mark.anyio
async def test_transactions_persistence():
    """Validates transaction creation, amounts, and user association."""
    async with get_background_session() as session:
        user_id = str(uuid.uuid4())
        port_id = str(uuid.uuid4())
        session.add(User(
            id=user_id,
            name="Tx User",
            email=f"tx_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="hash",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        ))
        session.add(Portfolio(
            id=port_id,
            user_id=user_id,
            name="Tx Portfolio",
            benchmark="^NSEI",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        ))
        await session.flush()

        tx = Transaction(
            id=str(uuid.uuid4()),
            user_id=user_id,
            portfolio_id=port_id,
            symbol="RELIANCE.NS",
            type="BUY",
            quantity=10.0,
            price=220.0,
            total_amount=2200.0,
            date="2026-06-01",
            notes="Initial buy",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(tx)
        await session.flush()

        res = await session.execute(select(Transaction).where(Transaction.user_id == user_id))
        fetched_tx = res.scalar_one_or_none()
        assert fetched_tx is not None
        assert fetched_tx.total_amount == 2200.0
        assert fetched_tx.type == "BUY"

@pytest.mark.anyio
async def test_user_settings_persistence():
    """Validates user preferences and configuration persistence."""
    async with get_background_session() as session:
        user_id = str(uuid.uuid4())
        session.add(User(
            id=user_id,
            name="Settings User",
            email=f"settings_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="hash",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        ))
        await session.flush()

        settings_obj = UserSettings(
            id=str(uuid.uuid4()),
            user_id=user_id,
            risk_tolerance="Aggressive",
            default_stop_loss_pct=5.0,
            default_target_pct=25.0,
            voice_calls_enabled=True,
            phone_number="+14155550000",
            voice_consent_given=True,
            cooldown_period_minutes=45,
            email_notifications_enabled=True,
            in_app_notifications_enabled=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(settings_obj)
        await session.flush()

        res = await session.execute(select(UserSettings).where(UserSettings.user_id == user_id))
        s = res.scalar_one_or_none()
        assert s is not None
        assert s.risk_tolerance == "Aggressive"
        assert s.cooldown_period_minutes == 45
        assert s.voice_calls_enabled is True

@pytest.mark.anyio
async def test_alerts_creation_and_rules():
    """Validates alert rule creation, event logging, and status dismissal."""
    async with get_background_session() as session:
        user_id = str(uuid.uuid4())
        session.add(User(
            id=user_id,
            name="Alerts User",
            email=f"alert_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="hash",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        ))
        await session.flush()

        # Rule
        rule = AlertRule(
            id=str(uuid.uuid4()),
            user_id=user_id,
            symbol="TSLA",
            company_name="Tesla Inc.",
            rule_type="STOP_LOSS",
            threshold=180.0,
            condition="LESS_THAN",
            is_active=True,
            enable_voice_call=True,
            enable_email=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(rule)

        # Event
        event_id = str(uuid.uuid4())
        event = AlertEvent(
            id=event_id,
            user_id=user_id,
            symbol="TSLA",
            company_name="Tesla Inc.",
            alert_type="STOP_LOSS_BREACH",
            severity="CRITICAL",
            triggered_condition="Price fell below $180.00",
            trigger_price=180.0,
            current_price=175.50,
            supporting_evidence="High volume selloff",
            suggested_action="Review Sell",
            is_read=False,
            voice_notified=True,
            timestamp=datetime.now(timezone.utc).isoformat(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(event)
        await session.flush()

        # Dismiss event
        event.is_read = True
        await session.flush()

        res = await session.execute(select(AlertEvent).where(AlertEvent.id == event_id))
        dismissed = res.scalar_one_or_none()
        assert dismissed.is_read is True

@pytest.mark.anyio
async def test_user_data_isolation():
    """Verifies strict isolation between User A and User B records."""
    async with get_background_session() as session:
        user_a_id = str(uuid.uuid4())
        user_b_id = str(uuid.uuid4())

        session.add(User(id=user_a_id, name="User A", email=f"a_{uuid.uuid4().hex[:6]}@example.com", password_hash="h", created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc)))
        session.add(User(id=user_b_id, name="User B", email=f"b_{uuid.uuid4().hex[:6]}@example.com", password_hash="h", created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc)))
        
        p_a = Portfolio(id=str(uuid.uuid4()), user_id=user_a_id, name="Portfolio A", created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
        p_b = Portfolio(id=str(uuid.uuid4()), user_id=user_b_id, name="Portfolio B", created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
        session.add_all([p_a, p_b])
        await session.flush()

        # Query User A portfolios
        res_a = await session.execute(select(Portfolio).where(Portfolio.user_id == user_a_id))
        ports_a = res_a.scalars().all()
        assert len(ports_a) == 1
        assert ports_a[0].name == "Portfolio A"

        # User A cannot see Portfolio B
        res_cross = await session.execute(select(Portfolio).where(Portfolio.id == p_b.id, Portfolio.user_id == user_a_id))
        assert res_cross.scalar_one_or_none() is None

@pytest.mark.anyio
async def test_foreign_key_cascading_deletes():
    """Validates that deleting a user cascades and deletes all associated portfolios, holdings, and settings."""
    async with get_background_session() as session:
        u_id = str(uuid.uuid4())
        p_id = str(uuid.uuid4())
        h_id = str(uuid.uuid4())

        user = User(id=u_id, name="Cascade User", email=f"cascade_{uuid.uuid4().hex[:6]}@example.com", password_hash="h", created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
        port = Portfolio(id=p_id, user_id=u_id, name="Cascade Port", created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
        holding = Holding(id=h_id, user_id=u_id, portfolio_id=p_id, symbol="RELIANCE.NS", quantity=10, purchase_price=150, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
        
        session.add_all([user, port, holding])
        await session.flush()

        # Delete user
        await session.delete(user)
        await session.flush()

        # Verify portfolio and holding cascaded
        res_p = await session.execute(select(Portfolio).where(Portfolio.id == p_id))
        assert res_p.scalar_one_or_none() is None

        res_h = await session.execute(select(Holding).where(Holding.id == h_id))
        assert res_h.scalar_one_or_none() is None

@pytest.mark.anyio
async def test_database_rollback_on_error():
    """Validates transaction rollback on error ensures no partial/corrupted records persist."""
    async with get_background_session() as session:
        initial_count_res = await session.execute(select(func.count(User.id)))
        initial_count = initial_count_res.scalar()

        try:
            async with session.begin_nested():
                u_bad = User(
                    id=str(uuid.uuid4()),
                    name="Will Fail",
                    email="valid_email@example.com",
                    password_hash="hash",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                session.add(u_bad)
                # Intentionally trigger an error
                raise ValueError("Simulated unexpected failure")
        except ValueError:
            pass

        after_count_res = await session.execute(select(func.count(User.id)))
        assert after_count_res.scalar() == initial_count
