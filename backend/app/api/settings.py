import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from typing import Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UserOut, UserSettingsUpdate
from app.api.auth import get_current_user
from app.database.connection import get_db_session
from app.database.models import UserSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("")
async def get_settings(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    res = await db.execute(stmt)
    doc = res.scalar_one_or_none()
    
    if not doc:
        now_dt = datetime.now(timezone.utc)
        doc = UserSettings(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            risk_tolerance="Moderate",
            default_stop_loss_pct=7.0,
            default_target_pct=15.0,
            voice_calls_enabled=True,
            phone_number=current_user.phone or "+1 (415) 555-2671",
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
        db.add(doc)
        await db.flush()

    return doc.to_dict()

@router.put("")
async def update_settings(
    req: UserSettingsUpdate,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    res = await db.execute(stmt)
    doc = res.scalar_one_or_none()
    now_dt = datetime.now(timezone.utc)

    if not doc:
        doc = UserSettings(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            created_at=now_dt,
            updated_at=now_dt
        )
        db.add(doc)

    update_data = req.model_dump(exclude_unset=True) if hasattr(req, "model_dump") else req.dict(exclude_unset=True)
    for field, val in update_data.items():
        if hasattr(doc, field) and val is not None:
            setattr(doc, field, val)
    doc.updated_at = now_dt

    await db.flush()
    return doc.to_dict()
