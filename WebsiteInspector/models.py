"""Pydantic v2 models for WebsiteInspector"""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class CrawledPage(BaseModel):
    url: str
    domain: str
    text_content: str = ""
    colors: list[str] = Field(default_factory=list)   # dominant hex colors
    sections: list[str] = Field(default_factory=list)  # detected section types
    product_count: int = 0
    has_countdown_timer: bool = False
    has_social_proof: bool = False
    has_money_back: bool = False
    has_free_shipping: bool = False
    has_whatsapp: bool = False
    screenshot_path: Optional[str] = None


class StorePattern(BaseModel):
    primary_color: str = "#000000"
    secondary_color: str = "#ffffff"
    accent_color: str = "#ff6600"
    font_style: Literal["sans", "serif", "display"] = "sans"
    layout_type: Literal["minimal", "bold", "luxury", "playful"] = "minimal"
    hero_type: Literal["image", "video", "split", "fullscreen"] = "image"
    tone: Literal["urgent", "premium", "friendly", "technical"] = "friendly"
    headline_pattern: str = ""
    cta_text_pattern: str = ""
    usp_count: int = 3
    has_countdown_timer: bool = False
    has_social_proof: bool = False
    has_money_back: bool = False
    has_free_shipping_banner: bool = False
    section_order: list[str] = Field(default_factory=lambda: ["nav", "hero", "usp", "products", "reviews", "footer"])
    product_count_on_homepage: int = 4
    quality_score: int = Field(default=50, ge=0, le=100)
    reasoning: str = ""


class DesignInspiration(BaseModel):
    niche: str
    color_palette: list[str] = Field(default_factory=list)
    recommended_layout: str = "minimal"
    recommended_tone: str = "friendly"
    headline_formula: str = ""
    section_order: list[str] = Field(default_factory=lambda: ["nav", "hero", "usp", "products", "reviews", "footer"])
    source_store_ids: list[int] = Field(default_factory=list)


class CrawlRunStatus(BaseModel):
    id: int
    started_at: str
    completed_at: Optional[str] = None
    status: str
    stores_found: int = 0
    stores_analyzed: int = 0


class StoreRecord(BaseModel):
    id: int
    url: str
    domain: str
    niche: str
    first_seen: str
    last_crawled: Optional[str] = None
    crawl_count: int = 0
    is_active: bool = True
    screenshot_path: Optional[str] = None
    status: str = "pending"
