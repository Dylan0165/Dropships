import { describe, it, expect, beforeEach } from 'vitest'
import { Readable } from 'stream'

// We need to mock the db module before importing parser/store
import { vi } from 'vitest'
vi.mock('./db.js', () => {
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(() => []),
    })),
  }
  return { default: mockDb }
})

// Now we can import parser and related modules
const { parseStream } = await import('./parser.js')

function createMockStream(lines: string[]): Readable {
  const stream = new Readable({
    read() {
      for (const line of lines) {
        this.push(line + '\n')
      }
      this.push(null)
    },
  })
  return stream
}

describe('parseStream', () => {
  it('should parse PIPELINE_EVENT JSON lines', async () => {
    const events: Array<Record<string, unknown>> = []
    const broadcast = (event: Record<string, unknown>) => events.push(event)

    const line = JSON.stringify({
      type: 'agent_started',
      runId: 'test-run',
      agentId: 'trend-agent',
      payload: {},
      timestamp: '2024-01-01T00:00:00Z',
    })

    const stream = createMockStream([`PIPELINE_EVENT:${line}`])
    parseStream(stream, 'test-run', broadcast as never)

    // Wait for stream to finish
    await new Promise((resolve) => stream.on('end', resolve))
    // Small delay for readline processing
    await new Promise((r) => setTimeout(r, 50))

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe('agent_started')
    expect(events[0].agentId).toBe('trend-agent')
  })

  it('should parse plain log lines', async () => {
    const events: Array<Record<string, unknown>> = []
    const broadcast = (event: Record<string, unknown>) => events.push(event)

    const stream = createMockStream(['Some log output from the coordinator'])
    parseStream(stream, 'test-run', broadcast as never)

    await new Promise((resolve) => stream.on('end', resolve))
    await new Promise((r) => setTimeout(r, 50))

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe('agent_log')
  })

  it('should handle malformed PIPELINE_EVENT gracefully', async () => {
    const events: Array<Record<string, unknown>> = []
    const broadcast = (event: Record<string, unknown>) => events.push(event)

    const stream = createMockStream(['PIPELINE_EVENT:{bad json'])
    parseStream(stream, 'test-run', broadcast as never)

    await new Promise((resolve) => stream.on('end', resolve))
    await new Promise((r) => setTimeout(r, 50))

    // Should be treated as a log line
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe('agent_log')
  })
})
