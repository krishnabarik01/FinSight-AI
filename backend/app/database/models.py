import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import (
    Column,
    String,
    Float,
    Integer,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    Index,
    func
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def _generate_uuid() -> str:
    return str(uuid.uuid4())

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    phone = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    investor_profile = relationship("InvestorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    portfolios = relationship("Portfolio", back_populates="user", cascade="all, delete-orphan")
    holdings = relationship("Holding", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    alert_rules = relationship("AlertRule", back_populates="user", cascade="all, delete-orphan")
    alert_events = relationship("AlertEvent", back_populates="user", cascade="all, delete-orphan")
    voice_logs = relationship("VoiceLog", back_populates="user", cascade="all, delete-orphan")
    watchlist_items = relationship("WatchlistItemModel", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "name": self.name,
            "email": self.email,
            "password_hash": self.password_hash,
            "phone": self.phone,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    risk_tolerance = Column(String(50), default="Moderate", nullable=False)
    default_stop_loss_pct = Column(Float, default=7.0, nullable=False)
    default_target_pct = Column(Float, default=15.0, nullable=False)
    voice_calls_enabled = Column(Boolean, default=False, nullable=False)
    phone_number = Column(String(64), nullable=True)
    voice_consent_given = Column(Boolean, default=False, nullable=False)
    quiet_hours_enabled = Column(Boolean, default=False, nullable=False)
    quiet_hours_start = Column(String(10), default="22:00", nullable=False)
    quiet_hours_end = Column(String(10), default="08:00", nullable=False)
    cooldown_period_minutes = Column(Integer, default=30, nullable=False)
    email_notifications_enabled = Column(Boolean, default=True, nullable=False)
    in_app_notifications_enabled = Column(Boolean, default=True, nullable=False)
    twilio_account_sid = Column(String(255), nullable=True, default="")
    twilio_auth_token = Column(String(255), nullable=True, default="")
    twilio_from_phone = Column(String(64), nullable=True, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="settings")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "user_id": self.user_id,
            "risk_tolerance": self.risk_tolerance,
            "default_stop_loss_pct": float(self.default_stop_loss_pct) if self.default_stop_loss_pct is not None else 7.0,
            "default_target_pct": float(self.default_target_pct) if self.default_target_pct is not None else 15.0,
            "voice_calls_enabled": bool(self.voice_calls_enabled),
            "phone_number": self.phone_number,
            "voice_consent_given": bool(self.voice_consent_given),
            "quiet_hours_enabled": bool(self.quiet_hours_enabled),
            "quiet_hours_start": self.quiet_hours_start or "22:00",
            "quiet_hours_end": self.quiet_hours_end or "08:00",
            "cooldown_period_minutes": int(self.cooldown_period_minutes) if self.cooldown_period_minutes is not None else 30,
            "email_notifications_enabled": bool(self.email_notifications_enabled),
            "in_app_notifications_enabled": bool(self.in_app_notifications_enabled),
            "twilio_account_sid": self.twilio_account_sid or "",
            "twilio_auth_token": self.twilio_auth_token or "",
            "twilio_from_phone": self.twilio_from_phone or "",
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    benchmark = Column(String(50), default="^NSEI", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="portfolios")
    holdings = relationship("Holding", back_populates="portfolio", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="portfolio", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description,
            "benchmark": self.benchmark,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class Holding(Base):
    __tablename__ = "holdings"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    portfolio_id = Column(String(64), ForeignKey("portfolios.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), index=True, nullable=False)
    company_name = Column(String(255), nullable=True)
    sector = Column(String(100), default="Technology", nullable=False)
    quantity = Column(Float, nullable=False)
    purchase_price = Column(Float, nullable=False)
    purchase_date = Column(String(50), nullable=True)
    stop_loss = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    asset_type = Column(String(20), default="STOCK", nullable=False)  # STOCK, GOLD, SILVER
    metal_type = Column(String(20), nullable=True)  # GOLD, SILVER
    purity = Column(String(20), nullable=True)      # 24K, 22K, 18K or 999, 925
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="holdings")
    portfolio = relationship("Portfolio", back_populates="holdings")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "user_id": self.user_id,
            "portfolio_id": self.portfolio_id,
            "symbol": self.symbol,
            "company_name": self.company_name,
            "sector": self.sector,
            "quantity": float(self.quantity),
            "purchase_price": float(self.purchase_price),
            "purchase_date": self.purchase_date,
            "stop_loss": float(self.stop_loss) if self.stop_loss is not None else None,
            "target_price": float(self.target_price) if self.target_price is not None else None,
            "notes": self.notes,
            "asset_type": self.asset_type or "STOCK",
            "metal_type": self.metal_type,
            "purity": self.purity,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    portfolio_id = Column(String(64), ForeignKey("portfolios.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), index=True, nullable=False)
    type = Column(String(20), nullable=False)  # BUY, SELL
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    date = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    asset_type = Column(String(20), default="STOCK", nullable=False)  # STOCK, GOLD, SILVER
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="transactions")
    portfolio = relationship("Portfolio", back_populates="transactions")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "user_id": self.user_id,
            "portfolio_id": self.portfolio_id,
            "symbol": self.symbol,
            "type": self.type,
            "quantity": float(self.quantity),
            "price": float(self.price),
            "total_amount": float(self.total_amount),
            "date": self.date,
            "notes": self.notes,
            "asset_type": self.asset_type or "STOCK",
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), index=True, nullable=False)
    company_name = Column(String(255), nullable=True)
    rule_type = Column(String(50), nullable=False)
    threshold = Column(Float, nullable=False)
    condition = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    enable_voice_call = Column(Boolean, default=False, nullable=False)
    enable_email = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="alert_rules")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "user_id": self.user_id,
            "symbol": self.symbol,
            "company_name": self.company_name or self.symbol,
            "rule_type": self.rule_type,
            "threshold": float(self.threshold),
            "condition": self.condition,
            "is_active": bool(self.is_active),
            "enable_voice_call": bool(self.enable_voice_call),
            "enable_email": bool(self.enable_email),
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), index=True, nullable=False)
    company_name = Column(String(255), nullable=True)
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    triggered_condition = Column(Text, nullable=False)
    trigger_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=False)
    supporting_evidence = Column(Text, nullable=False)
    suggested_action = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    voice_notified = Column(Boolean, default=False, nullable=False)
    timestamp = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="alert_events")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "user_id": self.user_id,
            "symbol": self.symbol,
            "company_name": self.company_name or self.symbol,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "triggered_condition": self.triggered_condition,
            "trigger_price": float(self.trigger_price),
            "current_price": float(self.current_price),
            "supporting_evidence": self.supporting_evidence,
            "suggested_action": self.suggested_action,
            "is_read": bool(self.is_read),
            "voice_notified": bool(self.voice_notified),
            "timestamp": self.timestamp,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class VoiceLog(Base):
    __tablename__ = "voice_logs"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    call_id = Column(String(100), nullable=True)
    symbol = Column(String(50), nullable=True)
    status = Column(String(50), nullable=True)
    to_phone = Column(String(64), nullable=True)
    message = Column(Text, nullable=True)
    duration_seconds = Column(Integer, default=30, nullable=False)
    timestamp = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="voice_logs")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "_id": self.id,
            "user_id": self.user_id,
            "call_id": self.call_id,
            "symbol": self.symbol,
            "status": self.status,
            "to_phone": self.to_phone,
            "message": self.message,
            "duration_seconds": int(self.duration_seconds),
            "timestamp": self.timestamp,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }

