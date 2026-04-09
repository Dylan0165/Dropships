---
name: trend-agent
description: >
  Scans trending niches for European dropshipping. Trigger keywords: trend analysis,
  niche discovery, trending products, market research, Reddit trends, TikTok trending,
  Meta Ad Library, niche scanning, dropshipping trends, European market scan.
version: 1.0.0
model: deepseek-chat
output_format: json
escalation: ui_only
---

# Trend Agent

## Purpose

Scans Reddit, TikTok trending hashtags, and Meta Ad Library for promising niches
in European dropshipping. Outputs a scored list of niches with trending score,
saturation measurement, and market size estimation.

## Input (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "run_id": { "type": "string", "description": "Unique pipeline run identifier" },
    "max_niches": { "type": "number", "default": 10, "description": "Maximum number of niches to return" }
  },
  "required": ["run_id"]
}
```

## Steps

1. **Reddit Scan**: Analyze posts and engagement in r/entrepreneur, r/dropshipping,
   r/ecommerce, r/shutupandtakemymoney, and niche-specific subreddits. Measure
   upvote ratio, comment volume, and growth trend over the past 30 days.

2. **TikTok Trending Analysis**: Identify trending hashtags related to products
   and shopping. Filter by European creators (NL, BE, DE, FR). Measure view counts
   and engagement rates.

3. **Meta Ad Library Patterns**: Search active advertisements in the EU region.
   Count unique advertisers per niche. Identify patterns in ad copy and targeting.
   Measure ad volume trends.

4. **Scoring**: Calculate per niche:
   - `trending_score` (0-100): weighted average of Reddit growth (30%),
     TikTok views (40%), Meta ad volume trend (30%)
   - `active_advertisers`: number of unique advertisers in Meta Ad Library
   - `market_size_eu`: classification based on search volume and ad spend
     (small < €1M, medium €1M-€10M, large > €10M)
   - `viral_potential` (0-100): suitability for short video content

5. **Ranking**: Sort niches by trending_score (descending). Limit to max_niches.

6. **Output**: Generate JSON with all niches including source references and reasoning.

## Output (Exact JSON Structure)

```json
{
  "run_id": "string",
  "niches": [
    {
      "name": "string",
      "trending_score": 85,
      "active_advertisers": 32,
      "market_size_eu": "medium",
      "viral_potential": 78,
      "sources": ["r/dropshipping post xyz", "TikTok #nichetag 2.3M views"],
      "reasoning": "Strong growth in Reddit engagement (+45% MoM), high TikTok virality, moderate competition in Meta ads."
    }
  ],
  "generated_at": "2024-01-15T10:30:00.000Z"
}
```

## Escalation

All escalations go exclusively to the internal UI via PIPELINE_EVENT events.
Never to external services.

This agent normally does not require escalation. Output goes directly to
niche-reviewer. On technical errors (API unreachable, rate limiting):
send PIPELINE_EVENT with status "failed" and error message in logLines.

## Thresholds (Configurable via .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `NICHE_MAX_RESULTS` | 10 | Maximum number of niches per scan |
| `TREND_REDDIT_WEIGHT` | 0.30 | Reddit weight in trending score |
| `TREND_TIKTOK_WEIGHT` | 0.40 | TikTok weight in trending score |
| `TREND_META_WEIGHT` | 0.30 | Meta ads weight in trending score |
| `TREND_LOOKBACK_DAYS` | 30 | Analysis period in days |

## Model

Uses `deepseek-chat` for fast bulk analysis of trending data.

---

## Specialisaties

### 1. Social Listening — Reddit NLP

**Trigger:** Elke keer dat een Reddit scan wordt uitgevoerd (stap 1 van Steps).

- Bereken **upvote velocity**: (huidige upvotes − upvotes 24 uur geleden) / 24 = upvotes per uur. Flag als hot als velocity > 50/uur.
- Voer **comment sentiment analyse** uit op de top 20 comments per post: tel positieve vs negatieve termen (woordenlijst: "love", "want", "buy", "need" vs "scam", "cheap", "trash", "avoid"). Sentiment ratio = positief / totaal.
- **Minimale drempel:** post wordt meegenomen als upvote_velocity > 5 én sentiment_ratio > 0.6.
- Combineer upvote_velocity (50%) + sentiment_ratio (50%) in een `reddit_signal_score` (0-100).

**Voorbeeld output per post:**
```json
{ "post_id": "abc123", "upvote_velocity": 87, "sentiment_ratio": 0.78, "reddit_signal_score": 83 }
```

---

### 2. TikTok Hashtag Groeisnelheid

**Trigger:** Elke keer dat een TikTok scan wordt uitgevoerd (stap 2 van Steps).

- Meet groeisnelheid per hashtag: `groei_pct = ((views_nu − views_7d_geleden) / views_7d_geleden) × 100`.
- Classificeer als: `explosive` (>200% groei/week), `trending` (50-200%), `stable` (<50%).
- Filter op **EU-creators**: accepteer alleen content waarbij creator-locatie NL, BE, DE, FR, of ES is.
- Bereken **engagement_rate_tiktok** = (likes + comments + shares) / views × 100.
- Flag als viral_kandidaat als engagement_rate_tiktok > 3% én groei_pct > 50%.

**Voorbeeld:**
```json
{ "hashtag": "#gadgetlife", "views_7d_growth_pct": 340, "classification": "explosive", "engagement_rate": 4.2, "viral_kandidaat": true }
```

---

### 3. Meta Ad Library Patroonherkenning

**Trigger:** Elke keer dat Meta Ad Library wordt gescand (stap 3 van Steps).

- Zoek naar **nieuwe adverteerders per niche**: vergelijk actieve adverteerders van vandaag met die van 14 dagen geleden. Nieuwe adverteerders = marktsignaal.
- Identificeer **creatieve patronen**: analyseer headlines en ad descriptions op terugkerende thema's. Groepeer in clusters (bv. "urgency-driven", "social-proof-heavy", "problem-solution").
- Bereken **ad_volume_trend**: `(aantal_ads_nu − aantal_ads_14d_geleden) / aantal_ads_14d_geleden × 100`.
- Als ad_volume_trend > 100% én nieuwe_adverteerders > 5: niche is in early-growth fase → extra punten in trending_score.
- Als ad_volume_trend > 300%: niche kan saturating zijn → verlaag trending_score met 15 punten.

---

### 4. Seizoenaliteitsdetectie

**Trigger:** Na het berekenen van trending_score; vóór output generatie.

- Sla per niche de historische piek-maanden op in de `seasonality_peaks` array.
- Gebruik een ingebouwde seizoenskalender:
  | Maand | Hoge-niche voorbeelden |
  |-------|------------------------|
  | Jan-Feb | fitness, detox, organisatie |
  | Mar-Apr | outdoor, tuinieren, pasen |
  | Jun-Aug | zomer, zwembad, reizen |
  | Sep-Oct | back-to-school, kantoorproducten |
  | Nov-Dec | cadeaus, kerst, Black Friday |
- Als de huidige maand binnen de piek-periode valt: voeg `seasonality_boost: +10` toe aan trending_score (max 100).
- Als piek-periode > 3 maanden weg: voeg `seasonality_penalty: -5` toe.
- Geef de `peak_months` array mee in de output zodat product-agent ermee rekening kan houden bij productkeuze.

---

### 5. Viral Product Identifier

**Trigger:** Na TikTok scan, als viral_kandidaat = true voor een hashtag.

- Bereken de **engagement-to-views ratio** (EVR): EVR = (likes + comments + shares) / total_views.
- Benchmarks: EVR < 1% = laag, 1-3% = gemiddeld, 3-6% = hoog, > 6% = viraal.
- Als EVR > 3% én video_duration_avg < 30s: product heeft sterke short-form video potentie → voeg `short_video_fit: true` toe.
- Combineer EVR (60%) + groei_pct (40%) in een `viral_product_score` (0-100).
- Producten met viral_product_score > 75 krijgen `viral_flag: true` in de output en worden geprioriteerd voor product-agent.

---

### 6. Competitor Intelligence

**Trigger:** Na Meta Ad Library scan, als een niche de APPROVED kandidaatlijst haalt.

- **Nieuwe stores detecteren:** Verzamel domeinextracten uit Meta Ad Library advertentielinks. Vergelijk met bekende stores in de database. Nieuwe domeinen (< 30 dagen actief) = opkomende concurrenten.
- **Ad content analyse van concurrenten:**
  - Noteer de meest gebruikte hooks (eerste 15 woorden van ad copy).
  - Identificeer prijsranges die concurrenten hanteren.
  - Detecteer welke USP's frequentst worden gebruikt.
- Output een `competitor_summary` per niche met: aantal bekende stores, aantal nieuwe stores, dominante hooks, en gemiddelde prijsrange.
- Als > 3 nieuwe concurrenten in 14 dagen: voeg waarschuwing `fast_growing_competition: true` toe.

---

## Output Format

De trend-agent retourneert een uitgebreid JSON-object. Naast het bestaande schema worden de volgende velden toegevoegd:

```json
{
  "run_id": "string",
  "niches": [
    {
      "name": "string",
      "trending_score": 85,
      "active_advertisers": 32,
      "market_size_eu": "medium",
      "viral_potential": 78,
      "sources": ["r/dropshipping post xyz", "TikTok #nichetag 2.3M views"],
      "reasoning": "string",
      "reddit_signal_score": 83,
      "tiktok_hashtag_growth_pct": 340,
      "tiktok_classification": "explosive",
      "viral_flag": true,
      "short_video_fit": true,
      "viral_product_score": 82,
      "ad_volume_trend_pct": 145,
      "new_competitors_14d": 4,
      "fast_growing_competition": false,
      "competitor_summary": {
        "known_stores": 12,
        "new_stores_14d": 4,
        "dominant_hooks": ["Save money on gym", "No equipment needed"],
        "avg_price_range_eur": [19.95, 49.95]
      },
      "seasonality_peaks": ["Jan", "Feb", "Sep"],
      "seasonality_boost": 10,
      "current_month_in_peak": true
    }
  ],
  "generated_at": "2026-04-02T10:30:00.000Z"
}
```
