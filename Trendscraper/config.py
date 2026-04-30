"""Trendscraper configuration — loaded from .env"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── DeepSeek ─────────────────────────────────────────────────────
DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL: str = "deepseek-chat"

# ── CJ Dropshipping ───────────────────────────────────────────────
CJ_API_KEY: str = os.getenv("CJ_API_KEY", "")
CJ_BASE_URL: str = "https://developers.cjdropshipping.com"

# ── Reddit ────────────────────────────────────────────────────────
REDDIT_CLIENT_ID: str = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET: str = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT: str = os.getenv("REDDIT_USER_AGENT", "trendscraper/1.0 by dropshipping_tool")

# ── Server ────────────────────────────────────────────────────────
PORT: int = int(os.getenv("PORT", "8001"))

# ── Scheduler ────────────────────────────────────────────────────
SCRAPE_INTERVAL_HOURS: int = 6
HEALTH_CHECK_INTERVAL_SECONDS: int = 60

# ── Filters ──────────────────────────────────────────────────────
REDDIT_MIN_SCORE: int = 100
REDDIT_DAYS_BACK: int = 7
PRODUCT_MIN_MARGIN_FACTOR: float = 3.0
PRODUCT_MAX_DELIVERY_DAYS: int = 12

# ── CJ product quality filters ───────────────────────────────────
PRODUCT_MIN_EXISTING_ORDERS: int = 50
PRODUCT_MIN_IMAGES: int = 3
PRODUCT_MIN_MARGIN_PCT: float = 40.0
PRODUCT_REJECT_PATTERN: str = r"(?i)\b(nike|adidas|apple|samsung|replica|lithium|lipo)\b"
PRODUCT_DEFAULT_COUNTRY: str = "NL"

# ── Rate limiting (seconds between external requests) ────────────
RATE_LIMIT_SECONDS: float = 1.0

# ── CORS origins ─────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
]

# ── Database ──────────────────────────────────────────────────────
DB_PATH: str = "trendscraper.db"
LOG_PATH: str = "logs/scraper.log"

# ── Enabled scrape categories ─────────────────────────────────────
ENABLED_CATEGORIES: list[str] = [
    "home",
    "fitness",
    "beauty",
    "tech_accessories",
    "outdoor",
    "kitchen",
    "pet",
    "wellness",
    "baby",
    "garden",
    "automotive",
    "travel",
]

# ── TikTok Shop ────────────────────────────────────────────────────
TIKTOK_SHOP_ENABLED: bool = True
TIKTOK_SHOP_MAX_PRODUCTS: int = 20
