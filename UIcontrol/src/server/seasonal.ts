/**
 * Seasonal automation.
 *
 * Detects approaching seasonal windows and adjusts store copy/ads:
 *   Black Friday · Kerst · Valentijn · Zomer · Pasen · Moederdag
 *
 * Call runSeasonalCheck() daily at 07:00.
 */
import db from './db.js'
import { notifyApprovalNeeded } from './whatsapp.js'

// ── Season definitions ────────────────────────────────────────────────────────

interface Season {
  id: string
  name: string
  emoji: string
  // Month is 1-12, day is 1-31
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  warningDays: number   // start preparing N days before
  copyHints: {
    announcementText: string
    ctaText: string
    discountNote: string
    colorOverride?: string
  }
}

const SEASONS: Season[] = [
  {
    id: 'black_friday',
    name: 'Black Friday',
    emoji: '🛍️',
    startMonth: 11, startDay: 22,
    endMonth: 11,   endDay: 30,
    warningDays: 14,
    copyHints: {
      announcementText: '🛍️ BLACK FRIDAY — Tot 40% korting! Beperkte voorraad.',
      ctaText: 'Claim jouw korting',
      discountNote: 'Grootste sale van het jaar — Eindigt zondag',
      colorOverride: '#1a1a1a',
    },
  },
  {
    id: 'kerst',
    name: 'Kerst',
    emoji: '🎄',
    startMonth: 12, startDay: 10,
    endMonth: 12,   endDay: 26,
    warningDays: 21,
    copyHints: {
      announcementText: '🎄 Gratis verzending op alle kerstcadeaus!',
      ctaText: 'Shop kerstcadeaus',
      discountNote: 'Bestel voor 20 dec voor garantie op tijdige levering',
    },
  },
  {
    id: 'valentijn',
    name: 'Valentijnsdag',
    emoji: '❤️',
    startMonth: 2, startDay: 1,
    endMonth: 2,   endDay: 14,
    warningDays: 14,
    copyHints: {
      announcementText: '❤️ Verras jouw geliefde — Gratis cadeauverpakking',
      ctaText: 'Shop cadeau ideeën',
      discountNote: 'Op tijd bezorgd voor 14 februari',
      colorOverride: '#e11d48',
    },
  },
  {
    id: 'pasen',
    name: 'Pasen',
    emoji: '🐣',
    startMonth: 3, startDay: 20,
    endMonth: 4,   endDay: 15,
    warningDays: 10,
    copyHints: {
      announcementText: '🐣 Paasdeal — 2 voor de prijs van 1!',
      ctaText: 'Bekijk paasdeal',
      discountNote: 'Tijdelijk: bundel & bespaar',
    },
  },
  {
    id: 'moederdag',
    name: 'Moederdag',
    emoji: '💐',
    startMonth: 5, startDay: 1,
    endMonth: 5,   endDay: 12,
    warningDays: 14,
    copyHints: {
      announcementText: '💐 Perfecte moederdagcadeaus — Gratis levering',
      ctaText: 'Shop moederdagtips',
      discountNote: 'Maak mama blij',
    },
  },
  {
    id: 'zomer',
    name: 'Zomer Sale',
    emoji: '☀️',
    startMonth: 6, startDay: 20,
    endMonth: 8,   endDay: 31,
    warningDays: 10,
    copyHints: {
      announcementText: '☀️ Zomersale — Extra korting op summerspecials',
      ctaText: 'Shop zomersale',
      discountNote: 'Tot 35% korting — zolang de voorraad strekt',
      colorOverride: '#f59e0b',
    },
  },
]

// ── Season detection ──────────────────────────────────────────────────────────

export interface ActiveSeason {
  season: Season
  phase: 'upcoming' | 'active'
  daysUntilStart: number
  daysUntilEnd: number
}

