// ═══════ Authenticatie: wachtwoord + TOTP 2FA ═══════
// Drie vaste accounts (dylan/claumi/fernando), geen open registratie. Elk account
// wordt één keer aangemaakt via /setup/<username> en is daarna definitief.
//
// Beveiligingskeuzes (bewust, niet toevallig):
//  - Sessie-tokens worden GEHASHT opgeslagen (sha256). Een DB-lek levert dus geen
//    bruikbare sessies op — hetzelfde principe als wachtwoord-hashing.
//  - Het TOTP-secret wordt tijdens setup server-side in een pending-tabel bewaard,
//    NOOIT via de client teruggestuurd (anders kan een aanvaller z'n eigen secret
//    injecteren en het account overnemen).
//  - TOTP-replay-bescherming: een gebruikte code kan binnen z'n 30s-venster niet
//    hergebruikt worden (laatst gebruikte counter wordt vastgelegd).
//  - Alle vergelijkingen van geheimen gaan via timing-safe equal of bcrypt.
//  - Wachtwoord-reset kan ALLEEN met een geldige TOTP-code. Geen e-mail-reset.

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import db from './db.js'

// ── Vaste accounts ────────────────────────────────────────────────────────────
export const ALLOWED_USERS = ['dylan', 'claumi', 'fernando'] as const
export type AllowedUser = typeof ALLOWED_USERS[number]

export function isAllowedUser(name: string): name is AllowedUser {
  return (ALLOWED_USERS as readonly string[]).includes(name)
}

const BCRYPT_ROUNDS = 12
const SESSION_HOURS = 12
const PENDING_SETUP_MINUTES = 10
export const MIN_PASSWORD_LENGTH = 12

// TOTP: standaard 30s-stap, 1 stap speling voor klok-drift
authenticator.options = { window: 1 }

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_users (
    username      TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    totp_secret   TEXT NOT NULL,
    last_totp     TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_exp ON auth_sessions(expires_at);
  CREATE TABLE IF NOT EXISTS auth_pending_setup (
    username    TEXT PRIMARY KEY,
    totp_secret TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );
  -- Tussenstap login: wachtwoord OK, wacht op TOTP. Kortlevend (5 min) en
  -- eenmalig bruikbaar, zodat een onderschepte tussenstap niets waard is.
  CREATE TABLE IF NOT EXISTS auth_pending_login (
    token_hash TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`)

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(v: string): string {
  return crypto.createHash('sha256').update(v).digest('hex')
}

function nowIso(): string { return new Date().toISOString() }

export interface AuthUserRow {
  username: string
  password_hash: string
  totp_secret: string
  last_totp: string
}

export function getUser(username: string): AuthUserRow | undefined {
  return db.prepare('SELECT username, password_hash, totp_secret, last_totp FROM auth_users WHERE username = ?')
    .get(username) as AuthUserRow | undefined
}

export function userExists(username: string): boolean {
  return !!getUser(username)
}

/** Status van alle drie de accounts (voor de setup/login-pagina's). */
export function accountsStatus(): Array<{ username: string; exists: boolean }> {
  return ALLOWED_USERS.map(u => ({ username: u, exists: userExists(u) }))
}

// ── Wachtwoord-sterkte ────────────────────────────────────────────────────────

export function validatePassword(pw: string): { ok: boolean; error?: string } {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens zijn.` }
  }
  if (pw.length > 200) return { ok: false, error: 'Wachtwoord is te lang (max 200 tekens).' }
  // Minimaal 3 van de 4 categorieën — voorkomt "aaaaaaaaaaaa"
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length
  if (classes < 3) {
    return { ok: false, error: 'Gebruik minimaal 3 van: kleine letters, hoofdletters, cijfers, symbolen.' }
  }
  if (/^(.)\1+$/.test(pw)) return { ok: false, error: 'Wachtwoord mag niet uit één herhaald teken bestaan.' }
  return { ok: true }
}

// ── TOTP ──────────────────────────────────────────────────────────────────────

export function generateTotpSecret(): string {
  return authenticator.generateSecret()
}

