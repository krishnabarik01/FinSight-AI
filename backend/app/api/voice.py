import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UserOut, VoiceCallTestRequest
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.database.models import UserSettings, VoiceLog
from app.notifications.voice_provider import voice_provider

router = APIRouter(prefix="/api/voice", tags=["voice"])

@router.get("/logs")
async def get_voice_logs(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    stmt = select(VoiceLog).where(VoiceLog.user_id == current_user.id).order_by(VoiceLog.created_at.desc())
    res = await db.execute(stmt)
    logs = res.scalars().all()
    
    if not logs:
        # Sample historical voice alert log
        return [
            {
                "id": "call-log-1",
                "_id": "call-log-1",
                "user_id": current_user.id,
                "call_id": "CA_78fa9b0e41d84310",
                "symbol": "RELIANCE.NS",
                "status": "completed",
                "to_phone": "+91 98765 43210",
                "message": "FinSight AI portfolio alert. Your holding in Reliance Industries Limited (RELIANCE.NS) has triggered your configured risk threshold. The latest available price is ₹2,985.40. Reason: Trailing stop buffer test. Please review your position in the FinSight AI dashboard.",
                "duration_seconds": 32,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 7200))
            }
        ]
    return [l.to_dict() for l in logs]

@router.post("/test-call")
async def trigger_test_call(
    req: VoiceCallTestRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    res = await db.execute(stmt)
    user_settings = res.scalar_one_or_none()

    custom_sid = user_settings.twilio_account_sid if user_settings else None
    custom_token = user_settings.twilio_auth_token if user_settings else None
    custom_from = user_settings.twilio_from_phone if user_settings else None

    target_symbol = req.symbol or "RELIANCE.NS"
    result = await voice_provider.dispatch_voice_call(
        to_phone=req.phone_number,
        company_name=f"{target_symbol} Holdings",
        symbol=target_symbol,
        price=req.price or 2985.40,
        alert_reason=req.alert_reason or "Automated portfolio monitoring check",
        custom_sid=custom_sid,
        custom_token=custom_token,
        custom_from=custom_from
    )

    # Save to logs
    now_dt = datetime.now(timezone.utc)
    vlog = VoiceLog(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        call_id=result.get("call_id"),
        symbol=target_symbol,
        status=result.get("status"),
        to_phone=req.phone_number,
        message=result.get("spoken_message"),
        duration_seconds=result.get("duration_seconds", 30),
        timestamp=result.get("timestamp") or now_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        created_at=now_dt,
        updated_at=now_dt
    )
    db.add(vlog)
    await db.flush()

    return result

@router.post("/twiml")
async def get_twiml_endpoint():
    """Twilio webhook callback serving dynamic Voice XML response."""
    msg = (
        "FinSight AI portfolio alert. Your holding has triggered your configured risk threshold. "
        "Please review your position immediately in the FinSight AI dashboard."
    )
    twiml_xml = voice_provider.generate_twiml(msg)
    return Response(content=twiml_xml, media_type="application/xml")
