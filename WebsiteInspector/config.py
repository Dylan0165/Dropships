"""WebsiteInspector configuration — loaded from .env"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── LLM (OpenAI-compatible: Ollama or DeepSeek) ───────────────────────────────
LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen2.5:14b")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")

# ── Upstream services ─────────────────────────────────────────────────────────
TRENDSCRAPER_URL: str = os.getenv("TRENDSCRAPER_URL", "http://localhost:8001")

# ── Server ────────────────────────────────────────────────────────────────────
PORT: int = int(os.getenv("PORT", "8002"))

# ── Database + storage ────────────────────────────────────────────────────────
DB_PATH: str = os.getenv("DB_PATH", "inspector.db")
SCREENSHOT_DIR: str = os.getenv("SCREENSHOT_DIR", "data/screenshots")
LOG_PATH: str = "logs/inspector.log"

# ── Crawl behaviour ───────────────────────────────────────────────────────────
MAX_STORES_PER_CYCLE: int = int(os.getenv("MAX_STORES_PER_CYCLE", "10"))
CRAWL_INTERVAL_HOURS: int = int(os.getenv("CRAWL_INTERVAL_HOURS", "12"))
RATE_LIMIT_SECONDS: float = float(os.getenv("RATE_LIMIT_SECONDS", "5"))
RECRAWL_DAYS: int = 7          # skip if crawled within this many days
MIN_PATTERNS_FOR_INSPIRATION: int = 3

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
]
