# Fase 2 — verificatie-output

Getest tegen een echt draaiende server (`PORT=3311`), met drie geseede live
teststores (Trailform / Mealkind / Nightwell) en drie deals waarvan één inactief.

## De apex-pagina, zonder login

```
$ curl -s -o market.html -w "HTTP %{http_code}  %{size_download} bytes  type=%{content_type}\n" \
    http://127.0.0.1:3311/market
HTTP 200  10845 bytes  type=text/html; charset=utf-8
```

De teststores staan server-rendered in de HTML — niet pas na een fetch:

```
<h3>Trailform</h3>
<h3>Mealkind</h3>
<h3>Nightwell</h3>

class="card" href="https://trailform.jouwdomein.nl/"
class="card" href="https://mealkind.jouwdomein.nl/"
class="card" href="https://nightwell.jouwdomein.nl/"
```

> De hostnaam komt uit `STORE_BASE_DOMAIN`; op deze dev-machine staat daar nog
> de placeholder `jouwdomein.nl`. Op de VPS hoort daar `clynado.com` te staan.

Categoriefilters worden afgeleid uit de niche en alleen getoond als er winkels
in zitten:

```
data-cat=""         aria-pressed="true"  → Alles (3)
data-cat="sport"    aria-pressed="false" → Sport (1)
data-cat="kitchen"  aria-pressed="false" → Keuken (1)
data-cat="wellness" aria-pressed="false" → Wellness (1)
```

Deals: alleen de actieve komen erin.

```
<b>TEST Winterkorting op trainingsmatten</b>
<b>TEST Gratis verzending op keukensets</b>
verborgen deal aanwezig: 0
```

## Publiek versus achter de 2FA-gate

```
=== PUBLIEK (zonder cookie) ===
/market                      200
/api/market/stores           200
/api/market/deals            200

=== ACHTER DE 2FA-GATE ===
/ (admin dashboard)          302   → /login
/api/admin/deals             401
/api/stores                  401
```

De publieke JSON:

```
Trailform | Sport    | portable gym equipment    | thumb=ja
Mealkind  | Keuken   | kitchen prep tools        | thumb=ja
Nightwell | Wellness | sleep and wellness aids   | thumb=kleurvlak
2 actieve deals: TEST Winterkorting op trainingsmatten / TEST Gratis verzending op keukensets
```

## De etalage volgt de database live

Geen synchronisatiestap, geen cache die je moet legen — de status in de
`stores`-tabel is de waarheid:

```
vóór       : Trailform, Mealkind, Nightwell
   DB: Mealkind → status=killed (1 rij)
na kill    : Trailform, Nightwell
   DB: Mealkind → status=live (1 rij)
na herstel : Trailform, Mealkind, Nightwell
```

## Deals beheren vanuit het admin-dashboard (end-to-end)

```
1. account "claumi" opzetten
   setup voltooid: HTTP 200
2. inloggen (wachtwoord → TOTP)
   sessie: HTTP 200
3. admin-deals ophalen (nu mét sessie)
   HTTP 200 — 3 deals, 3 winkels selecteerbaar
4. nieuwe deal aanmaken via het admin-endpoint
   HTTP 200 — id 4
   publiek zichtbaar: true
5. deal op inactief zetten
   publiek zichtbaar: false  (moet false zijn)
6. deal verwijderen
   HTTP 200 — nog 3 deals in beheer
7. uitloggen → admin-endpoint weer dicht
   /api/admin/deals zonder sessie: HTTP 401
   /api/market/deals zonder sessie: HTTP 200
```

## Weergave (headless Chromium)

```
filter "Sport"    → 1 kaart(en) zichtbaar
zoekterm "keuken" → 1 kaart(en) zichtbaar
desktop  1280x900 light  horizontale overflow: false  JS-fouten: geen
mobile    390x844 light  horizontale overflow: false  JS-fouten: geen
dark     1280x900 dark   horizontale overflow: false  JS-fouten: geen
```

De screenshots legden één echt probleem bloot: bij een kapotte productafbeelding
bleef een leeg vlak achter. Het merkkleurvlak met initialen staat nu **altijd**
onder de afbeelding, met `onerror="this.remove()"` erop. Productbeelden komen van
de leverancier en kunnen zonder waarschuwing verdwijnen; dan hoort de kaart een
herkenbaar merkvlak te tonen, geen gat.

## Typecheck en build

```
npx tsc --noEmit  → schoon
npm run build     → ✓ built in 5.88s
```

## Valkuil die tijdens het testen toesloeg

De eerste screenshot-ronde toonde de oude pagina: `pkill` had het oude
tsx-proces niet gedood, dus de herstart botste stil op `EADDRINUSE` en de
metingen kwamen van de vorige build. Op Windows moet dat via
`Get-NetTCPConnection -LocalPort <poort> | Stop-Process`. Controleer bij elke
her-meting eerst of de server écht opnieuw is opgestart.
