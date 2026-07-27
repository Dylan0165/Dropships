// ═══════ Auth-routes + login/setup-pagina's ═══════
// De login-, setup- en reset-pagina's zijn losse, server-rendered HTML-pagina's
// zonder build-stap. Reden: zo kan de VOLLEDIGE React-bundel achter de
// sessie-gate, en krijgt een niet-ingelogde bezoeker het dashboard nooit te zien.

import express from 'express'
import rateLimit from 'express-rate-limit'
import QRCode from 'qrcode'
import {
  ALLOWED_USERS, MIN_PASSWORD_LENGTH, SESSION_COOKIE,
  accountsStatus, beginSetup, completeSetup, consumePendingLogin, createPendingLogin,
  createSession, destroySession, getSessionUser, isAllowedUser, resetPasswordWithTotp,
  sessionCookieOptions, userExists, validatePassword, verifyPassword, verifyTotpForUser,
} from './auth.js'

// ── Routes die ZONDER sessie bereikbaar blijven ───────────────────────────────
// Stripe kan geen cookie meesturen en monitoring moet altijd werken.
const PUBLIC_API = new Set(['/api/webhooks/stripe', '/api/health'])
const PUBLIC_PAGES = ['/login', '/setup', '/reset']

function isPublicPath(p: string): boolean {
  if (PUBLIC_API.has(p)) return true
  if (p.startsWith('/api/auth/')) return true                    // login/setup zelf
  if (PUBLIC_PAGES.some(base => p === base || p.startsWith(base + '/'))) return true
  return false
}

/** Sessie-gate. Alles behalve de publieke routes vereist een geldige sessie. */
export function requireAuth(
  req: express.Request, res: express.Response, next: express.NextFunction,
): void {
  if (isPublicPath(req.path)) return next()
  const user = (req as express.Request & { authUser?: string }).authUser
  if (user) return next()
  // API → 401 JSON; pagina → redirect naar de loginpagina
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Niet ingelogd', loginUrl: '/login' })
    return
  }
  res.redirect(302, '/login')
}

/** Leest de sessie-cookie en zet req.authUser (draait vóór requireAuth). */
export function attachUser(
  req: express.Request, _res: express.Response, next: express.NextFunction,
): void {
  const cookies = (req as express.Request & { cookies?: Record<string, string> }).cookies
  const user = getSessionUser(cookies?.[SESSION_COOKIE])
  if (user) (req as express.Request & { authUser?: string }).authUser = user
  next()
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Gescheiden budgetten per doel. Eén gedeeld budget was fout: dan sluit een
// normale setup-flow je daarna buiten bij het inloggen.
// `skipSuccessfulRequests` zorgt dat alleen MISLUKTE pogingen meetellen — een
// bruteforcer wordt geblokkeerd, een legitieme gebruiker nooit.
function limiter(opts: { limit: number; byUsername: boolean; skipSuccess?: boolean }) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: opts.skipSuccess ?? true,
    keyGenerator: (req) => {
      if (!opts.byUsername) return req.ip ?? 'unknown'
      const body = (req.body ?? {}) as { username?: string }
      return `${req.ip}|${String(body.username ?? 'anon').toLowerCase()}`
    },
    message: { error: 'Te veel pogingen. Wacht 15 minuten en probeer opnieuw.' },
  })
}

// Max 5 mislukte wachtwoord-pogingen per 15 min per account (vanaf één IP)
const loginLimiter = limiter({ limit: 5, byUsername: true })
// Tweede factor: de gebruikersnaam zit in de pending-cookie, niet in de body →
// sleutel op IP. Het pending-token verloopt sowieso na 5 minuten.
const totpLimiter = limiter({ limit: 5, byUsername: false })
// Reset is even gevoelig als login: 5 mislukte pogingen per account.
const resetLimiter = limiter({ limit: 5, byUsername: true })
// Setup is een eenmalige flow met legitieme herhaling (typefout in wachtwoord,
// QR opnieuw scannen) → ruimer, en ook geslaagde stappen tellen niet mee.
const setupLimiter = limiter({ limit: 15, byUsername: true })

// ── HTML-helpers ──────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · Dropships</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
  background:#0a0a0c;color:#e8e8ea;font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;padding:1.5rem}
