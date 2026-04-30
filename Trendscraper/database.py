"""SQLite database layer for Trendscraper"""
import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from loguru import logger
import config


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    """Create tables if they do not exist."""
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = _get_conn()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS niche_runs (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp         TEXT NOT NULL,
                status            TEXT NOT NULL DEFAULT 'running',
                total_niches_found INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS niches (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id                INTEGER NOT NULL,
                name                  TEXT NOT NULL,
                trend_score           INTEGER NOT NULL DEFAULT 0,
                competition_level     TEXT NOT NULL DEFAULT 'medium',
                estimated_market_size TEXT NOT NULL DEFAULT 'medium',
                recommended_audience  TEXT NOT NULL DEFAULT '',
                sources               TEXT NOT NULL DEFAULT '[]',
                reasoning             TEXT NOT NULL DEFAULT '',
                status                TEXT NOT NULL DEFAULT 'pending',
                created_at            TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES niche_runs(id)
            );

            CREATE TABLE IF NOT EXISTS products (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                niche_id             INTEGER NOT NULL,
                cj_product_id        TEXT NOT NULL,
                name                 TEXT NOT NULL,
                buy_price            REAL NOT NULL,
                sell_price_suggested REAL NOT NULL,
                margin_percent       REAL NOT NULL,
                delivery_days_nl     INTEGER NOT NULL,
                virality_score       INTEGER NOT NULL DEFAULT 0,
                image_url            TEXT NOT NULL DEFAULT '',
                created_at           TEXT NOT NULL,
                FOREIGN KEY (niche_id) REFERENCES niches(id)
            );

            CREATE TABLE IF NOT EXISTS orders (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                cj_order_id     TEXT NOT NULL DEFAULT '',
                order_number    TEXT NOT NULL UNIQUE,
                status          TEXT NOT NULL DEFAULT 'pending',
                payload_json    TEXT NOT NULL DEFAULT '{}',
                response_json   TEXT NOT NULL DEFAULT '{}',
                error_message   TEXT NOT NULL DEFAULT '',
                created_at      TEXT NOT NULL
            );
        """)
        conn.commit()
        logger.info("Database initialised at {}", config.DB_PATH)
    finally:
        conn.close()


# ── Runs ──────────────────────────────────────────────────────────────────────

def create_run() -> int:
    ts = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO niche_runs (timestamp, status, total_niches_found) VALUES (?, 'running', 0)",
            (ts,),
        )
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]
    finally:
        conn.close()


def finish_run(run_id: int, status: str, total: int) -> None:
    conn = _get_conn()
    try:
        conn.execute(
            "UPDATE niche_runs SET status=?, total_niches_found=? WHERE id=?",
            (status, total, run_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_runs(limit: int = 20) -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM niche_runs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_last_run() -> dict | None:
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM niche_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ── Niches ────────────────────────────────────────────────────────────────────

def insert_niche(
    run_id: int,
    name: str,
    trend_score: int,
    competition_level: str,
    estimated_market_size: str,
    recommended_audience: str,
    sources: list,
    reasoning: str,
) -> int:
    ts = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        cur = conn.execute(
            """INSERT INTO niches
               (run_id, name, trend_score, competition_level, estimated_market_size,
                recommended_audience, sources, reasoning, status, created_at)
               VALUES (?,?,?,?,?,?,?,?,'pending',?)""",
            (
                run_id, name, trend_score, competition_level, estimated_market_size,
                recommended_audience, json.dumps(sources), reasoning, ts,
            ),
        )
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]
    finally:
        conn.close()


def get_niches(status: str = "all") -> list[dict]:
    conn = _get_conn()
    try:
        if status == "all":
            rows = conn.execute("SELECT * FROM niches ORDER BY id DESC").fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM niches WHERE status=? ORDER BY id DESC", (status,)
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_niche_status(niche_id: int, status: str) -> dict | None:
    conn = _get_conn()
    try:
        conn.execute("UPDATE niches SET status=? WHERE id=?", (status, niche_id))
        conn.commit()
        row = conn.execute("SELECT * FROM niches WHERE id=?", (niche_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def count_niches_by_status() -> dict[str, int]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT status, COUNT(*) as cnt FROM niches GROUP BY status"
        ).fetchall()
        result = {"pending": 0, "approved": 0, "rejected": 0}
        for r in rows:
            result[r["status"]] = r["cnt"]
        result["total"] = sum(result.values())
        return result
    finally:
        conn.close()


# ── Products ──────────────────────────────────────────────────────────────────

def insert_product(
    niche_id: int,
    cj_product_id: str,
    name: str,
    buy_price: float,
    sell_price_suggested: float,
    margin_percent: float,
    delivery_days_nl: int,
    virality_score: int,
    image_url: str,
) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO products
               (niche_id, cj_product_id, name, buy_price, sell_price_suggested,
                margin_percent, delivery_days_nl, virality_score, image_url, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                niche_id, cj_product_id, name, buy_price, sell_price_suggested,
                margin_percent, delivery_days_nl, virality_score, image_url, ts,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_products(niche_id: int) -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM products WHERE niche_id=? ORDER BY margin_percent DESC",
            (niche_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ── Orders ────────────────────────────────────────────────────────────────────

def insert_order(
    order_number: str,
    payload_json: str,
    cj_order_id: str = "",
    status: str = "pending",
    response_json: str = "{}",
    error_message: str = "",
) -> int:
    ts = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        cur = conn.execute(
            """INSERT INTO orders
               (cj_order_id, order_number, status, payload_json, response_json, error_message, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (cj_order_id, order_number, status, payload_json, response_json, error_message, ts),
        )
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]
    finally:
        conn.close()


def update_order(
    order_number: str,
    cj_order_id: str = "",
    status: str = "",
    response_json: str = "",
    error_message: str = "",
) -> dict | None:
    conn = _get_conn()
    try:
        sets, params = [], []
        if cj_order_id:
            sets.append("cj_order_id=?")
            params.append(cj_order_id)
        if status:
            sets.append("status=?")
            params.append(status)
        if response_json:
            sets.append("response_json=?")
            params.append(response_json)
        if error_message:
            sets.append("error_message=?")
            params.append(error_message)
        if sets:
            params.append(order_number)
            conn.execute(f"UPDATE orders SET {', '.join(sets)} WHERE order_number=?", params)
            conn.commit()
        row = conn.execute("SELECT * FROM orders WHERE order_number=?", (order_number,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_orders(limit: int = 50) -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM orders ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
