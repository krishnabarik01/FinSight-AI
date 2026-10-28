import uuid
import pytest
from sqlalchemy import select

from app.database.connection import get_background_session
from app.database.models import User, Holding, AlertRule
from app.api.auth import verify_password

def test_valid_registration_and_get_me(client):
    """Valid user registration returns an access token, and /api/auth/me returns the correct user profile."""
    email = f"auth_valid_{uuid.uuid4().hex[:10]}@finsight.ai"
    reg_resp = client.post("/api/auth/register", json={
        "name": "Alice Morgan",
        "email": email,
        "password": "SecurePassword2026!",
        "phone": "+14155551001"
    })
    assert reg_resp.status_code == 200
    token_data = reg_resp.json()
    assert "access_token" in token_data
    assert token_data["token_type"].lower() == "bearer"
    assert token_data["user"]["email"] == email

    headers = {"Authorization": f"Bearer {token_data['access_token']}"}
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["id"] == token_data["user"]["id"]
    assert me_data["email"] == email
    assert me_data["name"] == "Alice Morgan"

def test_duplicate_email_registration_rejected(client, make_user):
    """Attempting to register with an already registered email address is rejected with 400 Bad Request."""
    user = make_user()
    duplicate_resp = client.post("/api/auth/register", json={
        "name": "Imposter User",
        "email": user["email"],
        "password": "AnotherPassword123!",
        "phone": "+14155559999"
    })
    assert duplicate_resp.status_code == 400
    assert "already exists" in duplicate_resp.json()["detail"].lower()

@pytest.mark.parametrize("invalid_email", [
    "notanemail",
    "missingat.com",
    "@nodomain.com",
    "spaces in@email.com",
])
def test_invalid_email_format_rejected(client, invalid_email):
    """Registration with malformed email addresses is rejected with 422 Unprocessable Entity."""
    resp = client.post("/api/auth/register", json={
        "name": "Invalid Email User",
        "email": invalid_email,
        "password": "ValidPassword123!"
    })
    assert resp.status_code == 422

@pytest.mark.parametrize("weak_password", [
    "",
    "123",
    "short",
])
def test_weak_or_empty_password_rejected(client, weak_password):
    """Registration with empty or short passwords (<6 chars) is rejected with 422 Unprocessable Entity."""
    email = f"pwd_{uuid.uuid4().hex[:8]}@finsight.ai"
    resp = client.post("/api/auth/register", json={
        "name": "Weak Pwd User",
        "email": email,
        "password": weak_password
    })
    assert resp.status_code == 422

def test_login_success_with_valid_credentials(client, make_user):
    """Login succeeds when valid email and password are provided, returning bearer token."""
    user = make_user(password="MySecret2026!")
    login_resp = client.post("/api/auth/login", json={
        "email": user["email"],
        "password": "MySecret2026!"
    })
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == user["email"]

def test_login_with_wrong_password_returns_401(client, make_user):
    """Login with an incorrect password should return 401 Unauthorized."""
    user = make_user(password="CorrectPass123!")
    login_resp = client.post("/api/auth/login", json={
        "email": user["email"],
        "password": "WrongPassword999!"
    })
    assert login_resp.status_code == 401

def test_login_with_unknown_email_returns_401(client):
    """Login with an unregistered email address should return 401 Unauthorized."""
    login_resp = client.post("/api/auth/login", json={
        "email": f"unknown_{uuid.uuid4().hex[:10]}@finsight.ai",
        "password": "AnyPassword123!"
    })
    assert login_resp.status_code == 401

def test_get_me_with_invalid_token_returns_401(client):
    """Accessing /api/auth/me with a corrupted or forged token returns 401 Unauthorized."""
    bad_headers = {"Authorization": "Bearer forged.invalid.token"}
    resp = client.get("/api/auth/me", headers=bad_headers)
    assert resp.status_code == 401

def test_get_me_with_bearer_undefined_returns_401(client):
    """Accessing /api/auth/me with 'Bearer undefined' header must return 401 Unauthorized rather than 500."""
    bad_headers = {"Authorization": "Bearer undefined"}
    resp = client.get("/api/auth/me", headers=bad_headers)
    assert resp.status_code == 401

