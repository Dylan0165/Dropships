import { EventEmitter } from 'events'
import type { Stage, StageState, PipelineState } from './types.js'

export type PipelineEventType =
  | 'pipeline:started'
  | 'pipeline:paused'
  | 'pipeline:resumed'
  | 'pipeline:done'
  | 'pipeline:failed'
  | 'pipeline:cancelled'
  | 'stage:start'
  | 'stage:progress'
  | 'stage:complete'
  | 'stage:failed'
  | 'stage:rejected'
  | 'stage:uncertain'

export interface PipelineEvent {
  type: PipelineEventType
  runId: string
  stage?: Stage
  state?: StageState
  data?: Record<string, unknown>
  error?: string
  fullState?: PipelineState
  timestamp: string
  storeUrl?: string
}

class PipelineEmitter extends EventEmitter {
  emitEvent(event: PipelineEvent): void {
    this.emit('event', event)
    // also fan out per runId so consumers can subscribe to a specific run
    this.emit(`run:${event.runId}`, event)
  }
}

export const pipelineEvents = new PipelineEmitter()
pipelineEvents.setMaxListeners(100)

export function emit(event: Omit<PipelineEvent, 'timestamp'>): void {
  pipelineEvents.emitEvent({ ...event, timestamp: new Date().toISOString() })
}
