import db, { savePipelineState, loadPipelineState, getStageOutput } from '../db.js'
import { STAGES, initialState } from './types.js'
import type { Stage, PipelineState, StageStatus, WizardConfig } from './types.js'
import { STAGE_RUNNERS } from './stages.js'
import { emit } from './events.js'

// ─── Active run registry ─────────────────────────────────────────────────────
const activeRuns = new Map<string, {
  state: PipelineState
  cancel: () => void
  pauseSignal: { paused: boolean; resolve?: () => void }
}>()

function persist(state: PipelineState): void {
  savePipelineState(state.runId, state.currentStage, state as unknown as Record<string, unknown>, state.paused)
}

function updateStage(state: PipelineState, stage: Stage, patch: Partial<typeof state.stages[Stage]>): void {
  state.stages[stage] = { ...state.stages[stage], ...patch }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startRun(runId: string, niche: string, config?: WizardConfig): Promise<PipelineState> {
  if (activeRuns.has(runId)) {
    return activeRuns.get(runId)!.state
  }
  // Bootstrap runs row
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO runs (run_id, niche, status, data, started_at, updated_at)
    VALUES (?, ?, 'running', '{}', ?, ?)
  `).run(runId, niche, now, now)

  const state = initialState(runId, niche, config)
  persist(state)
  emit({ type: 'pipeline:started', runId, fullState: state })
  startEngine(state)
  return state
}

export async function resumeRun(runId: string): Promise<PipelineState | null> {
  if (activeRuns.has(runId)) return activeRuns.get(runId)!.state

  const persisted = loadPipelineState(runId)
  if (!persisted || !persisted.stateJson) return null

  const state = persisted.stateJson as unknown as PipelineState
  state.paused = false
  persist(state)
  emit({ type: 'pipeline:resumed', runId, fullState: state })
  startEngine(state)
  return state
}

export function pauseRun(runId: string): boolean {
  const active = activeRuns.get(runId)
  if (!active) return false
  active.state.paused = true
  active.pauseSignal.paused = true
  persist(active.state)
  emit({ type: 'pipeline:paused', runId, fullState: active.state })
  return true
}

export function stopRun(runId: string): boolean {
  const active = activeRuns.get(runId)
  if (!active) return false
  active.state.cancelled = true
  active.cancel()
  db.prepare(`UPDATE runs SET status='cancelled', completed_at=?, updated_at=? WHERE run_id=?`)
    .run(new Date().toISOString(), new Date().toISOString(), runId)
  emit({ type: 'pipeline:cancelled', runId, fullState: active.state })
  activeRuns.delete(runId)
  return true
}

export function getRunState(runId: string): PipelineState | null {
  const active = activeRuns.get(runId)
  if (active) return active.state
  const persisted = loadPipelineState(runId)
  if (!persisted?.stateJson) return null
  return persisted.stateJson as unknown as PipelineState
}

// ─── Engine ──────────────────────────────────────────────────────────────────

function startEngine(state: PipelineState): void {
  const cancelToken = { cancelled: false }
  const pauseSignal = { paused: state.paused }

  const cancel = () => { cancelToken.cancelled = true }
  activeRuns.set(state.runId, { state, cancel, pauseSignal })

  ;(async () => {
    try {
      await drive(state, cancelToken, pauseSignal)
    } catch (err) {
      console.error(`[engine] Run ${state.runId} crashed:`, err)
      state.finishedAt = new Date().toISOString()
      db.prepare(`UPDATE runs SET status='failed', completed_at=?, updated_at=? WHERE run_id=?`)
        .run(state.finishedAt, state.finishedAt, state.runId)
      emit({ type: 'pipeline:failed', runId: state.runId, error: err instanceof Error ? err.message : String(err), fullState: state })
    } finally {
      activeRuns.delete(state.runId)
    }
  })()
}

async function drive(
  state: PipelineState,
  cancelToken: { cancelled: boolean },
  pauseSignal: { paused: boolean },
): Promise<void> {
  // Resume from first non-approved stage
  const startIdx = STAGES.findIndex(s =>
    state.stages[s].status !== 'approved' && state.stages[s].status !== 'skipped',
  )
  const fromIdx = startIdx === -1 ? STAGES.length : startIdx

  for (let i = fromIdx; i < STAGES.length; i++) {
    if (cancelToken.cancelled) return
    if (pauseSignal.paused) {
      state.paused = true
      persist(state)
      return
    }
    const stage = STAGES[i]
    state.currentStage = stage
    await runStage(state, stage)
    persist(state)

    const status = state.stages[stage].status
    if (status === 'rejected' || status === 'failed') {
      state.finishedAt = new Date().toISOString()
      db.prepare(`UPDATE runs SET status='failed', completed_at=?, updated_at=? WHERE run_id=?`)
        .run(state.finishedAt, state.finishedAt, state.runId)
      emit({ type: 'pipeline:failed', runId: state.runId, stage, error: state.stages[stage].error, fullState: state })
      return
    }
    if (status === 'uncertain') {
      // Pause: wait for human approval (in v1 we auto-pause; resume is manual)
      state.paused = true
      persist(state)
      emit({ type: 'stage:uncertain', runId: state.runId, stage, state: state.stages[stage], fullState: state })
      return
    }
  }

  state.finishedAt = new Date().toISOString()
  db.prepare(`UPDATE runs SET status='completed', completed_at=?, updated_at=? WHERE run_id=?`)
    .run(state.finishedAt, state.finishedAt, state.runId)
  emit({ type: 'pipeline:done', runId: state.runId, fullState: state, storeUrl: state.storeUrl })
}

async function runStage(state: PipelineState, stage: Stage): Promise<void> {
  updateStage(state, stage, { status: 'running', startedAt: new Date().toISOString() })
  emit({ type: 'stage:start', runId: state.runId, stage, state: state.stages[stage], fullState: state })

  const runner = STAGE_RUNNERS[stage]
  const previous = collectPreviousOutputs(state)

  const onLog = (msg: string) => {
    emit({ type: 'stage:progress', runId: state.runId, stage, data: { message: msg } })
  }

  try {
    const result = await runner({ runId: state.runId, niche: state.niche, previous, onLog, config: state.config })
    const finishedAt = new Date().toISOString()
    const startedAt = state.stages[stage].startedAt ?? finishedAt
    const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()

    if (!result.ok) {
      updateStage(state, stage, {
        status: 'failed',
        error: result.error,
        finishedAt,
        durationMs,
        tokensIn: result.tokensIn ?? 0,
        tokensOut: result.tokensOut ?? 0,
        costUsd: result.costUsd ?? 0,
      })
      emit({ type: 'stage:failed', runId: state.runId, stage, state: state.stages[stage], error: result.error, fullState: state })
      return
    }

    let nextStatus: StageStatus = 'approved'
    if (result.verdict) {
      if (result.verdict === 'APPROVED')      nextStatus = 'approved'
      else if (result.verdict === 'REJECTED') nextStatus = 'rejected'
      else if (result.verdict === 'UNCERTAIN') nextStatus = 'uncertain'
    }

    updateStage(state, stage, {
      status: nextStatus,
      output: result.output,
      finishedAt,
      durationMs,
      tokensIn: result.tokensIn ?? 0,
      tokensOut: result.tokensOut ?? 0,
      costUsd: result.costUsd ?? 0,
      verdict: result.verdict,
      reason: result.reason,
    })

    if (result.meta?.storeId)  state.storeId  = result.meta.storeId as string
    if (result.meta?.storeUrl) state.storeUrl = result.meta.storeUrl as string

    if (nextStatus === 'rejected') {
      emit({ type: 'stage:rejected', runId: state.runId, stage, state: state.stages[stage], fullState: state })
    } else {
      emit({ type: 'stage:complete', runId: state.runId, stage, state: state.stages[stage], fullState: state })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateStage(state, stage, {
      status: 'failed',
      error: message,
      finishedAt: new Date().toISOString(),
    })
    emit({ type: 'stage:failed', runId: state.runId, stage, state: state.stages[stage], error: message, fullState: state })
  }
}

function collectPreviousOutputs(state: PipelineState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of STAGES) {
    const key = s.replace(/-/g, '_')
    const persisted = getStageOutput(state.runId, s)
    if (persisted) out[key] = persisted
    else if (state.stages[s].output) out[key] = state.stages[s].output
  }
  return out
}

// ─── Resume runs after server restart ────────────────────────────────────────
export function resumePersistedRuns(): void {
  const rows = db.prepare(`
    SELECT run_id FROM runs WHERE status = 'running' AND paused = 0
  `).all() as { run_id: string }[]
  for (const r of rows) {
    console.log(`[engine] Auto-resuming run ${r.run_id}`)
    resumeRun(r.run_id).catch((err) => {
      console.error(`[engine] Resume ${r.run_id} failed:`, err)
    })
  }
}
