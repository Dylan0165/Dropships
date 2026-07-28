// Verificatie Taak F — een verwijderde store laat z'n subdomein los.
// Draait tegen echte deploy-functies met temp-mappen; nginx zelf wordt niet
// uitgevoerd (dat kan alleen op de VPS), dus de reload is een mock-commando.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.join(os.tmpdir(), 'dropship-taakf')
const CONF = path.join(ROOT, 'nginx')
const STORES = path.join(ROOT, 'stores')
fs.rmSync(ROOT, { recursive: true, force: true })
fs.mkdirSync(CONF, { recursive: true })
fs.mkdirSync(STORES, { recursive: true })

process.env.NGINX_CONF_DIR = CONF
process.env.STORES_ROOT = STORES
process.env.STORE_BASE_DOMAIN = 'clynado.com'
process.env.NGINX_RELOAD_CMD = 'echo nginx-reload-mock'
process.env.DEPLOY_MODE = 'local'

const { atomicDeploy, removeDeployedStore, ensureApexVhost, scanDeployedStores } =
  await import('../src/server/store-platform/deploy-local.js')

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const src = path.join(ROOT, 'built')
fs.mkdirSync(src, { recursive: true })
fs.writeFileSync(path.join(src, 'index.html'), '<html><body>blendmate</body></html>')

say('═══ 1. APEX + CATCH-ALL ═══')
await ensureApexVhost(m => say(`  ${m}`))
const files = () => fs.readdirSync(CONF).filter(f => f.endsWith('.conf')).sort()
say(`  conf-bestanden: ${files().join(', ')}`)
check('catch-all bestaat', files().includes('_00-default.conf'), '_00-default.conf')
check('catch-all wordt als EERSTE geladen', files()[0] === '_00-default.conf',
  `nginx maakt het eerste server-blok de default; volgorde = ${files().join(' → ')}`)
const dflt = fs.readFileSync(path.join(CONF, '_00-default.conf'), 'utf-8')
check('claimt default_server expliciet', /listen\s+80\s+default_server;/.test(dflt), 'listen 80 default_server;')
check('geeft 404 op onbekende hosts', /return\s+404;/.test(dflt), 'return 404;')

say('')
say('═══ 2. STORE DEPLOYEN ═══')
const dep = await atomicDeploy('blendmate', src, 4321, m => say(`  ${m}`))
check('deploy geslaagd', dep.ok === true, `poort ${4321}`)
const vhost = path.join(CONF, 'blendmate.conf')
check('vhost aangemaakt', fs.existsSync(vhost), vhost)
const conf = fs.readFileSync(vhost, 'utf-8')
check('luistert op het subdomein', conf.includes('server_name blendmate.clynado.com;'), 'server_name blendmate.clynado.com')
check('staat NA de catch-all', files().indexOf('blendmate.conf') > files().indexOf('_00-default.conf'),
  `volgorde: ${files().join(' → ')}`)
const scanned = await scanDeployedStores()
check('scan ziet de store', scanned.some(s => s.subdomain === 'blendmate'), JSON.stringify(scanned))

say('')
say('═══ 3. VERWIJDEREN VIA DE ÉÉN-KLIK-FLOW ═══')
const rem = await removeDeployedStore('blendmate', m => say(`  ${m}`))
check('verwijderen geslaagd', rem.ok === true, rem.error ?? 'ok')
check('vhost bestaat NIET meer', !fs.existsSync(vhost), `${vhost} weg`)
check('bestanden opgeruimd', !fs.existsSync(path.join(STORES, 'blendmate')), 'release-map weg')
check('catch-all staat er nog', fs.existsSync(path.join(CONF, '_00-default.conf')), 'onbekende hosts geven 404')
const na = await scanDeployedStores()
check('scan ziet de store niet meer', !na.some(s => s.subdomain === 'blendmate'), JSON.stringify(na))
say(`  conf-bestanden na verwijderen: ${files().join(', ')}`)

say('')
say('═══ 4. HERSTEL ALS DE CATCH-ALL ONTBREEKT ═══')
fs.rmSync(path.join(CONF, '_00-default.conf'), { force: true })
await atomicDeploy('tweede', src, 4322, () => { /* stil */ })
await removeDeployedStore('tweede', m => say(`  ${m}`))
check('catch-all wordt opnieuw aangemaakt', fs.existsSync(path.join(CONF, '_00-default.conf')),
  'anders zou het volgende server-blok de default worden')

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
say('')
say('LET OP: nginx zelf is hier niet uitgevoerd — dat kan alleen op de VPS.')
say('Wat hier bewezen is: de vhost verdwijnt, de catch-all bestaat, claimt')
say('default_server en geeft 404, en wordt vóór alle andere confs geladen.')

fs.writeFileSync(process.env.LOGFILE ?? 'subdomain-cleanup.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
