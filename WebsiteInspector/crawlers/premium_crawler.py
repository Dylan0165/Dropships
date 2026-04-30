"""
Premium site crawler — extracts advanced animation and UX techniques.

Crawls a hardcoded list of top DTC/e-commerce brands every 7 days
(not every 12 h like the regular cycle).  Detects:
  Three.js · GSAP · Lottie · Framer Motion · custom cursor · parallax ·
  video backgrounds · scroll-triggered animations · magnetic hover ·
  morph/blob SVG · WebGL · CSS scroll-driven
"""
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from loguru import logger

import config

# ── Premium seedlist (crawl every 7 days) ─────────────────────────────────────
PREMIUM_STORES: list[dict] = [
    {"url": "https://www.gymshark.com",          "niche": "fitness",    "brand": "Gymshark"},
    {"url": "https://eu.gymshark.com",            "niche": "fitness",    "brand": "Gymshark EU"},
    {"url": "https://www.allbirds.com",           "niche": "footwear",   "brand": "Allbirds"},
    {"url": "https://www.glossier.com",           "niche": "beauty",     "brand": "Glossier"},
    {"url": "https://www.warbyparker.com",        "niche": "eyewear",    "brand": "Warby Parker"},
    {"url": "https://www.casper.com",             "niche": "home",       "brand": "Casper"},
    {"url": "https://www.brooklinen.com",         "niche": "home",       "brand": "Brooklinen"},
    {"url": "https://www.bombas.com",             "niche": "apparel",    "brand": "Bombas"},
    {"url": "https://www.ridgid.com/us/en",       "niche": "tools",      "brand": "Ridgid"},
    {"url": "https://www.hellofresh.com/en-gb",   "niche": "food",       "brand": "HelloFresh"},
    {"url": "https://www.mvmt.com",               "niche": "watches",    "brand": "MVMT"},
    {"url": "https://www.puravidabracelets.com",  "niche": "jewelry",    "brand": "Pura Vida"},
    {"url": "https://www.quay.com.au",            "niche": "eyewear",    "brand": "Quay"},
    {"url": "https://www.saatva.com",             "niche": "home",       "brand": "Saatva"},
    {"url": "https://www.ritual.com",             "niche": "wellness",   "brand": "Ritual"},
    {"url": "https://www.prose.com",              "niche": "beauty",     "brand": "Prose"},
    {"url": "https://www.oatly.com",              "niche": "food",       "brand": "Oatly"},
    {"url": "https://www.patagonia.com",          "niche": "outdoor",    "brand": "Patagonia"},
    {"url": "https://www.humanscale.com",         "niche": "home",       "brand": "Humanscale"},
    {"url": "https://www.outside.io",             "niche": "outdoor",    "brand": "Outside"},
]

# JavaScript that returns a JSON summary of detected animation techniques
_ANIMATION_DETECTION_JS = """
(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
  const inlineScripts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent || '');
  const allCode = inlineScripts.join(' ');
  const styles = Array.from(document.styleSheets).flatMap(ss => {
    try { return Array.from(ss.cssRules).map(r => r.cssText); } catch { return []; }
  }).join(' ');

  const detected = {
    gsap:               scripts.some(s => /gsap|tweenmax|tweenmin|greensock/i.test(s)) || /gsap\./i.test(allCode),
    three_js:           scripts.some(s => /three[\.\-]?(?:min\.)?js/i.test(s)) || /THREE\./i.test(allCode),
    lottie:             scripts.some(s => /lottie/i.test(s)) || /lottie/i.test(allCode),
    framer_motion:      scripts.some(s => /framer.motion/i.test(s)) || /motion\./i.test(allCode),
    scroll_trigger:     /ScrollTrigger|scroll-driven|scrollbar-gutter/i.test(allCode) || styles.includes('animation-timeline'),
    parallax:           /parallax|jarallax|rellax/i.test(allCode) || /[^-]parallax/i.test(styles),
    custom_cursor:      /cursor.*pointer|custom.?cursor|cursor\.style/i.test(allCode) || /cursor:\s*none/i.test(styles),
    video_background:   !!document.querySelector('video[autoplay], video[playsinline]'),
    webgl:              /WebGLRenderingContext|getContext.*webgl/i.test(allCode),
    magnetic_hover:     /magnet|magnetic/i.test(allCode),
    morph_svg:          /morphSVG|GSAP.*drawSVG|MorphSVGPlugin/i.test(allCode),
    css_scroll_driven:  /animation-timeline|scroll()\s|view()/i.test(styles),
    splittext:          /SplitText|splittype|split-type/i.test(allCode),
    canvas_animation:   !!document.querySelector('canvas'),
    intersection_observer: /IntersectionObserver/i.test(allCode),
    css_keyframe_complex: (allCode.match(/@keyframes/g) || []).length > 5,
  };

  const techniques = Object.entries(detected).filter(([,v]) => v).map(([k]) => k);
  return { techniques, script_count: scripts.length };
})()
"""

