"""Google Trends scraper using pytrends"""
import asyncio
from loguru import logger
import config
from models import TrendTerm

CATEGORIES = {
    "home": ["home decor", "smart home", "home organization", "cleaning gadgets"],
    "fitness": ["home gym", "fitness tracker", "yoga", "resistance bands"],
    "beauty": ["skincare routine", "hair tools", "makeup organizer", "nail art"],
    "tech accessories": ["phone stand", "wireless charger", "cable organizer", "laptop stand"],
    "outdoor": ["camping gear", "hiking essentials", "outdoor furniture", "hammock"],
    "kitchen": ["air fryer", "meal prep", "kitchen gadgets", "coffee accessories"],
    "pet": ["dog accessories", "cat toys", "pet grooming", "pet bed"],
}


async def scrape_google_trends() -> list[TrendTerm]:
    """Fetch Google Trends data for predefined product categories."""
    try:
        from pytrends.request import TrendReq  # type: ignore
    except ImportError:
        logger.error("pytrends not installed — pip install pytrends")
        return []

    results: list[TrendTerm] = []

    try:
        pytrends = TrendReq(hl="en-US", tz=360)

        for category, keywords in CATEGORIES.items():
            try:
                pytrends.build_payload(
                    keywords[:5],  # pytrends max 5 keywords per call
                    cat=0,
                    timeframe="today 1-m",
                    geo="",
                    gprop="",
                )
                data = pytrends.interest_over_time()

                if data.empty:
                    continue

                for kw in keywords[:5]:
                    if kw in data.columns:
                        avg = float(data[kw].mean())
                        if avg > 0:
                            results.append(
                                TrendTerm(
                                    term=kw,
                                    category=category,
                                    avg_interest=round(avg, 2),
                                )
                            )

                # rate limit
                await asyncio.sleep(config.RATE_LIMIT_SECONDS * 2)

            except Exception as exc:
                logger.warning("Google Trends error for category {}: {}", category, exc)
                continue

        logger.info("Google Trends: collected {} terms", len(results))
    except Exception as exc:
        logger.error("Google Trends scraper failed: {}", exc)

    return results