export function getActiveSeasons(date: Date = new Date()): ActiveSeason[] {
  const month = date.getMonth() + 1  // 1-12
  const day   = date.getDate()
  const active: ActiveSeason[] = []

  for (const season of SEASONS) {
    // Check if within active window
    const startOrd = season.startMonth * 100 + season.startDay
    const endOrd   = season.endMonth   * 100 + season.endDay
    const nowOrd   = month * 100 + day

    if (nowOrd >= startOrd && nowOrd <= endOrd) {
      const endDate = new Date(date.getFullYear(), season.endMonth - 1, season.endDay)
      const daysUntilEnd = Math.ceil((endDate.getTime() - date.getTime()) / 86_400_000)
      active.push({ season, phase: 'active', daysUntilStart: 0, daysUntilEnd })
      continue
    }

    // Check if upcoming within warning window
    let startDate = new Date(date.getFullYear(), season.startMonth - 1, season.startDay)
    if (startDate < date) {
      startDate = new Date(date.getFullYear() + 1, season.startMonth - 1, season.startDay)
    }
    const daysUntilStart = Math.ceil((startDate.getTime() - date.getTime()) / 86_400_000)
    if (daysUntilStart <= season.warningDays) {
      const endDate = new Date(startDate.getFullYear(), season.endMonth - 1, season.endDay)
      const daysUntilEnd = Math.ceil((endDate.getTime() - date.getTime()) / 86_400_000)
      active.push({ season, phase: 'upcoming', daysUntilStart, daysUntilEnd })
    }
  }

  return active
}

// ── Store copy injection ───────────────────────────────────────────────────────

export function getSeasonalAnnouncementText(storeNiche?: string): string | null {
  const active = getActiveSeasons()
  if (active.length === 0) return null

  // Prefer "active" over "upcoming"
  const sorted = [...active].sort((a, b) => {
    if (a.phase === 'active' && b.phase !== 'active') return -1
    if (b.phase === 'active' && a.phase !== 'active') return 1
    return a.daysUntilStart - b.daysUntilStart
  })

  const { season, phase } = sorted[0]
  if (phase === 'upcoming') {
    return `${season.emoji} Over ${sorted[0].daysUntilStart} dagen: ${season.name} deals!`
  }
  return season.copyHints.announcementText
}

export function getSeasonalColorOverride(): string | null {
  const active = getActiveSeasons().filter(s => s.phase === 'active')
  for (const { season } of active) {
    if (season.copyHints.colorOverride) return season.copyHints.colorOverride
  }
  return null
}

// ── Main check cycle ──────────────────────────────────────────────────────────

export async function runSeasonalCheck(): Promise<void> {
  const active = getActiveSeasons()
  if (active.length === 0) {
    console.log('[seasonal] Geen actieve seizoenen')
    return
  }

  for (const { season, phase, daysUntilStart } of active) {
    console.log(`[seasonal] ${season.name} — fase: ${phase}, start over: ${daysUntilStart}d`)

    // Log seasonal event to lifecycle_events for all active stores
    const stores = db.prepare(
      `SELECT store_id, niche FROM stores WHERE status NOT IN ('paused','killed','failed')`,
    ).all() as { store_id: string; niche: string }[]

    for (const store of stores) {
      try {
        db.prepare(
          `INSERT OR IGNORE INTO lifecycle_events (store_id, event_type, payload, created_at)
           VALUES (?, ?, ?, ?)`,
        ).run(
          store.store_id,
          `seasonal_${phase}_${season.id}`,
          JSON.stringify({
            season: season.name,
            phase,
            daysUntilStart,
            announcementText: season.copyHints.announcementText,
            ctaText: season.copyHints.ctaText,
            colorOverride: season.copyHints.colorOverride ?? null,
          }),
          new Date().toISOString(),
        )
      } catch { /* lifecycle_events may not exist yet */ }
    }

    // Send WhatsApp prep alert for upcoming seasons
    if (phase === 'upcoming' && daysUntilStart <= 7) {
      await notifyApprovalNeeded({
        agentId: 'seasonal-manager',
        niche: 'seizoen',
        severity: 'LOW',
        reason: `${season.emoji} ${season.name} begint over ${daysUntilStart} dagen. Bereid je campagnes voor: "${season.copyHints.announcementText}"`,
        runId: `seasonal-${season.id}-${Date.now()}`,
      }).catch(console.error)
    }
  }
}
