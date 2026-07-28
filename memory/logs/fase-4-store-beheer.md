# Fase 4 — verificatie-output

## Store-beheer (`npm run verify:store-mgmt`)

```
═══ 1. POORT-ALLOCATIE: ALTIJD DE LAAGSTE VRIJE ═══
  drie stores gedeployed → poorten 4001, 4002, 4003
  ✓ oplopend vanaf de onderkant van de range — 4001 < 4002 < 4003
  ✓ idempotent per store — sm-a vraagt opnieuw → 4001
  middelste store (sm-b, poort 4002) verwijderd
  ✓ volgende deploy krijgt de vrijgekomen poort — nieuwe store kreeg 4002 — niet 4004, maar het gat op 4002
  ✓ opnieuw vrijgeven en pakken werkt — 4002

═══ 2. PRIJZEN IN BULK ═══
  ✓ procentuele verhoging — Alpha 20→22, Beta 33.33→36.66, Gamma 9.5→10.45
  ✓ afronding op twee decimalen — 22, 36.66, 10.45
  ✓ charme-afronding — 22→22.95, 36.66→36.95, 10.45→10.95
  ✓ prijzen worden nooit onder EUR 1 gezet — 0 wijzigingen bij -99%
  ✓ lege opdracht geweigerd — "Geef percent, delta of roundTo op"
  ✓ alleen het gekozen product — p-3 10.95→15.95

═══ 3. OVERRIDES LATEN DE ORIGINELE DATA INTACT ═══
  ✓ merged toont de bewerking — slogan="Nieuwe slogan" titel="Alpha Pro"
  ✓ originele store_data ongewijzigd — basis blijft "Alpha" / "Test slogan"
  ✓ supplier-velden overleven de bewerking — supplierProductId=CJ-1
  ✓ niet-bewerkte producten ongemoeid — Beta

═══ 3b. AI-BEWERKING — NABEWERKING VAN HET LLM-ANTWOORD ═══
  ✓ LLM-antwoord voldoet aan het schema — gevalideerd
  ✓ bewerking toegepast — 2 producten gewijzigd (van de 4 die de LLM noemde)
  ✓ verzonnen product genegeerd — onbekend id komt niet in de diff
  ✓ ongewijzigd veld levert geen diff — p-3 kreeg dezelfde titel terug → geen wijziging
  ✓ emoji uit de LLM-output geweerd — LLM stuurde "Alpha Pro 🚀" → opgeslagen "Alpha Pro"
  ✓ prijzen uit de bewerking overgenomen — p-1=20 p-2=33.33 p-3=9.5 → p-1=27.5 p-2=39.99 p-3=9.5
  ✓ slogan bijgewerkt — "Sharper than before"
  ✓ supplier-velden onaangeroerd — CJ-1
  diff (5 regels): p-1.title, p-1.description, p-1.price, p-2.price, (store).slogan
  samenvatting van de AI: "Beschrijvingen ingekort en twee prijzen aangepast."
  ✓ negatieve prijs afgekeurd door het schema — Too small: expected number to be >0
  ✓ product zonder id afgekeurd — Invalid input: expected string, received undefined

═══ 4. VERWIJDEREN VIA DE API ═══
  ✓ verwijderen zonder sessie geweigerd — HTTP 401
  ✓ ingelogd met 2FA voor de beheeracties — als fernando
  ✓ zonder bevestiging geweigerd — HTTP 428, verwacht "sm-c"
  ✓ verkeerde bevestiging geweigerd — HTTP 428
  ✓ store staat er nog — rij aanwezig
  ✓ met de juiste naam verwijderd — HTTP 200
  opruimstappen: nginx-vhost en bestanden verwijderd | geen poort in gebruik | design-combinatie vrijgegeven | 1 deal(s) van het kopers-dashboard gehaald | uit de database en de publieke etalage
  ✓ uit de database — rij weg
  ✓ poort vrijgegeven — geen actieve allocatie
  ✓ design-combinatie vrijgegeven — hash weer beschikbaar
  ✓ deal van het kopers-dashboard gehaald — geen deals meer
  ✓ uit de publieke etalage — 3 winkels in de etalage

═══ RESULTAAT: 35 geslaagd, 0 gefaald ═══```

## Beveiligingsheaders op elke store-vhost

Echt gegenereerd door `atomicDeploy()`:

```nginx
# managed by Dropships deploy-local — securitytest
# Publiek: via de Cloudflare-tunnel op poort 80. TLS eindigt bij Cloudflare.
server {
  listen 80;
  server_name securitytest.clynado.com;
  root C:/Users/dylan/AppData/Local/Temp/claude/d--Dropshippingv0-1tool/fe92529d-43f2-4b5e-a167-52a0c87e9559/scratchpad/stores-test/securitytest/current/out;
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), interest-cohort=()" always;
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.clynado.com https://api.stripe.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://checkout.stripe.com" always;
  add_header X-Store "securitytest" always;
}

# Debug-poort: UITSLUITEND op de loopback. Zonder het expliciete 127.0.0.1
# luistert nginx op 0.0.0.0 en is elke store rechtstreeks van buiten bereikbaar,
# buiten de tunnel en buiten Cloudflare om.
server {
  listen 127.0.0.1:4321;
  server_name _;
  root C:/Users/dylan/AppData/Local/Temp/claude/d--Dropshippingv0-1tool/fe92529d-43f2-4b5e-a167-52a0c87e9559/scratchpad/stores-test/securitytest/current/out;
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), interest-cohort=()" always;
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.clynado.com https://api.stripe.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://checkout.stripe.com" always;
  add_header X-Store "securitytest" always;
}
```