.card{width:100%;max-width:400px;background:#141418;border:1px solid #26262e;border-radius:16px;padding:2rem}
h1{font-size:1.15rem;margin:0 0 .35rem}
p.sub{color:#8a8a96;font-size:.85rem;margin:0 0 1.5rem}
label{display:block;font-size:.75rem;color:#a8a8b4;margin:0 0 .35rem;font-weight:600}
input{width:100%;padding:.7rem .85rem;background:#0d0d10;border:1px solid #2e2e38;border-radius:8px;
  color:#fff;font-size:.95rem;font-family:inherit;margin-bottom:1rem}
input:focus{outline:2px solid #4f7cff;outline-offset:1px;border-color:transparent}
input.code{letter-spacing:.4em;text-align:center;font-size:1.3rem;font-variant-numeric:tabular-nums}
button{width:100%;padding:.75rem;background:#4f7cff;color:#fff;border:0;border-radius:8px;
  font-size:.9rem;font-weight:600;cursor:pointer;font-family:inherit}
button:hover{background:#3d68e8}button:disabled{opacity:.5;cursor:not-allowed}
.err{background:#3b1418;border:1px solid #7d2530;color:#ffb4bc;padding:.7rem .85rem;
  border-radius:8px;font-size:.85rem;margin-bottom:1rem;display:none}
.err.on{display:block}
.ok{background:#0f2e1c;border:1px solid #1f6b3f;color:#8ff0b4;padding:.7rem .85rem;
  border-radius:8px;font-size:.85rem;margin-bottom:1rem}
.qr{background:#fff;padding:.85rem;border-radius:10px;width:fit-content;margin:0 auto 1rem}
.qr img{display:block;width:200px;height:200px}
code{background:#0d0d10;border:1px solid #2e2e38;padding:.5rem .6rem;border-radius:6px;
  font-size:.75rem;display:block;word-break:break-all;margin-bottom:1rem;color:#c9c9d4}
a{color:#7f9fff;font-size:.8rem;text-decoration:none}a:hover{text-decoration:underline}
.foot{margin-top:1.25rem;text-align:center}
.step{display:none}.step.on{display:block}
</style></head><body><div class="card">${body}</div></body></html>`
}

// ── Router ────────────────────────────────────────────────────────────────────

export function registerAuthRoutes(app: express.Application): void {
  // ═══ Login-pagina ═══
  app.get('/login', (req, res) => {
    if ((req as express.Request & { authUser?: string }).authUser) return res.redirect(302, '/')
    const pending = accountsStatus().filter(a => !a.exists).map(a => a.username)
    res.type('html').send(page('Inloggen', `
<h1>Dropships</h1>
<p class="sub">Log in met je wachtwoord en 2FA-code.</p>
<div class="err" id="err"></div>

<div class="step on" id="s1">
  <label for="u">Gebruikersnaam</label>
  <input id="u" autocomplete="username" autocapitalize="off" autofocus>
  <label for="p">Wachtwoord</label>
  <input id="p" type="password" autocomplete="current-password">
  <button id="b1">Volgende</button>
</div>

<div class="step" id="s2">
  <label for="c">6-cijferige code uit Google Authenticator</label>
  <input id="c" class="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">
  <button id="b2">Inloggen</button>
</div>

<div class="foot">
  <a href="/reset">Wachtwoord vergeten? (met 2FA-code)</a>
  ${pending.length ? `<br><a href="/setup/${esc(pending[0])}">Account instellen: ${esc(pending.join(', '))}</a>` : ''}
</div>
<script>
const $=i=>document.getElementById(i), err=$('err');
const show=m=>{err.textContent=m;err.classList.add('on')};
const hide=()=>err.classList.remove('on');
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},
  credentials:'same-origin',body:JSON.stringify(b)});return{ok:r.ok,data:await r.json().catch(()=>({}))}}
$('b1').onclick=async()=>{hide();$('b1').disabled=true;
  const r=await post('/api/auth/login',{username:$('u').value.trim().toLowerCase(),password:$('p').value});
  $('b1').disabled=false;
  if(!r.ok){show(r.data.error||'Inloggen mislukt');return}
  $('s1').classList.remove('on');$('s2').classList.add('on');$('c').focus()};
$('b2').onclick=async()=>{hide();$('b2').disabled=true;
  const r=await post('/api/auth/verify-2fa',{token:$('c').value.trim()});
  $('b2').disabled=false;
  if(!r.ok){show(r.data.error||'Code klopt niet');$('c').value='';$('c').focus();return}
  location.href='/'};
$('p').onkeydown=e=>{if(e.key==='Enter')$('b1').click()};
$('c').onkeydown=e=>{if(e.key==='Enter')$('b2').click()};
</script>`))
  })

  // ═══ Setup-pagina ═══
  app.get('/setup/:username', (req, res) => {
    const username = String(req.params.username ?? '').toLowerCase()
    if (!isAllowedUser(username)) {
      return res.status(404).type('html').send(page('Onbekend', `
<h1>Onbekende gebruikersnaam</h1>
<p class="sub">Alleen ${esc(ALLOWED_USERS.join(', '))} hebben een account.</p>
<div class="foot"><a href="/login">Naar inloggen</a></div>`))
    }
    if (userExists(username)) {
      return res.status(409).type('html').send(page('Bestaat al', `
<h1>Account bestaat al</h1>
<p class="sub">Het account <strong>${esc(username)}</strong> is al ingesteld en wordt niet overschreven.</p>
<div class="foot"><a href="/login">Naar inloggen</a> · <a href="/reset">Wachtwoord vergeten?</a></div>`))
    }
    res.type('html').send(page('Account instellen', `
<h1>Account instellen</h1>
<p class="sub">Eenmalig voor <strong>${esc(username)}</strong>. Dit kan maar één keer.</p>
<div class="err" id="err"></div>

<div class="step on" id="s1">
  <label for="p">Kies een wachtwoord (min. ${MIN_PASSWORD_LENGTH} tekens)</label>
  <input id="p" type="password" autocomplete="new-password" autofocus>
  <label for="p2">Herhaal wachtwoord</label>
  <input id="p2" type="password" autocomplete="new-password">
  <button id="b1">Volgende</button>
</div>

<div class="step" id="s2">
  <p class="sub">Scan met Google Authenticator en voer daarna de code in.</p>
  <div class="qr"><img id="qr" alt="QR-code voor Google Authenticator"></div>
  <p class="sub">Lukt scannen niet? Voer deze sleutel handmatig in:</p>
  <code id="sec"></code>
  <label for="c">6-cijferige code</label>
  <input id="c" class="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">
  <button id="b2">Account activeren</button>
</div>

<div class="foot"><a href="/login">Naar inloggen</a></div>
<script>
const U=${JSON.stringify(username)};
const $=i=>document.getElementById(i), err=$('err');
const show=m=>{err.textContent=m;err.classList.add('on')};
const hide=()=>err.classList.remove('on');
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},
  credentials:'same-origin',body:JSON.stringify(b)});return{ok:r.ok,data:await r.json().catch(()=>({}))}}
$('b1').onclick=async()=>{hide();
  if($('p').value!==$('p2').value){show('Wachtwoorden komen niet overeen');return}
  $('b1').disabled=true;
  const r=await post('/api/auth/setup/begin',{username:U,password:$('p').value});
  $('b1').disabled=false;
  if(!r.ok){show(r.data.error||'Setup mislukt');return}
  $('qr').src=r.data.qr;$('sec').textContent=r.data.secret;
  $('s1').classList.remove('on');$('s2').classList.add('on');$('c').focus()};
$('b2').onclick=async()=>{hide();$('b2').disabled=true;
  const r=await post('/api/auth/setup/complete',{username:U,password:$('p').value,token:$('c').value.trim()});
  $('b2').disabled=false;
  if(!r.ok){show(r.data.error||'Activeren mislukt');$('c').value='';$('c').focus();return}
  location.href='/login'};
$('c').onkeydown=e=>{if(e.key==='Enter')$('b2').click()};
</script>`))
  })

  // ═══ Reset-pagina ═══
  app.get('/reset', (_req, res) => {
    res.type('html').send(page('Wachtwoord resetten', `
<h1>Wachtwoord resetten</h1>
<p class="sub">Alleen mogelijk met een geldige 2FA-code. Er is geen e-mail-reset.</p>
<div class="err" id="err"></div>
<label for="u">Gebruikersnaam</label>
<input id="u" autocomplete="username" autocapitalize="off" autofocus>
<label for="c">Huidige 6-cijferige code</label>
<input id="c" class="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">
<label for="p">Nieuw wachtwoord (min. ${MIN_PASSWORD_LENGTH} tekens)</label>
<input id="p" type="password" autocomplete="new-password">
<label for="p2">Herhaal nieuw wachtwoord</label>
<input id="p2" type="password" autocomplete="new-password">
<button id="b">Wachtwoord wijzigen</button>
<div class="foot"><a href="/login">Terug naar inloggen</a></div>
<script>
const $=i=>document.getElementById(i), err=$('err');
const show=m=>{err.textContent=m;err.classList.add('on')};
$('b').onclick=async()=>{err.classList.remove('on');
  if($('p').value!==$('p2').value){show('Wachtwoorden komen niet overeen');return}
  $('b').disabled=true;
  const r=await fetch('/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'same-origin',body:JSON.stringify({username:$('u').value.trim().toLowerCase(),
    token:$('c').value.trim(),newPassword:$('p').value})});
  const d=await r.json().catch(()=>({}));$('b').disabled=false;
  if(!r.ok){show(d.error||'Reset mislukt');return}
  location.href='/login'};