_DB_PATH_FLAG = Path(config.SCREENSHOT_DIR).parent / "premium_crawl_timestamps.json"


def _load_timestamps() -> dict[str, str]:
    try:
        return json.loads(_DB_PATH_FLAG.read_text()) if _DB_PATH_FLAG.exists() else {}
    except Exception:
        return {}


def _save_timestamps(ts: dict[str, str]) -> None:
    _DB_PATH_FLAG.parent.mkdir(parents=True, exist_ok=True)
    _DB_PATH_FLAG.write_text(json.dumps(ts, indent=2))


def _should_crawl(url: str, ts: dict[str, str], interval_days: int = 7) -> bool:
    if url not in ts:
        return True
    last = datetime.fromisoformat(ts[url])
    return (datetime.now(timezone.utc) - last).days >= interval_days


async def _crawl_single(url: str) -> Optional[dict]:
    """Crawl one premium URL and return animation detection results."""
    try:
        from playwright.async_api import async_playwright, TimeoutError as PwTimeout
    except ImportError:
        logger.error("playwright not installed — pip install playwright")
        return None

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900},
                                        user_agent="Mozilla/5.0 (compatible; WebsiteInspector/2.0)")
        page = await ctx.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=30_000)
            await page.wait_for_timeout(2000)
            result = await page.evaluate(_ANIMATION_DETECTION_JS)
            return result
        except PwTimeout:
            logger.warning("[premium] timeout: {}", url)
            return None
        except Exception as exc:
            logger.warning("[premium] error on {}: {}", url, exc)
            return None
        finally:
            await browser.close()


async def run_premium_crawl() -> list[dict]:
    """
    Crawl all premium stores that are due (7-day interval).
    Returns a list of records suitable for storing in the animation_library.
    """
    from database import save_animation_library_entries, get_animation_library_count

    timestamps = _load_timestamps()
    due = [s for s in PREMIUM_STORES if _should_crawl(s["url"], timestamps)]

    if not due:
        logger.info("[premium] All premium stores crawled recently — skipping")
        return []

    logger.info("[premium] Crawling {} premium stores (of {} total)", len(due), len(PREMIUM_STORES))
    library_entries: list[dict] = []

    for store in due:
        await asyncio.sleep(config.RATE_LIMIT_SECONDS * 2)  # be polite
        result = await _crawl_single(store["url"])
        if not result:
            continue

        techniques: list[str] = result.get("techniques", [])
        if not techniques:
            logger.info("[premium] {} — no animations detected", store["brand"])
            timestamps[store["url"]] = datetime.now(timezone.utc).isoformat()
            continue

        logger.info("[premium] {} — {} techniques: {}", store["brand"], len(techniques), techniques)

        # Build one library entry per detected technique
        for tech in techniques:
            entry = _build_library_entry(tech, store, result)
            library_entries.append(entry)

        timestamps[store["url"]] = datetime.now(timezone.utc).isoformat()

    _save_timestamps(timestamps)

    if library_entries:
        saved = save_animation_library_entries(library_entries)
        logger.info("[premium] Saved {} animation library entries (total in DB: {})",
                    saved, get_animation_library_count())

    return library_entries


# ── Metadata for each technique ────────────────────────────────────────────────

