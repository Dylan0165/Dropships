"""CJ Dropshipping API scraper + order placement.

Public functions:
- get_cj_access_token()           — OAuth token (cached 29d)
- scrape_cj_products(keywords)    — search catalog + apply quality filters
- check_stock(cj_product_id)      — true if sellable + has delivery time
- get_shipping_cost(cj_product_id, country_code)   — float EUR per piece
- get_product_variants(cj_product_id)              — list of variants
- place_order(order)              — POST createOrderV2, returns CJ order ID
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Any

import httpx
from loguru import logger

import config
from models import CJOrder, CJProduct

# ── Token cache ───────────────────────────────────────────────────────────────
_access_token: str = ""
_token_expires_at: float = 0.0

# Compile reject pattern once
_REJECT_RE = re.compile(config.PRODUCT_REJECT_PATTERN)


# ── Auth ──────────────────────────────────────────────────────────────────────

async def get_cj_access_token() -> str:
    """Retrieve (or refresh) the CJ access token. Cached for 29 days."""
    global _access_token, _token_expires_at

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
                _token_expires_at = time.time() + 29 * 24 * 3600
                logger.info("CJ access token refreshed")
                return _access_token
            logger.error("CJ auth failed: {}", data.get("message"))
            return ""
    except Exception as exc:
        logger.error("CJ auth error: {}", exc)
        return ""


async def _authed_client() -> httpx.AsyncClient | None:
    token = await get_cj_access_token()
    if not token:
        return None
    return httpx.AsyncClient(
        timeout=20,
        headers={"CJ-Access-Token": token, "Content-Type": "application/json"},
    )


# ── Quality helpers ───────────────────────────────────────────────────────────

def _passes_name_filter(name: str) -> bool:
    return _REJECT_RE.search(name or "") is None


def _count_images(item: dict[str, Any]) -> int:
    """CJ returns either productImageSet (list/CSV string) or productImage (single)."""
    img_set = item.get("productImageSet")
    if isinstance(img_set, list):
        return len([x for x in img_set if x])
    if isinstance(img_set, str) and img_set.strip():
        return len([x for x in img_set.split(",") if x.strip()])
    return 1 if item.get("productImage") else 0


def _extract_sales_volume(item: dict[str, Any]) -> int:
    for key in ("salesVolume", "saleVolume", "sales", "sold"):
        v = item.get(key)
        if v is None:
            continue
        try:
            return int(v)
        except (TypeError, ValueError):
            continue
    sku_count = item.get("productSku")
    if isinstance(sku_count, (list, tuple)):
        return len(sku_count)
    return 0


# ── Catalog search ────────────────────────────────────────────────────────────

async def scrape_cj_products(keywords: list[str]) -> list[CJProduct]:
    """Search CJ catalog for keywords and apply hard quality filters."""
    client = await _authed_client()
    if client is None:
        return []

    products: list[CJProduct] = []
    rejected = {"name": 0, "orders": 0, "images": 0, "margin": 0, "delivery": 0, "stock": 0}

    try:
        async with client:
            for keyword in keywords:
                try:
                    resp = await client.get(
                        f"{config.CJ_BASE_URL}/api2.0/v1/product/list",
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
                        pid = str(item.get("pid", ""))
                        name = item.get("productNameEn", "")

                        if not _passes_name_filter(name):
                            rejected["name"] += 1
                            continue

                        buy_price = float(item.get("sellPrice") or 0)
                        if buy_price <= 0:
                            rejected["stock"] += 1
                            continue

                        delivery = int(item.get("deliveryTime") or 99)
                        if delivery > config.PRODUCT_MAX_DELIVERY_DAYS:
                            rejected["delivery"] += 1
                            continue

                        sales = _extract_sales_volume(item)
                        if sales < config.PRODUCT_MIN_EXISTING_ORDERS:
                            rejected["orders"] += 1
                            continue

                        image_count = _count_images(item)
                        if image_count < config.PRODUCT_MIN_IMAGES:
                            rejected["images"] += 1
                            continue

                        # Suggested retail = 3.5x cost
                        sell_suggested = round(buy_price * 3.5, 2)

                        # Real shipping cost (best effort — never fail catalogue scrape on this)
                        shipping_cost = 0.0
                        try:
                            shipping_cost = await get_shipping_cost(pid, config.PRODUCT_DEFAULT_COUNTRY)
                        except Exception as exc:
                            logger.debug("shipping lookup failed for {}: {}", pid, exc)

                        margin_pct = round(
                            (sell_suggested - buy_price - shipping_cost) / sell_suggested * 100, 1
                        )
                        if margin_pct < config.PRODUCT_MIN_MARGIN_PCT:
                            rejected["margin"] += 1
                            continue

                        products.append(
                            CJProduct(
                                cj_product_id=pid,
                                name=name,
                                buy_price=buy_price,
                                sell_price_suggested=sell_suggested,
                                margin_percent=margin_pct,
                                delivery_days_nl=delivery,
                                image_url=item.get("productImage", ""),
                                shipping_cost_nl=shipping_cost,
                                sales_volume=sales,
                                image_count=image_count,
                                warehouse=str(item.get("entryNameEn", "") or item.get("warehouseLocation", "")),
                            )
                        )

                    await asyncio.sleep(config.RATE_LIMIT_SECONDS)
                except Exception as exc:
                    logger.warning("CJ search error for '{}': {}", keyword, exc)
                    continue
    except Exception as exc:
        logger.error("CJ scraper failed: {}", exc)

    logger.info(
        "CJ: {} accepted, rejected: {}", len(products), rejected,
    )
    return products


# ── Stock & shipping & variants ──────────────────────────────────────────────

async def check_stock(cj_product_id: str) -> bool:
    """Returns True if product is buyable (sellPrice > 0 AND deliveryTime present)."""
    client = await _authed_client()
    if client is None:
        return False
    try:
        async with client:
            resp = await client.get(
                f"{config.CJ_BASE_URL}/api2.0/v1/product/list",
                params={"pid": cj_product_id, "pageNum": 1, "pageSize": 1},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("result"):
                return False
            items = data.get("data", {}).get("list", [])
            if not items:
                return False
            item = items[0]
            sell_price = float(item.get("sellPrice") or 0)
            delivery = item.get("deliveryTime")
            return sell_price > 0 and delivery is not None and str(delivery).strip() != ""
    except Exception as exc:
        logger.error("check_stock({}) failed: {}", cj_product_id, exc)
        return False


async def get_shipping_cost(cj_product_id: str, country_code: str = "NL") -> float:
    """Per-piece shipping cost in EUR. Returns 0.0 if calc fails."""
    client = await _authed_client()
    if client is None:
        return 0.0
    try:
        async with client:
            resp = await client.post(
                f"{config.CJ_BASE_URL}/api2.0/v1/logistic/freightCalculate",
                json={
                    "startCountryCode": "CN",
                    "endCountryCode": country_code,
                    "products": [{"vid": cj_product_id, "quantity": 1}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("result"):
                return 0.0
            options = data.get("data") or []
            if not options:
                return 0.0
            cheapest = min(options, key=lambda o: float(o.get("logisticPrice") or 9999))
            return float(cheapest.get("logisticPrice") or 0.0)
    except Exception as exc:
        logger.warning("get_shipping_cost({}, {}) failed: {}", cj_product_id, country_code, exc)
        return 0.0


async def get_product_variants(cj_product_id: str) -> list[dict]:
    """Fetch SKU variants for a product."""
    client = await _authed_client()
    if client is None:
        return []
    try:
        async with client:
            resp = await client.get(
                f"{config.CJ_BASE_URL}/api2.0/v1/product/variant",
                params={"pid": cj_product_id},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("result"):
                return []
            return data.get("data") or []
    except Exception as exc:
        logger.error("get_product_variants({}) failed: {}", cj_product_id, exc)
        return []


# ── Order placement ───────────────────────────────────────────────────────────

async def place_order(order: CJOrder) -> str:
    """POST createOrderV2 — returns the CJ order ID on success, empty string on failure."""
    client = await _authed_client()
    if client is None:
        raise RuntimeError("CJ access token unavailable — cannot place order")

    payload = {
        "orderNumber": order.order_number,
        "shippingCountryCode": order.shipping_country_code,
        "shippingProvince": order.shipping_province,
        "shippingCity": order.shipping_city,
        "shippingAddress": order.shipping_address,
        "shippingZip": order.shipping_zip,
        "shippingPhone": order.shipping_phone,
        "shippingCustomerName": order.shipping_customer_name,
        "remark": order.remark,
        "logisticName": order.logistic_name,
        "products": [{"vid": it.vid, "quantity": it.quantity} for it in order.items],
    }
    if order.shipping_email:
        payload["email"] = order.shipping_email

    try:
        async with client:
            resp = await client.post(
                f"{config.CJ_BASE_URL}/api2.0/v1/shopping/order/createOrderV2",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("result"):
                logger.error("CJ order failed: {}", data.get("message"))
                raise RuntimeError(f"CJ rejected order: {data.get('message')}")
            cj_order_id = str((data.get("data") or {}).get("orderId") or "")
            if not cj_order_id:
                raise RuntimeError("CJ accepted order but returned no orderId")
            logger.info("CJ order placed: {} → CJ orderId {}", order.order_number, cj_order_id)
            return cj_order_id
    except httpx.HTTPError as exc:
        logger.error("CJ order HTTP error: {}", exc)
        raise
    except Exception as exc:
        logger.error("CJ order unexpected error: {}", exc)
        raise
