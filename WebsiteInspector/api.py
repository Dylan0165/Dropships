"""WebsiteInspector FastAPI route definitions."""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from loguru import logger

import database
import config

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "ok": True,
        "service": "WebsiteInspector",
        "port": config.PORT,
        "llm_model": config.LLM_MODEL,
        "llm_base_url": config.LLM_BASE_URL,
    }


@router.get("/status")
async def status():
    last = database.get_last_run()
    stores = database.get_stores(limit=1)
    total_stores = len(database.get_stores(limit=10_000))
    return {
        "last_run": last,
        "total_stores_indexed": total_stores,
        "crawl_interval_hours": config.CRAWL_INTERVAL_HOURS,
        "max_stores_per_cycle": config.MAX_STORES_PER_CYCLE,
    }


@router.get("/runs")
async def get_runs():
    return database.get_recent_runs(20)


@router.get("/stores")
async def get_stores(niche: str | None = Query(default=None)):
    return database.get_stores(niche=niche, limit=200)


@router.get("/patterns")
async def get_patterns(niche: str = Query(..., description="Niche naam")):
    patterns = database.get_patterns(niche, limit=50)
    if not patterns:
        raise HTTPException(status_code=404, detail=f"Geen patronen gevonden voor niche '{niche}'")
    return patterns


@router.get("/inspiration")
async def get_inspiration(niche: str = Query(..., description="Niche naam")):
    """Returns the best synthesised design inspiration for a niche.
    Used by the store-builder in UIcontrol.
    """
    insp = database.get_inspiration(niche)
    if not insp:
        # Try a fuzzy niche match
        all_insps = database.get_all_inspirations()
        for i in all_insps:
            if niche.lower() in i["niche"].lower() or i["niche"].lower() in niche.lower():
                return i
        raise HTTPException(
            status_code=404,
            detail=f"Geen inspiratie beschikbaar voor '{niche}'. Wacht op een analysecyclus of trigger /run/trigger.",
        )
    return insp


@router.get("/animations")
async def get_animations(
    difficulty: str | None = Query(default=None, description="easy|medium|hard"),
    performance: str | None = Query(default=None, description="low|medium|high"),
    niche: str | None = Query(default=None),
):
    """
    Returns animation techniques from the premium brand library.
    Filter by difficulty, performance_impact, or niche.
    """
    entries = database.get_animation_library(
        difficulty=difficulty,
        performance_impact=performance,
        niche=niche,
        limit=200,
    )
    return {
        "count": len(entries),
        "filters": {"difficulty": difficulty, "performance": performance, "niche": niche},
        "entries": entries,
    }


@router.post("/run/trigger")
async def trigger_run(background_tasks: BackgroundTasks):
    """Manually trigger an inspection cycle (runs in background)."""
    from runner import run_inspection_cycle
    background_tasks.add_task(run_inspection_cycle)
    logger.info("[api] handmatige cycle getriggerd")
    return {"triggered": True, "message": "Inspectiecyclus gestart op de achtergrond"}


@router.post("/run/premium")
async def trigger_premium_crawl(background_tasks: BackgroundTasks):
    """Trigger a premium site crawl cycle (runs in background)."""
    from crawlers.premium_crawler import run_premium_crawl
    background_tasks.add_task(run_premium_crawl)
    logger.info("[api] premium crawl getriggerd")
    return {"triggered": True, "message": "Premium crawl gestart op de achtergrond"}