class DomesticGoldSnapshot(Base):
    __tablename__ = "domestic_gold_snapshots"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    city = Column(String(100), index=True, nullable=False)
    date = Column(String(20), index=True, nullable=False)  # YYYY-MM-DD
    market = Column(String(100), default="Indian Market", nullable=False)
    currency = Column(String(10), default="INR", nullable=False)

    # 24K Prices
    price_24k_10g = Column(Float, nullable=False)  # Final INR per 10g including 3% GST
    base_price_24k_1g = Column(Float, nullable=False)  # Base INR per gram before GST
    gst_amount_24k_1g = Column(Float, nullable=False)  # 3% GST per gram
    final_price_24k_1g = Column(Float, nullable=False)  # Final INR per gram including GST

    # 22K Prices
    price_22k_10g = Column(Float, nullable=True)
    base_price_22k_1g = Column(Float, nullable=True)
    gst_amount_22k_1g = Column(Float, nullable=True)
    final_price_22k_1g = Column(Float, nullable=True)

    # 18K & 14K Prices
    price_18k_10g = Column(Float, nullable=True)
    price_14k_10g = Column(Float, nullable=True)

    # Underlying Benchmarks & Tariffs
    spot_usd_oz = Column(Float, nullable=True)
    usd_inr = Column(Float, nullable=True)
    import_duty_pct = Column(Float, default=15.0, nullable=False)
    gst_rate_pct = Column(Float, default=3.0, nullable=False)
    source_timestamp = Column(String(50), nullable=True)
    fetch_timestamp = Column(String(50), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_domestic_gold_city_date", "city", "date", unique=True),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "city": self.city,
            "date": self.date,
            "market": self.market,
            "currency": self.currency,
            "price_24k_10g": float(self.price_24k_10g),
            "base_price_24k_1g": float(self.base_price_24k_1g),
            "gst_amount_24k_1g": float(self.gst_amount_24k_1g),
            "gst_amount_24k_10g": round(float(self.gst_amount_24k_1g) * 10.0, 2),
            "final_price_24k_1g": float(self.final_price_24k_1g),
            "price_22k_10g": float(self.price_22k_10g) if self.price_22k_10g is not None else None,
            "price_18k_10g": float(self.price_18k_10g) if self.price_18k_10g is not None else None,
            "price_14k_10g": float(self.price_14k_10g) if self.price_14k_10g is not None else None,
            "spot_usd_oz": float(self.spot_usd_oz) if self.spot_usd_oz is not None else None,
            "usd_inr": float(self.usd_inr) if self.usd_inr is not None else None,
            "import_duty_pct": float(self.import_duty_pct),
            "gst_rate_pct": float(self.gst_rate_pct),
            "source_timestamp": self.source_timestamp,
            "fetch_timestamp": self.fetch_timestamp,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
        }


