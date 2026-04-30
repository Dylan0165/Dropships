"""SQLite database setup and query helpers (sync, via aiosqlite in async context)"""
import json
import sqlite3
from pathlib import Path
from typing import Optional
from loguru import logger

import config

# ── Init ──────────────────────────────────────────────────────────────────────

def init_db() -> None:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript("""
        CREATE TABLE IF NOT EXISTS crawl_runs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at   TEXT NOT NULL,
            completed_at TEXT,
            status       TEXT NOT NULL DEFAULT 'running',
            stores_found    INTEGER NOT NULL DEFAULT 0,
            stores_analyzed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS stores (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            url             TEXT NOT NULL UNIQUE,
            domain          TEXT NOT NULL,
            niche           TEXT NOT NULL DEFAULT '',
            first_seen      TEXT NOT NULL,
            last_crawled    TEXT,
            crawl_count     INTEGER NOT NULL DEFAULT 0,
            is_active       INTEGER NOT NULL DEFAULT 1,
            screenshot_path TEXT,
            status          TEXT NOT NULL DEFAULT 'pending'
        );
        CREATE INDEX IF NOT EXISTS idx_stores_niche  ON stores(niche);
        CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);

        CREATE TABLE IF NOT EXISTS store_patterns (
            id                       INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id                 INTEGER NOT NULL,
            analyzed_at              TEXT NOT NULL,
            niche                    TEXT NOT NULL,
            primary_color            TEXT,
            secondary_color          TEXT,
            accent_color             TEXT,
            font_style               TEXT,
            layout_type              TEXT,
            hero_type                TEXT,
            tone                     TEXT,
            headline_pattern         TEXT,
            cta_text_pattern         TEXT,
            usp_count                INTEGER,
            has_countdown_timer      INTEGER NOT NULL DEFAULT 0,
            has_social_proof         INTEGER NOT NULL DEFAULT 0,
            has_money_back           INTEGER NOT NULL DEFAULT 0,
            has_free_shipping_banner INTEGER NOT NULL DEFAULT 0,
            section_order            TEXT NOT NULL DEFAULT '[]',
            product_count_on_homepage INTEGER,
            quality_score            INTEGER,
            reasoning                TEXT,
            FOREIGN KEY (store_id) REFERENCES stores(id)
        );
        CREATE INDEX IF NOT EXISTS idx_patterns_niche ON store_patterns(niche);

        CREATE TABLE IF NOT EXISTS design_inspirations (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            niche              TEXT NOT NULL UNIQUE,
            created_at         TEXT NOT NULL,
            color_palette      TEXT NOT NULL DEFAULT '[]',
            recommended_layout TEXT NOT NULL DEFAULT 'minimal',
            recommended_tone   TEXT NOT NULL DEFAULT 'friendly',
            headline_formula   TEXT NOT NULL DEFAULT '',
            section_order      TEXT NOT NULL DEFAULT '[]',
            source_store_ids   TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_inspirations_niche ON design_inspirations(niche);

        -- placeholder: animation_techniques migrated below

        -- v2: premium animation library
        CREATE TABLE IF NOT EXISTS animation_library (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            name                TEXT NOT NULL,
            technique_type      TEXT NOT NULL,
            description         TEXT NOT NULL DEFAULT '',
            implementation_hint TEXT NOT NULL DEFAULT '',
            source_url          TEXT NOT NULL DEFAULT '',
            source_brand        TEXT NOT NULL DEFAULT '',
            niche               TEXT NOT NULL DEFAULT '',
            difficulty          TEXT NOT NULL DEFAULT 'medium',
            performance_impact  TEXT NOT NULL DEFAULT 'medium',
            created_at          TEXT NOT NULL,
            UNIQUE(technique_type, source_url)
        );
        CREATE INDEX IF NOT EXISTS idx_animation_technique ON animation_library(technique_type);
        CREATE INDEX IF NOT EXISTS idx_animation_difficulty ON animation_library(difficulty);
    """)
    # v2 migration: add animation_techniques if not present
    try:
        con.execute("ALTER TABLE store_patterns ADD COLUMN animation_techniques TEXT NOT NULL DEFAULT '[]'")
        con.commit()
        logger.info("Migration applied: store_patterns.animation_techniques")
    except Exception:
        pass  # column already exists

    con.commit()
    con.close()
    logger.info("Database initialised: {}", config.DB_PATH)


# ── Crawl runs ────────────────────────────────────────────────────────────────

