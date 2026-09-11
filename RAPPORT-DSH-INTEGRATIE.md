# Rapport — DeepSeek Harness in de Dropshipping-pipeline

**Datum:** 2026-08-08
**Vraag:** kan DeepSeek Harness (DSH, open source) in dit project verwerkt worden, gegeven dat we de DeepSeek API al gebruiken maar de websitegeneratie tot nu toe verschrikkelijk is?
**Methode:** broncode gelezen van zowel deze repo (`UIcontrol/src/server/**`, `Skillslibrary/**`, `.env`-sleutels op *aanwezigheid* gecontroleerd) als de DSH-installatie (`C:\Users\dylan\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\*`). Alles wat hier staat is terug te vinden in een bestand; aannames zijn expliciet gemarkeerd.

---

## 1. Kort antwoord

1. **Ja, technisch kan het** — DSH is MIT-gelicenseerd, publiek op npm (`@deepseek-ai/dsh@0.1.5-rc.1`) en de repo staat op GitHub (`github.com/deepseek-ai/deepseek-harness`). Er is een *one-shot headless modus* (`dsh --profile headless "<taak>"`), een stdio **JSON-RPC SDK-profiel** (`dsh --profile sdk`) en een **ACP**-profiel. Een Express-proces kan dus per winkel een DSH-proces spawnen en over stdio aansturen.
2. **Maar DSH is geen websitegenerator.** Het is een agent-runtime: agent-lus, tools, subagents, workflows, skills, MCP, sandbox. Het model blijft hetzelfde DeepSeek-model dat je nu al aanroept. DSH verandert *hoe* je agent werkt, niet *wat* het model kan.
3. **Belangrijke technische grens:** er is **geen in-process library-API**. `@deepseek-ai/dsh` is van de 240 packages de énige zonder `main`/`exports`/`types` — alleen een `bin`. Embedden betekent dus **spawnen**, niet importeren.
4. **Je "verschrikkelijke" winkels komen niet door het ontbreken van DSH.** Ik vond vijf concrete oorzaken in je eigen code (§4). Vier daarvan zijn zonder DSH op te lossen; twee ervan zijn de echte kwaliteitskillers (beeldmateriaal en het ontbreken van enige visuele keuring).
5. **Waar DSH wél het verschil maakt:** (a) de design-skills uit het DSH-skill-systeem als promptkapitaal, en (b) één geïtereerd generatiepad *bouwen → valideren → visueel keuren → bijstellen* in plaats van één enkele JSON-call. Dat is §6, optie A en C.
6. **Afgeraden:** je pipeline vervangen door DSH, of per winkel een volledige coding-agent laten loslaten zónder visuele keuring. Dat maakt het duurder en trager zonder dat het mooier wordt.

---

## 2. Wat DSH feitelijk is (bron-gebaseerd)

