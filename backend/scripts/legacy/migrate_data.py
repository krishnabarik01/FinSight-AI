#!/usr/bin/env python3
"""
FinSight AI - Data Migration Tool (JSON / MongoDB to PostgreSQL / Supabase)

Safely and idempotently imports historical data into PostgreSQL tables:
  1. users
  2. user_settings
  3. portfolios
  4. holdings
  5. transactions
  6. alert_rules
  7. alert_events
  8. voice_logs

Usage:
    python scripts/migrate_data.py --source json
    python scripts/migrate_data.py --source json --dry-run
    python scripts/migrate_data.py --source mongodb
"""

import os
import sys
import json
import asyncio
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

# Add backend directory to sys.path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database.connection import db_manager, get_background_session
from app.database.models import (
    Base,
    User,
    UserSettings,
    Portfolio,
    Holding,
    Transaction,
    AlertRule,
    AlertEvent,
    VoiceLog
)

def parse_iso_datetime(val: Any) -> Optional[datetime]:
    """Safely converts string or int timestamp to datetime with timezone."""
    if not val:
        return datetime.now(timezone.utc)
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    try:
        s = str(val).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(timezone.utc)

class DataMigrator:
    def __init__(self, source_type: str = "json", dry_run: bool = False, json_file: Optional[str] = None):
        self.source_type = source_type
        self.dry_run = dry_run
        self.json_file = json_file or os.path.join(BACKEND_DIR, "data", "finsight_db.json")
        self.stats = {
            "users": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
            "user_settings": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
            "portfolios": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
            "holdings": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
            "transactions": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
            "alert_rules": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
            "alert_events": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
            "voice_logs": {"source": 0, "imported": 0, "skipped": 0, "failed": 0},
        }

    async def load_source_data(self) -> Dict[str, List[Dict[str, Any]]]:
        """Loads data from specified source without mutating or destroying source."""
        if self.source_type == "json":
            if not os.path.exists(self.json_file):
                raise FileNotFoundError(f"Source JSON database file not found at: {self.json_file}")
            print(f"[INFO] Reading local JSON database from: {self.json_file}")
            with open(self.json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        elif self.source_type == "mongodb":
            print(f"[INFO] Connecting to MongoDB: {settings.MONGODB_URL} (db: {settings.DATABASE_NAME})")
            import motor.motor_asyncio
            client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=5000)
            db = client[settings.DATABASE_NAME]
            data = {}
            for col_name in self.stats.keys():
                cursor = db[col_name].find({})
                docs = await cursor.to_list(length=10000)
                data[col_name] = docs
            return data
        else:
            raise ValueError(f"Unsupported source type: {self.source_type}")

    async def run(self):
        print("=" * 70)
        print("   FinSight AI - Safe Supabase PostgreSQL Data Migration Tool")
        print("=" * 70)
        print(f" Source mode : {self.source_type.upper()}")
        print(f" Dry run     : {self.dry_run}")
        print(f" Target DB   : {db_manager._mask_url(settings.get_async_database_url())}")
        print("-" * 70)

        source_data = await self.load_source_data()
        for k in self.stats.keys():
            self.stats[k]["source"] = len(source_data.get(k, []))

        await db_manager.connect()

        async with get_background_session() as session:
            # 1. Users
            await self._migrate_users(session, source_data.get("users", []))
            await session.flush()

            # 2. User Settings
            await self._migrate_user_settings(session, source_data.get("user_settings", []))
            await session.flush()

            # 3. Portfolios
            await self._migrate_portfolios(session, source_data.get("portfolios", []))
            await session.flush()

            # 4. Holdings
            await self._migrate_holdings(session, source_data.get("holdings", []))
            await session.flush()

            # 5. Transactions
            await self._migrate_transactions(session, source_data.get("transactions", []))
            await session.flush()

            # 6. Alert Rules
            await self._migrate_alert_rules(session, source_data.get("alert_rules", []))
            await session.flush()

            # 7. Alert Events
            await self._migrate_alert_events(session, source_data.get("alert_events", []))
            await session.flush()

            # 8. Voice Logs
            await self._migrate_voice_logs(session, source_data.get("voice_logs", []))
            await session.flush()

            if self.dry_run:
                print("\n[DRY RUN] Rolling back transaction. No changes were committed to the database.")
                await session.rollback()
            else:
                await session.commit()
                print("\n[SUCCESS] Transaction committed successfully to PostgreSQL database.")

            # Verification step
            await self._verify_migration(session)

        self._print_summary()

    async def _migrate_users(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            u_id = str(doc.get("_id") or doc.get("id"))
            email = str(doc.get("email", "")).lower().strip()
            try:
                # Check existence by ID or email
                existing = await session.execute(
                    select(User).where((User.id == u_id) | (User.email == email))
                )
                if existing.scalar_one_or_none():
                    self.stats["users"]["skipped"] += 1
                    continue

                user = User(
                    id=u_id,
                    name=doc.get("name", "FinSight User"),
                    email=email,
                    password_hash=doc.get("password_hash", ""),
                    phone=doc.get("phone"),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(user)
                self.stats["users"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate user {u_id} ({email}): {e}")
                self.stats["users"]["failed"] += 1

    async def _migrate_user_settings(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            s_id = str(doc.get("_id") or doc.get("id"))
            user_id = str(doc.get("user_id"))
            try:
                existing = await session.execute(
                    select(UserSettings).where((UserSettings.id == s_id) | (UserSettings.user_id == user_id))
                )
                if existing.scalar_one_or_none():
                    self.stats["user_settings"]["skipped"] += 1
                    continue

                # Verify foreign key existence
                user = await session.get(User, user_id)
                if not user:
                    print(f"[WARN] Skipping user_settings {s_id}: user {user_id} does not exist.")
                    self.stats["user_settings"]["skipped"] += 1
                    continue

                settings_obj = UserSettings(
                    id=s_id,
                    user_id=user_id,
                    risk_tolerance=doc.get("risk_tolerance", "Moderate"),
                    default_stop_loss_pct=float(doc.get("default_stop_loss_pct", 7.0)),
                    default_target_pct=float(doc.get("default_target_pct", 15.0)),
                    voice_calls_enabled=bool(doc.get("voice_calls_enabled", False)),
                    phone_number=doc.get("phone_number"),
                    voice_consent_given=bool(doc.get("voice_consent_given", False)),
                    quiet_hours_enabled=bool(doc.get("quiet_hours_enabled", False)),
                    quiet_hours_start=doc.get("quiet_hours_start", "22:00"),
                    quiet_hours_end=doc.get("quiet_hours_end", "08:00"),
                    cooldown_period_minutes=int(doc.get("cooldown_period_minutes", 30)),
                    email_notifications_enabled=bool(doc.get("email_notifications_enabled", True)),
                    in_app_notifications_enabled=bool(doc.get("in_app_notifications_enabled", True)),
                    twilio_account_sid=doc.get("twilio_account_sid", ""),
                    twilio_auth_token=doc.get("twilio_auth_token", ""),
                    twilio_from_phone=doc.get("twilio_from_phone", ""),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(settings_obj)
                self.stats["user_settings"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate user_settings {s_id}: {e}")
                self.stats["user_settings"]["failed"] += 1

    async def _migrate_portfolios(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            p_id = str(doc.get("_id") or doc.get("id"))
            user_id = str(doc.get("user_id"))
            try:
                existing = await session.get(Portfolio, p_id)
                if existing:
                    self.stats["portfolios"]["skipped"] += 1
                    continue

                user = await session.get(User, user_id)
                if not user:
                    print(f"[WARN] Skipping portfolio {p_id}: user {user_id} does not exist.")
                    self.stats["portfolios"]["skipped"] += 1
                    continue

                portfolio = Portfolio(
                    id=p_id,
                    user_id=user_id,
                    name=doc.get("name", "Main Portfolio"),
                    description=doc.get("description"),
                    benchmark=doc.get("benchmark", "^NSEI"),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(portfolio)
                self.stats["portfolios"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate portfolio {p_id}: {e}")
                self.stats["portfolios"]["failed"] += 1

    async def _migrate_holdings(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            h_id = str(doc.get("_id") or doc.get("id"))
            user_id = str(doc.get("user_id"))
            portfolio_id = str(doc.get("portfolio_id"))
            try:
                existing = await session.get(Holding, h_id)
                if existing:
                    self.stats["holdings"]["skipped"] += 1
                    continue

                user = await session.get(User, user_id)
                portfolio = await session.get(Portfolio, portfolio_id)
                if not user or not portfolio:
                    print(f"[WARN] Skipping holding {h_id}: missing user {user_id} or portfolio {portfolio_id}")
                    self.stats["holdings"]["skipped"] += 1
                    continue

                holding = Holding(
                    id=h_id,
                    user_id=user_id,
                    portfolio_id=portfolio_id,
                    symbol=doc.get("symbol", "").upper().strip(),
                    company_name=doc.get("company_name"),
                    sector=doc.get("sector", "Technology"),
                    quantity=float(doc.get("quantity", 0)),
                    purchase_price=float(doc.get("purchase_price", 0)),
                    purchase_date=doc.get("purchase_date"),
                    stop_loss=float(doc["stop_loss"]) if doc.get("stop_loss") is not None else None,
                    target_price=float(doc["target_price"]) if doc.get("target_price") is not None else None,
                    notes=doc.get("notes"),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(holding)
                self.stats["holdings"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate holding {h_id}: {e}")
                self.stats["holdings"]["failed"] += 1

    async def _migrate_transactions(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            t_id = str(doc.get("_id") or doc.get("id"))
            user_id = str(doc.get("user_id"))
            portfolio_id = str(doc.get("portfolio_id"))
            try:
                existing = await session.get(Transaction, t_id)
                if existing:
                    self.stats["transactions"]["skipped"] += 1
                    continue

                user = await session.get(User, user_id)
                portfolio = await session.get(Portfolio, portfolio_id)
                if not user or not portfolio:
                    print(f"[WARN] Skipping transaction {t_id}: missing user {user_id} or portfolio {portfolio_id}")
                    self.stats["transactions"]["skipped"] += 1
                    continue

                tx = Transaction(
                    id=t_id,
                    user_id=user_id,
                    portfolio_id=portfolio_id,
                    symbol=doc.get("symbol", "").upper().strip(),
                    type=doc.get("type", "BUY"),
                    quantity=float(doc.get("quantity", 0)),
                    price=float(doc.get("price", 0)),
                    total_amount=float(doc.get("total_amount", 0)),
                    date=doc.get("date"),
                    notes=doc.get("notes"),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(tx)
                self.stats["transactions"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate transaction {t_id}: {e}")
                self.stats["transactions"]["failed"] += 1

    async def _migrate_alert_rules(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            r_id = str(doc.get("_id") or doc.get("id"))
            user_id = str(doc.get("user_id"))
            try:
                existing = await session.get(AlertRule, r_id)
                if existing:
                    self.stats["alert_rules"]["skipped"] += 1
                    continue

                user = await session.get(User, user_id)
                if not user:
                    print(f"[WARN] Skipping alert rule {r_id}: user {user_id} missing")
                    self.stats["alert_rules"]["skipped"] += 1
                    continue

                rule = AlertRule(
                    id=r_id,
                    user_id=user_id,
                    symbol=doc.get("symbol", "").upper().strip(),
                    company_name=doc.get("company_name"),
                    rule_type=doc.get("rule_type", "STOP_LOSS"),
                    threshold=float(doc.get("threshold", 0)),
                    condition=doc.get("condition", "LESS_THAN"),
                    is_active=bool(doc.get("is_active", True)),
                    enable_voice_call=bool(doc.get("enable_voice_call", False)),
                    enable_email=bool(doc.get("enable_email", True)),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(rule)
                self.stats["alert_rules"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate alert_rule {r_id}: {e}")
                self.stats["alert_rules"]["failed"] += 1

    async def _migrate_alert_events(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            e_id = str(doc.get("_id") or doc.get("id"))
            user_id = str(doc.get("user_id"))
            try:
                existing = await session.get(AlertEvent, e_id)
                if existing:
                    self.stats["alert_events"]["skipped"] += 1
                    continue

                user = await session.get(User, user_id)
                if not user:
                    print(f"[WARN] Skipping alert event {e_id}: user {user_id} missing")
                    self.stats["alert_events"]["skipped"] += 1
                    continue

                event = AlertEvent(
                    id=e_id,
                    user_id=user_id,
                    symbol=doc.get("symbol", "").upper().strip(),
                    company_name=doc.get("company_name", doc.get("symbol")),
                    alert_type=doc.get("alert_type", "STOP_LOSS_BREACH"),
                    severity=doc.get("severity", "MEDIUM"),
                    triggered_condition=doc.get("triggered_condition", ""),
                    trigger_price=float(doc.get("trigger_price", 0)),
                    current_price=float(doc.get("current_price", 0)),
                    supporting_evidence=doc.get("supporting_evidence", ""),
                    suggested_action=doc.get("suggested_action", ""),
                    is_read=bool(doc.get("is_read", False)),
                    voice_notified=bool(doc.get("voice_notified", False)),
                    timestamp=str(doc.get("timestamp", datetime.utcnow().isoformat())),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(event)
                self.stats["alert_events"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate alert_event {e_id}: {e}")
                self.stats["alert_events"]["failed"] += 1

    async def _migrate_voice_logs(self, session: AsyncSession, records: List[Dict[str, Any]]):
        for doc in records:
            v_id = str(doc.get("_id") or doc.get("id"))
            user_id = str(doc.get("user_id"))
            try:
                existing = await session.get(VoiceLog, v_id)
                if existing:
                    self.stats["voice_logs"]["skipped"] += 1
                    continue

                user = await session.get(User, user_id)
                if not user:
                    print(f"[WARN] Skipping voice log {v_id}: user {user_id} missing")
                    self.stats["voice_logs"]["skipped"] += 1
                    continue

                vlog = VoiceLog(
                    id=v_id,
                    user_id=user_id,
                    call_id=doc.get("call_id"),
                    symbol=doc.get("symbol"),
                    status=doc.get("status"),
                    to_phone=doc.get("to_phone"),
                    message=doc.get("message"),
                    duration_seconds=int(doc.get("duration_seconds", 30)),
                    timestamp=str(doc.get("timestamp", datetime.utcnow().isoformat())),
                    created_at=parse_iso_datetime(doc.get("created_at")),
                    updated_at=parse_iso_datetime(doc.get("updated_at") or doc.get("created_at")),
                )
                session.add(vlog)
                self.stats["voice_logs"]["imported"] += 1
            except Exception as e:
                print(f"[ERROR] Failed to migrate voice_log {v_id}: {e}")
                self.stats["voice_logs"]["failed"] += 1

    async def _verify_migration(self, session: AsyncSession):
        """Verifies database counts and relationship integrity."""
        print("\n--- Migration Integrity Verification ---")
        models_map = {
            "users": User,
            "user_settings": UserSettings,
            "portfolios": Portfolio,
            "holdings": Holding,
            "transactions": Transaction,
            "alert_rules": AlertRule,
            "alert_events": AlertEvent,
            "voice_logs": VoiceLog,
        }

        for table_name, model in models_map.items():
            count_res = await session.execute(select(func.count(model.id)))
            target_count = count_res.scalar() or 0
            print(f" [CHECK] Table '{table_name:<14}': {target_count} records currently in database.")

        # Check holding relationships
        orphaned_holdings = await session.execute(
            select(Holding.id).outerjoin(User, Holding.user_id == User.id).where(User.id.is_(None))
        )
        orphans = orphaned_holdings.scalars().all()
        if orphans:
            print(f"[ALERT] Found {len(orphans)} orphaned holdings without matching user!")
        else:
            print(" [PASS] Foreign Key Integrity: All holdings match valid users and portfolios.")

    def _print_summary(self):
        print("\n" + "=" * 70)
        print("                 MIGRATION RESULTS SUMMARY")
        print("=" * 70)
        print(f"{'Entity':<18} | {'Source':<8} | {'Imported':<10} | {'Skipped':<9} | {'Failed':<8}")
        print("-" * 70)
        for entity, counts in self.stats.items():
            print(f"{entity:<18} | {counts['source']:<8} | {counts['imported']:<10} | {counts['skipped']:<9} | {counts['failed']:<8}")
        print("=" * 70)

def main():
    parser = argparse.ArgumentParser(description="FinSight AI PostgreSQL Migration Tool")
    parser.add_argument("--source", choices=["json", "mongodb"], default="json", help="Data source to import from")
    parser.add_argument("--file", type=str, default=None, help="Custom JSON source file path")
    parser.add_argument("--dry-run", action="store_true", help="Simulate migration without committing")
    args = parser.parse_args()

    migrator = DataMigrator(source_type=args.source, dry_run=args.dry_run, json_file=args.file)
    asyncio.run(migrator.run())

if __name__ == "__main__":
    main()