_TECHNIQUE_META: dict[str, dict] = {
    "gsap": {
        "name": "GSAP Tween Animations",
        "description": "GreenSock Animation Platform — buttery-smooth JS tweens, timelines, and stagger effects. Industry standard for premium feel.",
        "implementation_hint": "Import gsap from 'gsap'. Use gsap.from('.hero h1', {y:60,opacity:0,duration:1}) on page load.",
        "difficulty": "medium",
        "performance_impact": "low",
    },
    "three_js": {
        "name": "Three.js 3D Scene",
        "description": "WebGL-based 3D rendering in the browser. Used for interactive hero sections, product rotations, and particle systems.",
        "implementation_hint": "Add a <canvas> in the hero section. Use THREE.WebGLRenderer, add lights, camera, and animate with requestAnimationFrame.",
        "difficulty": "hard",
        "performance_impact": "high",
    },
    "lottie": {
        "name": "Lottie JSON Animations",
        "description": "Lightweight After Effects animations exported as JSON, rendered via lottie-web. Zero-compromise quality at tiny file size.",
        "implementation_hint": "npm install lottie-web. Use lottie.loadAnimation({container, renderer:'svg', animationData: require('./anim.json')}).",
        "difficulty": "easy",
        "performance_impact": "low",
    },
    "framer_motion": {
        "name": "Framer Motion React Animations",
        "description": "Declarative React animation library. Variants, gesture handlers, shared layout transitions, and drag.",
        "implementation_hint": "Wrap component in <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.6}}>.",
        "difficulty": "easy",
        "performance_impact": "low",
    },
    "scroll_trigger": {
        "name": "Scroll-Triggered Animations",
        "description": "Elements animate as they enter the viewport on scroll. Creates a 'scrollytelling' narrative feel.",
        "implementation_hint": "Use GSAP ScrollTrigger or CSS @keyframes with IntersectionObserver. Add class 'is-visible' on scroll entry.",
        "difficulty": "medium",
        "performance_impact": "low",
    },
    "parallax": {
        "name": "Parallax Scrolling",
        "description": "Background moves slower than foreground on scroll, creating depth. Common in hero sections.",
        "implementation_hint": "On scroll event: bg.style.transform = `translateY(${window.scrollY * 0.3}px)`. Use will-change:transform.",
        "difficulty": "easy",
        "performance_impact": "medium",
    },
    "custom_cursor": {
        "name": "Custom Cursor",
        "description": "Replaces the default cursor with a branded dot or circle that follows mouse movement. Signature premium feel.",
        "implementation_hint": "Set body{cursor:none}. Create a div.cursor, update left/top on mousemove with a slight lag via lerp.",
        "difficulty": "easy",
        "performance_impact": "low",
    },
    "video_background": {
        "name": "Video Hero Background",
        "description": "Looping autoplay video as hero section background. Dramatically increases perceived quality and trust.",
        "implementation_hint": "<video autoplay muted loop playsinline style='object-fit:cover'>. Use WebM + MP4 fallback. Max 3 MB.",
        "difficulty": "easy",
        "performance_impact": "high",
    },
    "webgl": {
        "name": "WebGL Shader Effects",
        "description": "Raw GPU shader programs for distortion, noise, and fluid effects. Used on ultra-premium DTC brands.",
        "implementation_hint": "Use Three.js ShaderMaterial with custom GLSL vertex+fragment shaders for image distortion on hover.",
        "difficulty": "hard",
        "performance_impact": "high",
    },
    "magnetic_hover": {
        "name": "Magnetic Button Hover",
        "description": "Buttons that attract the cursor slightly on hover, creating a tactile magnetic feel.",
        "implementation_hint": "On mousemove near button: btn.style.transform = `translate(${dx*0.3}px,${dy*0.3}px)`. Reset on mouseleave.",
        "difficulty": "easy",
        "performance_impact": "low",
    },
    "morph_svg": {
        "name": "SVG Morphing / Blob Animation",
        "description": "SVG paths animate between shapes — e.g., a blob that slowly morphs. Adds organic, alive feel.",
        "implementation_hint": "Use GSAP MorphSVGPlugin or CSS animation between clip-path: polygon() values.",
        "difficulty": "medium",
        "performance_impact": "low",
    },
    "css_scroll_driven": {
        "name": "CSS Scroll-Driven Animations",
        "description": "Native CSS scroll-linked animations using animation-timeline: scroll(). No JS needed.",
        "implementation_hint": "@keyframes reveal {from {opacity:0} to {opacity:1}} .el{animation: reveal linear; animation-timeline: view();}",
        "difficulty": "medium",
        "performance_impact": "low",
    },
    "splittext": {
        "name": "Split Text Animation",
        "description": "Headline letters or words split and animate individually for a dramatic entrance.",
        "implementation_hint": "Split text node into <span> per word. gsap.from('.word', {y:40,opacity:0,stagger:0.05,duration:0.6}).",
        "difficulty": "easy",
        "performance_impact": "low",
    },
    "canvas_animation": {
        "name": "Canvas Particle System",
        "description": "Interactive canvas-based particles, confetti, or noise field as decorative background.",
        "implementation_hint": "Use tsParticles or write a custom requestAnimationFrame loop drawing to <canvas>.",
        "difficulty": "medium",
        "performance_impact": "medium",
    },
    "intersection_observer": {
        "name": "Intersection Observer Reveal",
        "description": "Elements fade/slide in as they scroll into view using the IntersectionObserver API.",
        "implementation_hint": "new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')))",
        "difficulty": "easy",
        "performance_impact": "low",
    },
    "css_keyframe_complex": {
        "name": "Rich CSS Keyframe Animations",
        "description": "Multiple layered CSS @keyframes for complex multi-step animations without JS overhead.",
        "implementation_hint": "Stack multiple animations: animation: fadeIn 0.6s ease, slideUp 0.8s ease, glow 3s infinite;",
        "difficulty": "easy",
        "performance_impact": "low",
    },
}


def _build_library_entry(technique: str, store: dict, crawl_result: dict) -> dict:
    meta = _TECHNIQUE_META.get(technique, {
        "name": technique.replace("_", " ").title(),
        "description": f"Advanced animation technique detected on {store['brand']}.",
        "implementation_hint": "Analyse source at " + store["url"],
        "difficulty": "medium",
        "performance_impact": "medium",
    })
    return {
        "name": meta["name"],
        "technique_type": technique,
        "description": meta["description"],
        "implementation_hint": meta["implementation_hint"],
        "source_url": store["url"],
        "source_brand": store["brand"],
        "niche": store["niche"],
        "difficulty": meta["difficulty"],
        "performance_impact": meta["performance_impact"],
    }
