"""Pydantic v2 models for Trendscraper"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


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