Twee dingen die hier veranderd zijn:

1. **`listen 127.0.0.1:<poort>`** in plaats van `listen <poort>`. Zonder het
   expliciete adres luistert nginx op `0.0.0.0` en is élke store rechtstreeks
   van buiten bereikbaar op z'n debug-poort — buiten de tunnel en buiten
   Cloudflare om. De poort blijft bestaan als lokale debug-ingang.
2. **Beveiligingsheaders met `always`.** Zonder dat trefwoord ontbreken ze op
   foutpagina's (404/50x), precies waar een aanvaller kijkt.

De CSP is ruim genoeg voor wat een gegenereerde store echt doet: inline styles
(de renderer zet alles inline), Google Fonts, productbeelden van willekeurige
leverancier-CDN's, en één XHR-doel — de centrale checkout-gateway. Strakker kan
pas als de renderer geen inline styles meer gebruikt.

**SSL** loopt volledig via Cloudflare: TLS eindigt daar, de tunnel praat
onversleuteld met nginx op de loopback. Er staan dus geen certificaten op de VPS
en er is geen certbot-vernieuwing die kan verlopen.

## Poort-parser leest de nieuwe vorm

De scan die bepaalt welke poorten al bezet zijn, moest mee met de
loopback-wijziging — anders zou `allocatePort` poorten opnieuw uitdelen die al
in gebruik zijn:

```
scanDeployedStores: [{"subdomain":"securitytest","port":4321}]
listVhostPorts   : [{"subdomain":"securitytest","port":4321,"enabled":true}]
```

`_apex.conf` komt hier bewust niet in voor: conf-bestanden die met `_` beginnen
zijn infrastructuur, geen winkel.

## Rate-limiting: IPv6-gat gedicht

De auth-limiter gebruikte `req.ip` rechtstreeks als sleutel. express-rate-limit
v8 waarschuwde daar bij elke start voor (`ERR_ERL_KEY_GEN_IPV6`): een
IPv6-gebruiker heeft miljarden adressen binnen z'n eigen /64 en kan de limiet
dus simpelweg uitzitten door van adres te wisselen. Nu via `ipKeyGenerator`,
die naar het /64-prefix normaliseert.

```
=== ValidationError-regels in de log: 0 ===

=== rate-limiting werkt nog na de IPv6-fix ===
  poging 1 → HTTP 401
  poging 2 → HTTP 401
  poging 3 → HTTP 401
  poging 4 → HTTP 401
  poging 5 → HTTP 401
  poging 6 → HTTP 429
  poging 7 → HTTP 429
  poging 8 → HTTP 429
```

## Deploy-workflow: twee echte fouten gevonden

De gemelde falende deploy (`curl: (7) Failed to connect to localhost port 3001
after 0 ms`) legde twee problemen bloot in `.github/workflows/deploy.yml`:

1. **De health check wachtte 6 seconden.** De server draait onder `tsx` en
   compileert bij het opstarten de hele server-boom; lokaal duurt dat ~14
   seconden, op een koude modulecache langer. `curl` liep dus tegen een poort
   die nog niet gebonden was. Nu een wachtlus van maximaal 120s, en bij falen
   een dump van `pm2 list`, de laatste 80 logregels en de luisterende poorten —
   zodat een volgende storing meteen diagnosticeerbaar is.
2. **De UI-check eiste HTTP 200 met `<div id="root">` op `/`.** Sinds de
   2FA-gate geeft `/` een **302 naar `/login`** voor een niet-ingelogde
   aanvraag. Die stap zou dus élke deploy hebben laten falen, ook bij een
   perfect draaiende app. De check accepteert nu 302 (en controleert dan dat
   `/login` een 200 geeft) én 200 met de React-bundel.

Daarnaast geeft `pm2 restart` een exitcode 0 zodra het proces *gestart* is, ook
als het meteen daarna crasht. Er staat nu een expliciete statuscontrole achter
die `pm2 logs` dumpt wanneer `uicontrol` niet `online` is.

Gemeten tegen een draaiende server, precies wat de workflow nu verwacht:

```
  /api/health → 200
  /            → 302 (redirect: /login)
  /login       → 200
  /market      → 200
```

## Wat NIET geverifieerd kon worden

De **AI-bewerking met een echte LLM-aanroep**. De DeepSeek-key in de lokale
dev-`.env` is ongeldig (`LLM 401: Authentication Fails`); op de VPS staat de
juiste waarde wel. Wat hier wél getest is, is het deel dat de LLM in toom houdt:
schemavalidatie, hallucinatie eruit filteren, emoji strippen, de diff en het
wegschrijven — zie sectie 3b hierboven. De aanroep zelf loopt via dezelfde
`runAgent` als alle pipeline-stages.

Ook niet gedaan: een **volledige rebuild + redeploy** van een bewerkte store.
Dat vraagt `npm install` plus `next build` per store (enkele minuten) en een
echte nginx; het rebuild-endpoint zelf is ongewijzigd gebleven.
