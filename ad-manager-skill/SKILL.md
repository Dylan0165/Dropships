---
name: ad-manager
description: >
  Gebruik deze skill wanneer de gebruiker werkt aan het Ad Manager systeem binnen het Dropshipping automatiseringsproject. Triggers: Higgsfield API, video ads genereren, geanimeerde ads, Meta Ads koppeling, TikTok Ads koppeling, ad pipeline, creative pipeline, image-to-video, ad-agent, ad manager dashboard, ads voor deployed stores. Dit systeem genereert automatisch statische image ads (fase 1) en geanimeerde video ads via Higgsfield (fase 2) voor elke gedeployde dropshipping store, en koppelt ze aan Meta/TikTok platformen.
---

# Ad Manager Skill

## Architectuur overzicht

Het Ad Manager systeem zit volledig in de bestaande Dropships pipeline op de tool server (192.168.121.133).

### Nieuwe services

| Service       | Poort | Functie                                      |
|---------------|-------|----------------------------------------------|
| ad-manager    | 3003  | Ad pipeline orchestratie + Higgsfield client |
| ad-dashboard  | 5175  | React UI voor ad beheer per store            |

### Database uitbreiding (dropship.db)

Nieuwe tabellen naast bestaande `stores` en `runs`:

```sql
CREATE TABLE ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER REFERENCES stores(id),
  run_id TEXT,
  platform TEXT,           -- 'meta' | 'tiktok' | 'both'
  format TEXT,             -- 'image' | 'video_animated'
  phase TEXT,              -- 'static' | 'animated'
  status TEXT,             -- 'queued' | 'generating' | 'ready' | 'published' | 'killed'
  higgsfield_job_id TEXT,
  creative_url TEXT,
  hook TEXT,
  primary_text TEXT,
  headline TEXT,
  performance_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE higgsfield_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER REFERENCES ads(id),
  job_id TEXT UNIQUE,
  status TEXT,             -- 'pending' | 'processing' | 'completed' | 'failed'
  input_image_url TEXT,
  output_video_url TEXT,
  prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

### Pipeline uitbreiding

Bestaande pipeline eindigt bij `ads-reviewer`. Daarna start automatisch:

```
ads-reviewer → [NIEUW] ad-generator → [NIEUW] higgsfield-animator (conditioneel)
```

Conditioneel betekent: Higgsfield wordt alleen getriggerd als:
- `performance_score > 7.0` (hoog potentieel product), OF
- Store heeft 2+ dagen positieve ROAS

---

## Higgsfield API integratie

### Endpoints

```
POST https://api.higgsfield.ai/v1/generate/image-to-video
GET  https://api.higgsfield.ai/v1/jobs/{job_id}
```

### Animatie strategie per fase

**Fase 1 — Static image ads (direct bij store launch)**
- Gebruik productafbeeldingen van de store
- Genereer 5 creatives via ads-agent output (hooks al beschikbaar)
- Formaten: 1:1 (feed), 9:16 (story/reels), 16:9 (banner)
- Platformen: Meta + TikTok

**Fase 2 — Animated video ads (bij potentieel of groei)**
- Higgsfield image-to-video op de beste static ad
- Prompt gebaseerd op product + hook uit ads-agent
- Duur: 3–6 seconden (ideaal voor Meta Reels + TikTok)
- Trigger: automatisch OF handmatig via dashboard

### Prompt template voor Higgsfield

```
"{product_name} product shot, {animation_style}, {hook_emotion},
cinematic lighting, high-end commercial, 4K, smooth motion,
no text overlay, brand color {primary_color}"
```

---

## Dashboard (ad-dashboard poort 5175)

### Pagina's

1. **Overzicht** — alle stores met ad status + performance badge
2. **Store detail** — ads per store, preview thumbnails, platform status
3. **Generator** — handmatig ad genereren (kies store + platform + fase)
4. **Queue** — Higgsfield jobs in behandeling (polling elke 10s)
5. **Analytics** — spend, CTR, ROAS per ad (handmatig invullen of API)

### UI componenten

- `StoreAdCard` — store thumbnail + ad count + quick-generate knop
- `AdPreview` — creative preview + hook tekst + platform badges
- `HiggsfieldQueue` — live job status met progress bar
- `PhaseToggle` — schakel tussen static/animated per store
- `PlatformBadge` — Meta / TikTok / Both indicators

---

## .env variabelen (toevoegen aan tool server)

```bash
HIGGSFIELD_API_KEY=your_key_here
META_ACCESS_TOKEN=optional_for_publishing
TIKTOK_ACCESS_TOKEN=optional_for_publishing
AD_AUTO_ANIMATE_THRESHOLD=7.0
```

---

## Kill/Scale integratie

Gebruik exact de bootcamp kill rules voor ads:

| Spend | Check       | Actie in systeem          |
|-------|-------------|---------------------------|
| €10   | CPC > €1    | Status → 'killed', alert  |
| €20   | 0 ATC       | Status → 'killed', alert  |
| €30   | 0 purchases | Status → 'killed', alert  |
| €50   | Geen winst  | Status → 'killed', alert  |

Bij scale: trigger automatisch Higgsfield fase 2 als nog niet gedaan.

---

## Agent bestanden

Zet in `Skillslibrary/` op de tool server:
- `ad-generator/SKILL.md` — image creative generatie + prompt schrijven
- `higgsfield-animator/SKILL.md` — Higgsfield job aanmaken + polling

---

## Bestandslocaties (tool server ~/Dropships/)

```
UIcontrol/
├── src/server/
│   ├── ad-manager.ts        # Higgsfield client + ad pipeline orchestratie
│   └── ad-db.ts             # Ad/job DB queries (CREATE, UPDATE, SELECT)
└── ad-dashboard/            # Vite React app (poort 5175)
    ├── package.json
    └── src/
        ├── pages/
        │   ├── Overview.tsx
        │   ├── StoreDetail.tsx
        │   ├── Generator.tsx
        │   ├── Queue.tsx
        │   └── Analytics.tsx
        └── components/
            ├── StoreAdCard.tsx
            ├── AdPreview.tsx
            ├── HiggsfieldQueue.tsx
            ├── PhaseToggle.tsx
            └── PlatformBadge.tsx
```

---

## Implementatie volgorde (aanbevolen)

1. DB migratie: voeg `ads` en `higgsfield_jobs` tabellen toe aan `db.ts`
2. Schrijf `ad-manager.ts`: Higgsfield API client + `generateAd()` + `pollJob()`
3. Koppel in `coordinator.ts`: na ads-reviewer, roep ad-manager aan (best-effort)
4. Bouw ad-dashboard als Vite React app (apart van UIcontrol frontend)
5. Registreer in PM2: `pm2 start ... --name ad-manager` en `--name ad-dashboard`
6. Nginx: voeg proxy rules toe voor poort 3003 en 5175

---

## Technische notities

- Higgsfield jobs zijn asynchroon — poll elke 10-30s tot status `completed`
- Sla `output_video_url` op in `higgsfield_jobs` tabel zodra klaar
- Kopieer video naar `/var/www/stores/<subdomain>/ads/` op store server via SSH
- Meta/TikTok publicatie is optioneel (requires access tokens) — creative URL volstaat voor handmatig uploaden
- Ad-manager service mag crashen zonder de hoofdpipeline te stoppen (best-effort patroon zoals store deploy)
