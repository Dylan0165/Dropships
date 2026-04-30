"""
Inspection cycle orchestrator.
Coordinates: niche discovery → URL finding → crawling → analysis → inspiration.
"""
import asyncio
from urllib.parse import urlparse

from loguru import logger

import config
import database
from models import StorePattern
from analyzer import analyze_store, generate_inspiration
from crawlers.google_shopping import find_stores
from crawlers.myip_ms import get_trending_shopify_stores
from crawlers.page_crawler import crawl_store

FALLBACK_NICHES = ["fitness", "beauty", "gadgets", "home", "pet"]


async def _get_approved_niches() -> list[str]:
    """Fetch approved niches from Trendscraper. Falls back to hardcoded list."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{config.TRENDSCRAPER_URL}/niches?status=approved")
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and data:
                    niches = [n.get("name", "") for n in data if n.get("name")]
                    if niches:
                        logger.debug("[runner] {} niche(s) van Trendscraper opgehaald", len(niches))
                        return niches
    except Exception as exc:
        logger.warning("[runner] Trendscraper offline ({}), gebruik fallback niches", exc)
    return FALLBACK_NICHES


def _all_store_urls_for_niche(niche: str, discovered: list[str]) -> list[str]:
    """Merge discovered URLs with seedlist; deduplicate."""
    seed = get_trending_shopify_stores(niche)
    seen: set[str] = set()
    result: list[str] = []
    for url in discovered + seed:
        key = urlparse(url).netloc
        if key not in seen:
            seen.add(key)
            result.append(url)
    return result


async def run_inspection_cycle() -> None:
    """Main inspection cycle — called by scheduler every 12 hours."""
    run_id = database.start_crawl_run()
    logger.info("[runner] inspectie cyclus gestart (run #{})", run_id)

    stores_found = 0
    stores_analyzed = 0

    try:
        niches = await _get_approved_niches()
        # Process max 3 niches per cycle to avoid overload
        active_niches = niches[:3]
        logger.info("[runner] verwerken niches: {}", active_niches)

        total_store_count = 0

        for niche in active_niches:
            if total_store_count >= config.MAX_STORES_PER_CYCLE:
                logger.info("[runner] max stores per cycle bereikt ({})", config.MAX_STORES_PER_CYCLE)
                break

            logger.info("[runner] niche: '{}'", niche)

            # Discover new stores via Google Shopping
            keywords = [niche, f"{niche} kopen", f"beste {niche}"]
            try:
                discovered = await find_stores(keywords)
            except Exception as exc:
                logger.warning("[runner] find_stores mislukt voor '{}': {}", niche, exc)
                discovered = []

            all_urls = _all_store_urls_for_niche(niche, discovered)

            # Register stores in DB and get IDs for pending ones
            pending_store_ids: list[tuple[int, str]] = []
            for url in all_urls:
                domain = urlparse(url).netloc.replace("www.", "")
                store_id = database.upsert_store(url, domain, niche)
                stores_found += 1

            # Only crawl stores that need (re)crawling
            pending = database.get_pending_stores(niche)
            logger.info("[runner] {} store(s) nog te crawlen voor '{}'", len(pending), niche)

            pattern_ids_this_niche: list[int] = []
            patterns_this_niche: list[StorePattern] = []

            for record in pending:
                if total_store_count >= config.MAX_STORES_PER_CYCLE:
                    break

                url = record["url"]
                store_id = record["id"]

                logger.info("[runner] crawlen: {}", url)
                crawled = await crawl_store(url)

                if crawled is None:
                    database.mark_store_crawled(store_id, None, status="failed")
                    await asyncio.sleep(config.RATE_LIMIT_SECONDS)
                    total_store_count += 1
                    continue

                database.mark_store_crawled(store_id, crawled.screenshot_path, status="analyzed")

                # LLM analysis
                pattern = await analyze_store(crawled, niche)
                if pattern:
                    pat_id = database.save_pattern(store_id, niche, pattern)
                    pattern_ids_this_niche.append(store_id)
                    patterns_this_niche.append(pattern)
                    stores_analyzed += 1
                    logger.info(
                        "[runner] patroon opgeslagen voor {} (score: {})",
                        crawled.domain, pattern.quality_score,
                    )

                await asyncio.sleep(config.RATE_LIMIT_SECONDS)
                total_store_count += 1

            # Generate/update inspiration if we have enough patterns for this niche
            total_patterns = database.count_patterns(niche)
            if total_patterns >= config.MIN_PATTERNS_FOR_INSPIRATION:
                existing = database.get_patterns(niche, limit=5)
                all_patterns = [
                    StorePattern(
                        primary_color=p.get("primary_color") or "#000",
                        secondary_color=p.get("secondary_color") or "#fff",
                        accent_color=p.get("accent_color") or "#f60",
                        font_style=p.get("font_style") or "sans",
                        layout_type=p.get("layout_type") or "minimal",
                        hero_type=p.get("hero_type") or "image",
                        tone=p.get("tone") or "friendly",
                        headline_pattern=p.get("headline_pattern") or "",
                        cta_text_pattern=p.get("cta_text_pattern") or "",
                        usp_count=p.get("usp_count") or 3,
                        has_countdown_timer=bool(p.get("has_countdown_timer")),
                        has_social_proof=bool(p.get("has_social_proof")),
                        has_money_back=bool(p.get("has_money_back")),
                        has_free_shipping_banner=bool(p.get("has_free_shipping_banner")),
                        section_order=p.get("section_order") or [],
                        product_count_on_homepage=p.get("product_count_on_homepage") or 4,
                        quality_score=p.get("quality_score") or 50,
                        reasoning=p.get("reasoning") or "",
                    )
                    for p in existing
                ]
                source_ids = [p["store_id"] for p in existing]
                inspiration = await generate_inspiration(niche, all_patterns, source_ids)
                if inspiration:
                    database.save_inspiration(inspiration)

        database.finish_crawl_run(run_id, stores_found, stores_analyzed)
        logger.info(
            "[runner] cyclus voltooid — {} stores gevonden, {} geanalyseerd",
            stores_found, stores_analyzed,
        )

    except Exception as exc:
        logger.error("[runner] cyclus gecrasht: {}", exc)
        database.finish_crawl_run(run_id, stores_found, stores_analyzed, status="failed")