export function totpKeyUri(username: string, secret: string): string {
  return authenticator.keyuri(username, 'Dropships', secret)
}

/** Verifieert een TOTP-code tegen een secret (zonder replay-check). */
export function verifyTotpRaw(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(String(token ?? '').trim())) return false
  try {
    return authenticator.verify({ token: String(token).trim(), secret })
  } catch {
    return false
  }
}

/**
 * Verifieert een TOTP-code VOOR een bestaande gebruiker, inclusief
 * replay-bescherming: dezelfde code kan binnen hetzelfde 30s-venster niet
 * tweemaal gebruikt worden (bv. onderschept via een gedeeld scherm).
 */
export function verifyTotpForUser(username: string, token: string): boolean {
  const user = getUser(username)
  if (!user) return false
  const clean = String(token ?? '').trim()
  if (!verifyTotpRaw(clean, user.totp_secret)) return false
  // Replay: exact dezelfde code al eerder geaccepteerd?
  if (user.last_totp && crypto.timingSafeEqual(Buffer.from(sha256(user.last_totp)), Buffer.from(sha256(clean)))) {
    return false
  }
  db.prepare('UPDATE auth_users SET last_totp = ? WHERE username = ?').run(clean, username)
  return true
}

// ── Setup (eenmalig per account) ──────────────────────────────────────────────

export interface PendingSetup { username: string; secret: string; otpauth: string }

/**
 * Start de setup: valideert het wachtwoord, genereert een TOTP-secret en bewaart
 * dat SERVER-SIDE (pending). Het wachtwoord wordt hier nog niet opgeslagen — het
 * account bestaat pas na bevestiging met een geldige code.
 */
export function beginSetup(username: string): { ok: true; pending: PendingSetup } | { ok: false; error: string } {
  if (!isAllowedUser(username)) return { ok: false, error: 'Onbekende gebruikersnaam.' }
  if (userExists(username)) return { ok: false, error: 'Dit account bestaat al. Ga naar de inlogpagina.' }

  const secret = generateTotpSecret()
  const expires = new Date(Date.now() + PENDING_SETUP_MINUTES * 60_000).toISOString()
  db.prepare(
    `INSERT INTO auth_pending_setup (username, totp_secret, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET totp_secret = excluded.totp_secret, expires_at = excluded.expires_at`,
  ).run(username, secret, expires)

  return { ok: true, pending: { username, secret, otpauth: totpKeyUri(username, secret) } }
}

function getPending(username: string): { totp_secret: string } | undefined {
  const row = db.prepare('SELECT totp_secret, expires_at FROM auth_pending_setup WHERE username = ?')
    .get(username) as { totp_secret: string; expires_at: string } | undefined
  if (!row) return undefined
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM auth_pending_setup WHERE username = ?').run(username)
    return undefined
  }
  return { totp_secret: row.totp_secret }
}

/**
 * Rondt de setup af: controleert de eerste TOTP-code tegen het pending secret en
 * maakt het account pas dán definitief aan. Race-veilig: de INSERT faalt als het
 * account inmiddels toch bestaat (PRIMARY KEY), dus nooit overschrijven.
 */
