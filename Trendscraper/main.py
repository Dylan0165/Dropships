"""Trendscraper entry point — starts FastAPI + APScheduler together"""
import asyncio
import sys
from pathlib import Path
from loguru import logger
import uvicorn

import config
import database
from scheduler import start_scheduler, stop_scheduler
from api import app

# ── Logging setup ─────────────────────────────────────────────────────────────

Path("logs").mkdir(exist_ok=True)
logger.remove()  # remove default stderr handler
logger.add(
    sys.stderr,
    level="INFO",
    format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | {message}",
    colorize=True,
)
logger.add(
    config.LOG_PATH,
    level="DEBUG",
    rotation="10 MB",
    retention="14 days",
    compression="gz",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {name}:{line} — {message}",
)


async def main() -> None:
    # Initialise database
    database.init_db()

    # Start scheduler
    start_scheduler()

    # Start uvicorn server
    server_config = uvicorn.Config(
        app=app,
        host="0.0.0.0",
        port=config.PORT,
        log_level="warning",  # uvicorn access logs off; loguru handles app logs
    )
    server = uvicorn.Server(server_config)

    logger.info("Trendscraper starting on http://0.0.0.0:{}", config.PORT)
    logger.info("API docs: http://localhost:{}/docs", config.PORT)

    try:
        await server.serve()
    finally:
        stop_scheduler()


if __name__ == "__main__":
    asyncio.run(main())
