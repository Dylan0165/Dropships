import { runAgent } from './agent.js'
import { z } from 'zod'
import type { ReviewerOutput, AgentResult } from './types.js'

export const ReviewerOutputSchema = z.object({
  verdict: z.enum(['APPROVED', 'REJECTED', 'UNCERTAIN']),
  reason: z.string().min(1),
  score: z.number().min(0).max(100).optional(),
  suggestions: z.array(z.string()).optional(),
})

export interface ReviewerConfig {
  runId: string
  stage: string
  agentName: string
  skillName: string
  input: Record<string, unknown>
  model?: 'deepseek-chat' | 'deepseek-reasoner'
  onLog?: (level: 'info' | 'warn' | 'error', msg: string) => void
}

export async function runReviewer(
  cfg: ReviewerConfig,
): Promise<AgentResult & { verdict?: ReviewerOutput }> {
  const result = await runAgent({
    runId: cfg.runId,
    stage: cfg.stage,
    agentName: cfg.agentName,
    skillName: cfg.skillName,
    model: cfg.model ?? 'deepseek-reasoner',
    input: cfg.input,
    outputSchema: ReviewerOutputSchema,
    timeoutMs: 180_000,
    retries: 3,
    onLog: cfg.onLog,
  })

  if (result.ok && result.parsed) {
    return { ...result, verdict: result.parsed as ReviewerOutput }
  }
  return result
}
