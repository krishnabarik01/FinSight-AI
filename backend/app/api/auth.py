import uuid
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt
import hashlib

from app.config import settings
from app.models.schemas import UserRegister, UserLogin, UserOut, Token
from app.database.connection import get_db_session, get_background_session
from app.database.models import User, UserSettings, Portfolio, Holding

router = APIRouter(prefix="/api/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

import bcrypt

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def is_legacy_hash(hashed: str) -> bool:
    """Returns True if the hash is a legacy 64-character SHA-256 hex string."""
    return len(hashed) == 64 and all(c in "0123456789abcdefABCDEF" for c in hashed)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against bcrypt hash, falling back to legacy SHA-256."""
    if not hashed_password:
        return False
    if hashed_password.startswith(("$2b$", "$2a$", "$2y$")):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False
    if is_legacy_hash(hashed_password):
        salt = (settings.SECRET_KEY or "finsight_ai_super_secret_jwt_key_2026_financial_platform_sec")[:16]
        legacy_hash = hashlib.sha256(f"{salt}{plain_password}".encode("utf-8")).hexdigest()
        return legacy_hash == hashed_password
    return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db_session)
) -> UserOut:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token subject")
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        created_at=user.created_at.isoformat() if isinstance(user.created_at, datetime) else str(user.created_at)
    )

@router.post("/register", response_model=Token)
async def register(req: UserRegister, db: AsyncSession = Depends(get_db_session)):
    clean_email = req.email.lower().strip()
    res = await db.execute(select(User).where(User.email == clean_email))
    existing = res.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user_id = str(uuid.uuid4())
    now_dt = datetime.now(timezone.utc)
    
    new_user = User(
        id=user_id,
        name=req.name.strip(),
        email=clean_email,
        password_hash=hash_password(req.password),
        phone=req.phone.strip() if req.phone else None,
        created_at=now_dt,
        updated_at=now_dt
    )
    db.add(new_user)

    # Initialize default user settings
    default_settings = UserSettings(
        id=str(uuid.uuid4()),
        user_id=user_id,
        risk_tolerance="Moderate",
        default_stop_loss_pct=7.0,
        default_target_pct=15.0,
        voice_calls_enabled=False,
        phone_number=req.phone.strip() if req.phone else None,
        voice_consent_given=False,
        quiet_hours_enabled=False,
        quiet_hours_start="22:00",
        quiet_hours_end="08:00",
        cooldown_period_minutes=30,
        email_notifications_enabled=True,
        in_app_notifications_enabled=True,
        twilio_account_sid="",
        twilio_auth_token="",
        twilio_from_phone="",
        created_at=now_dt,
        updated_at=now_dt
    )
    db.add(default_settings)

    # Create default Main Portfolio
    portfolio_id = str(uuid.uuid4())
    default_portfolio = Portfolio(
        id=portfolio_id,
        user_id=user_id,
        name="Main Growth Portfolio",
        description="Primary equity holdings and strategic core investments",
        benchmark="^NSEI",
        created_at=now_dt,
        updated_at=now_dt
    )
    db.add(default_portfolio)
    await db.flush()

    token = create_access_token({"sub": user_id})
    user_out = UserOut(
        id=user_id,
        name=new_user.name,
        email=new_user.email,
        phone=new_user.phone,
        created_at=new_user.created_at.isoformat()
    )
    return Token(access_token=token, user=user_out)

@router.post("/login", response_model=Token)
async def login(req: UserLogin, db: AsyncSession = Depends(get_db_session)):
    clean_email = req.email.lower().strip()
    res = await db.execute(select(User).where(User.email == clean_email))
    user = res.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Re-hash legacy password to bcrypt on successful login
    if is_legacy_hash(user.password_hash):
        user.password_hash = hash_password(req.password)
        db.add(user)
        await db.commit()

    token = create_access_token({"sub": user.id})
    user_out = UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        created_at=user.created_at.isoformat() if isinstance(user.created_at, datetime) else str(user.created_at)
    )
    return Token(access_token=token, user=user_out)

@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    return current_user

async def seed_demo_user():
    """Ensure a rich demo user with realistic holdings is present for instant exploration."""
    async with get_background_session() as session:
        res = await session.execute(select(User).where(User.email == "demo@finsight.ai"))
        demo_user = res.scalar_one_or_none()
        if not demo_user:
            demo_id = "demo-user-finsight-2026"
            now_dt = datetime.now(timezone.utc)
            demo_user = User(
                id=demo_id,
                name="Alex Mercer",
                email="demo@finsight.ai",
                password_hash=hash_password("password123"),
                phone="+14155552671",
                created_at=now_dt,
                updated_at=now_dt
            )
            session.add(demo_user)

            p_id = "demo-portfolio-1"
            demo_portfolio = Portfolio(
                id=p_id,
                user_id=demo_id,
                name="Alpha Growth Portfolio",
                description="Diversified multi-asset equities focused on AI infrastructure & Indian growth leaders",
                benchmark="^NSEI",
                created_at=now_dt,
                updated_at=now_dt
            )
            session.add(demo_portfolio)

            demo_holdings_data = [
                {
                    "symbol": "INFY.NS",
                    "company_name": "Infosys Limited",
                    "sector": "Information Technology",
                    "quantity": 45.0,
                    "purchase_price": 1820.00,
                    "purchase_date": "2026-03-12",
                    "stop_loss": 1720.00,
                    "target_price": 2100.00,
                    "notes": "Core IT exporter position with digital transformation monetization."
                },
                {
                    "symbol": "HDFCBANK.NS",
                    "company_name": "HDFC Bank Limited",
                    "sector": "Banking & Financial Services",
                    "quantity": 60.0,
                    "purchase_price": 1640.00,
                    "purchase_date": "2026-04-18",
                    "stop_loss": 1550.00,
                    "target_price": 1850.00,
                    "notes": "Private sector banking leader benefiting from credit expansion."
                },
                {
                    "symbol": "RELIANCE.NS",
                    "company_name": "Reliance Industries Limited",
                    "sector": "Energy & Telecom",
                    "quantity": 50.0,
                    "purchase_price": 2840.00,
                    "purchase_date": "2026-02-10",
                    "stop_loss": 2700.00,
                    "target_price": 3400.00,
                    "notes": "India conglomerate with retail, 5G, and green energy tailwinds."
                },
                {
                    "symbol": "TCS.NS",
                    "company_name": "Tata Consultancy Services Ltd",
                    "sector": "Technology",
                    "quantity": 30.0,
                    "purchase_price": 3890.00,
                    "purchase_date": "2026-05-02",
                    "stop_loss": 3650.00,
                    "target_price": 4500.00,
                    "notes": "High return on equity cash-cow IT exporter."
                },
                {
                    "symbol": "ICICIBANK.NS",
                    "company_name": "ICICI Bank Limited",
                    "sector": "Banking & Financial Services",
                    "quantity": 55.0,
                    "purchase_price": 1210.00,
                    "purchase_date": "2026-06-15",
                    "stop_loss": 1150.00,
                    "target_price": 1380.00,
                    "notes": "Strong NIM expansion and asset quality metrics."
                }
            ]
            for h in demo_holdings_data:
                session.add(Holding(
                    id=str(uuid.uuid4()),
                    user_id=demo_id,
                    portfolio_id=p_id,
                    symbol=h["symbol"],
                    company_name=h["company_name"],
                    sector=h["sector"],
                    quantity=h["quantity"],
                    purchase_price=h["purchase_price"],
                    purchase_date=h["purchase_date"],
                    stop_loss=h["stop_loss"],
                    target_price=h["target_price"],
                    notes=h["notes"],
                    created_at=now_dt,
                    updated_at=now_dt
                ))

            demo_settings = UserSettings(
                id=str(uuid.uuid4()),
                user_id=demo_id,
                risk_tolerance="Moderate",
                default_stop_loss_pct=7.0,
                default_target_pct=18.0,
                voice_calls_enabled=True,
                phone_number="+14155552671",
                voice_consent_given=True,
                quiet_hours_enabled=False,
                quiet_hours_start="22:00",
                quiet_hours_end="08:00",
                cooldown_period_minutes=30,
                email_notifications_enabled=True,
                in_app_notifications_enabled=True,
                twilio_account_sid="",
                twilio_auth_token="",
                twilio_from_phone="",
                created_at=now_dt,
                updated_at=now_dt
            )
            session.add(demo_settings)
            await session.commit()
