"""APScheduler — runs inspection cycle every N hours."""
import asyncio
from loguru import logger
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

import config

_scheduler = BackgroundScheduler()
_loop: asyncio.AbstractEventLoop | None = None


def _run_cycle_in_loop() -> None:
    """Bridge from APScheduler (sync thread) into the async event loop."""
    from runner import run_inspection_cycle
    if _loop is None:
        logger.error("[scheduler] geen event loop beschikbaar")
        return
    future = asyncio.run_coroutine_threadsafe(run_inspection_cycle(), _loop)
    try:
        future.result(timeout=3600)  # max 1 hour per cycle
    except Exception as exc:
        logger.error("[scheduler] cyclus fout: {}", exc)


def _run_premium_crawl_in_loop() -> None:
    """Weekly premium crawl bridge."""
    from crawlers.premium_crawler import run_premium_crawl
    if _loop is None:
        return
    future = asyncio.run_coroutine_threadsafe(run_premium_crawl(), _loop)
    try:
        future.result(timeout=7200)  # max 2 hours for premium crawl
    except Exception as exc:
        logger.error("[scheduler] premium crawl fout: {}", exc)


def start_scheduler(loop: asyncio.AbstractEventLoop | None = None) -> None:
    global _loop
    _loop = loop or asyncio.get_event_loop()

    _scheduler.add_job(
        _run_cycle_in_loop,
        trigger=IntervalTrigger(hours=config.CRAWL_INTERVAL_HOURS),
        id="inspection_cycle",
        replace_existing=True,
        max_instances=1,
    )
    # Premium crawl — every 7 days (168 hours)
    _scheduler.add_job(
        _run_premium_crawl_in_loop,
        trigger=IntervalTrigger(hours=168),
        id="premium_crawl",
        replace_existing=True,
        max_instances=1,
    )
    _scheduler.start()
    logger.info("[scheduler] gestart — interval {} uur (+ premium crawl elke 7 dagen)", config.CRAWL_INTERVAL_HOURS)

    # Run immediately on startup (in the background, non-blocking)
    from runner import run_inspection_cycle
    if _loop:
        asyncio.run_coroutine_threadsafe(run_inspection_cycle(), _loop)
        logger.info("[scheduler] eerste cyclus gestart bij opstarten")


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[scheduler] gestopt")
