from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Auth ---
class UserRegister(BaseModel):
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=6)
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    created_at: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token: Optional[str] = None
    token_type: str = "bearer"
    user: UserOut

    @model_validator(mode="after")
    def populate_token_alias(self):
        if not self.token and self.access_token:
            self.token = self.access_token
        elif not self.access_token and self.token:
            self.access_token = self.token
        return self

class TokenData(BaseModel):
    user_id: Optional[str] = None

# --- Portfolio & Holdings ---
class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    benchmark: Optional[str] = "^NSEI"  # Or ^GSPC for S&P 500

class HoldingCreate(BaseModel):
    portfolio_id: Optional[str] = None
    symbol: str = Field(..., min_length=1)
    company_name: Optional[str] = None
    sector: Optional[str] = "Technology"
    quantity: float = Field(..., gt=0)
    purchase_price: float = Field(..., gt=0)
    currency: Optional[str] = None
    purchase_date: Optional[str] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    notes: Optional[str] = None

class HoldingsBatchCreate(BaseModel):
    holdings: List[HoldingCreate]

class HoldingUpdate(BaseModel):
    quantity: Optional[float] = None
    purchase_price: Optional[float] = None
    purity: Optional[str] = None
    currency: Optional[str] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    notes: Optional[str] = None

class MetalHoldingCreate(BaseModel):
    portfolio_id: Optional[str] = None
    metal_type: str = Field(..., min_length=4, max_length=10, description="GOLD or SILVER")
    purity: str = Field(..., min_length=2, max_length=20, description="24K, 22K, 18K for Gold; 999, 925 for Silver")
    quantity: float = Field(..., gt=0, description="Quantity in grams")
    purchase_price: float = Field(..., gt=0, description="Purchase price per gram in INR")
    purchase_date: Optional[str] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    notes: Optional[str] = None

class HoldingOut(BaseModel):
    id: str
    user_id: str
    portfolio_id: str
    symbol: str
    company_name: str
    sector: str
    quantity: float
    purchase_price: float
    purchase_date: str
    current_price: float
    invested_value: float
    current_value: float
    unrealized_pnl: float
    pnl_percentage: float
    daily_change_pct: float
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    ai_risk_level: Optional[str] = "Moderate"
    ai_sell_signal: Optional[str] = "Hold and Monitor"
    currency: Optional[str] = "INR"
    original_currency: Optional[str] = "INR"
    original_purchase_price: Optional[float] = None
    original_current_price: Optional[float] = None
    is_converted: Optional[bool] = False
    exchange_rate: Optional[float] = 1.0
    asset_type: Optional[str] = "STOCK"
    metal_type: Optional[str] = None
    purity: Optional[str] = None
    created_at: Optional[str] = None
    is_stale: Optional[bool] = False
    data_status: Optional[str] = "live"

class PortfolioSummaryOut(BaseModel):
    id: str
    name: str
    total_invested: float
    total_value: float
    total_pnl: float
    total_pnl_pct: float
    today_pnl: float
    today_pnl_pct: float
    holdings_count: int
    portfolio_risk_score: float # 0 - 100
    diversification_score: float # 0 - 100
    currency: Optional[str] = "INR"
    exchange_rate: Optional[float] = None
    exchange_rate_source: Optional[str] = None
    holdings: List[HoldingOut] = []

class TransactionCreate(BaseModel):
    portfolio_id: str
    symbol: str
    type: str # BUY, SELL
    quantity: float
    price: float
    date: Optional[str] = None
    notes: Optional[str] = None

class TransactionOut(BaseModel):
    id: str
    portfolio_id: str
    symbol: str
    type: str
    quantity: float
    price: float
    total_amount: float
    date: str
    notes: Optional[str] = None

# --- Watchlist ---
class WatchlistAdd(BaseModel):
    symbol: str
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    notes: Optional[str] = None

class WatchlistBatchAdd(BaseModel):
    items: List[WatchlistAdd]

class WatchlistBatchDelete(BaseModel):
    ids: List[str]

class WatchlistUpdate(BaseModel):
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    notes: Optional[str] = None

