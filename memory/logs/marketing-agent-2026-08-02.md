# Marketing-agent fase 1 — concept-social-content (2 augustus 2026)

Zodra een winkel gebouwd of herbouwd wordt, genereert het systeem concept-content
voor social. **Er wordt niets gepost**: alles komt als `draft` in de database en
de operator bekijkt, bewerkt en plaatst het zelf.

Geen nieuwe abonnementen: DeepSeek (al geconfigureerd) + de bestaande SQLite.

## Taak A — de agent

`server/marketing-agent.ts`. Eén DeepSeek-call per winkel levert:

- 4 TikTok-captions (kort, spreektaal) + hashtags
- 4 Instagram-captions (iets langer) + hashtags
- per product één "wat te filmen"-suggestie

Input komt uit wat er na de store-build al klaarstaat: merknaam, niche, toon uit
de brand-agent, `story_angle` en USP's uit de brief, en de producten met prijzen.

Twee kwaliteitspoorten, allebei hergebruikt/in dezelfde geest als de site-copy:

1. **`sanitizeCopyDeep`** — dezelfde emoji-filter die de winkels zelf gebruiken,
   over het complete antwoord in één keer.
2. **`checkClaims`** — deterministisch, nieuw. Weigert varianten met verzonnen
   sociale bewijskracht. Dit gaat naar een publiek account, dus een verzonnen
   klantaantal is niet alleen generiek maar onwaar.

```
STOP  Join 10,000+ happy customers who train at home.   verzonnen klant-/verkoopaantal
STOP  Rated 4.9/5 by our community.                     verzonnen beoordelingscijfer
STOP  The #1 resistance band set in Europe.             onbewijsbare marktpositie
STOP  Clinically proven to build muscle faster.         medische claim
STOP  Thousands of athletes already switched.           verzonnen aantal
DOOR  Five bands, 3 to 25 kg, in a pouch that fits a jacket pocket.
DOOR  Ships from Germany, so it is with you in about four days.
DOOR  The 3m steel rope has replaceable bearings — no glue, just screws.
DOOR  Costs EUR 24.95 and comes with a 30-day return window.
```

Prijzen, maten en levertijden blijven dus gewoon toegestaan — dat zijn gegevens,
geen claims.

**Aanroeppunt.** Aan het eind van de `store-build`-stage, waar de brief en het
assortiment klaarstaan. Losgekoppeld afgevuurd (`generateMarketingContentDetached`):
het draait door terwijl build-validate en deploy hun gang gaan, en een mislukte
caption kan een winkel nooit tegenhouden. De `storeId` is dezelfde
deterministische die de deploy-stage daarna claimt. Bij een rebuild via het
beheerscherm draait hij opnieuw.

## Taak B — opslag

Tabel `marketing_content` in dezelfde SQLite-database:
`id, store_id, platform, kind, content_text, hashtags, product_title, status,
notes, created_at, updated_at`. Status: `draft` → `edited` → `used`.

Hergenereren vervangt alleen de concepten: wat op `used` staat is geplaatst en
blijft staan.

## Taak C — beheerscherm

Nieuw tabblad **Marketing** in de store-editor, achter de bestaande 2FA-gate.
Per platform gegroepeerd, elke variant een bewerkbaar tekstveld met hashtags,
een statusstempel, een **Kopieer**-knop (caption + hashtags samen) en een
**Gebruikt**-schakelaar. Geen publiceerknop — die hoort niet in deze fase.

Eén ontwerpkeuze onderweg: het tabblad hangt bewust NIET aan de CMS-data van de
store-platform-service. Het paneel haalt z'n eigen content op, dus het blijft
werken als die service even niet draait.

## Verificatie

**`npm run verify:marketing` → 25/25.** ⚠ Het LLM is lokaal onderschept (deze
machine heeft geen geldige DeepSeek-key); de poorten, de opslag, de
bewerk-semantiek en het gedrag bij hergenereren zijn wél echt.

```
✓ winkelgegevens, toon en story angle zitten in de prompt
✓ alle 5 verzonnen claims gevangen, alle 4 concrete captions doorgelaten
✓ emoji verwijderd (1 veld) · hashtags genormaliseerd en ontdubbeld
✓ geen geweigerde caption in de database
✓ film-suggesties hangen aan een product
✓ tekst bewerken zet de status automatisch op "bewerkt"
✓ emoji-filter geldt ook bij handmatig bewerken
✓ geplaatste content overleeft een nieuwe generatieronde
✓ mislukte generatie laat geen halve rijen achter
```

**End-to-end tegen een draaiende server** (echte 2FA-gate, echte gebouwde UI,
echte SQLite):

```
zonder sessie          → 401          (endpoints zitten achter de gate)
GET  /marketing        → 200, 6 items
PATCH /marketing/:id   → 200, status=edited
Marketing-tab aanwezig → true
  TikTok (2) · Instagram (2) · Wat te filmen (2)
  6 tekstvelden · 6 Kopieer-knoppen · 6 Gebruikt-knoppen
  statussen: concept/bewerkt zichtbaar per variant
  publiceerknop aanwezig: nee
bewerken in de UI → Opslaan verschijnt → opgeslagen, status=edited
```

Screenshot: `marketing.png` (beheerscherm, tabblad Marketing).

## Raakvlak met bestaande logica

```
alleen deze taak (marketing):
  marketing-agent.ts       389 +   (nieuw)
  MarketingPanel.tsx       235 +   (nieuw)
  verify-marketing.ts      176 +   (nieuw)
  index.ts                  67 +   (endpoints + rebuild-hook)
  pipeline/stages.ts        19 +   (aanroep na store-build)
  StoreEditor.tsx           13 ±   (tabblad)
  package.json / .gitignore  4 +

site-build-logica (design/, store-platform/, store-builder.ts): 0 wijzigingen
```

De twee andere bestanden in de tag-diff (`product-relevance.ts`,
`batch-research.ts`) horen bij de **vorige** taak — de doelgroep-/diersoort-
mismatch — die halverwege afgebroken werd. Die is nu afgemaakt en compileert;
de bijbehorende verificatie staat nog open.

## Regressie

`tsc --noEmit` schoon · `npm run build` 5,16s · alle elf verify-scripts groen ·
`vitest` 9/10 (`store.test.ts`, bestond al vóór dit werk).

## Wat nog op de VPS moet

- **De kwaliteit van échte captions.** Het model is hier onderschept. Op de VPS:
  bouw een winkel, open het tabblad Marketing en lees wat DeepSeek ervan maakt.
  Let op of de claim-poort te streng of te los staat.
- **Timing.** De generatie loopt parallel aan build-validate en deploy; of hij
  daar altijd op tijd klaar is, is hier niet gemeten.
