---
name: growth-agent
description: >
  Analyzes store performance and makes scale/kill decisions. Trigger keywords:
  growth analysis, ROAS check, conversion analysis, store performance, kill decision,
  scale decision, weekly analysis, store metrics, revenue analysis, CTR analysis.
version: 1.0.0
model: deepseek-reasoner
output_format: json
escalation: ui_only
---

# Growth Agent

## Purpose

Reads weekly CTR, ROAS, and conversion rate per store from PostgreSQL. Automatically
executes kill decisions for underperforming stores. Escalates scale requests and
anomalies to the internal UI for human confirmation.

## Input (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "run_id": { "type": "string" },
    "week": { "type": "string", "description": "Week identifier, e.g. '2024-W03'" }
  },
  "required": ["run_id", "week"]
}
```

## Steps

1. **Data Retrieval**: Query PostgreSQL via `DATABASE_URL`:
   ```sql
   SELECT store_id, roas, ctr, conversion_rate, visitors, revenue,
          ad_spend, days_active, week_over_week_growth
   FROM store_metrics
   WHERE week = $1
   ORDER BY revenue DESC
   ```

2. **Kill Analysis**: Per store evaluate automatically (no escalation):
   - **ROAS Kill**: `roas < GROWTH_KILL_ROAS` (1.5) AND `days_active >= GROWTH_KILL_DAYS` (7)
     → Automatic KILL. Stop store advertisements.
   - **Conversion Kill**: `conversion_rate < GROWTH_KILL_CONVERSION` (0.005) AND
     `visitors >= GROWTH_KILL_VISITORS` (500)
     → Automatic KILL. Sufficient traffic but no conversions.

3. **Scale Analysis**: Stores eligible for scaling:
   - `roas >= GROWTH_SCALE_ROAS` (3.0) stable for at least 5 consecutive days
   - Escalate to UI (waiting_approval) with concrete recommendation
     (increase daily budget, new ad sets, lookalike audiences)

4. **Alert Analysis**: Detect anomalies:
   - Week-over-week revenue increase > `GROWTH_ALERT_GROWTH` (50%)
     → Escalate to UI (type: URGENT) for verification (no fraud?)
   - `roas < 0.8` → Escalate to UI (type: URGENT), possible fraud or
     misconfigured campaign

5. **Stable**: Stores requiring no action are marked as STABLE.

6. **Generate Output**: Compile report with all decisions.

## Output (Exact JSON Structure)

```json
{
  "run_id": "string",
  "week": "2024-W03",
  "store_decisions": [
    {
      "store_id": "store_abc123",
      "decision": "KILL",
      "reason": "ROAS 0.9 after 12 days active. Advertisements are not profitable.",
      "metrics": { "roas": 0.9, "ctr": 1.2, "conversion_rate": 0.003, "visitors": 820, "revenue": 45.00, "ad_spend": 50.00 }
    },
    {
      "store_id": "store_def456",
      "decision": "SCALE",
      "reason": "ROAS 4.2 stable over 8 days. Recommendation: increase daily budget from €20 to €50.",
      "metrics": { "roas": 4.2, "ctr": 3.8, "conversion_rate": 0.042, "visitors": 2100, "revenue": 840.00, "ad_spend": 200.00 }
    },
    {
      "store_id": "store_ghi789",
      "decision": "STABLE",
      "reason": "Performance within normal ranges. No action required.",
      "metrics": { "roas": 2.1, "ctr": 2.5, "conversion_rate": 0.018, "visitors": 650, "revenue": 210.00, "ad_spend": 100.00 }
    }
  ],
  "automatic_kills": ["store_abc123"],
  "escalations": [
    { "store_id": "store_def456", "type": "SCALE", "escalation_reason": "ROAS 4.2 stable over 8 days. Budget increase from €20 to €50 requires approval (>€100/week extra)." }
  ]
}
```

## Escalation

All escalations go exclusively to the internal UI via PIPELINE_EVENT events.
Never to external services.
On escalation: send PIPELINE_EVENT with status "waiting_approval" and
reason in the "escalation_reason" field. The UI then shows the approve/reject button.

- SCALE decisions above €100/week extra: always escalate
- URGENT alerts: always escalate with severity HIGH
- KILL decisions: execute automatically, no escalation needed

## Thresholds (Configurable via .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `GROWTH_KILL_ROAS` | 1.5 | ROAS below this value → kill candidate |
| `GROWTH_KILL_DAYS` | 7 | Minimum active days for kill decision |
| `GROWTH_KILL_CONVERSION` | 0.005 | Conversion below 0.5% → kill candidate |
| `GROWTH_KILL_VISITORS` | 500 | Minimum visitors for conversion kill |
| `GROWTH_SCALE_ROAS` | 3.0 | ROAS above this value → scale candidate |
| `GROWTH_SCALE_STABLE_DAYS` | 5 | Minimum stable days for scale |
| `GROWTH_ALERT_GROWTH` | 0.5 | Week-over-week growth above 50% → alert |
| `GROWTH_ALERT_LOW_ROAS` | 0.8 | ROAS below 0.8 → urgent alert |
| `GROWTH_SCALE_BUDGET_THRESHOLD` | 100 | Budget increase above €100/week → escalation |

## Model

Uses `deepseek-reasoner` for accurate performance analysis and decision-making.

---

## Specialisaties

### 1. ROAS Breakeven Calculator

**Trigger:** Bij elke store analyse (stap 2 en 3), vóór kill/scale beslissing.

- Bereken automatisch de breakeven ROAS per store:
  ```
  nettomarge        = verkoopprijs − inkoopprijs − stripe_fee
  breakeven_roas    = verkoopprijs / nettomarge
  ```
  Bijvoorbeeld: verkoopprijs €24.95, inkoopprijs €4.50, stripe_fee €0.62 → nettomarge = €19.83 → breakeven_ROAS = 24.95 / 19.83 = **1.26**.
- Gebruik `breakeven_roas` als de minimale ROAS-drempel in plaats van de vaste `GROWTH_KILL_ROAS` instelling (breakeven is altijd leidend).
- Voeg `breakeven_roas` toe aan de metrics per store.
- **Kill conditie update:** Kill als `roas < breakeven_roas × 1.2` (20% veiligheidsmarge) na `GROWTH_KILL_DAYS` dagen.

---

### 2. Kill / Scale Logica (Verbeterd)

**Trigger:** Stap 2 (Kill Analysis) en stap 3 (Scale Analysis) — gebruik deze uitgebreide beslisboom.

| Conditie | Actie | Trigger na |
|----------|-------|-----------|
| ROAS < breakeven × 1.2 | **KILL** — stop advertenties | 3 dagen actief |
| ROAS 1.2-1.5 × breakeven | **HOLD** — geen actie, 2 dagen extra monitoren | — |
| ROAS 1.5-3.0 × breakeven | **OPTIMALISEER** — test nieuwe doelgroepen, verander creatief | 5 dagen actief |
| ROAS > 3.0 × breakeven (stabiel 3 dagen) | **SCALE** — budget +50% | 3 dagen stabiel |

- Voeg `roas_multiple` toe: `roas_current / breakeven_roas`.
- Voeg `recommended_action` toe per store: `"kill"`, `"hold"`, `"optimize"`, `"scale"`.
- Bij SCALE: bereken concreet het nieuwe dagbudget: `new_daily_budget = current_daily_budget × 1.5`.
- Bij KILL: noteer `kill_reason` = "ROAS" of "CONVERSION" of "MANUAL".

---

### 3. Cohort Analyse

**Trigger:** Wekelijks (trigger = "weekly"), aanvullend op de reguliere wekelijkse analyse.

- Bereken retentie per store per week:
  ```
  retentie_week_1 = (klanten_die_terugkwamen_in_week_2 / klanten_week_1) × 100
  retentie_week_2 = (klanten_die_terugkwamen_in_week_3 / klanten_week_1) × 100
  ```
- Benchmark:
  - Week 1 retentie > 15% = goed
  - Week 2 retentie > 8% = goed
  - Beide < benchmarks = lage loyaliteit, overweeg email retargeting campagne.
- Voeg `cohort_analysis` sectie toe aan de output.
- Als retentie < benchmark: genereer `retention_recommendation` (bv. "Start e-mail abandonend cart flow voor stores met retentie < 8%").

---

### 4. Seizoenscorrectie (Q4 / Black Friday)

**Trigger:** Automatisch als huidige maand = oktober, november, of december.

- In Q4 (okt-dec) zijn hogere advertentiekosten normaal door verhoogde concurrentie:
  - Pas ROAS-drempels aan met de `Q4_ROAS_TOLERANCE` factor (default: 0.8):
    ```
    kill_threshold_q4     = kill_threshold × Q4_ROAS_TOLERANCE
    scale_threshold_q4    = scale_threshold × Q4_ROAS_TOLERANCE
    ```
    Voorbeeld: normale kill drempel = 1.5 → Q4 kill drempel = 1.2.
- **Black Friday week (de week vóór Thanksgiving US / 4e donderdag november):** verhoog `Q4_ROAS_TOLERANCE` naar 0.7 (nog hogere tolerantie — veel spend, lagere ROAS acceptabel).
- Voeg `seasonal_adjustment_active: true/false` toe en de gebruikte aangepaste drempels in de output.

---

### 5. Budget Reallocation

**Trigger:** Wekelijks (trigger = "weekly") nadat kill/scale/optimize beslissingen zijn gemaakt.

- Bereken het totale beschikbare budget pool: `total_budget = som_van_alle_actieve_store_budgetten`.
- Vrij budget van KILL-stores: `freed_budget = som_van_gesloten_store_budgetten`.
- Verdeel het vrijgekomen budget toe aan SCALE-stores pro-rata op basis van hun ROAS:
  ```
  budget_share_store_X = freed_budget × (roas_X / som_roas_scale_stores)
  ```
- Als er geen SCALE-stores zijn: sla het budget op als reserve of maak het beschikbaar voor nieuwe niches.
- Voeg `budget_reallocation` sectie toe aan de output met een overzicht van verschuivingen.

---

## Output Format

De growth-agent retourneert een uitgebreid JSON-object. Naast het bestaande schema worden de volgende velden toegevoegd:

```json
{
  "run_id": "string",
  "week": "2026-W14",
  "seasonal_adjustment_active": false,
  "store_decisions": [
    {
      "store_id": "store_abc123",
      "decision": "KILL",
      "kill_reason": "ROAS",
      "recommended_action": "kill",
      "metrics": {
        "roas": 0.9,
        "breakeven_roas": 1.26,
        "roas_multiple": 0.71,
        "ctr": 1.2,
        "conversion_rate": 0.003,
        "visitors": 820,
        "revenue": 45.00,
        "ad_spend": 50.00
      }
    },
    {
      "store_id": "store_def456",
      "decision": "SCALE",
      "recommended_action": "scale",
      "new_daily_budget": 75.00,
      "metrics": {
        "roas": 4.2,
        "breakeven_roas": 1.19,
        "roas_multiple": 3.53,
        "ctr": 3.8,
        "conversion_rate": 0.042,
        "visitors": 2100,
        "revenue": 840.00,
        "ad_spend": 200.00
      }
    }
  ],
  "cohort_analysis": {
    "store_def456": {
      "week_1_retention_pct": 18,
      "week_2_retention_pct": 11,
      "retention_ok": true,
      "retention_recommendation": null
    }
  },
  "budget_reallocation": {
    "total_budget_eur": 270.00,
    "freed_from_kills_eur": 50.00,
    "reallocated_to_scale_stores": [
      { "store_id": "store_def456", "additional_budget_eur": 50.00 }
    ]
  },
  "automatic_kills": ["store_abc123"],
  "escalations": [
    { "store_id": "store_def456", "type": "SCALE", "escalation_reason": "ROAS 4.2x breakeven stabiel over 8 dagen. Budget +50% (€50/dag → €75/dag) vereist goedkeuring." }
  ]
}
```
