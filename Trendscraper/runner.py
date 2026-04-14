"""Full scraper pipeline — orchestrates all scrapers + analyzer + DB writes"""
import asyncio
from datetime import datetime, timezone
from loguru import logger

import database
from models import ScraperAggregate
from scrapers.reddit import scrape_reddit
from scrapers.google_trends import scrape_google_trends
from scrapers.tiktok import scrape_tiktok
from scrapers.cj_products import scrape_cj_products
from analyzer import analyze_trends


async def run_pipeline() -> int:
    """Run full scrape → analyze → persist cycle.

    Returns the number of niches saved, or -1 on critical failure.
    """
    run_id = database.create_run()
    logger.info("=== Starting scraper run #{} ===", run_id)
    start = datetime.now(timezone.utc)

    try:
        # ── 1. Run all scrapers concurrently ─────────────────────────────────
        reddit_task = asyncio.create_task(scrape_reddit())
        trends_task = asyncio.create_task(scrape_google_trends())
        tiktok_task = asyncio.create_task(scrape_tiktok())

        reddit_posts, trend_terms, tiktok_hashtags = await asyncio.gather(
            reddit_task, trends_task, tiktok_task
        )

        aggregate = ScraperAggregate(
            reddit_posts=reddit_posts,
            trend_terms=trend_terms,
            tiktok_hashtags=tiktok_hashtags,
        )

        # ── 2. AI analysis ────────────────────────────────────────────────────
        niches = await analyze_trends(aggregate)

        if not niches:
            database.finish_run(run_id, "failed", 0)
            logger.error("Run #{} failed — no niches returned", run_id)
            return -1

        # ── 3. Persist niches ─────────────────────────────────────────────────
        all_keywords = [n.name for n in niches]
        cj_products = await scrape_cj_products(all_keywords)

        # Build a keyword→products mapping
        kw_map: dict[str, list] = {n.name.lower(): [] for n in niches}
        for p in cj_products:
            for kw in kw_map:
                if kw in p.name.lower():
                    kw_map[kw].append(p)
                    break

        for niche in niches:
            niche_id = database.insert_niche(
                run_id=run_id,
                name=niche.name,
                trend_score=niche.trend_score,
                competition_level=niche.competition_level,
                estimated_market_size=niche.estimated_market_size,
                recommended_audience=niche.recommended_audience,
                sources=["reddit", "google_trends", "tiktok"],
                reasoning=niche.reasoning,
            )

            for prod in kw_map.get(niche.name.lower(), [])[:5]:
                database.insert_product(
                    niche_id=niche_id,
                    cj_product_id=prod.cj_product_id,
                    name=prod.name,
                    buy_price=prod.buy_price,
                    sell_price_suggested=prod.sell_price_suggested,
                    margin_percent=prod.margin_percent,
                    delivery_days_nl=prod.delivery_days_nl,
                    virality_score=0,
                    image_url=prod.image_url,
                )

        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        database.finish_run(run_id, "completed", len(niches))
        logger.info("=== Run #{} completed in {:.1f}s — {} niches ===", run_id, elapsed, len(niches))
        return len(niches)

    except Exception as exc:
        logger.error("Run #{} CRITICAL ERROR: {}", run_id, exc)
        database.finish_run(run_id, "failed", 0)
        return -1
