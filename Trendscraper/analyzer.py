"""DeepSeek-powered niche analyzer"""
import asyncio
import json
from loguru import logger
import httpx
import config
from models import NicheResult, ScraperAggregate


SYSTEM_PROMPT = (
    "Je bent een dropshipping niche expert. Analyseer de volgende trending data van Reddit, "
    "Google Trends en TikTok. Geef een JSON array terug van maximaal 10 kansrijke niches "
    "gesorteerd op kans. Elk object heeft exact deze velden: name (string), trend_score "
    "(integer 0-100), competition_level (string: low/medium/high), estimated_market_size "
    "(string: small/medium/large), recommended_audience (string), reasoning (string, max 200 "
    "tekens). Geef ALLEEN geldige JSON terug, geen markdown, geen uitleg, geen code blocks."
)


def _build_user_message(aggregate: ScraperAggregate) -> str:
    reddit_summary = "\n".join(
        f"- [{p.subreddit}] {p.title} (score: {p.score})"
        for p in aggregate.reddit_posts[:30]
    ) or "Geen Reddit data beschikbaar."

    trends_summary = "\n".join(
        f"- {t.term} ({t.category}): gemiddeld interesse {t.avg_interest}"
        for t in sorted(aggregate.trend_terms, key=lambda x: x.avg_interest, reverse=True)[:20]
    ) or "Geen Google Trends data beschikbaar."

    tiktok_summary = "\n".join(
        f"- #{h.hashtag}: {h.estimated_views:,} views"
        for h in sorted(aggregate.tiktok_hashtags, key=lambda x: x.estimated_views, reverse=True)[:10]
    ) or "Geen TikTok data beschikbaar."

    return (
        f"## Reddit Trending Posts (afgelopen 7 dagen, score > 100)\n{reddit_summary}\n\n"
        f"## Google Trends (afgelopen 30 dagen)\n{trends_summary}\n\n"
        f"## TikTok Trending Hashtags\n{tiktok_summary}"
    )


async def _call_deepseek(user_message: str) -> list[NicheResult]:
    """Call DeepSeek API once and return parsed niche list."""
    if not config.DEEPSEEK_API_KEY:
        logger.error("DEEPSEEK_API_KEY not configured")
        return []

    payload = {
        "model": config.DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "max_tokens": 2048,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            config.DEEPSEEK_BASE_URL,
            headers={
                "Authorization": f"Bearer {config.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    raw_content: str = data["choices"][0]["message"]["content"].strip()
    return _parse_niches(raw_content)


def _parse_niches(raw: str) -> list[NicheResult]:
    """Parse and validate the DeepSeek JSON response."""
    # Strip potential markdown code fences
    clean = raw.strip()
    if clean.startswith("```"):
        lines = clean.splitlines()
        # Remove first and last fence lines
        inner = "\n".join(
            ln for ln in lines if not ln.strip().startswith("```")
        )
        clean = inner.strip()

    data = json.loads(clean)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array, got {type(data)}")

    results: list[NicheResult] = []
    for item in data:
        try:
            results.append(NicheResult(**item))
        except Exception as exc:
            logger.warning("Skipping invalid niche item: {} — {}", item, exc)

    return results


async def analyze_trends(aggregate: ScraperAggregate) -> list[NicheResult]:
    """Run DeepSeek analysis, retrying once on parse error (after 5 min delay)."""
    user_message = _build_user_message(aggregate)

    for attempt in range(1, 3):
        try:
            niches = await _call_deepseek(user_message)
            logger.info("Analyzer: {} niches identified (attempt {})", len(niches), attempt)
            return niches
        except json.JSONDecodeError as exc:
            logger.error("DeepSeek JSON parse error (attempt {}): {}", attempt, exc)
            if attempt == 1:
                logger.info("Retrying analyzer in 5 minutes…")
                await asyncio.sleep(300)
        except Exception as exc:
            logger.error("DeepSeek API error (attempt {}): {}", attempt, exc)
            if attempt == 1:
                await asyncio.sleep(300)

    return []
