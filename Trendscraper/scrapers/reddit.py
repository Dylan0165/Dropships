"""Reddit scraper using PRAW"""
import asyncio
from datetime import datetime, timedelta, timezone
from loguru import logger
import config
from models import RedditPost

SUBREDDITS = [
    "BuyItForLife",
    "shutupandtakemymoney",
    "amazonfinds",
    "gadgets",
    "homeimprovement",
    "fitness",
    "beauty",
    "EDC",
    "minimalism",
]


async def scrape_reddit() -> list[RedditPost]:
    """Scrape posts from target subreddits using PRAW.

    Falls back to an empty list if credentials are not configured.
    """
    if not config.REDDIT_CLIENT_ID or not config.REDDIT_CLIENT_SECRET:
        logger.warning("Reddit credentials not configured — skipping Reddit scrape")
        return []

    try:
        import praw  # type: ignore
    except ImportError:
        logger.error("praw not installed — pip install praw")
        return []

    posts: list[RedditPost] = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=config.REDDIT_DAYS_BACK)

    try:
        reddit = praw.Reddit(
            client_id=config.REDDIT_CLIENT_ID,
            client_secret=config.REDDIT_CLIENT_SECRET,
            user_agent=config.REDDIT_USER_AGENT,
        )

        for sub_name in SUBREDDITS:
            try:
                subreddit = reddit.subreddit(sub_name)
                for post in subreddit.hot(limit=50):
                    created = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)
                    if created < cutoff:
                        continue
                    if post.score < config.REDDIT_MIN_SCORE:
                        continue
                    posts.append(
                        RedditPost(
                            title=post.title,
                            subreddit=sub_name,
                            score=post.score,
                            url=f"https://reddit.com{post.permalink}",
                            created_at=created.isoformat(),
                        )
                    )
                # respect rate limit
                await asyncio.sleep(config.RATE_LIMIT_SECONDS)
            except Exception as exc:
                logger.warning("Error scraping r/{}: {}", sub_name, exc)
                continue

        logger.info("Reddit: collected {} posts", len(posts))
    except Exception as exc:
        logger.error("Reddit scraper failed: {}", exc)

    return posts
