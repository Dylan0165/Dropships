"""
Trendscraper — FastAPI service on port 8001
Generates EU dropshipping niches via DeepSeek, stores them in SQLite.
UIcontrol proxies /api/niches/* to this service.
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

from database import DB, NicheRow, init_db

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
PORT = int(os.getenv("TRENDSCRAPER_PORT", "8001"))

app = FastAPI(title="Trendscraper", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db = DB()


@app.on_event("startup")
def startup():
    init_db()


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "service": "trendscraper", "niches": db.count()}


# ── Niches ─────────────────────────────────────────────────────────────────

@app.get("/niches")
def get_niches(status: str = "pending") -> list[dict]:
    allowed = {"pending", "approved", "rejected", "used", "all"}
    if status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    return db.get_niches(None if status == "all" else status)


@app.post("/niches/{niche_id}/approve")
def approve_niche(niche_id: int) -> dict:
    row = db.set_status(niche_id, "approved")
    if not row:
        raise HTTPException(404, "niche not found")
    return row


@app.post("/niches/{niche_id}/reject")
def reject_niche(niche_id: int) -> dict:
    row = db.set_status(niche_id, "rejected")
    if not row:
        raise HTTPException(404, "niche not found")
    return row


@app.post("/niches/{niche_id}/use")
def use_niche(niche_id: int) -> dict:
    row = db.set_status(niche_id, "used")
    if not row:
        raise HTTPException(404, "niche not found")
    return row


# ── Scrape run ──────────────────────────────────────────────────────────────

@app.post("/run")
async def trigger_run(background_tasks: BackgroundTasks):
    """Trigger a new niche discovery run. Returns immediately; runs in background."""
    run_id = db.new_run()
    background_tasks.add_task(_scrape_run, run_id)
    return {"run_id": run_id, "status": "started"}


async def _scrape_run(run_id: int):
    """Generate 8 EU dropshipping niches via DeepSeek."""
    if not DEEPSEEK_API_KEY:
        print("[trendscraper] DEEPSEEK_API_KEY not set — inserting mock niches")
        _insert_mock_niches(run_id)
        return

    existing = [n["name"] for n in db.get_niches(None)]
    exclude_str = ", ".join(existing) if existing else "none"

    prompt = f"""Je bent een EU dropshipping expert. Genereer precies 8 trending product niches voor de Nederlandse/Belgische/Duitse markt.

Regels:
- Specifieke niches (niet "fitness", maar "Portable Blender Bottles voor thuis fitness")
- Minimaal 60 viral score (TikTok/Instagram potentieel)
- EU-vriendelijke shipping (Zendrop/AliExpress ≤14 dagen)
- Margin potentieel ≥40%
- Sluit deze al bestaande niches uit: {exclude_str}

Output ALLEEN een JSON array met exact 8 objecten:
[
  {{
    "name": "Specifieke niche naam",
    "trend_score": 75,
    "competition_level": "low|medium|high",
    "estimated_market_size": "€X - €Y per maand in NL/BE",
    "recommended_audience": "Leeftijd, geslacht, interesses",
    "sources": "TikTok #hashtag, Google Trends NL",
    "reasoning": "Waarom dit nu trending is in EU"
  }}
]"""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.8,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            raw = json.loads(content)
            niches = raw if isinstance(raw, list) else raw.get("niches", raw.get("data", []))

            for niche in niches[:8]:
                db.insert_niche(run_id, niche)

            print(f"[trendscraper] run {run_id}: inserted {len(niches)} niches")

    except Exception as e:
        print(f"[trendscraper] run {run_id} failed: {e}")
        _insert_mock_niches(run_id)


def _insert_mock_niches(run_id: int):
    mocks = [
        {"name": "Portable Blender Bottles", "trend_score": 88, "competition_level": "low",
         "estimated_market_size": "€80k - €200k/maand NL/BE", "recommended_audience": "18-35, fitness, thuis sports",
         "sources": "TikTok #portableblender, Google Trends NL stijgend", "reasoning": "Viral op TikTok EU, weinig concurrentie NL"},
        {"name": "Ergonomische Bureau Accessoires", "trend_score": 82, "competition_level": "medium",
         "estimated_market_size": "€150k - €400k/maand NL/BE/DE", "recommended_audience": "25-45, thuiswerkers, freelancers",
         "sources": "Google Trends DE stijgend, Reddit r/homeoffice", "reasoning": "Post-COVID thuiswerk blijft, Europees segment groeit"},
        {"name": "LED Nagellampen Salon Kit", "trend_score": 79, "competition_level": "low",
         "estimated_market_size": "€60k - €180k/maand NL/BE", "recommended_audience": "18-30, vrouwen, beauty",
         "sources": "TikTok #gelnails #nagelstudio, Pinterest NL", "reasoning": "Beauty DIY stijgt in NL, salon alternatief"},
        {"name": "Auto Smartphone Houder Draadloos", "trend_score": 85, "competition_level": "medium",
         "estimated_market_size": "€200k - €500k/maand NL/DE", "recommended_audience": "25-50, autorijders, forensen",
         "sources": "Amazon DE bestseller, Google Shopping NL", "reasoning": "Elke auto-eigenaar heeft dit nodig, repeat buyers"},
        {"name": "Plantenbak Zelfregulerend Water", "trend_score": 76, "competition_level": "low",
         "estimated_market_size": "€50k - €150k/maand NL/BE", "recommended_audience": "25-55, huiseigenaren, planten lovers",
         "sources": "Pinterest NL trending, Instagram #urbanjungle", "reasoning": "Plant trend blijft, zelfregulerend = gemak"},
        {"name": "Silicone Kookgereedschap Set", "trend_score": 80, "competition_level": "medium",
         "estimated_market_size": "€100k - €280k/maand NL/DE/BE", "recommended_audience": "28-50, kookhobbyisten, young professionals",
         "sources": "Coolblue top 100, TikTok #koken", "reasoning": "Hoog herhalingsaankoop, cadeau potentieel"},
        {"name": "Kinderfietshelm Customizable", "trend_score": 73, "competition_level": "low",
         "estimated_market_size": "€70k - €180k/maand NL/BE", "recommended_audience": "Ouders 28-42, kinderen 3-10",
         "sources": "Google Trends NL, Bol.com recensies", "reasoning": "Veiligheid trend + schoolvakanties piek"},
        {"name": "Huisdier GPS Tracker Halsband", "trend_score": 87, "competition_level": "medium",
         "estimated_market_size": "€120k - €300k/maand NL/BE/DE", "recommended_audience": "25-55, hond/kat eigenaren",
         "sources": "TikTok #pettech, Google Trends stijgend", "reasoning": "Pet spending EU groeit 12% YoY, tech segment"},
    ]
    for m in mocks:
        db.insert_niche(run_id, m)
    print(f"[trendscraper] inserted {len(mocks)} mock niches for run {run_id}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
