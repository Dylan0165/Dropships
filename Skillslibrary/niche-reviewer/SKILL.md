---
name: niche-reviewer
description: >
  Evaluates trending niches for dropshipping suitability. Trigger keywords:
  niche evaluation, niche review, niche approval, saturation check, legal risk
  check, niche validation, niche filter, market assessment, niche decision.
version: 1.0.0
model: deepseek-reasoner
output_format: json
escalation: ui_only
---

# Niche Reviewer

## Purpose

Review agent that evaluates trend-agent output against strict criteria: trending
score, number of active advertisers, and legal risks. Delivers a decision per
niche: APPROVED, UNCERTAIN, or REJECTED. Uncertain cases are escalated to the
internal UI for human review.

## Input (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "run_id": { "type": "string" },
    "niches": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "trending_score": { "type": "number" },
          "active_advertisers": { "type": "number" },
          "market_size_eu": { "type": "string" },
          "viral_potential": { "type": "number" },
          "sources": { "type": "array", "items": { "type": "string" } },
          "reasoning": { "type": "string" }
        }
      }
    },
    "generated_at": { "type": "string" }
  },
  "required": ["run_id", "niches"]
}
```

## Steps

1. **Score Check**: Per niche evaluate trending_score:
   - `> NICHE_MIN_SCORE` (default 75): mark as APPROVED candidate
   - `>= NICHE_UNCERTAIN_MIN` (default 60) and `<= NICHE_MIN_SCORE`: mark as UNCERTAIN
   - `< NICHE_UNCERTAIN_MIN`: mark as REJECTED with reason "Score too low"

2. **Saturation Check**: If `active_advertisers > 50`: mark as REJECTED
   regardless of score. Reason: "Too many active advertisers ({n}), market saturated."

3. **Legal Risk Check**: Check niche name and reasoning for prohibited categories:
   - Medical claims or products (supplements, medications, health products)
   - Financial products (crypto, trading tools, investments)
   - Alcohol and tobacco
   - Weapons and ammunition
   - Adult products
   - Counterfeit products / trademark infringement
   On match: REJECTED with reason "Legal risk: {category}"

4. **Uncertain Decision**: Collect all niches with UNCERTAIN status. If uncertain
   cases exist: set `escalation_required: true` and send PIPELINE_EVENT with
   status "waiting_approval" to UI.

5. **Generate Output**: Compile assessment list with all decisions.

## Output (Exact JSON Structure)

```json
{
  "run_id": "string",
  "assessments": [
    {
      "niche": "fitness accessories",
      "decision": "APPROVED",
      "reason": "Trending score 82%, 28 active advertisers, no legal risks.",
      "score": 82
    },
    {
      "niche": "wellness supplements",
      "decision": "REJECTED",
      "reason": "Legal risk: medical claims",
      "score": 71
    },
    {
      "niche": "desk accessories",
      "decision": "UNCERTAIN",
      "reason": "Trending score 68%, just below threshold. Market looks promising but uncertain.",
      "score": 68
    }
  ],
  "approved_niches": ["fitness accessories"],
  "escalation_required": true,
  "escalation_reason": "1 uncertain case found: desk accessories (score 68%). Human review required."
}
```

## Escalation

All escalations go exclusively to the internal UI via PIPELINE_EVENT events.
Never to external services.
On escalation: send PIPELINE_EVENT with status "waiting_approval" and
reason in the "escalation_reason" field. The UI then shows the approve/reject button.

Pipeline only continues after approve or reject from the UI. On approve, uncertain
cases are added to approved_niches. On reject, they are removed.

## Thresholds (Configurable via .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `NICHE_MIN_SCORE` | 75 | Minimum trending score for automatic approval |
| `NICHE_UNCERTAIN_MIN` | 60 | Minimum score for uncertain case (below: reject) |
| `NICHE_MAX_ADVERTISERS` | 50 | Maximum advertisers (above: saturated) |

## Model

Uses `deepseek-reasoner` for thorough evaluation and decision-making.

---

## Specialisaties

### 1. Scorecard Systeem (100-punten model)

**Trigger:** Stap 1 (Score Check) vervangen door dit uitgebreidere scorecardmodel.

Bereken voor elke niche een **totaalscore /100** op basis van vier gelijke componenten:

| Dimensie | Max punten | Berekening |
|----------|-----------|------------|
| **Marktgrootte** | 25 | Klein (<€1M EU) = 5pt, Middel (€1M-€10M) = 15pt, Groot (>€10M) = 25pt |
| **Concurrentieniveau** | 25 | >100 ads = 0pt, 51-100 = 8pt, 21-50 = 16pt, 1-20 = 25pt |
| **Margeruimte** | 25 | Gemiddelde gross margin < €10 = 0pt, €10-€15 = 10pt, €15-€25 = 18pt, > €25 = 25pt |
| **Seizoensbestendigheid** | 25 | 1-2 piekmaanden = 8pt, 3-5 piekmaanden = 16pt, 6+ piekmaanden (evergreen) = 25pt |

- **Totaalscore ≥ 76 → APPROVED** (automatisch, geen escalatie).
- **Totaalscore 60-75 → UNCERTAIN** (escaleren naar team via UI).
- **Totaalscore < 60 → REJECTED** (automatisch afwijzen met reden).
- Voeg `scorecard_breakdown` toe aan de output met puntentoelichting per dimensie.

**Voorbeeld:**
```json
{
  "scorecard_breakdown": {
    "market_size_pts": 15,
    "competition_pts": 16,
    "margin_pts": 18,
    "seasonality_pts": 25,
    "total": 74,
    "decision": "UNCERTAIN"
  }
}
```

---

### 2. Red Flag Detector

**Trigger:** Na het berekenen van de scorecard, vóór finale beslissing. Als een red flag wordt gevonden: REJECTED ongeacht de score.

- **Marktsaturatie:** Als `active_advertisers > 1000` (Meta Ad Library, zelfde product) → red flag: `"Extreme marktsaturatie: >1000 actieve advertenties voor exact dit product"`.
- **Patentrisico:** Scan de productnaam en niche op merken die bekend staan om IP-bescherming:
  - Blokkeer: Apple, Nike, Adidas, Sony, Samsung, Louis Vuitton, Gucci, Disney, Lego, en alle producten met "® " of "™ " in de naam.
  - Als match: `"Patentrisico / trademark infringement: {merknaam} gedetecteerd"`.
- **Meta verboden categorieën:** Controleer op:
  ```
  ["wapens", "munitie", "drugs", "alcohol", "tabak", "gokken", "adult content",
   "medische claims", "financiële producten", "crypto", "supplements met claims",
   "gewichtsverlies pillen", "weapons", "gambling", "adult", "CBD", "firearms"]
  ```
  Exacte match of substring match in niche naam of reasoning → red flag.
- Voeg `red_flags` array toe aan de output. Als leeg: `[]`. Als gevuld: automatisch REJECTED.

---

### 3. Geografische Kansverdeling

**Trigger:** Voor alle APPROVED en UNCERTAIN niches, na de scorecard berekening.

- Genereer per niche een `geo_opportunity` matrix voor de primaire EU-markten:
  | Land | Beoordeling | Motivering |
  |------|-------------|------------|
  | NL   | ... | Marktgrootte, koopkracht, levertijdvoordeel |
  | BE   | ... | Tweetalig, hoge koopkracht |
  | DE   | ... | Grootste EU-markt, hogere acquisitikosten |
  | FR   | ... | Volume, maar hogere retourpercentages |
  | PL   | ... | Groeimarkt, lagere CPC |
- Schaal: `"hoog"`, `"middel"`, `"laag"` per land.
- Geef ook `primary_target_country` mee: het land met de beste risico/rendementverhouding.
- Logica: NL/BE = voorkeur voor startcampagnes (lage CPC + korte levertijd), DE = schaalmogelijkheid bij bewezen ROAS.

---

## Output Format

De niche-reviewer retourneert een uitgebreid JSON-object. Naast het bestaande schema worden de volgende velden toegevoegd:

```json
{
  "run_id": "string",
  "assessments": [
    {
      "niche": "fitness accessories",
      "decision": "APPROVED",
      "reason": "Totaalscore 82/100. Geen red flags. Primaire markt: NL.",
      "score": 82,
      "scorecard_breakdown": {
        "market_size_pts": 15,
        "competition_pts": 16,
        "margin_pts": 25,
        "seasonality_pts": 25,
        "total": 82
      },
      "red_flags": [],
      "geo_opportunity": {
        "NL": { "rating": "hoog", "reason": "Korte levertijd NL-warehouse, grote fitness community" },
        "BE": { "rating": "hoog", "reason": "Hoge koopkracht, vergelijkbaar met NL" },
        "DE": { "rating": "middel", "reason": "Grote markt maar hogere CPC, pas opschalen na bewezen ROAS" },
        "FR": { "rating": "laag", "reason": "Hoge retourpercentages in fitness categorie" },
        "PL": { "rating": "middel", "reason": "Groeimarkt, lagere CPC maar ook lagere AOV" }
      },
      "primary_target_country": "NL"
    },
    {
      "niche": "wellness supplements",
      "decision": "REJECTED",
      "reason": "Red flag: Meta verboden categorie (supplements met gezondheidsclaimsj). Score irrelevant.",
      "score": 71,
      "scorecard_breakdown": { "market_size_pts": 25, "competition_pts": 8, "margin_pts": 25, "seasonality_pts": 13, "total": 71 },
      "red_flags": ["Meta verboden categorie: supplements met medische claims"]
    }
  ],
  "approved_niches": ["fitness accessories"],
  "escalation_required": false,
  "escalation_reason": null
}
```
