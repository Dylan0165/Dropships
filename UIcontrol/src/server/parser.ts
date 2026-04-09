import { createInterface } from 'readline'
import type { Readable } from 'stream'
import type { AgentId, WsEvent, StoreInfo } from '../types/index.js'
import { ALL_AGENT_IDS } from '../constants/pipeline.js'
import * as store from './store.js'

// Map coordinator task-ids to valid AgentIds
const TASK_ID_TO_AGENT: Record<string, AgentId> = {}
for (const id of ALL_AGENT_IDS) {
  TASK_ID_TO_AGENT[id] = id
  // Also map without -agent/-reviewer suffix for flexibility
  TASK_ID_TO_AGENT[id.replace(/-agent$/, '').replace(/-reviewer$/, '')] = id
}

function resolveAgentId(taskId: string | undefined, fallback: AgentId): AgentId {
  if (!taskId) return fallback
  const resolved = TASK_ID_TO_AGENT[taskId]
  if (resolved) return resolved
  // Try case-insensitive match
  const lower = taskId.toLowerCase()
  for (const [key, val] of Object.entries(TASK_ID_TO_AGENT)) {
    if (key.toLowerCase() === lower) return val
  }
  return fallback
}

export function parseStream(
  stream: Readable,
  runId: string,
  broadcast: (event: WsEvent) => void,
): void {
  let activeAgent: AgentId = 'trend-agent'
  let xmlBuffer: string[] | null = null

  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  rl.on('line', (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    // ── 1. PIPELINE_EVENT: JSON line ──
    if (trimmed.startsWith('PIPELINE_EVENT:')) {
      try {
        const json = trimmed.slice('PIPELINE_EVENT:'.length)
        const event = JSON.parse(json) as WsEvent
        event.runId = event.runId || runId

        handleEvent(event, runId, broadcast)
        if (event.agentId) activeAgent = event.agentId
      } catch {
        // Malformed JSON — treat as log
        logLine(runId, activeAgent, trimmed, broadcast)
      }
      return
    }

    // ── 2. <task-notification> XML block ──
    if (trimmed.includes('<task-notification>')) {
      xmlBuffer = [trimmed]
      return
    }
    if (xmlBuffer !== null) {
      xmlBuffer.push(trimmed)
      if (trimmed.includes('</task-notification>')) {
        const xml = xmlBuffer.join('\n')
        xmlBuffer = null
        parseTaskNotification(xml, runId, activeAgent, broadcast)
      }
      return
    }

    // ── 3. Any other output ──
    logLine(runId, activeAgent, trimmed, broadcast)
  })
}

function handleEvent(event: WsEvent, runId: string, broadcast: (e: WsEvent) => void): void {
  const agentId = event.agentId as AgentId | undefined
  const now = new Date().toISOString()
  const p = event.payload ?? {}

  switch (event.type) {
    case 'agent_started':
      if (agentId) {
        store.updateAgent(runId, agentId, { status: 'running', startedAt: now, attempt: ((store.getRun(runId)?.agents[agentId]?.attempt ?? 0) + 1) })
      }
      break

    case 'agent_completed':
      if (agentId) {
        store.updateAgent(runId, agentId, {
          status: 'completed',
          completedAt: now,
          outputJson: (p.outputJson as Record<string, unknown>) ?? null,
          tokenCount: (p.tokenCount as number) ?? 0,
          costEur: (p.costEur as number) ?? 0,
          durationMs: (p.durationMs as number) ?? null,
        })
      }
      break

    case 'agent_failed':
      if (agentId) {
        store.updateAgent(runId, agentId, { status: 'failed', completedAt: now })
      }
      break

    case 'agent_escalation':
      if (agentId) {
        store.setEscalation(runId, agentId, {
          reason: (p.reason as string) ?? 'No reason provided',
          severity: (p.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
          createdAt: now,
          resolvedAt: null,
          decision: null,
          opmerking: null,
        })
      }
      break

    case 'store_live':
      store.addStore(runId, p as unknown as StoreInfo)
      break

    case 'pipeline_completed':
      store.completeRun(runId, 'completed')
      break

    case 'pipeline_failed':
      store.completeRun(runId, 'failed')
      break
  }

  broadcast(event)
}

function logLine(
  runId: string,
  agentId: AgentId,
  message: string,
  broadcast: (e: WsEvent) => void,
): void {
  const now = new Date().toISOString()
  store.addLog(runId, agentId, { timestamp: now, level: 'info', message })
  broadcast({
    type: 'agent_log',
    runId,
    agentId,
    payload: { level: 'info', message },
    timestamp: now,
  })
}

function parseTaskNotification(
  xml: string,
  runId: string,
  fallbackAgent: AgentId,
  broadcast: (e: WsEvent) => void,
): void {
  const tag = (name: string): string => {
    const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
    return m ? m[1].trim() : ''
  }

  const taskId = tag('task-id')
  const status = tag('status') as 'completed' | 'failed' | 'killed'
  const summary = tag('summary')
  const result = tag('result')
  const totalTokens = parseInt(tag('total_tokens'), 10) || 0
  const durationMs = parseInt(tag('duration_ms'), 10) || 0

  const agentId = resolveAgentId(taskId || undefined, fallbackAgent)
  const now = new Date().toISOString()

  let outputJson: Record<string, unknown> | null = null
  if (result) {
    try {
      outputJson = JSON.parse(result)
    } catch {
      // Not valid JSON — keep as null
    }
  }

  if (summary) {
    store.addLog(runId, agentId, { timestamp: now, level: 'info', message: summary })
  }

  const agentStatus = status === 'completed' ? 'completed' : 'failed'
  store.updateAgent(runId, agentId, {
    status: agentStatus,
    completedAt: now,
    outputJson,
    tokenCount: totalTokens,
    durationMs,
  })

  const eventType = agentStatus === 'completed' ? 'agent_completed' : 'agent_failed'
  broadcast({
    type: eventType,
    runId,
    agentId,
    payload: { outputJson, tokenCount: totalTokens, durationMs, summary },
    timestamp: now,
  })
}
