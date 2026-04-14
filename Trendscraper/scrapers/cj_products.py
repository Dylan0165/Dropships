"""CJ Dropshipping API scraper"""
import asyncio
import time
from loguru import logger
import httpx
import config
from models import CJProduct

# ── Token cache ───────────────────────────────────────────────────────────────
_access_token: str = ""
_token_expires_at: float = 0.0


async def get_cj_access_token() -> str:
    """Retrieve (or refresh) the CJ access token."""
    global _access_token, _token_expires_at

    # If token is still valid (with 30-minute buffer) reuse it
    if _access_token and time.time() < _token_expires_at - 1800:
        return _access_token

    if not config.CJ_API_KEY:
        logger.warning("CJ_API_KEY not configured — skipping CJ products")
        return ""

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{config.CJ_BASE_URL}/api2.0/v1/authentication/getAccessToken",
                json={"apiKey": config.CJ_API_KEY},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("result") is True:
                _access_token = data["data"]["accessToken"]
                # CJ tokens expire in 30 days; treat as 29 days to be safe
                _token_expires_at = time.time() + 29 * 24 * 3600
                logger.info("CJ access token refreshed")
                return _access_token
            else:
                logger.error("CJ auth failed: {}", data.get("message"))
                return ""
    except Exception as exc:
        logger.error("CJ auth error: {}", exc)
        return ""


async def scrape_cj_products(keywords: list[str]) -> list[CJProduct]:
    """Search CJ catalog for products matching the given keywords."""
    token = await get_cj_access_token()
    if not token:
        return []

    products: list[CJProduct] = []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            headers = {"CJ-Access-Token": token}

            for keyword in keywords:
                try:
                    resp = await client.get(
                        f"{config.CJ_BASE_URL}/api2.0/v1/product/list",
                        headers=headers,
                        params={
                            "productNameEn": keyword,
                            "pageNum": 1,
                            "pageSize": 20,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    if not data.get("result"):
                        continue

                    for item in data.get("data", {}).get("list", []):
                        buy_price = float(item.get("sellPrice", 0))
                        if buy_price <= 0:
                            continue

                        sell_suggested = round(buy_price * 3.5, 2)
                        margin_pct = round((sell_suggested - buy_price) / sell_suggested * 100, 1)

                        # Filter: margin >= 3x, delivery <= 7 days
                        if sell_suggested < buy_price * config.PRODUCT_MIN_MARGIN_FACTOR:
                            continue

                        delivery = int(item.get("deliveryTime", 99))
                        if delivery > config.PRODUCT_MAX_DELIVERY_DAYS:
                            continue

                        products.append(
                            CJProduct(
                                cj_product_id=str(item.get("pid", "")),
                                name=item.get("productNameEn", ""),
                                buy_price=buy_price,
                                sell_price_suggested=sell_suggested,
                                margin_percent=margin_pct,
                                delivery_days_nl=delivery,
                                image_url=item.get("productImage", ""),
                            )
                        )

                    await asyncio.sleep(config.RATE_LIMIT_SECONDS)

                except Exception as exc:
                    logger.warning("CJ search error for '{}': {}", keyword, exc)
                    continue

    except Exception as exc:
        logger.error("CJ scraper failed: {}", exc)

    logger.info("CJ: collected {} products for {} keywords", len(products), len(keywords))
    return products
