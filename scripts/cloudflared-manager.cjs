#!/usr/bin/env node
// ═══════ Cloudflare Quick Tunnel manager (PM2: "cloudflared-api") ═══════
// Waarom: Mollie eist een webhook-URL die publiek bereikbaar is; het LAN
// (192.168.121.x) is dat niet → structurele 422's. Deze manager:
//   1. start `cloudflared tunnel --url http://127.0.0.1:3001` (Quick Tunnel:
//      gratis, geen Cloudflare-account of eigen domein nodig, geen open poorten)
//   2. parset de toegewezen https://*.trycloudflare.com URL uit de output
//   3. registreert die bij de UIcontrol API (POST /api/admin/public-url),
//      die hem in SQLite bewaart — mollie.ts leest hem runtime, dus een
//      URL-wissel (quick tunnels wisselen bij herstart!) vergt geen pm2 restart
//   4. her-registreert elke 60s (heartbeat) en herstart cloudflared bij crash
//
// Binary: ~/bin/cloudflared (door CI gedownload, geen sudo nodig) of in PATH.
// Start:  pm2 start scripts/cloudflared-manager.cjs --name cloudflared-api

'use strict'
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const API_BASE = process.env.UICONTROL_API ?? 'http://127.0.0.1:3001'
const TUNNEL_TARGET = process.env.TUNNEL_TARGET ?? 'http://127.0.0.1:3001'
const HEARTBEAT_MS = 60_000
const RESTART_BACKOFF_MS = 10_000

function findCloudflared() {
  const candidates = [
    path.join(os.homedir(), 'bin', 'cloudflared'),
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
    'cloudflared', // PATH
  ]
  for (const c of candidates) {
    if (c === 'cloudflared') return c
    try { fs.accessSync(c, fs.constants.X_OK); return c } catch { /* volgende */ }
  }
  return 'cloudflared'
}

let currentUrl = null

async function registerUrl(url) {
  try {
    const resp = await fetch(`${API_BASE}/api/admin/public-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TUNNEL_TOKEN ? { 'X-Tunnel-Token': process.env.TUNNEL_TOKEN } : {}),
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(8_000),
    })
    const data = await resp.json().catch(() => ({}))
    if (resp.ok) {
      console.log(`[cf-manager] geregistreerd bij UIcontrol: ${url}`)
    } else {
      console.error(`[cf-manager] registratie geweigerd (${resp.status}): ${JSON.stringify(data)}`)
    }
  } catch (err) {
    // UIcontrol (nog) niet op — heartbeat probeert het zo weer
    console.warn(`[cf-manager] registratie mislukt (${err.message}) — retry via heartbeat`)
  }
}

function startTunnel() {
  const bin = findCloudflared()
  console.log(`[cf-manager] start: ${bin} tunnel --url ${TUNNEL_TARGET}`)
  const proc = spawn(bin, ['tunnel', '--url', TUNNEL_TARGET, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // cloudflared print de toegewezen URL op stderr (banner) — scan beide streams
  const scan = (chunk) => {
    const text = chunk.toString()
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
    if (m && m[0] !== currentUrl) {
      currentUrl = m[0]
      console.log(`[cf-manager] tunnel-URL toegewezen: ${currentUrl}`)
      registerUrl(currentUrl)
    }
  }
  proc.stdout.on('data', scan)
  proc.stderr.on('data', scan)

  proc.on('exit', (code, signal) => {
    console.error(`[cf-manager] cloudflared gestopt (code=${code} signal=${signal}) — herstart over ${RESTART_BACKOFF_MS / 1000}s`)
    currentUrl = null
    setTimeout(startTunnel, RESTART_BACKOFF_MS)
  })
  proc.on('error', (err) => {
    console.error(`[cf-manager] cloudflared start-fout: ${err.message} — is de binary geïnstalleerd? (CI downloadt hem naar ~/bin)`)
    // 'exit' volgt hierna en plant de herstart
  })
}

// Heartbeat: her-registreer (dekt UIcontrol-herstarts en DB-resets af)
setInterval(() => { if (currentUrl) registerUrl(currentUrl) }, HEARTBEAT_MS)

startTunnel()
