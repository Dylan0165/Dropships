/**
 * WhatsApp Cloud API notificaties
 * Stuurt een bericht als een agent goedkeuring nodig heeft.
 *
 * Vereist in .env:
 *   WHATSAPP_TOKEN         — permanent access token van Meta
 *   WHATSAPP_PHONE_ID      — Phone Number ID van je WhatsApp Business nummer
 *   WHATSAPP_TO            — jouw WhatsApp nummer (bijv. 31612345678)
 *   APPROVAL_APP_URL       — publieke URL van de ApprovalApp (bijv. https://approval.jouwdomein.com)
 */

const TOKEN    = process.env.WHATSAPP_TOKEN    ?? ''
const PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? ''
const TO       = process.env.WHATSAPP_TO       ?? ''
const APP_URL  = process.env.APPROVAL_APP_URL  ?? 'http://localhost:5174'

const SEVERITY_EMOJI: Record<string, string> = {
  LOW:      '🟡',
  MEDIUM:   '🟠',
  HIGH:     '🔴',
  CRITICAL: '🚨',
}

export async function notifyApprovalNeeded(params: {
  agentId: string
  niche: string
  severity: string
  reason: string
  runId: string
}): Promise<void> {
  if (!TOKEN || !PHONE_ID || !TO) {
    console.log('[WhatsApp] Niet geconfigureerd — sla notificatie over')
    return
  }

  const emoji = SEVERITY_EMOJI[params.severity] ?? '⚠️'
  const shortRun = params.runId.slice(0, 8)
  const text = [
    `${emoji} *Goedkeuring nodig*`,
    ``,
    `*Agent:* ${params.agentId}`,
    `*Niche:* ${params.niche}`,
    `*Prioriteit:* ${params.severity}`,
    ``,
    `${params.reason.slice(0, 200)}`,
    ``,
    `👉 ${APP_URL}`,
    `Run: \`${shortRun}\``,
  ].join('\n')

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: TO,
          type: 'text',
          text: { body: text },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('[WhatsApp] Fout:', err)
    } else {
      console.log(`[WhatsApp] Notificatie verstuurd voor ${params.agentId} / ${params.niche}`)
    }
  } catch (e) {
    console.error('[WhatsApp] Kon bericht niet versturen:', e)
  }
}
