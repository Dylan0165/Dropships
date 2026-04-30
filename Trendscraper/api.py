"""FastAPI REST API for Trendscraper — port 8001"""
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

import config
import database
import scheduler as sched
from models import CJOrder
from runner import run_pipeline
from scrapers import cj_products as cj

app = FastAPI(
    title="Trendscraper API",
    description="AI-powered dropshipping niche discovery service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "online", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── Status ────────────────────────────────────────────────────────────────────

@app.get("/status")
async def status():
    last_run = database.get_last_run()
    counts = database.count_niches_by_status()
    next_run = sched.get_next_run_time()
    return {
        "last_run": last_run,
        "next_run_time": next_run,
        "niche_counts": counts,
    }


# ── Runs ──────────────────────────────────────────────────────────────────────

@app.get("/runs")
async def get_runs():
    return database.get_runs(limit=20)


# ── Niches ────────────────────────────────────────────────────────────────────

@app.get("/niches")
async def get_niches(status: Optional[str] = "all"):
    allowed = {"all", "pending", "approved", "rejected"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")
    return database.get_niches(status=status)


@app.post("/niches/{niche_id}/approve")
async def approve_niche(niche_id: int):
    updated = database.update_niche_status(niche_id, "approved")
    if not updated:
        raise HTTPException(status_code=404, detail="Niche not found")
    return updated


@app.post("/niches/{niche_id}/reject")
async def reject_niche(niche_id: int):
    updated = database.update_niche_status(niche_id, "rejected")
    if not updated:
        raise HTTPException(status_code=404, detail="Niche not found")
    return updated


# ── Manual trigger ────────────────────────────────────────────────────────────

@app.post("/run/trigger")
async def trigger_run(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_in_background)
    return {"message": "run started"}


async def _run_in_background() -> None:
    try:
        await run_pipeline()
    except Exception as exc:
        logger.error("Background run error: {}", exc)


# ── Products ──────────────────────────────────────────────────────────────────

@app.get("/products")
async def get_products(niche_id: int):
    return database.get_products(niche_id)


# ── CJ Orders ─────────────────────────────────────────────────────────────────

@app.post("/orders")
async def create_order(order: CJOrder):
    """Place a real order at CJ Dropshipping and persist the result."""
    payload_json = order.model_dump_json()

    # Pre-insert in 'pending' state so we always have an audit trail
    try:
        database.insert_order(
            order_number=order.order_number,
            payload_json=payload_json,
            status="pending",
        )
    except Exception as exc:
        # Likely UNIQUE constraint — order_number already exists
        logger.warning("Order {} already exists or insert failed: {}", order.order_number, exc)
        raise HTTPException(status_code=409, detail=f"order_number '{order.order_number}' already exists")

    try:
        cj_order_id = await cj.place_order(order)
    except Exception as exc:
        database.update_order(
            order.order_number,
            status="failed",
            error_message=str(exc)[:500],
        )
        logger.error("place_order failed for {}: {}", order.order_number, exc)
        raise HTTPException(status_code=502, detail=f"CJ order failed: {exc}")

    updated = database.update_order(
        order.order_number,
        cj_order_id=cj_order_id,
        status="placed",
        response_json=json.dumps({"orderId": cj_order_id}),
    )
    return updated


@app.get("/orders")
async def list_orders(limit: int = 50):
    return database.get_orders(limit=limit)