def test_get_me_without_token_returns_401(client):
    """Accessing /api/auth/me without an authorization header must return 401 Unauthorized."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401

def test_cors_headers_for_render_origin(client):
    """Preflight and requests from Render deployment origins should receive valid CORS headers."""
    headers = {
        "Origin": "https://finsight-ai-1-n7mt.onrender.com",
        "Access-Control-Request-Method": "GET",
    }
    resp = client.options("/api/health", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://finsight-ai-1-n7mt.onrender.com"

def test_cors_headers_for_vercel_origin(client):
    """Preflight and requests from Vercel deployment origins should receive valid CORS headers."""
    headers = {
        "Origin": "https://finsight-ai.vercel.app",
        "Access-Control-Request-Method": "GET",
    }
    resp = client.options("/api/health", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://finsight-ai.vercel.app"


@pytest.mark.anyio
async def test_password_hash_not_stored_in_plain_text(client, make_user):
    """Direct database query verifies password is never stored in plain text and uses SHA-256 hash."""
    plain_pass = "SuperSecretPlainTextPassword123!"
    user = make_user(password=plain_pass)

    async with get_background_session() as session:
        result = await session.execute(select(User).where(User.id == user["id"]))
        db_user = result.scalar_one_or_none()
        assert db_user is not None
        assert db_user.password_hash != plain_pass
        assert plain_pass not in db_user.password_hash
        assert db_user.password_hash.startswith("$2b$")
        assert len(db_user.password_hash) == 60
        assert verify_password(plain_pass, db_user.password_hash) is True

def test_user_data_isolation_between_accounts(client, make_user):
    """Holdings, transactions, alert rules, and settings for User A never appear in User B queries."""
    user_a = make_user(name="User Alpha")
    user_b = make_user(name="User Beta")

    # User A creates a holding
    add_h_resp = client.post("/api/portfolio/holdings", headers=user_a["headers"], json={
        "symbol": "RELIANCE.NS",
        "quantity": 25.0,
        "purchase_price": 2840.0,
        "stop_loss": 2700.0,
        "target_price": 3200.0
    })
    assert add_h_resp.status_code == 200
    holding_a_id = add_h_resp.json()["id"]

    # User A creates an alert rule
    add_r_resp = client.post("/api/alerts/rules", headers=user_a["headers"], json={
        "symbol": "RELIANCE.NS",
        "rule_type": "STOP_LOSS",
        "threshold": 2700.0,
        "condition": "LESS_THAN"
    })
    assert add_r_resp.status_code == 200
    rule_a_id = add_r_resp.json()["id"]

    # User A updates settings
    client.put("/api/settings", headers=user_a["headers"], json={
        "risk_tolerance": "Aggressive",
        "default_stop_loss_pct": 12.0
    })

    # Verify User B cannot see User A's data
    b_portfolio = client.get("/api/portfolio", headers=user_b["headers"]).json()
    b_holding_ids = [h["id"] for h in b_portfolio.get("holdings", [])]
    assert holding_a_id not in b_holding_ids

    b_transactions = client.get("/api/portfolio/transactions", headers=user_b["headers"]).json()
    assert len(b_transactions) == 0

    b_rules = client.get("/api/alerts/rules", headers=user_b["headers"]).json()
    b_rule_ids = [r["id"] for r in b_rules]
    assert rule_a_id not in b_rule_ids

    b_settings = client.get("/api/settings", headers=user_b["headers"]).json()
    assert b_settings["risk_tolerance"] != "Aggressive"
    assert b_settings["default_stop_loss_pct"] != 12.0

def test_cross_user_holding_update_forbidden(client, make_user):
    """User B attempting to PUT User A's holding ID receives 403 or 404, leaving A's data unchanged."""
    user_a = make_user(name="Owner A")
    user_b = make_user(name="Attacker B")

    add_resp = client.post("/api/portfolio/holdings", headers=user_a["headers"], json={
        "symbol": "TCS.NS",
        "quantity": 10.0,
        "purchase_price": 3900.0,
        "stop_loss": 3700.0
    })
    assert add_resp.status_code == 200
    holding_id = add_resp.json()["id"]

    # B attempts to tamper with A's holding
    put_resp = client.put(f"/api/portfolio/holdings/{holding_id}", headers=user_b["headers"], json={
        "quantity": 999.0,
        "stop_loss": 50.0
    })
    assert put_resp.status_code in [403, 404]

    # Verify A's holding is completely unmodified
    a_portfolio = client.get("/api/portfolio", headers=user_a["headers"]).json()
    a_holding = next(h for h in a_portfolio["holdings"] if h["id"] == holding_id)
    assert a_holding["quantity"] == 10.0
    assert a_holding["stop_loss"] == 3700.0

def test_cross_user_holding_delete_forbidden(client, make_user):
    """User B attempting to DELETE User A's holding ID receives 403 or 404, leaving A's data unchanged."""
    user_a = make_user(name="Owner A")
    user_b = make_user(name="Attacker B")

    add_resp = client.post("/api/portfolio/holdings", headers=user_a["headers"], json={
        "symbol": "INFY.NS",
        "quantity": 15.0,
        "purchase_price": 1820.0
    })
    assert add_resp.status_code == 200
    holding_id = add_resp.json()["id"]

    # B attempts to delete A's holding
    del_resp = client.delete(f"/api/portfolio/holdings/{holding_id}", headers=user_b["headers"])
    assert del_resp.status_code in [403, 404]

    # Verify A's holding still exists
    a_portfolio = client.get("/api/portfolio", headers=user_a["headers"]).json()
    assert any(h["id"] == holding_id for h in a_portfolio["holdings"])

def test_cross_user_alert_rule_delete_forbidden(client, make_user):
    """User B attempting to DELETE User A's alert rule ID receives 403 or 404, leaving A's rule intact."""
    user_a = make_user(name="Owner A")
    user_b = make_user(name="Attacker B")

    add_rule_resp = client.post("/api/alerts/rules", headers=user_a["headers"], json={
        "symbol": "HDFCBANK.NS",
        "rule_type": "TARGET_PRICE",
        "threshold": 1800.0,
        "condition": "GREATER_THAN"
    })
    assert add_rule_resp.status_code == 200
    rule_id = add_rule_resp.json()["id"]

    # B attempts to delete A's rule
    del_resp = client.delete(f"/api/alerts/rules/{rule_id}", headers=user_b["headers"])
    assert del_resp.status_code in [403, 404]

    # Verify A's rule still exists in database
    a_rules = client.get("/api/alerts/rules", headers=user_a["headers"]).json()
    assert any(r["id"] == rule_id for r in a_rules)

def test_login_response_schema_contains_access_token_and_token(client, make_user):
    """Login response must include access_token, token alias, token_type, and user object."""
    user = make_user(password="ValidSecure2026!")
    resp = client.post("/api/auth/login", json={
        "email": user["email"],
        "password": "ValidSecure2026!"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data and isinstance(data["access_token"], str) and len(data["access_token"]) > 20
    assert "token" in data and data["token"] == data["access_token"]
    assert data.get("token_type") == "bearer"
    assert "user" in data and isinstance(data["user"], dict)
    assert data["user"]["email"] == user["email"]
    assert "id" in data["user"]

def test_registration_response_schema_contains_access_token_and_token(client):
    """Registration response must include access_token, token alias, token_type, and user object."""
    email = f"reg_schema_{uuid.uuid4().hex[:8]}@finsight.ai"
    resp = client.post("/api/auth/register", json={
        "name": "Schema User",
        "email": email,
        "password": "ValidSecure2026!",
        "phone": "+14155552671"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data and len(data["access_token"]) > 20
    assert "token" in data and data["token"] == data["access_token"]
    assert data.get("token_type") == "bearer"
    assert data["user"]["email"] == email

def test_authenticated_me_using_login_token(client, make_user):
    """Subsequent requests using 'Authorization: Bearer <access_token>' to /api/auth/me succeed."""
    user = make_user(password="ValidSecure2026!")
    login_resp = client.post("/api/auth/login", json={
        "email": user["email"],
        "password": "ValidSecure2026!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == user["email"]
    assert me_data["id"] == user["id"]

def test_demo_user_login_flow(client):
    """Demo user demo@finsight.ai can log in or register and receive an access token."""
    login_resp = client.post("/api/auth/login", json={
        "email": "demo@finsight.ai",
        "password": "password123"
    })
    if login_resp.status_code == 401:
        reg_resp = client.post("/api/auth/register", json={
            "name": "Alex Mercer",
            "email": "demo@finsight.ai",
            "password": "password123",
            "phone": "+14155552671"
        })
        assert reg_resp.status_code == 200
        token = reg_resp.json().get("access_token")
    else:
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
    assert token is not None and len(token) > 20

