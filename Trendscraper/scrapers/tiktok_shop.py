"""
TikTok Shop trending products scraper.

Playwright-based scrape of tiktok.com/shop/discover.
Runs headless, extracts product cards, max 20 results.
10-second rate limit between retries.  Graceful fallback on any error.
"""
import asyncio
from typing import Optional
from loguru import logger


async def scrape_tiktok_shop(max_products: int = 20) -> list[dict]:
    """
    Scrape trending products from TikTok Shop discover page.
    Returns list of dicts with keys: title, price, sold_count, url, image_url.
    Returns [] on any error — caller must handle empty list.
    """
    try:
        from playwright.async_api import async_playwright, TimeoutError as PwTimeout
    except ImportError:
        logger.error("[tiktok_shop] playwright not installed — pip install playwright")
        return []

    products: list[dict] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = await ctx.new_page()

        try:
            logger.info("[tiktok_shop] Navigating to TikTok Shop discover...")
            await page.goto("https://www.tiktok.com/shop/discover", timeout=30_000, wait_until="domcontentloaded")
            await page.wait_for_timeout(4000)

            # Scroll to load more products
            for _ in range(3):
                await page.evaluate("window.scrollBy(0, 800)")
                await page.wait_for_timeout(1500)

            # Extract product cards via common selectors (may change with site updates)
            raw = await page.evaluate("""
                () => {
                    const items = [];
                    // TikTok Shop product card selectors (as of 2024-2025)
                    const cards = document.querySelectorAll(
                        '[data-testid="product-card"], .product-card, [class*="ProductCard"], [class*="productCard"]'
                    );

                    cards.forEach(card => {
                        const titleEl = card.querySelector('[class*="title"], [class*="name"], h3, h2');
                        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
                        const soldEl  = card.querySelector('[class*="sold"], [class*="sales"]');
                        const imgEl   = card.querySelector('img');
                        const linkEl  = card.querySelector('a');

                        const title = titleEl?.textContent?.trim();
                        if (!title) return;

                        items.push({
                            title,
                            price: priceEl?.textContent?.trim() || '',
                            sold_count: soldEl?.textContent?.trim() || '',
                            url: linkEl?.href || '',
                            image_url: imgEl?.src || imgEl?.dataset?.src || '',
                        });
                    });

                    return items.slice(0, 20);
                }
            """)

            if isinstance(raw, list):
                products = [p for p in raw if isinstance(p, dict) and p.get("title")]

            logger.info("[tiktok_shop] Extracted {} products", len(products))

        except PwTimeout:
            logger.warning("[tiktok_shop] Page load timeout — TikTok may be blocking")
        except Exception as exc:
            logger.warning("[tiktok_shop] Scrape failed: {}", exc)
        finally:
            await browser.close()

    # Rate limit
    if products:
        await asyncio.sleep(10)

    return products


def parse_price_eur(raw: str) -> Optional[float]:
    """Parse '€12.99' or '$14.50' to float euros (rough conversion)."""
    import re
    m = re.search(r"[\d,.]+", raw.replace(",", "."))
    if not m:
        return None
    val = float(m.group())
    if "$" in raw:
        val *= 0.93  # rough USD→EUR
    return round(val, 2)


def parse_sold_count(raw: str) -> int:
    """Parse '1.2k sold' → 1200."""
    import re
    m = re.search(r"([\d.]+)\s*([kKmM]?)", raw)
    if not m:
        return 0
    num = float(m.group(1))
    suffix = m.group(2).lower()
    if suffix == "k":
        num *= 1_000
    elif suffix == "m":
        num *= 1_000_000
    return int(num)
