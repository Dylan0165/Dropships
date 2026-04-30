"""Pydantic v2 models for Trendscraper"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator


class RedditPost(BaseModel):
    title: str
    subreddit: str
    score: int
    url: str
    created_at: str


class TrendTerm(BaseModel):
    term: str
    category: str
    avg_interest: float


class TikTokHashtag(BaseModel):
    hashtag: str
    estimated_views: int


class CJProduct(BaseModel):
    cj_product_id: str
    name: str
    buy_price: float
    sell_price_suggested: float
    margin_percent: float
    delivery_days_nl: int
    image_url: str
    shipping_cost_nl: float = 0.0
    sales_volume: int = 0
    image_count: int = 1
    warehouse: str = ""


class CJOrderItem(BaseModel):
    """Single line item in a CJ order."""
    vid: str = Field(..., description="CJ variant ID (vid) from /product/variant")
    quantity: int = Field(default=1, ge=1)


class CJOrder(BaseModel):
    """Order payload for POST /api2.0/v1/shopping/order/createOrderV2."""
    order_number: str = Field(..., description="Your internal order reference")
    shipping_country_code: str = Field(default="NL", min_length=2, max_length=2)
    shipping_province: str = ""
    shipping_city: str
    shipping_address: str
    shipping_zip: str
    shipping_phone: str
    shipping_customer_name: str
    shipping_email: Optional[str] = None
    remark: str = ""
    items: list[CJOrderItem]
    logistic_name: str = "CJPacket Sensitive"

    @field_validator("items")
    @classmethod
    def _at_least_one_item(cls, v: list[CJOrderItem]) -> list[CJOrderItem]:
        if not v:
            raise ValueError("Order must contain at least one item")
        return v


class CJOrderRecord(BaseModel):
    id: int
    cj_order_id: str
    order_number: str
    status: str
    payload_json: str
    response_json: str
    created_at: str


class NicheResult(BaseModel):
    name: str
    trend_score: int = Field(ge=0, le=100)
    competition_level: str  # low / medium / high
    estimated_market_size: str  # small / medium / large
    recommended_audience: str
    reasoning: str


class NicheRecord(BaseModel):
    id: int
    run_id: int
    name: str
    trend_score: int
    competition_level: str
    estimated_market_size: str
    recommended_audience: str
    sources: str  # JSON string
    reasoning: str
    status: str
    created_at: str


class ProductRecord(BaseModel):
    id: int
    niche_id: int
    cj_product_id: str
    name: str
    buy_price: float
    sell_price_suggested: float
    margin_percent: float
    delivery_days_nl: int
    virality_score: int
    image_url: str
    created_at: str


class RunRecord(BaseModel):
    id: int
    timestamp: str
    status: str
    total_niches_found: int


class ScraperAggregate(BaseModel):
    reddit_posts: list[RedditPost]
    trend_terms: list[TrendTerm]
    tiktok_hashtags: list[TikTokHashtag]