export async function completeSetup(
  username: string, password: string, token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedUser(username)) return { ok: false, error: 'Onbekende gebruikersnaam.' }
  if (userExists(username)) return { ok: false, error: 'Dit account bestaat al.' }

  const pwCheck = validatePassword(password)
  if (!pwCheck.ok) return { ok: false, error: pwCheck.error! }

  const pending = getPending(username)
  if (!pending) return { ok: false, error: 'Setup verlopen of niet gestart. Herlaad de pagina en begin opnieuw.' }
  if (!verifyTotpRaw(token, pending.totp_secret)) {
    return { ok: false, error: 'Code klopt niet. Controleer de tijd op je telefoon en probeer de nieuwste code.' }
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  try {
    db.prepare(
      `INSERT INTO auth_users (username, password_hash, totp_secret, last_totp, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(username, hash, pending.totp_secret, String(token).trim(), nowIso())
  } catch {
    return { ok: false, error: 'Dit account bestaat al.' }
  }
  db.prepare('DELETE FROM auth_pending_setup WHERE username = ?').run(username)
  return { ok: true }
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function verifyPassword(username: string, password: string): Promise<boolean> {
  const user = getUser(username)
  if (!user) {
    // Dummy-vergelijking zodat een niet-bestaand account niet sneller antwoordt
    // (voorkomt user-enumeration via timing).
    await bcrypt.compare(String(password ?? ''), '$2b$12$' + 'x'.repeat(53))
    return false
  }
  return bcrypt.compare(String(password ?? ''), user.password_hash)
}

// ── Tussenstap login (wachtwoord OK → wacht op TOTP) ──────────────────────────

const PENDING_LOGIN_MINUTES = 5

/** Maakt een eenmalig, kortlevend token na een geslaagde wachtwoord-stap. */
export function createPendingLogin(username: string): string {
  const token = crypto.randomBytes(24).toString('hex')
  const expires = new Date(Date.now() + PENDING_LOGIN_MINUTES * 60_000).toISOString()
  db.prepare('INSERT INTO auth_pending_login (token_hash, username, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), username, expires)
  return token
}

/** Wisselt het tussenstap-token in (eenmalig — wordt direct verwijderd). */
export function consumePendingLogin(token: string | undefined): string | null {
  if (!token || typeof token !== 'string') return null
  const hash = sha256(token)
  const row = db.prepare('SELECT username, expires_at FROM auth_pending_login WHERE token_hash = ?')
    .get(hash) as { username: string; expires_at: string } | undefined
  db.prepare('DELETE FROM auth_pending_login WHERE token_hash = ?').run(hash)   // eenmalig
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null
  return row.username
}

// ── Wachtwoord-reset (alleen via TOTP) ────────────────────────────────────────

export async function resetPasswordWithTotp(
  username: string, token: string, newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedUser(username) || !userExists(username)) {
    return { ok: false, error: 'Ongeldige gebruikersnaam of code.' }
  }
  const pwCheck = validatePassword(newPassword)
  if (!pwCheck.ok) return { ok: false, error: pwCheck.error! }
  if (!verifyTotpForUser(username, token)) {
    return { ok: false, error: 'Ongeldige gebruikersnaam of code.' }
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  db.prepare('UPDATE auth_users SET password_hash = ? WHERE username = ?').run(hash, username)
  // Alle bestaande sessies intrekken — een reset hoort overal uit te loggen
  db.prepare('DELETE FROM auth_sessions WHERE username = ?').run(username)
  return { ok: true }
}

// ── Sessies ───────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'dropships_sid'

/** Maakt een sessie; retourneert het RUWE token (alleen de hash gaat de DB in). */
export function createSession(username: string): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000)
  db.prepare('INSERT INTO auth_sessions (token_hash, username, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(token), username, nowIso(), expiresAt.toISOString())
  db.prepare('UPDATE auth_users SET last_login_at = ? WHERE username = ?').run(nowIso(), username)
  cleanupExpired()
  return { token, expiresAt }
}

export function getSessionUser(token: string | undefined): string | null {
  if (!token || typeof token !== 'string') return null
  const row = db.prepare('SELECT username, expires_at FROM auth_sessions WHERE token_hash = ?')
    .get(sha256(token)) as { username: string; expires_at: string } | undefined
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token))
    return null
  }
  return row.username
}

export function destroySession(token: string | undefined): void {
  if (!token) return
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token))
}

function cleanupExpired(): void {
  try {
    db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(nowIso())
    db.prepare('DELETE FROM auth_pending_setup WHERE expires_at < ?').run(nowIso())
    db.prepare('DELETE FROM auth_pending_login WHERE expires_at < ?').run(nowIso())
  } catch { /* best-effort */ }
}

/** Cookie-opties. `secure` staat aan tenzij expliciet uitgezet voor lokale http-dev. */
export function sessionCookieOptions(expires: Date) {
  const insecure = /^(1|true|yes)$/i.test(process.env.AUTH_INSECURE_COOKIES ?? '')
  return {
    httpOnly: true,
    secure: !insecure,
    sameSite: 'strict' as const,
    path: '/',
    expires,
  }
}
