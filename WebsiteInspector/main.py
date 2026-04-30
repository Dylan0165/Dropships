"""WebsiteInspector entry point — FastAPI + APScheduler."""
import asyncio
import sys
from pathlib import Path
from loguru import logger
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
import database
from api import router
from scheduler import start_scheduler, stop_scheduler

# ── Logging ───────────────────────────────────────────────────────────────────

Path("logs").mkdir(exist_ok=True)
logger.remove()
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

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="WebsiteInspector",
    description="Crawls dropshipping stores and analyses design/copy patterns.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# ── Lifecycle ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    database.init_db()
    loop = asyncio.get_event_loop()
    start_scheduler(loop)
    logger.info("WebsiteInspector gestart op http://0.0.0.0:{}", config.PORT)
    logger.info("API docs: http://localhost:{}/docs", config.PORT)


@app.on_event("shutdown")
async def on_shutdown():
    stop_scheduler()


# ── Direct run ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=False,
        log_level="warning",
    )