</script>`))
  })

  // ═══ API ═══

  // Stap 1: wachtwoord. Geeft GEEN sessie — alleen een tussenstap-token.
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    const u = String(username ?? '').toLowerCase().trim()
    // Bewust één generieke foutmelding: geen onderscheid tussen "bestaat niet"
    // en "verkeerd wachtwoord" (voorkomt user-enumeration).
    if (!isAllowedUser(u) || !(await verifyPassword(u, String(password ?? '')))) {
      res.status(401).json({ error: 'Gebruikersnaam of wachtwoord klopt niet.' })
      return
    }
    const pending = createPendingLogin(u)
    res.cookie('dropships_pending', pending, {
      httpOnly: true, secure: !/^(1|true|yes)$/i.test(process.env.AUTH_INSECURE_COOKIES ?? ''),
      sameSite: 'strict', path: '/', maxAge: 5 * 60_000,
    })
    res.json({ ok: true, next: '2fa' })
  })

  // Stap 2: TOTP → pas hier komt de echte sessie-cookie.
  app.post('/api/auth/verify-2fa', totpLimiter, (req, res) => {
    const cookies = (req as express.Request & { cookies?: Record<string, string> }).cookies ?? {}
    const username = consumePendingLogin(cookies['dropships_pending'])
    res.clearCookie('dropships_pending', { path: '/' })
    if (!username) {
      res.status(401).json({ error: 'Inlogsessie verlopen. Begin opnieuw.' })
      return
    }
    const { token } = (req.body ?? {}) as { token?: string }
    if (!verifyTotpForUser(username, String(token ?? ''))) {
      res.status(401).json({ error: 'Code klopt niet of is al gebruikt.' })
      return
    }
    const { token: sid, expiresAt } = createSession(username)
    res.cookie(SESSION_COOKIE, sid, sessionCookieOptions(expiresAt))
    res.json({ ok: true, username })
  })

  // Setup stap 1: secret genereren + QR (account bestaat hierna nog NIET)
  app.post('/api/auth/setup/begin', setupLimiter, async (req, res) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    const u = String(username ?? '').toLowerCase().trim()
    const pwCheck = validatePassword(String(password ?? ''))
    if (!pwCheck.ok) { res.status(400).json({ error: pwCheck.error }); return }

    const result = beginSetup(u)
    if (!result.ok) { res.status(409).json({ error: result.error }); return }
    const qr = await QRCode.toDataURL(result.pending.otpauth, { margin: 0, width: 400 })
    // Alleen het secret + QR terug (nodig om te scannen); het account is nog niet actief.
    res.json({ ok: true, secret: result.pending.secret, qr })
  })

  // Setup stap 2: eerste code bevestigen → account definitief aanmaken
  app.post('/api/auth/setup/complete', setupLimiter, async (req, res) => {
    const { username, password, token } = (req.body ?? {}) as
      { username?: string; password?: string; token?: string }
    const u = String(username ?? '').toLowerCase().trim()
    const result = await completeSetup(u, String(password ?? ''), String(token ?? ''))
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    console.log(`[auth] account aangemaakt: ${u}`)
    res.json({ ok: true })
  })

  // Wachtwoord-reset — uitsluitend met geldige TOTP-code
  app.post('/api/auth/reset', resetLimiter, async (req, res) => {
    const { username, token, newPassword } = (req.body ?? {}) as
      { username?: string; token?: string; newPassword?: string }
    const u = String(username ?? '').toLowerCase().trim()
    const result = await resetPasswordWithTotp(u, String(token ?? ''), String(newPassword ?? ''))
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    console.log(`[auth] wachtwoord gereset via 2FA: ${u} (alle sessies ingetrokken)`)
    res.json({ ok: true })
  })

  app.post('/api/auth/logout', (req, res) => {
    const cookies = (req as express.Request & { cookies?: Record<string, string> }).cookies ?? {}
    destroySession(cookies[SESSION_COOKIE])
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  app.get('/api/auth/me', (req, res) => {
    const user = (req as express.Request & { authUser?: string }).authUser
    if (!user) { res.status(401).json({ error: 'Niet ingelogd' }); return }
    res.json({ username: user, accounts: accountsStatus() })
  })
}
