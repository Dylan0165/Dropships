"""
Individual store page crawler using Playwright headless Chromium.
Extracts design signals, copy, and visual data without storing personal data.
"""
import asyncio
import re
from pathlib import Path
from urllib.parse import urlparse

from loguru import logger

import config
from models import CrawledPage

# JS snippet to extract dominant colours from computed styles
_COLOR_EXTRACTION_JS = """
() => {
    const counts = {};
    const els = document.querySelectorAll('*');
    els.forEach(el => {
        const s = getComputedStyle(el);
        [s.backgroundColor, s.color, s.borderColor].forEach(c => {
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                counts[c] = (counts[c] || 0) + 1;
            }
        });
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([color]) => color);
}
"""

# JS to detect section structure
_SECTION_JS = """
() => {
    const tags = ['nav', 'header', 'footer', 'main', 'section', 'article'];
    const sections = [];
    tags.forEach(t => {
        if (document.querySelector(t)) sections.push(t);
    });
    // Detect by class name hints
    const hints = {
        hero:     '[class*=hero],[class*=banner],[class*=jumbotron]',
        usp:      '[class*=usp],[class*=feature],[class*=benefit]',
        products: '[class*=product],[class*=grid],[class*=catalog]',
        reviews:  '[class*=review],[class*=testimonial],[class*=rating]',
        countdown:'[class*=countdown],[class*=timer]',
        cta:      'button,[class*=cta],[class*=btn]',
    };
    for (const [name, sel] of Object.entries(hints)) {
        if (document.querySelector(sel) && !sections.includes(name)) {
            sections.push(name);
        }
    }
    return sections;
}
"""

# JS to count products on the homepage
_PRODUCT_COUNT_JS = """
() => document.querySelectorAll(
    '[class*=product],[class*=card],[class*=item],[class*=ProductCard]'
).length
"""

# Trust-element detection strings (Dutch + English)
_COUNTDOWN_PATTERNS = ["countdown", "timer", "minutten", "minuten", "aftellen"]
_SOCIAL_PROOF_PATTERNS = ["⭐", "★", "reviews", "beoordelingen", "klanten", "trustpilot", "kiyoh"]
_MONEY_BACK_PATTERNS = ["niet tevreden", "geld terug", "money back", "garantie", "retour"]
_FREE_SHIPPING_PATTERNS = ["gratis verzending", "gratis levering", "free shipping", "free delivery"]
_WHATSAPP_PATTERNS = ["whatsapp", "wa.me", "whatsapp.com"]


def _rgb_to_hex(rgb_str: str) -> str:
    """Convert 'rgb(R, G, B)' or 'rgba(R, G, B, A)' to '#RRGGBB'."""
    nums = re.findall(r"\d+", rgb_str)
    if len(nums) >= 3:
        r, g, b = int(nums[0]), int(nums[1]), int(nums[2])
        # Skip near-white / near-black fillers
        if (r, g, b) in ((255, 255, 255), (0, 0, 0)):
            return ""
        return f"#{r:02x}{g:02x}{b:02x}"
    return ""


def _contains_any(text: str, patterns: list[str]) -> bool:
    tl = text.lower()
    return any(p in tl for p in patterns)


async def crawl_store(url: str) -> CrawledPage | None:
    """Crawl a store URL and extract design/copy signals.
    Returns None on timeout or error.
    """
    domain = urlparse(url).netloc.replace("www.", "")
    screenshot_path: str | None = None

    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    except ImportError:
        logger.warning("[page_crawler] playwright not installed")
        return None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            )
            page = await ctx.new_page()

            try:
                await page.goto(url, wait_until="networkidle", timeout=20_000)
            except PWTimeout:
                logger.warning("[page_crawler] timeout loading {}", url)
                await browser.close()
                return None

            # Screenshot
            shot_dir = Path(config.SCREENSHOT_DIR)
            shot_dir.mkdir(parents=True, exist_ok=True)
            safe_domain = re.sub(r"[^a-z0-9\-]", "-", domain)
            shot_file = shot_dir / f"{safe_domain}.png"
            try:
                await page.screenshot(path=str(shot_file), full_page=False)
                screenshot_path = str(shot_file)
            except Exception as e:
                logger.debug("[page_crawler] screenshot failed for {}: {}", domain, e)

            # Visible text (headings, paragraphs, buttons)
            text_parts = await page.evaluate("""
                () => [...document.querySelectorAll('h1,h2,h3,p,button,span,a')]
                    .map(el => el.innerText?.trim())
                    .filter(t => t && t.length > 2 && t.length < 300)
                    .slice(0, 100)
            """)
            text_content = " | ".join(text_parts)[:3000]

            # Dominant colours
            raw_colors = await page.evaluate(_COLOR_EXTRACTION_JS)
            hex_colors = [h for c in raw_colors if (h := _rgb_to_hex(c))][:6]

            # Sections
            sections: list[str] = await page.evaluate(_SECTION_JS)

            # Product count
            product_count: int = await page.evaluate(_PRODUCT_COUNT_JS)

            await browser.close()

        text_lower = text_content.lower()
        return CrawledPage(
            url=url,
            domain=domain,
            text_content=text_content,
            colors=hex_colors,
            sections=sections,
            product_count=product_count,
            has_countdown_timer=_contains_any(text_lower, _COUNTDOWN_PATTERNS),
            has_social_proof=_contains_any(text_lower, _SOCIAL_PROOF_PATTERNS),
            has_money_back=_contains_any(text_lower, _MONEY_BACK_PATTERNS),
            has_free_shipping=_contains_any(text_lower, _FREE_SHIPPING_PATTERNS),
            has_whatsapp=_contains_any(text_lower, _WHATSAPP_PATTERNS),
            screenshot_path=screenshot_path,
        )

    except Exception as exc:
        logger.error("[page_crawler] {} failed: {}", url, exc)
        return None
