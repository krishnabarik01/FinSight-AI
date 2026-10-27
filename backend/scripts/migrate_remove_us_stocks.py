"""
FinSight AI — Database Migration Script: Remove All US Stock Records
Safely eliminates all US stock market records from SQLite and JSON databases,
migrates demo holdings to verified Indian equities (NSE), and maintains a timestamped backup.
"""

import os
import shutil
import sqlite3
import json
import time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "finsight_local.db")
JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "finsight_db.json")

DISALLOWED_US_SYMBOLS = {
    "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "NFLX",
    "AMD", "INTC", "SPY", "QQQ", "DIA", "BABA", "BRK.A", "BRK.B", "JPM", "V",
    "MA", "DIS", "PYPL", "BAC", "WMT", "PG", "XOM", "CVX", "JNJ", "PFE", "KO",
    "PEP", "COST", "CRM", "ORCL", "CSCO", "IBM", "UBER", "ABNB", "PLTR", "COIN",
    "SNOW", "AVGO", "QCOM", "TXN", "MU", "ARM", "SHOP", "NOW", "PANW", "CRWD",
    "NS"  # corrupted test artifact
}

def migrate_sqlite():
    if not os.path.exists(DB_PATH):
        print(f"[SKIP] SQLite DB not found at {DB_PATH}")
        return

    # 1. Create a safe backup
    backup_path = f"{DB_PATH}.backup_{int(time.time())}"
    shutil.copy2(DB_PATH, backup_path)
    print(f"[BACKUP] Created backup at {backup_path}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    try:
        tables_to_clean = [
            ("holdings", "symbol"),
            ("transactions", "symbol"),
            ("alert_rules", "symbol"),
            ("alert_events", "symbol"),
            ("voice_logs", "symbol"),
            ("watchlists", "symbol")
        ]

        total_deleted = 0
        for table, col in tables_to_clean:
            # Check if table exists
            cur.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (table,))
            if not cur.fetchone():
                continue

            for sym in DISALLOWED_US_SYMBOLS:
                cur.execute(f"DELETE FROM {table} WHERE UPPER(TRIM({col})) = ?;", (sym,))
                if cur.rowcount > 0:
                    print(f"[CLEAN] Deleted {cur.rowcount} row(s) with symbol '{sym}' from '{table}'")
                    total_deleted += cur.rowcount

        # Ensure demo user has active Indian equity holdings
        cur.execute("SELECT id FROM users WHERE email='demo@finsight.ai';")
        demo_user = cur.fetchone()
        if demo_user:
            demo_user_id = demo_user[0]
            cur.execute("SELECT id FROM portfolios WHERE user_id=?;", (demo_user_id,))
            demo_p = cur.fetchone()
            if demo_p:
                demo_p_id = demo_p[0]
                # Check current holdings count
                cur.execute("SELECT count(*) FROM holdings WHERE user_id=?;", (demo_user_id,))
                cnt = cur.fetchone()[0]
                if cnt == 0:
                    print("[SEED] Adding clean Indian holdings for demo user...")
                    indian_holdings = [
                        ("hold-in-1", demo_user_id, demo_p_id, "RELIANCE.NS", "Reliance Industries Limited", "Energy & Telecom", 50.0, 2840.00, "2026-02-10", 2700.00, 3400.00, "India conglomerate with retail, 5G, and green energy tailwinds."),
                        ("hold-in-2", demo_user_id, demo_p_id, "TCS.NS", "Tata Consultancy Services Ltd", "Information Technology", 30.0, 3890.00, "2026-05-02", 3650.00, 4500.00, "High return on equity cash-cow IT exporter."),
                        ("hold-in-3", demo_user_id, demo_p_id, "INFY.NS", "Infosys Limited", "Information Technology", 45.0, 1820.00, "2026-03-12", 1720.00, 2100.00, "Core IT exporter position with digital transformation monetization."),
                        ("hold-in-4", demo_user_id, demo_p_id, "HDFCBANK.NS", "HDFC Bank Limited", "Banking & Financial Services", 60.0, 1640.00, "2026-04-18", 1550.00, 1850.00, "Private sector banking leader benefiting from credit expansion."),
                        ("hold-in-5", demo_user_id, demo_p_id, "ICICIBANK.NS", "ICICI Bank Limited", "Banking & Financial Services", 55.0, 1210.00, "2026-06-15", 1150.00, 1380.00, "Strong NIM expansion and asset quality metrics.")
                    ]
                    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
                    for h in indian_holdings:
                        cur.execute("""
                            INSERT INTO holdings (id, user_id, portfolio_id, symbol, company_name, sector, quantity, purchase_price, purchase_date, stop_loss, target_price, notes, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                        """, (*h, now_ts, now_ts))
                    print(f"[SEED] Inserted {len(indian_holdings)} Indian holdings.")

        conn.commit()
        print(f"[SUCCESS] SQLite migration complete. Total removed rows: {total_deleted}")
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] SQLite migration failed: {e}")
        raise
    finally:
        conn.close()

def migrate_json():
    if not os.path.exists(JSON_PATH):
        return
    try:
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        modified = False
        for collection in ["holdings", "transactions", "alerts", "alert_rules", "watchlists", "voice_logs"]:
            if collection in data and isinstance(data[collection], list):
                original_len = len(data[collection])
                data[collection] = [
                    item for item in data[collection]
                    if item.get("symbol", "").upper().strip() not in DISALLOWED_US_SYMBOLS
                ]
                if len(data[collection]) != original_len:
                    print(f"[JSON] Filtered {original_len - len(data[collection])} US records from '{collection}'")
                    modified = True

        if modified:
            with open(JSON_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            print("[JSON] Successfully cleaned JSON database.")
    except Exception as e:
        print(f"[WARN] Failed to clean JSON db: {e}")

if __name__ == "__main__":
    migrate_sqlite()
    migrate_json()
