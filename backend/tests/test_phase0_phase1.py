import pytest
from app.config import Settings
from app.api.auth import hash_password, verify_password, is_legacy_hash
from app.database.models import User
from app.database.connection import get_background_session
from fastapi.testclient import TestClient
from app.main import app
import hashlib

def test_config_refuses_prod_without_secret_key():
    with pytest.raises(ValueError, match="SECURITY ERROR"):
        Settings(APP_ENV="prod", SECRET_KEY="")

def test_config_refuses_prod_without_database_url():
    prod_settings = Settings(APP_ENV="prod", SECRET_KEY="valid-secret-for-production-mode")
    with pytest.raises(ValueError, match="CRITICAL: Production DATABASE_URL missing"):
        prod_settings.get_async_database_url()

def test_health_reports_active_database_type():
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "active_database_type" in data
    assert data["active_database_type"] in ("sqlite", "postgresql")
    assert data["environment"] == "dev"

@pytest.mark.anyio
async def test_legacy_sha256_password_migration(client, make_user):
    from app.config import settings
    plain_password = "LegacyPasswordToMigrate123!"
    salt = settings.SECRET_KEY[:16]
    legacy_sha256 = hashlib.sha256(f"{salt}{plain_password}".encode("utf-8")).hexdigest()
    
    # Verify is_legacy_hash detects it
    assert is_legacy_hash(legacy_sha256) is True
    
    # Create user with legacy hash
    user_info = make_user(password="Temporary123!")
    async with get_background_session() as session:
        from sqlalchemy import select
        res = await session.execute(select(User).where(User.id == user_info["id"]))
        user = res.scalar_one()
        user.password_hash = legacy_sha256
        await session.commit()
    
    # Login with plain password should succeed via backward compatibility
    login_resp = client.post("/api/auth/login", json={
        "email": user_info["email"],
        "password": plain_password
    })
    assert login_resp.status_code == 200
    
    # Verify password hash was automatically re-hashed to bcrypt
    async with get_background_session() as session:
        res = await session.execute(select(User).where(User.id == user_info["id"]))
        updated_user = res.scalar_one()
        assert updated_user.password_hash.startswith("$2b$")
        assert len(updated_user.password_hash) == 60
        assert verify_password(plain_password, updated_user.password_hash) is True