| Aspect | Bevinding | Bewijs |
|---|---|---|
| Licentie | **MIT** — 239 van 240 packages MIT, 1× BSD-3-Clause (`node-addon-system`). Geen "all rights reserved", geen Apache, geen copyleft. | `@deepseek-ai/dsh/LICENSE` → *"MIT License / Copyright (c) 2026 DeepSeek"* |
| Repo | **publiek**: `git+https://github.com/deepseek-ai/deepseek-harness.git` (per package ook `repository.directory`, bv. `apps/cli`) | `repository`-veld in elke `package.json` |
| Versie | `0.1.5-rc.1` / `-rc.2` — **release candidate, geen compatibiliteitsbelofte** (SDK-protocol meldt expliciet `serverInfo.version: 0.0.1`, "no compatibility promise") | `package.json`, `dsh-sdk-protocol/README.md` |
| Vorm | 240 los gepubliceerde npm-packages; **alles is een Cordis-plugin** in een compositie. Geen monorepo-checkout, geen `src/`, geen docs — alleen gebouwde `lib/*.js` + `.d.ts` + READMEs | `node_modules/@deepseek-ai/` |
| CLI | bin `dsh` → `lib/bin.js` (commander). Flags: `--profile`, `--patch`, `--dump-config`; subcommando's `web`, `plugin` | `@deepseek-ai/dsh/package.json`, `lib/bin.js` |
| Surfaces | `web` (browser-GUI op `127.0.0.1:3080`), `headless` (one-shot), `sdk` + `sdk-minimal` (JSON-RPC over stdio), `acp` (Agent Client Protocol) | 6 shipped `cordis.patch.yml`-bundles |
| Presets | 4 shipped: **`standard`** (default), `ptc`, `cordis`, `minimal`. Formaat: map met `preset.yml` + `agent.cordis.yml` + optioneel `skills/<naam>/SKILL.md`. Eigen presets in `${DSH_HOME}/.agent-presets/` | `@deepseek-ai/dsh-agent-presets/presets/` |
| **Embedden** | **Geen `createHarness()`/`runSession()`/`Harness`-klasse.** `@deepseek-ai/dsh` is de enige package zonder `exports` → niet importeerbaar. Programmatisch = **spawnen** (`--profile sdk` / `headless` / `acp`) | grep over alle `.d.ts`; `exports`-analyse 239/240 |
| LLM | `dsh-llm-deepseek` (route `deepseek-official`) + `dsh-llm-pi-ai` (dormant; **OpenAI én Anthropic** configureerbaar via `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) | `dsh-llm-pi-ai/lib/types/index.d.ts` |
| Modellen | catalogus: `deepseek-flash`, `deepseek-v4-flash`, `deepseek-v4-pro`, **`deepseek-v4-flash-vision-exp`**. Default hier: `deepseek-official/deepseek-flash` | `dsh-llm-deepseek/README.md`, `~/.dsh/settings.yaml` |
| Beeldinvoer | de DeepSeek-adapter heeft `maxImagesPerRequest`, `maxInlineRequestImageBytes`, `imageOffload*` → **beeld-invoer is voorzien**, i.i.g. via de vision-variant | `dsh-llm-deepseek/README.md` |
| Tools | fs (`read`/`write`/`edit`), fs-search (`glob`/`grep`), bash/pwsh (+ persistent), web, skill, todo, jobs, subagent(+fork/control), workflow, present, goal, ralph, ask-user, cordis. **Geen beeldgeneratie-tool.** | `dsh-tool-*`, toolnamen in de gebouwde JS |
| Skills | `dsh-skill` + `dsh-skill-filesystem`; roots met rang: **`<projectRoot>/.dsh/skills`** (100) → `<projectRoot>/.agents/skills` (200) → custom (300) → `$DSH_HOME/skills` (400) → `~/.agents/skills` (500) → bundled. Live watcher. | `dsh-skill-filesystem/lib/index.js` |
| MCP | `dsh-mcp-client`, tools als `mcp__<server>__<tool>`, stdio + streamable-http. **Niet standaard gemount** — moet als row toegevoegd. Alleen tools, geen resources/prompts. | `dsh-mcp-client` |
| Sandbox | Linux **bwrap/landlock**, macOS Seatbelt, Windows ACL restricted token; **fail-closed** (weigert liever dan ongeconfineerd draaien). Permissiemodi `read-only` / `workspace-write` / `danger-full-access`, approval-policy `ask`/`never` | `dsh-sandbox-local/README.md`, `dsh-base/cordis.patch.yml` |
| Config | `~/.dsh/settings.yaml` (hot-reload) + `.credentials.yaml`. Key-precedentie: proces-env → `$DSH_HOME/.credentials.yaml` → **`<cwd>/.env`** → `$DSH_HOME/.env` | `dsh-credentials-local/lib/index.js` |

**Belangrijke beperkingen van de headless-route** (letterlijk uit de README): one task per invocation, geen interactieve follow-up, alleen redenering (stderr) en het eindantwoord (stdout) worden geprint — **tussenliggende tool-output niet** — en het start alleen via de `dsh`-launcher. Voor meer controle is `--profile sdk` de route (`initialize` → `session/prompt`, met `session.event`-notificaties; géén cancel- of close-methode).

> Voor de leesbaarheid: DSH is dus geen "open-source versie van je generator". Het is de motor waar deze sessie (de agent die dit rapport schrijft) op draait.

---

## 3. Hoe je storegeneratie nu werkt

```
wizard → pipeline/engine.ts (10 stages, sequentieel, state machine, SQLite-persistentie)
   stage 7 store-build:
     runAgent(store-builder, deepseek-reasoner, temperature 0.9, max_tokens 8000,
              response_format=json_object, Zod-schema StoreBriefSchema)
        → de LLM levert ALLEEN een JSON-brief:
          hero-copy, kleuren, 3 USP's, story_angle,
          optioneel design-plan (kleuren/fonts/signature) en components-keuze
   renderStore():
     deriveDesignDNA(persona, seed) → applyDesignPlan(LLM) → selectLayout()
     → buildStorePage() → 43 vooraf gebouwde componenten (10 categorieën)
       deterministisch samengevoegd (assemblePage) met CSS-conflict-audit
     → app/page.tsx + checkout/info-pagina's + design-dna.json
   stage 8 build-validate: npm install + tsc + next build   ← de enige harde kwaliteitspoort
   stage 9 deploy, stage 10 health-check
```

Dit is een **goed doordacht systeem**: "combineren i.p.v. genereren", seeded design-DNA, anti-herhaling via `layout_history` en `component-usage`, WCAG-contrastguard, font-allowlist, CSS-conflict-audit, en een terugvalpad als de assemblage faalt (`design/build-page.ts`). Er is ook een echte bouwvalidatie (`store-platform/build-validator.ts`: `npm install` + `tsc` + `next build`) — precies het soort machinecontroleerbare signaal dat een agent-lus nodig heeft.

**De zwakke plekken zitten niet in de opzet maar in wat er ontbreekt.**

---

## 4. Vijf concrete oorzaken van "verschrikkelijk" (met bewijs)

### 4.1 Geen beeldmateriaal — de grootste visuele killer
- `UIcontrol/.env`: `OPENAI_API_KEY` **leeg**, `REPLICATE_API_TOKEN` **leeg**, `HIGGSFIELD_API_KEY` **leeg**. `hasImageProvider()` in `image-gen.ts` is dus `false`.
- Gevolg: `maybeHeroImage()` in `pipeline/store-builder.ts` doet niets en de renderer valt terug op **de ruwe leveranciersfoto** (CJ-packshot: wit, gecentreerd, veel lucht — de testfixture in `scripts/audit-store-quality.ts` bootst dat expliciet na).
- De beeldpijplijn (`generateStoreImages()`, `generateAdCreatives()`) bestaat wél, maar wordt **niet door de pipeline aangeroepen** — alleen via een handmatige route (`src/server/index.ts:1513`).
- Dit is één key in `.env` verwijderd van een compleet andere winkel. Geen enkele harness verandert dat.

### 4.2 Er is nergens een visuele keuring
- `grep playwright|puppeteer|screenshot` in `src/` → **nul treffers**.
- `scripts/verify-store-quality.ts` en `scripts/audit-store-quality.ts` controleren de *brontekst* (`page.tsx`, `design-dna.json`): welke component-id's gebruikt zijn, of CSS-variabelen bestaan, of generieke copy-woorden voorkomen. **Niemand kijkt naar een pixel.**
- Gevolg: een winkel met een uitgesneden packshot, zwakke hiërarchie of kapotte sectie-uitlijning gaat gewoon door naar productie. `build-validate` bewijst alleen dat Next.js compileert, niet dat het er goed uitziet.

### 4.3 De store-reviewer is een dood bestand
- `src/server/agents/registry.ts:21` definieert `'store-reviewer'`, `Skillslibrary/store-reviewer/SKILL.md` bestaat (102 regels) — maar `getAgent()` wordt **nergens** aangeroepen en `STAGES` in `pipeline/types.ts` bevat **geen** store-review stage.
- `UIcontrol/PROJECT_CONTEXT.md:48-51` beschrijft de flow nog mét `store-reviewer`; die is in de v3-herziening weggevallen. Er is dus geen enkele poort tussen "winkel gegenereerd" en "winkel live".

### 4.4 Verzonnen reviews en badges op de winkel
- `design/content-en.ts`: `generateReviews()` produceert deterministisch 3 reviews met verzonnen namen ("Emma R.", "James T.") en templated teksten ("Exactly as described…", 5 sterren in 72% van de gevallen). `badgeFor()` zet "Bestseller"/"Editor's pick" op producten.
- Dit is niet alleen een kwaliteitssignaal dat elke bezoeker herkent — het is **misleidende handelspraktijk** (EU oneerlijke handelspraktijken) en een Meta-adsrisico.
- Inconsistentie: `marketing-agent.ts` heeft met `checkClaims` juist een poort die verzonnen klantaantallen en sterren weigert. De winkel zelf mag het wel.

### 4.5 Prompt/schema-drift in de store-builder skill
- `Skillslibrary/store-builder/SKILL.md` staat op `version: 3.0.0` en zegt: *"The page itself is rendered from a deterministic Next.js template (no code generation)"* — terwijl de code inmiddels een design-plan **en** een componentselectie uit een catalogus van 43 componenten vraagt.
- Het voorbeeld in de skill geeft `hero_cta: "e.g. 'Bestel nu'"` — Nederlands, terwijl het hele systeem Engelstalige klantcopy eist.
- Het input-contract beschrijft `previous_agent_output.brand_agent`, terwijl `store-builder.ts` `{ brand, products }` stuurt.
- Een model dat de skill volgt, krijgt dus een deels verkeerd beeld van wat er van hem verwacht wordt. Dat kost kwaliteit bij elke run.

**Bijkomend:** `max_tokens: 8000` met `response_format: json_object` op `deepseek-reasoner` — je code detecteert het al (`reasoningOnly` in `pipeline/agent.ts`): het model kan zijn budget in het redeneren opmaken en dan nooit JSON leveren. Dan valt de run terug op `fallbackBrief()` — een sobere, generieke winkel. Precies het soort uitkomst dat "verschrikkelijk" heet.

---

## 5. Wat DSH toevoegt — en wat niet

| | DSH lost dit op? |
|---|---|
| Geen hero-/productbeeld | **Nee.** DSH heeft geen beeldgeneratie-tool. Dit is een key + pijplijnkwestie. |
| Geen visuele keuring | **Ja, als je het bouwt.** DSH geeft bash/fs-tools, subagents en workflows om screenshot → beoordeling → bijstelling te draaien. De browser (Playwright) moet je zelf toevoegen. |
| Beeld beoordelen (vision) | **Mogelijk op dezelfde provider.** De DeepSeek-adapter heeft beeldbudgetten en de catalogus noemt `deepseek-v4-flash-vision-exp`. *Onbevestigd of die model-id op jouw gateway beschikbaar is.* Alternatief: `dsh-llm-pi-ai` met OpenAI/Anthropic. |
| Dode reviewer | **Nee, indirect.** DSH maakt een reviewer-stage makkelijker te orkestreren, maar de stage moet in je pipeline terug. |
| Verzonnen reviews | **Nee.** Dat is een productbeslissing in `content-en.ts`. |
| Promptdrift in SKILL.md | **Deels.** DSH leest SKILL.md-bestanden vanaf het filesystem, en **`<projectRoot>/.dsh/skills` heeft de hoogste rang** — je `Skillslibrary/` is er dus direct op aan te sluiten. Actualiseren moet je zelf doen. |
| Modelkwaliteit | **Nee.** Zelfde DeepSeek API. |
| Herhaald bijstellen i.p.v. één shot | **Ja.** Dit is de echte winst: een agent-lus met build-feedback (`build-validator.ts` is al een perfecte reward-signal) en subagents voor parallelle varianten. |

---

## 6. Integratiemogelijkheden, gerangschikt

### Optie A — Design-skills importeren (aanbevolen, laagste risico)
Kopieer de relevante anti-generieke-design-skills naar `Skillslibrary/` en hang ze aan de store-builder. In de skillcatalogus van deze DSH-sessie staan o.a. `frontend-design`, `high-end-visual-design`, `image-taste-frontend`, `gpt-taste`, `design-taste-frontend`, `critique`, `audit`, `polish`, `typeset`, `colorize`. Je hebt zelf al `Skillslibrary/taste-skill/SKILL.md` — die is **nergens in `src/server` gerefereerd** en wordt dus nooit geladen.
**Kosten:** uren. **Runtime-afhankelijkheid van DSH:** nul. **Effect:** de LLM-brief (kleuren, fonts, signature-element, components-keuze) wordt aantoonbaar minder "AI-default".

### Optie B — Visuele keuringsloop (grootste kwaliteitssprong)
Nieuwe stage na `build-validate`, vóór `deploy`:
1. `next build` → `next start` op een tijdelijke poort (of de static export serveren);
2. Playwright screenshot op 3 viewports (mobiel/tablet/desktop);
3. beoordeling tegen een vaste checklist (contrast, hiërarchie, beeldgebruik, witruimte, "ziet dit eruit als 1000 andere Shopify-thema's") door een vision-model én deterministische checks;
4. bij falen: gerichte bijstelling van brief/design-plan en opnieuw, maximaal N rondes; anders escaleren naar de operator.
**Kosten:** 1-2 weken (Playwright + judge + lus). **DSH-rol:** dit is de natuurlijkste plek om DSH te gebruiken — één `dsh --profile sdk`-proces per winkel (of `headless` voor de simpele variant), met fs/bash-tools, de design-skills en de sandbox. Maar het kan ook volledig in-project.

### Optie C — DSH als generator voor het store-build-pad
`pipeline/store-builder.ts` roept nu één JSON-call aan. Alternatief: spawn `dsh --profile sdk` (multi-turn, met `session.event`-notificaties) of `dsh --profile headless "<opdracht + context + paden>"` met een eigen preset — fs/bash-tools, design-skills, schrijfrechten **alleen** in de build-dir — laat de agent `app/page.tsx` + CSS + `design-dna.json` produceren, en valideer daarna met de bestaande `build-validator.ts`.
**Kosten:** 2-4 weken (preset + Cordis-compositie, spawn/stdio-integratie, sandbox op de VPS, kostenbeheersing, foutpaden). **Risico's:** (a) kosten en latency per winkel stijgen fors t.o.v. één JSON-call; (b) je geeft de determinisme-garanties op die je nu bewust hebt opgebouwd (uniqueness-hash, component-usage, anti-herhaling) — een agent kan die omzeilen; (c) `headless` print geen tussentijdse tool-output, dus logging/observability moet via `sdk` of `session.event`; (d) DSH is `0.1.5-rc` **zonder compatibiliteitsbelofte** — dit is een bewegend doel.
**Wanneer wél:** als *tweede* pad voor de moeilijke gevallen (klein assortiment, excentrieke niche, operator zegt "deze is lelijk, probeer opnieuw"), niet als vervanging van de deterministische renderer.

### Optie D — De hele pipeline op DSH zetten
Afgeraden. Je 10-stage state machine, SQLite-persistentie, WebSocket-events, approval-flow en kostenadministratie werken; DSH geeft je een andere motor voor dezelfde stages. Veel refactor, weinig ontwerpwinst.

### Quick wins die niets met DSH te maken hebben (doe deze sowieso)
1. `OPENAI_API_KEY` of `REPLICATE_API_TOKEN` zetten → hero + productbeeldgeneratie aanzetten, en `generateStoreImages()` in het pipeline-pad hangen i.p.v. achter een handmatige route.
2. `generateReviews()` uit de winkel halen (of koppelen aan echte reviews); `badgeFor()` beperken tot niet-claimende labels ("New").
3. `store-reviewer` terugzetten als stage (of minstens de skill daadwerkelijk aanroepen na `store-build`).
4. `Skillslibrary/store-builder/SKILL.md` gelijktrekken met `StoreBriefSchema` (componentcatalogus, design-plan, Engels).
5. `max_tokens` verhogen of `deepseek-chat` i.p.v. `reasoner` voor de brief, zodat `reasoningOnly`-uitval verdwijnt.

---

## 7. Voorgesteld implementatieplan

| Fase | Inhoud | Resultaat | Indicatie |
|---|---|---|---|
| 0 | Quick wins 1-5 hierboven | Zichtbaar betere winkels, geen architectuurwijziging | 1-2 dagen |
| 1 | Optie A: design-skills in `Skillslibrary/`, store-builder prompt bijwerken | Minder generieke briefs | 1 dag |
| 2 | Optie B: screenshot + beoordelingsstage achter een feature-flag | Objectieve kwaliteitsmeting per winkel; eerste echte kwaliteitspoort | 1-2 weken |
| 3 | Optie C (alleen als fase 2 staat): DSH-spawn als tweede generatiepad voor uitzonderingen | Hoger plafond zonder de hoofdroute te riskeren | 2-4 weken |

**Acceptatiecriteria voor fase 2** (niet "zou moeten werken"): van 10 gegenereerde winkels zijn er 10 met screenshot; de judge-score en de deterministische checks staan per winkel in de DB; een bewust kapotte winkel (lege hero, ontbrekend beeld, te weinig contrast) wordt aantoonbaar tegengehouden.

---

## 8. Wat ik niet heb kunnen verifiëren

- **Geen visuele inspectie van echte output.** De gegenereerde winkels in `%TEMP%\dropship-stores\*` bevatten op deze machine alleen nog mappen (`app/`, `out/`, `.next/`) — de bestanden erin ontbreken, dus ik heb geen `page.tsx` of HTML kunnen bekijken om "verschrikkelijk" concreet aan te wijzen. De diagnose in §4 komt uit de code en de configuratie, niet uit een screenshot.
- **DSH is niet daadwerkelijk gestart.** Noch `headless`, noch `sdk` is gedraaid (read-only sessie). De werking is afgeleid uit gebouwde JS, `.d.ts` en READMEs. Er is geen source, geen docs en geen tests in de npm-install; alle README-links naar `src/*.ts` en `docs/` zijn in deze install dood.
- **`@deepseek-ai/dsh-sdk-client` (de TypeScript SDK-client) staat niet in deze install** — de READMEs noemen hem, maar hij is geen dependency. De client-API is dus niet geverifieerd; idem de Python-SDK.
- **Modelbeschikbaarheid is deployment-afhankelijk.** De DeepSeek-adapter registreert model-id's voor zonder de gateway te probeeren; of `deepseek-v4-flash-vision-exp` (en dus de vision-route) op jouw account werkt, is onbevestigd. Er is hier ook geen `llm-pi-ai:`-sectie in `settings.yaml`, dus OpenAI/Anthropic zijn hier niet werkend aangetroffen — alleen ondersteund in de code.
- **VPS-configuratie.** Of `OPENAI_API_KEY`, `CJ_API_KEY`, `STRIPE_*` en `META_*` op de Hetzner-VPS gevuld zijn, weet ik niet — lokaal zijn ze leeg. §4.1 geldt hard voor deze machine; op productie kan het beeld anders zijn.
- **Sandbox op de VPS.** DSH's Linux-sandbox gebruikt bwrap of landlock en is fail-closed. Of die op de Ubuntu 24.04-VPS beschikbaar zijn (en of de PM2-service ze mag gebruiken), is niet getest.
- **Kosten/latency van een agent per winkel.** Niet gemeten; DSH is hier niet met een echte winkelgeneratie-opdracht gedraaid.

---

## 9. Aanbeveling

**Verwerk DSH er niet "in" als vervanging van je generatie, maar gebruik het als gereedschap op twee plekken:**

1. **Nu:** DSH als skill-bron en als dev-omgeving. De design-skills en het skill-mechanisme zijn direct bruikbaar; dat kost bijna niets en raakt je runtime niet.
2. **Daarna:** DSH als de motor van de **visuele keuringsloop** (één proces per winkel, in de sandbox, met build- en screenshot-feedback). Dat is precies waar een agent-lus iets toevoegt dat je nu mist.
3. **Pas als dat staat:** overwegen om DSH ook de store-build zelf te laten doen, en dan alleen als tweede pad naast de deterministische renderer.

**De harde conclusie:** de reden dat je winkels lelijk zijn, is niet dat je DeepSeek in plaats van DSH gebruikt. Het is dat er geen beeldmateriaal is, dat niemand naar de winkel kijkt voordat hij live gaat, dat de reviewer die je ooit had niet meer draait, en dat er verzonnen reviews op de pagina staan. Begin daar — dat levert meer op dan welke harness ook.