def start_crawl_run() -> int:
    from datetime import datetime, timezone
    con = sqlite3.connect(config.DB_PATH)
    cur = con.execute(
        "INSERT INTO crawl_runs (started_at, status) VALUES (?, 'running')",
        (datetime.now(timezone.utc).isoformat(),),
    )
    run_id = cur.lastrowid
    con.commit()
    con.close()
    return run_id


def finish_crawl_run(run_id: int, stores_found: int, stores_analyzed: int, status: str = "completed") -> None:
    from datetime import datetime, timezone
    con = sqlite3.connect(config.DB_PATH)
    con.execute(
        "UPDATE crawl_runs SET completed_at=?, status=?, stores_found=?, stores_analyzed=? WHERE id=?",
        (datetime.now(timezone.utc).isoformat(), status, stores_found, stores_analyzed, run_id),
    )
    con.commit()
    con.close()


def get_recent_runs(limit: int = 20) -> list[dict]:
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT * FROM crawl_runs ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def get_last_run() -> Optional[dict]:
    rows = get_recent_runs(1)
    return rows[0] if rows else None


# ── Stores ────────────────────────────────────────────────────────────────────

def upsert_store(url: str, domain: str, niche: str) -> int:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    con = sqlite3.connect(config.DB_PATH)
    cur = con.execute(
        """INSERT INTO stores (url, domain, niche, first_seen, status)
           VALUES (?, ?, ?, ?, 'pending')
           ON CONFLICT(url) DO UPDATE SET niche=excluded.niche
        """,
        (url, domain, niche, now),
    )
    store_id = cur.lastrowid or con.execute("SELECT id FROM stores WHERE url=?", (url,)).fetchone()[0]
    con.commit()
    con.close()
    return store_id


def mark_store_crawled(store_id: int, screenshot_path: Optional[str], status: str = "analyzed") -> None:
    from datetime import datetime, timezone
    con = sqlite3.connect(config.DB_PATH)
    con.execute(
        """UPDATE stores
           SET last_crawled=?, crawl_count=crawl_count+1, screenshot_path=?, status=?
           WHERE id=?""",
        (datetime.now(timezone.utc).isoformat(), screenshot_path, status, store_id),
    )
    con.commit()
    con.close()


def get_stores(niche: Optional[str] = None, limit: int = 100) -> list[dict]:
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    if niche:
        rows = con.execute(
            "SELECT * FROM stores WHERE niche=? ORDER BY last_crawled DESC LIMIT ?",
            (niche, limit),
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT * FROM stores ORDER BY last_crawled DESC LIMIT ?", (limit,)
        ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def get_pending_stores(niche: Optional[str] = None) -> list[dict]:
    """Return stores not crawled recently (or never)."""
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=config.RECRAWL_DAYS)).isoformat()
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    if niche:
        rows = con.execute(
            "SELECT * FROM stores WHERE niche=? AND (last_crawled IS NULL OR last_crawled < ?)",
            (niche, cutoff),
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT * FROM stores WHERE last_crawled IS NULL OR last_crawled < ?",
            (cutoff,),
        ).fetchall()
    con.close()
    return [dict(r) for r in rows]


# ── Patterns ──────────────────────────────────────────────────────────────────