class WatchlistItem(BaseModel):
    id: str
    user_id: str
    symbol: str
    company_name: str
    category: Optional[str] = "Equities"
    price: float
    change: Optional[float] = 0.0
    change_pct: float
    volume: int
    risk_level: str
    rsi: float
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    notes: Optional[str] = None
    added_at: str
    source: Optional[str] = "yfinance (fallback)"
    data_source: Optional[str] = "yfinance (fallback)"
    timestamp: Optional[str] = None
    last_updated: Optional[str] = None
    data_status: Optional[str] = "live"
    is_stale: Optional[bool] = False

# --- Investor Onboarding Questionnaire & Profile ---
class InvestorProfileCreate(BaseModel):
    experience_level: str = "Beginner"  # Beginner, Intermediate, Experienced
    financial_objective: str = "Wealth Creation"  # Wealth Creation, Capital Preservation, Retirement Planning, Active Trading
    investment_horizon: str = "3-5 Years"  # < 1 Year, 1-3 Years, 3-5 Years, 5+ Years
    risk_tolerance: str = "Moderate"  # Conservative, Moderate, Aggressive
    approximate_budget: str = "₹10,000 - ₹50,000"  # < ₹10,000, ₹10,000 - ₹50,000, ₹50,000 - ₹2,00,000, > ₹2,00,000
    preferred_categories: List[str] = ["Large Cap Equities", "Index ETFs", "Digital Gold"]
    product_interests: List[str] = ["Equities", "ETFs", "Gold", "Silver"]
    max_loss_tolerance_pct: float = 10.0
    liquidity_need: str = "Medium"  # Low, Medium, High

class InvestorProfileUpdate(BaseModel):
    experience_level: Optional[str] = None
    financial_objective: Optional[str] = None
    investment_horizon: Optional[str] = None
    risk_tolerance: Optional[str] = None
    approximate_budget: Optional[str] = None
    preferred_categories: Optional[List[str]] = None
    product_interests: Optional[List[str]] = None
    max_loss_tolerance_pct: Optional[float] = None
    liquidity_need: Optional[str] = None

class InvestorProfileOut(BaseModel):
    id: str
    user_id: str
    experience_level: str
    financial_objective: str
    investment_horizon: str
    risk_tolerance: str
    approximate_budget: str
    preferred_categories: List[str]
    product_interests: List[str]
    max_loss_tolerance_pct: float
    liquidity_need: str
    is_completed: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

# --- Personalized Recommendations Schemas ---
class RecommendationCandidate(BaseModel):
    symbol: str
    name: str
    category: str
    current_price: float
    change_pct: float
    risk_level: str  # Low Risk, Moderate Risk, High Risk
    risk_score: float  # 0 to 100
    suitability_score: float  # 0 to 100%
    score: Optional[float] = None  # Canonical score
    score_breakdown: Optional[Dict[str, float]] = None
    match_reasons: List[str]
    pros: List[str]
    cons: List[str]
    risks: Optional[List[str]] = None
    ai_explanation: Optional[str] = None
    suggested_allocation_pct: Optional[float] = None
    technical_indicator_summary: str
    valuation_summary: str
    forecast_scenarios: Dict[str, Any]
    data_source: str
    timestamp: str

class RecommendationsResponse(BaseModel):
    user_risk_profile: str
    investment_horizon: str
    financial_objective: str
    total_candidates: int
    candidates: List[RecommendationCandidate]
    disclaimer: str
    generated_at: str
    profile_hash: Optional[str] = None

# --- Alerts & Notifications ---
class AlertRuleCreate(BaseModel):
    symbol: str
    rule_type: str # STOP_LOSS, TARGET_PRICE, VOLATILITY_SPIKE, RSI_OVERBOUGHT, RSI_OVERSOLD, FUNDAMENTAL_DROP
    threshold: float
    condition: str # LESS_THAN, GREATER_THAN
    is_active: bool = True
    enable_voice_call: bool = False
    enable_email: bool = True

class AlertRuleOut(BaseModel):
    id: str
    user_id: str
    symbol: str
    company_name: Optional[str] = None
    rule_type: str
    threshold: float
    condition: str
    is_active: bool
    enable_voice_call: bool
    enable_email: bool
    created_at: str

