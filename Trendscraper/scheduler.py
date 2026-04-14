"""APScheduler — runs scraper every 6 hours and health-checks every 60 seconds"""
import asyncio
from datetime import datetime, timezone
from loguru import logger
from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore
from apscheduler.triggers.interval import IntervalTrigger  # type: ignore

import config
import database
from runner import run_pipeline

_scheduler: AsyncIOScheduler | None = None


async def _scheduled_run() -> None:
    logger.info("Scheduler: starting scheduled pipeline run")
    await run_pipeline()


async def _health_check() -> None:
    last = database.get_last_run()
    if last:
        logger.debug("Health check OK — last run #{} status={}", last["id"], last["status"])
    else:
        logger.debug("Health check OK — no runs yet")


def get_next_run_time() -> str | None:
    if _scheduler is None:
        return None
    job = _scheduler.get_job("scraper_run")
    if job and job.next_run_time:
        return job.next_run_time.isoformat()
    return None


def start_scheduler(loop: asyncio.AbstractEventLoop | None = None) -> AsyncIOScheduler:
    global _scheduler
    _scheduler = AsyncIOScheduler()

    _scheduler.add_job(
        _scheduled_run,
        trigger=IntervalTrigger(hours=config.SCRAPE_INTERVAL_HOURS),
        id="scraper_run",
        name="Full scraper pipeline",
        replace_existing=True,
        misfire_grace_time=300,
    )

    _scheduler.add_job(
        _health_check,
        trigger=IntervalTrigger(seconds=config.HEALTH_CHECK_INTERVAL_SECONDS),
        id="health_check",
        name="Health check",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(
        "Scheduler started — scraper runs every {} hours",
        config.SCRAPE_INTERVAL_HOURS,
    )
    return _scheduler


def stop_scheduler() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