def save_pattern(store_id: int, niche: str, pattern: "StorePattern") -> int:  # noqa: F821
    from datetime import datetime, timezone
    from models import StorePattern
    assert isinstance(pattern, StorePattern)
    con = sqlite3.connect(config.DB_PATH)
    cur = con.execute(
        """INSERT INTO store_patterns
           (store_id, analyzed_at, niche, primary_color, secondary_color, accent_color,
            font_style, layout_type, hero_type, tone, headline_pattern, cta_text_pattern,
            usp_count, has_countdown_timer, has_social_proof, has_money_back,
            has_free_shipping_banner, section_order, product_count_on_homepage,
            quality_score, reasoning)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            store_id, datetime.now(timezone.utc).isoformat(), niche,
            pattern.primary_color, pattern.secondary_color, pattern.accent_color,
            pattern.font_style, pattern.layout_type, pattern.hero_type, pattern.tone,
            pattern.headline_pattern, pattern.cta_text_pattern, pattern.usp_count,
            int(pattern.has_countdown_timer), int(pattern.has_social_proof),
            int(pattern.has_money_back), int(pattern.has_free_shipping_banner),
            json.dumps(pattern.section_order), pattern.product_count_on_homepage,
            pattern.quality_score, pattern.reasoning,
        ),
    )
    row_id = cur.lastrowid
    con.commit()
    con.close()
    return row_id


def get_patterns(niche: str, limit: int = 20) -> list[dict]:
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT * FROM store_patterns WHERE niche=? ORDER BY quality_score DESC LIMIT ?",
        (niche, limit),
    ).fetchall()
    con.close()
    result = []
    for r in rows:
        d = dict(r)
        d["section_order"] = json.loads(d.get("section_order") or "[]")
        result.append(d)
    return result


def count_patterns(niche: str) -> int:
    con = sqlite3.connect(config.DB_PATH)
    count = con.execute(
        "SELECT COUNT(*) FROM store_patterns WHERE niche=?", (niche,)
    ).fetchone()[0]
    con.close()
    return count


# ── Design inspirations ───────────────────────────────────────────────────────

def save_inspiration(insp: "DesignInspiration") -> None:  # noqa: F821
    from datetime import datetime, timezone
    from models import DesignInspiration
    assert isinstance(insp, DesignInspiration)
    con = sqlite3.connect(config.DB_PATH)
    con.execute(
        """INSERT INTO design_inspirations
           (niche, created_at, color_palette, recommended_layout, recommended_tone,
            headline_formula, section_order, source_store_ids)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(niche) DO UPDATE SET
             created_at=excluded.created_at,
             color_palette=excluded.color_palette,
             recommended_layout=excluded.recommended_layout,
             recommended_tone=excluded.recommended_tone,
             headline_formula=excluded.headline_formula,
             section_order=excluded.section_order,
             source_store_ids=excluded.source_store_ids
        """,
        (
            insp.niche, datetime.now(timezone.utc).isoformat(),
            json.dumps(insp.color_palette), insp.recommended_layout,
            insp.recommended_tone, insp.headline_formula,
            json.dumps(insp.section_order), json.dumps(insp.source_store_ids),
        ),
    )
    con.commit()
    con.close()


def get_inspiration(niche: str) -> Optional[dict]:
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    row = con.execute(
        "SELECT * FROM design_inspirations WHERE niche=?", (niche,)
    ).fetchone()
    con.close()
    if not row:
        return None
    d = dict(row)
    d["color_palette"] = json.loads(d.get("color_palette") or "[]")
    d["section_order"] = json.loads(d.get("section_order") or "[]")
    d["source_store_ids"] = json.loads(d.get("source_store_ids") or "[]")
    return d


# ── Animation library (TAAK 1 v2) ────────────────────────────────────────────

def save_animation_library_entries(entries: list[dict]) -> int:
    """Insert/replace animation library entries.  Returns number actually inserted."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    con = sqlite3.connect(config.DB_PATH)
    saved = 0
    for e in entries:
        try:
            cur = con.execute(
                """INSERT OR IGNORE INTO animation_library
                   (name, technique_type, description, implementation_hint,
                    source_url, source_brand, niche, difficulty, performance_impact, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    e.get("name", ""), e.get("technique_type", ""), e.get("description", ""),
                    e.get("implementation_hint", ""), e.get("source_url", ""), e.get("source_brand", ""),
                    e.get("niche", ""), e.get("difficulty", "medium"), e.get("performance_impact", "medium"),
                    now,
                ),
            )
            if cur.rowcount:
                saved += 1
        except Exception:
            pass
    con.commit()
    con.close()
    return saved


def get_animation_library(
    difficulty: Optional[str] = None,
    performance_impact: Optional[str] = None,
    niche: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    conditions = []
    params: list = []
    if difficulty:
        conditions.append("difficulty = ?")
        params.append(difficulty)
    if performance_impact:
        conditions.append("performance_impact = ?")
        params.append(performance_impact)
    if niche:
        conditions.append("niche = ?")
        params.append(niche)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        f"SELECT * FROM animation_library {where} ORDER BY created_at DESC LIMIT ?",
        params,
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def get_animation_library_count() -> int:
    con = sqlite3.connect(config.DB_PATH)
    count = con.execute("SELECT COUNT(*) FROM animation_library").fetchone()[0]
    con.close()
    return count


def get_all_inspirations() -> list[dict]:
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT * FROM design_inspirations ORDER BY niche").fetchall()
    con.close()
    result = []
    for r in rows:
        d = dict(r)
        d["color_palette"] = json.loads(d.get("color_palette") or "[]")
        d["section_order"] = json.loads(d.get("section_order") or "[]")
        d["source_store_ids"] = json.loads(d.get("source_store_ids") or "[]")
        result.append(d)
    return result
