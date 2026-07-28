# Incident — productie in crashloop door een meegecommitte SQLite-WAL

**Datum:** 28 juli 2026
**Symptoom:** deploy faalt op `curl: (7) Failed to connect to localhost port 3001`.
**Duur:** onbekend, maar `uicontrol` stond op **1982 pm2-herstarts**.

## Wat er misging

```
0|uicontro | SqliteError: database disk image is malformed
0|uicontro |     at <anonymous> (/opt/dropships/app/UIcontrol/src/server/index.ts:606:70)
0|uicontro |   code: 'SQLITE_CORRUPT'
0|uicontro | Node.js v22.23.1
```

`index.ts:606` draaide op moduleniveau:

```ts
const nicheCount = (db.prepare('SELECT COUNT(*) as cnt FROM niches').get() as { cnt: number }).cnt
```

Die gooide → module-load faalde → proces stierf → pm2 herstartte → opnieuw.
Poort 3001 werd nooit gebonden, dus de health check kon niets vinden.

## Oorzaak

`.gitignore` had `*.db`, maar dat dekt **`dropship.db-wal` en `dropship.db-shm`
niet**. Die twee stonden dus wél in de repo:

```
$ git ls-tree -r -l origin/main -- UIcontrol/data/
100644 blob baa5153…    32768  UIcontrol/data/dropship.db-shm
100644 blob 070b6e2…  2274272  UIcontrol/data/dropship.db-wal
```

De deploy doet `git reset --hard "$GITHUB_SHA"`. Bij élke deploy werd de
productie-WAL dus overschreven met de WAL van een dev-machine. SQLite ziet in
WAL-modus een `-wal` die niet bij deze database hoort en weigert met
SQLITE_CORRUPT.

De database zelf (`dropship.db`) was wél genegeerd en stond dus niet in git —
alleen de zijbestanden. Precies de combinatie die stuk gaat.

## Wat er is gerepareerd

1. **`git rm --cached`** op `dropship.db-shm` en `dropship.db-wal`, plus
   `*.db-wal` / `*.db-shm` / `*.db-journal` in `.gitignore`. Dit is de
   werkelijke oorzaak.
2. **Guard in de workflow** (`Guard database files`): de deploy faalt als er
   database-bestanden in git staan, en ruimt verweesde zijbestanden op. Zonder
   dit komt de fout gewoon terug zodra iemand de db per ongeluk commit.
3. **De seeding-query kan de boot niet meer slopen.** Hij staat nu in een
   try/catch: een onleesbare niches-tabel is hinderlijk, maar mag niet de hele
   API platleggen.
4. **`openDatabase()` in `db.ts`** zet bij SQLITE_CORRUPT de zijbestanden opzij
   (`*.corrupt-<timestamp>`) en probeert één keer opnieuw.

## Geverifieerd

Met een moedwillig verminkte database (pagina 3 overschreven):

```
[server] niches-tabel niet leesbaar — seeding overgeslagen, server start door: SqliteError: database disk image is malformed
[server] API + WS on http://localhost:3315
  /api/health → 200
  /login      → 200
```

De server komt dus op in plaats van te crashloopen — dat is het verschil tussen
"een tabel doet het niet" en "alles ligt plat".

**Niet aangetoond:** de sidecar-quarantaine in `openDatabase()`. De probe
(`SELECT count(*) FROM sqlite_master`) leest alleen de schemapagina en merkte
mijn synthetische corruptie niet op; een vreemde WAL naast een database wist
SQLite in mijn test gewoon te negeren. De guard is dus een vangnet waarvan het
trigger-pad niet bewezen is — hij is onschadelijk, maar reken er niet op. De
bescherming die er echt toe doet zijn punt 1 en 3.

## Nog te doen op de VPS

Na deze deploy verdwijnen de meegecommitte zijbestanden vanzelf (ze zitten niet
meer in de tree, dus `git reset --hard` verwijdert ze). Controleer daarna of
`dropship.db` zelf ongeschonden is:

```bash
cd /opt/dropships/app/UIcontrol/data
sqlite3 dropship.db "PRAGMA integrity_check;" | head
```

Geeft dat iets anders dan `ok`, dan is de database zelf beschadigd en helpt het
verwijderen van de WAL niet:

```bash
cp dropship.db dropship.db.bak-$(date +%F)
sqlite3 dropship.db ".recover" | sqlite3 dropship-recovered.db
mv dropship-recovered.db dropship.db
pm2 restart uicontrol
```

## Les

Een database hoort niet in versiebeheer, en **`*.db` is daarvoor niet genoeg**.
SQLite schrijft er in WAL-modus twee zijbestanden bij die andere extensies
hebben. Ze samen negeren is het hele punt: los van elkaar zijn ze niet alleen
nutteloos, ze maken de database onbruikbaar.

Tweede les: een query op moduleniveau is een single point of failure voor het
hele proces. Alles wat bij het importeren draait en kan gooien, hoort een
vangnet te hebben.