class AlertEventOut(BaseModel):
    id: str
    user_id: str
    symbol: str
    company_name: str
    alert_type: str
    severity: str # LOW, MEDIUM, HIGH, CRITICAL
    triggered_condition: str
    trigger_price: float
    current_price: float
    supporting_evidence: str
    suggested_action: str
    is_read: bool = False
    voice_notified: bool = False
    timestamp: str

# --- Three-Level Risk Analysis Schemas ---
class HighRiskDetail(BaseModel):
    level: str = "High Risk"
    volatility_score: float
    atr_14: float
    rsi_14: float
    short_term_momentum: str
    support_level: float
    resistance_level: float
    breakdown_risk: str
    potential_triggers: List[str]
    exit_conditions: List[str]
    market_insight: Optional[Dict[str, Any]] = None

class ModerateRiskDetail(BaseModel):
    level: str = "Moderate Risk"
    technical_score: float
    fundamental_score: float
    pe_ratio: Optional[float]
    industry_pe: Optional[float]
    profitability_trend: str
    key_levels: Dict[str, float]
    opportunities: List[str]
    risks: List[str]
    supporting_reasons: List[str]
    market_insight: Optional[Dict[str, Any]] = None

class LowRiskDetail(BaseModel):
    level: str = "Low Risk"
    fundamental_strength_score: float
    operating_margin: Optional[float]
    ebit_stability: str
    debt_to_equity: Optional[float]
    revenue_consistency: str
    drawdown_history_pct: float
    long_term_risk_factors: List[str]
    news_sentiment_indicator: str
    market_insight: Optional[Dict[str, Any]] = None

class RiskAssessmentResponse(BaseModel):
    symbol: str
    company_name: str
    current_price: float
    overall_classification: str # High Risk, Moderate Risk, Low Risk
    risk_score: float # 0 to 100
    high_risk_tier: HighRiskDetail
    moderate_risk_tier: ModerateRiskDetail
    low_risk_tier: LowRiskDetail
    rationale: str
    last_updated: str

# --- AI Prediction Schemas ---
class PredictionHorizon(BaseModel):
    horizon: str # "1 Day", "1 Week", "1 Month"
    predicted_price: float
    change_pct: float
    confidence_interval_low: float
    confidence_interval_high: float
    confidence_score: float # 0 to 100%
    bias: str # Bullish, Bearish, Neutral

class AIPredictionResponse(BaseModel):
    symbol: str
    company_name: str
    current_price: float
    overall_signal: str # "Bullish", "Bearish", "Neutral"
    signal_conviction: float # 0 - 100%
    horizons: List[PredictionHorizon]
    feature_importance: List[Dict[str, Any]]
    model_metrics: Dict[str, Any] # Directional Accuracy, RMSE, MAE, R2
    technical_summary: str
    fundamental_summary: str
    is_demo: bool = False
    generated_at: str

# --- Settings & Voice ---
class UserSettingsUpdate(BaseModel):
    risk_tolerance: Optional[str] = "Moderate" # Conservative, Moderate, Aggressive
    default_stop_loss_pct: Optional[float] = 7.0
    default_target_pct: Optional[float] = 15.0
    voice_calls_enabled: Optional[bool] = False
    phone_number: Optional[str] = None
    voice_consent_given: Optional[bool] = False
    quiet_hours_enabled: Optional[bool] = False
    quiet_hours_start: Optional[str] = "22:00"
    quiet_hours_end: Optional[str] = "08:00"
    cooldown_period_minutes: Optional[int] = 30
    email_notifications_enabled: Optional[bool] = True
    in_app_notifications_enabled: Optional[bool] = True
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_from_phone: Optional[str] = None

class VoiceCallTestRequest(BaseModel):
    phone_number: str
    symbol: Optional[str] = "RELIANCE.NS"
    price: Optional[float] = 2985.40
    alert_reason: Optional[str] = "Stop-loss trigger exceeded -3.5% threshold"

class MarketNewsItem(BaseModel):
    id: str
    title: str
    summary: str
    source: str
    url: str
    published_at: str
    sentiment: str # Bullish, Bearish, Neutral
    sentiment_score: float
    related_tickers: List[str]
    relevance_reason: str
