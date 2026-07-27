# Hoe je een release uitbrengt (wanneer wel/niet taggen)

> De autoritatieve versie van deze afspraak staat in `../../CLAUDE.md`, sectie
> "Deploy-protocol — automatisch taggen bij afgeronde taak". Dit bestand legt uit
> **waarom** en geeft de praktische checklist.

## Hoe deploy getriggerd wordt

`.github/workflows/deploy.yml` draait op een **self-hosted runner** (label
`dropships-vps`) en triggert uitsluitend op:

- `workflow_dispatch` — handmatig via de Actions-UI
- tags die matchen op `deploy-*` of `v*`

**Bewust NIET op push-naar-branch.** Zie "De 500-runs-les" hieronder.

Een run herstart live PM2-processen op productie. Dat is geen vrijblijvende actie.

## Wanneer WEL taggen

Precies één tag per afgeronde taak, op het moment dat je "klaar en geverifieerd"
rapporteert. Alle drie de voorwaarden moeten aantoonbaar waar zijn:

1. **Commit staat op origin/main**
   ```bash
   git rev-list --left-right --count origin/main...HEAD   # → 0    0
   ```
2. **Typecheck schoon** (en `npm run build` als de UI geraakt is)
   ```bash
   cd UIcontrol && npx tsc --noEmit                       # → geen output
   ```
3. **Tests of runtime-checks daadwerkelijk uitgevoerd, met echte output.**
   Niet "zou moeten werken". Kon je een check niet draaien → de taak is niet
   geverifieerd → **geen tag**, en zeg dat er expliciet bij.

Dan:

```bash
git tag deploy-$(date +%Y%m%d-%H%M%S)
git push origin --tags
```

Meld daarna welke tag je hebt gezet, zodat de run in Actions terug te vinden is.

## Wanneer NIET taggen

- ❌ Bij elke losse Edit/Write. De auto-push-hook in `.claude/settings.json`
  commit al bij élke wijziging — taggen per commit is precies de fout die
  eerder misging.
- ❌ Bij tussentijdse commits binnen een nog lopende taak.
- ❌ Bij werk dat faalde, half af is, of waarvan de verificatie niet lukte.
- ❌ Bij puur lokale experimenten (scratchpad, wegwerp-testscripts).
- ❌ "Voor de zekerheid nog een tag." Eén per taak.

## De 500-runs-les

Toen de workflow op `push` triggerde, vuurde élke auto-commit een deploy af.
Resultaat: **500+ ongewenste deploy-runs**, elk met een PM2-herstart op
productie. Daarom is het trigger-gedrag naar tag/dispatch-only gezet.

**Zet dit nooit terug naar push-triggered.** Als je denkt dat je dat nodig hebt,
heb je waarschijnlijk eigenlijk een aparte staging-workflow nodig.

## Wat de workflow doet (samengevat)

1. Verifieert dat de runner **niet als root** draait — pm2 is per-user, als root
   zou het een ander procesregister raken. Faalt hard als dat wel zo is.
2. Checkout + `npm ci` + `vite build` in `/opt/dropships/app/UIcontrol`.
3. `pm2 reload` van `uicontrol` en `store-platform`.
4. Optionele nginx-reload via de smalle sudoers-regel (`continue-on-error`:
   ontbrekende sudo-rechten mogen de deploy niet breken).
5. **Health-check op API én UI**: `/api/health` moet 200 geven, en `/` moet
   HTML met `<div id="root"` terugsturen. Faalt dit → de run faalt.

## Rollback

De vorige release-directory blijft staan; een rollback is het terugzetten van de
`current`-symlink. Voor de app zelf: tag een oudere commit opnieuw, of draai de
workflow handmatig met `workflow_dispatch` vanaf de gewenste ref.
