"""SQLite database layer for Trendscraper."""

import sqlite3
import os
from datetime import datetime
from typing import TypedDict, Optional

DB_PATH = os.getenv("TRENDSCRAPER_DB", "./data/trendscraper.db")


class NicheRow(TypedDict):
    id: int
    run_id: int
    name: str
    trend_score: int
    competition_level: str
    estimated_market_size: str
    recommended_audience: str
    sources: str
    reasoning: str
    status: str
    created_at: str


def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else ".", exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS niches (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id                INTEGER NOT NULL,
                name                  TEXT NOT NULL,
                trend_score           INTEGER NOT NULL DEFAULT 0,
                competition_level     TEXT NOT NULL DEFAULT 'medium',
                estimated_market_size TEXT NOT NULL DEFAULT '',
                recommended_audience  TEXT NOT NULL DEFAULT '',
                sources               TEXT NOT NULL DEFAULT '',
                reasoning             TEXT NOT NULL DEFAULT '',
                status                TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','approved','rejected','used')),
                created_at            TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (run_id) REFERENCES runs(id)
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_niches_status ON niches(status)")


class DB:
    def count(self) -> int:
        with _conn() as con:
            return con.execute("SELECT COUNT(*) FROM niches").fetchone()[0]

    def new_run(self) -> int:
        with _conn() as con:
            cur = con.execute("INSERT INTO runs DEFAULT VALUES")
            return cur.lastrowid

    def insert_niche(self, run_id: int, data: dict) -> NicheRow:
        with _conn() as con:
            cur = con.execute(
                """INSERT INTO niches
                   (run_id, name, trend_score, competition_level,
                    estimated_market_size, recommended_audience, sources, reasoning)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    run_id,
                    data.get("name", ""),
                    int(data.get("trend_score", 0)),
                    data.get("competition_level", "medium"),
                    data.get("estimated_market_size", ""),
                    data.get("recommended_audience", ""),
                    data.get("sources", ""),
                    data.get("reasoning", ""),
                ),
            )
            row = con.execute("SELECT * FROM niches WHERE id=?", (cur.lastrowid,)).fetchone()
            return dict(row)

    def get_niches(self, status: Optional[str]) -> list[NicheRow]:
        with _conn() as con:
            if status:
                rows = con.execute(
                    "SELECT * FROM niches WHERE status=? ORDER BY trend_score DESC", (status,)
                ).fetchall()
            else:
                rows = con.execute(
                    "SELECT * FROM niches ORDER BY trend_score DESC"
                ).fetchall()
            return [dict(r) for r in rows]

    def set_status(self, niche_id: int, status: str) -> Optional[NicheRow]:
        with _conn() as con:
            con.execute("UPDATE niches SET status=? WHERE id=?", (status, niche_id))
            row = con.execute("SELECT * FROM niches WHERE id=?", (niche_id,)).fetchone()
            return dict(row) if row else None