class DomesticSilverSnapshot(Base):
    __tablename__ = "domestic_silver_snapshots"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    city = Column(String(100), index=True, nullable=False)
    date = Column(String(20), index=True, nullable=False)  # YYYY-MM-DD
    market = Column(String(100), default="Indian Market", nullable=False)
    currency = Column(String(10), default="INR", nullable=False)

    # Silver Prices
    price_per_kg = Column(Float, nullable=False)  # Final INR per kg including 3% GST
    base_price_1g = Column(Float, nullable=False)  # Base INR per gram before GST
    gst_amount_1g = Column(Float, nullable=False)  # 3% GST per gram
    final_price_1g = Column(Float, nullable=False)  # Final INR per gram including GST
    price_10g = Column(Float, nullable=True)  # Final INR per 10g
    price_100g = Column(Float, nullable=True)  # Final INR per 100g

    # Underlying Benchmarks & Tariffs
    spot_usd_oz = Column(Float, nullable=True)
    usd_inr = Column(Float, nullable=True)
    import_duty_pct = Column(Float, default=15.0, nullable=False)
    gst_rate_pct = Column(Float, default=3.0, nullable=False)
    retail_spread_pct = Column(Float, default=13.6, nullable=False)
    source_timestamp = Column(String(50), nullable=True)
    fetch_timestamp = Column(String(50), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_domestic_silver_city_date", "city", "date", unique=True),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "city": self.city,
            "date": self.date,
            "market": self.market,
            "currency": self.currency,
            "price_per_kg": float(self.price_per_kg),
            "base_price_1g": float(self.base_price_1g),
            "gst_amount_1g": float(self.gst_amount_1g),
            "final_price_1g": float(self.final_price_1g),
            "price_10g": float(self.price_10g) if self.price_10g is not None else round(float(self.final_price_1g) * 10, 2),
            "price_100g": float(self.price_100g) if self.price_100g is not None else round(float(self.final_price_1g) * 100, 2),
            "spot_usd_oz": float(self.spot_usd_oz) if self.spot_usd_oz is not None else None,
            "usd_inr": float(self.usd_inr) if self.usd_inr is not None else None,
            "import_duty_pct": float(self.import_duty_pct),
            "gst_rate_pct": float(self.gst_rate_pct),
            "retail_spread_pct": float(self.retail_spread_pct),
            "source_timestamp": self.source_timestamp,
            "fetch_timestamp": self.fetch_timestamp,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
        }


class InvestorProfile(Base):
    __tablename__ = "investor_profiles"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    
    # 5-10 Profile Questions
    experience_level = Column(String(50), default="Beginner", nullable=False)
    financial_objective = Column(String(100), default="Wealth Creation", nullable=False)
    investment_horizon = Column(String(50), default="3-5 Years", nullable=False)
    risk_tolerance = Column(String(50), default="Moderate", nullable=False)
    approximate_budget = Column(String(50), default="₹10,000 - ₹50,000", nullable=False)
    preferred_categories = Column(Text, default="Large Cap Equities, Index ETFs, Digital Gold", nullable=False)
    product_interests = Column(Text, default="Equities, ETFs, Gold, Silver", nullable=False)
    max_loss_tolerance_pct = Column(Float, default=10.0, nullable=False)
    liquidity_need = Column(String(50), default="Medium", nullable=False)
    is_completed = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="investor_profile")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "experience_level": self.experience_level,
            "financial_objective": self.financial_objective,
            "investment_horizon": self.investment_horizon,
            "risk_tolerance": self.risk_tolerance,
            "approximate_budget": self.approximate_budget,
            "preferred_categories": [c.strip() for c in (self.preferred_categories or "").split(",") if c.strip()],
            "product_interests": [p.strip() for p in (self.product_interests or "").split(",") if p.strip()],
            "max_loss_tolerance_pct": float(self.max_loss_tolerance_pct),
            "liquidity_need": self.liquidity_need,
            "is_completed": bool(self.is_completed),
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }


class WatchlistItemModel(Base):
    __tablename__ = "watchlists"

    id = Column(String(64), primary_key=True, default=_generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), index=True, nullable=False)
    company_name = Column(String(255), nullable=True)
    category = Column(String(100), default="Equities", nullable=False)
    target_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="watchlist_items")

    __table_args__ = (
        Index("idx_user_watchlist_symbol", "user_id", "symbol", unique=True),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "symbol": self.symbol,
            "company_name": self.company_name or self.symbol,
            "category": self.category,
            "target_price": float(self.target_price) if self.target_price is not None else None,
            "stop_loss": float(self.stop_loss) if self.stop_loss is not None else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else str(self.updated_at),
        }
