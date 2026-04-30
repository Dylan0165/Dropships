"""
Google Shopping crawler — finds dropshipping stores selling a keyword.
Uses Playwright headless Chromium.
"""
import asyncio
import re
from urllib.parse import urlparse
from loguru import logger

import config

# Domains to exclude (marketplaces, not dropshipping stores)
EXCLUDE_DOMAINS = {
    "amazon", "bol", "aliexpress", "alibaba", "ebay", "etsy",
    "google", "facebook", "instagram", "youtube", "twitter",
    "walmart", "zalando", "coolblue", "mediamarkt",
}

MAX_PER_KEYWORD = 5


def _is_valid_store(url: str) -> bool:
    try:
        domain = urlparse(url).netloc.lower().replace("www.", "")
        root = domain.split(".")[0]
        return root not in EXCLUDE_DOMAINS and len(domain) > 4
    except Exception:
        return False


async def find_stores(keywords: list[str]) -> list[str]:
    """Search Google Shopping for stores selling these keywords.
    Returns unique store URLs (max MAX_PER_KEYWORD per keyword).
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("[google_shopping] playwright not installed — returning empty list")
        return []

    found: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        for keyword in keywords:
            query = f"{keyword} kopen site:myshopify.com"
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}&num=20"
            try:
                await page.goto(url, wait_until="networkidle", timeout=20_000)
                await asyncio.sleep(config.RATE_LIMIT_SECONDS)

                # Extract all links from the result page
                links = await page.evaluate("""
                    () => [...document.querySelectorAll('a[href]')]
                        .map(a => a.href)
                        .filter(h => h.startsWith('http'))
                """)

                count = 0
                for link in links:
                    if count >= MAX_PER_KEYWORD:
                        break
                    parsed = urlparse(link)
                    store_url = f"{parsed.scheme}://{parsed.netloc}"
                    if "myshopify.com" in parsed.netloc and _is_valid_store(link):
                        if store_url not in found:
                            found.add(store_url)
                            count += 1

                logger.debug("[google_shopping] keyword '{}' → {} stores", keyword, count)

            except Exception as exc:
                logger.warning("[google_shopping] keyword '{}' failed: {}", keyword, exc)

        await browser.close()

    return list(found)
