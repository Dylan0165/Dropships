// ═══════ Deploy dispatcher ═══════
// Kiest tussen LOKALE deploy (default, één-server VPS — deploy-local.ts) en de
// SSH/SCP-deploy naar een aparte store-server (deploy-ssh.ts, de oude
// schoolomgeving met twee hosts). Callers importeren ALTIJD hieruit; de
// implementatie wisselt op basis van config.
//
// KEUZE (migratie juli 2026): op de productie-VPS draait alles op één server →
// lokale bestandsoperaties zijn de standaard. SSH-naar-een-tweede-host blijft
// beschikbaar voor het geval de hosting later weer wordt afgesplitst, maar
// SSH-naar-localhost is BEWUST géén optie: dat zou de bug-gevoelige SSH-laag
// terugbrengen zonder enige winst.
//
// Regels voor "remote" (SSH):
//   - DEPLOY_MODE=ssh  → altijd SSH (expliciet), OF
//   - STORE_SERVER_HOST gezet naar een NIET-lokaal, NIET-privé host
//     terwijl DEPLOY_MODE niet 'local' is.
// Alles anders → lokaal.

import type { DeployResult, NginxVhostInfo } from './deploy-ssh.js'
import * as local from './deploy-local.js'
import * as ssh from './deploy-ssh.js'

export type { DeployResult, NginxVhostInfo } from './deploy-ssh.js'

function isLocalHostname(h: string): boolean {
  const host = h.trim().toLowerCase()
  return host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
}

/** true → SSH-deploy naar een aparte store-server; false → lokale deploy. */
export function isRemoteDeploy(): boolean {
  const mode = (process.env.DEPLOY_MODE ?? '').trim().toLowerCase()
  if (mode === 'ssh' || mode === 'remote') return true
  if (mode === 'local') return false
  // Auto: alleen remote als er een echt, niet-lokaal host-adres staat
  return !isLocalHostname(process.env.STORE_SERVER_HOST ?? '')
}

function impl() {
  return isRemoteDeploy() ? ssh : local
}

/**
 * Drie deploy-doelen:
 *   - 'ssh'     → aparte store-server via SSH (legacy twee-server / expliciet)
 *   - 'local'   → échte deploy op deze VPS (next build → fs → nginx reload)
 *   - 'preview' → geen echte deploy; Express serveert een statische preview
 *                 (dev-machine zonder nginx). Dit is de veilige default.
 * Zet `DEPLOY_MODE=local` op de productie-VPS.
 */
export function deployTargetKind(): 'preview' | 'local' | 'ssh' {
  if (isRemoteDeploy()) return 'ssh'
  if ((process.env.DEPLOY_MODE ?? '').trim().toLowerCase() === 'local') return 'local'
  return 'preview'
}

// ── Doorgeef-functies (identieke signatures in beide implementaties) ──────────

export function atomicDeploy(subdomain: string, builtOutDir: string, port: number, onLog?: (m: string) => void): Promise<DeployResult> {
  return impl().atomicDeploy(subdomain, builtOutDir, port, onLog)
}

export function rollback(subdomain: string, onLog?: (m: string) => void): Promise<{ ok: boolean; rolledBackTo?: string }> {
  return impl().rollback(subdomain, onLog)
}

export function removeDeployedStore(subdomain: string, onLog?: (m: string) => void): Promise<{ ok: boolean; error?: string }> {
  return impl().removeDeployedStore(subdomain, onLog)
}

export function scanDeployedStores(): Promise<Array<{ subdomain: string; port: number }>> {
  return impl().scanDeployedStores()
}

export function portConflictOwner(selfSubdomain: string, port: number): Promise<string | null> {
  return impl().portConflictOwner(selfSubdomain, port)
}

export function listVhostPorts(): Promise<NginxVhostInfo[]> {
  return impl().listVhostPorts()
}

export function getHighestNginxPort(): Promise<number> {
  return impl().getHighestNginxPort()
}

export function auditNginx(activeSubdomains: Set<string>): ReturnType<typeof local.auditNginx> {
  return impl().auditNginx(activeSubdomains)
}
