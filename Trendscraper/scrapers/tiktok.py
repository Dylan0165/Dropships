"""TikTok public trending hashtag scraper (no login required)"""
import asyncio
import re
from loguru import logger
import httpx
import config
from models import TikTokHashtag

SHOPPING_HASHTAGS = [
    "trending", "viral", "tiktokshop", "musthave", "productreview",
    "amazonfinds", "gadgets", "homehacks", "beautytips", "fitnesstools",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


async def _fetch_hashtag_views(client: httpx.AsyncClient, hashtag: str) -> TikTokHashtag | None:
    """Attempt to fetch view count for a single TikTok hashtag."""
    url = f"https://www.tiktok.com/tag/{hashtag}"
    try:
        resp = await client.get(url, headers=HEADERS, follow_redirects=True)
        text = resp.text

        # TikTok embeds view counts as JSON-LD or in __NEXT_DATA__
        # Try to find videoCount pattern
        match = re.search(r'"videoCount"\s*:\s*"?(\d+)"?', text)
        if not match:
            match = re.search(r'"stats".*?"videoCount"\s*:\s*(\d+)', text)

        views = int(match.group(1)) if match else 0
        return TikTokHashtag(hashtag=hashtag, estimated_views=views)
    except Exception as exc:
        logger.debug("TikTok fetch error for #{}: {}", hashtag, exc)
        return None


async def scrape_tiktok() -> list[TikTokHashtag]:
    """Scrape TikTok public hashtag pages for view counts."""
    results: list[TikTokHashtag] = []

    try:
        async with httpx.AsyncClient(timeout=15, http2=True) as client:
            for hashtag in SHOPPING_HASHTAGS:
                item = await _fetch_hashtag_views(client, hashtag)
                if item:
                    results.append(item)
                await asyncio.sleep(config.RATE_LIMIT_SECONDS)

        logger.info("TikTok: collected {} hashtags", len(results))
    except Exception as exc:
        logger.error("TikTok scraper failed: {}", exc)

    return results
