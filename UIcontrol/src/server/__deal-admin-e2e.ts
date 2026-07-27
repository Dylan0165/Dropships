// Bewijst de admin-kant: inloggen met 2FA → deal aanmaken → deal verschijnt
// publiek → deal verbergen → deal verdwijnt publiek.
import { generateSync } from 'otplib'
const B = process.env.TEST_BASE ?? 'http://127.0.0.1:3311'
const jar = new Map<string, string>()
async function req(p: string, o: { method?: string; body?: unknown } = {}) {
  const r = await fetch(B + p, {
    method: o.method ?? 'GET', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
    ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
  })
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';'); const i = pair.indexOf('=')
    const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim()
    if (v === '') jar.delete(n); else jar.set(n, v)
  }
  const t = await r.text()
  let j: any = null; try { j = JSON.parse(t) } catch { /* html */ }
  return { status: r.status, json: j, text: t }
}
const PW = 'DealTestWachtwoord1!'
const publicDeals = async () => (await req('/api/market/deals')).json.map((d: any) => d.title)

async function main() {
  console.log('1. account "claumi" opzetten (of bestaand gebruiken)')
  const begin = await req('/api/auth/setup/begin', { method: 'POST', body: { username: 'claumi', password: PW } })
  if (begin.status !== 200) { console.log(`   bestaat al (HTTP ${begin.status}) — dit script heeft een vers account nodig`); process.exit(2) }
  const secret = begin.json.secret
  const used: string[] = []
  const fresh = async () => { let c = generateSync({ secret }); for (let i = 0; i < 35 && used.includes(c); i++) { await new Promise(r => setTimeout(r, 1000)); c = generateSync({ secret }) } used.push(c); return c }
  const done = await req('/api/auth/setup/complete', { method: 'POST', body: { username: 'claumi', password: PW, token: await fresh() } })
  console.log(`   setup voltooid: HTTP ${done.status}`)

  console.log('2. inloggen (wachtwoord → TOTP)')
  await req('/api/auth/login', { method: 'POST', body: { username: 'claumi', password: PW } })
  const two = await req('/api/auth/verify-2fa', { method: 'POST', body: { token: await fresh() } })
  console.log(`   sessie: HTTP ${two.status}`)

  console.log('3. admin-deals ophalen (nu mét sessie)')
  const admin = await req('/api/admin/deals')
  console.log(`   HTTP ${admin.status} — ${admin.json.deals.length} deals, ${admin.json.stores.length} winkels selecteerbaar`)

  console.log('4. nieuwe deal aanmaken via het admin-endpoint')
  const created = await req('/api/admin/deals', { method: 'POST', body: { title: 'E2E Vlash-deal', subtitle: 'aangemaakt door de test', label: 'NIEUW', storeId: 'mkt-test-3' } })
  console.log(`   HTTP ${created.status} — id ${created.json.id}`)
  console.log(`   publiek zichtbaar: ${(await publicDeals()).includes('E2E Vlash-deal')}`)

  console.log('5. deal op inactief zetten')
  await req('/api/admin/deals', { method: 'POST', body: { ...created.json, active: false } })
  console.log(`   publiek zichtbaar: ${(await publicDeals()).includes('E2E Vlash-deal')}  (moet false zijn)`)

  console.log('6. deal verwijderen')
  const del = await req(`/api/admin/deals/${created.json.id}`, { method: 'DELETE' })
  const after = await req('/api/admin/deals')
  console.log(`   HTTP ${del.status} — nog ${after.json.deals.length} deals in beheer`)

  console.log('7. uitloggen → admin-endpoint weer dicht')
  await req('/api/auth/logout', { method: 'POST' })
  console.log(`   /api/admin/deals zonder sessie: HTTP ${(await req('/api/admin/deals')).status}`)
  console.log(`   /api/market/deals zonder sessie: HTTP ${(await req('/api/market/deals')).status}`)
}
main().catch(e => { console.error(e); process.exit(1) })
