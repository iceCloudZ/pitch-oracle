import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { HumanAugmentedAgent } from './human-augmented.js'
import type { Completer } from './client.js'
import type { MatchContext } from './types.js'

const unusedClient = {} as never

function ctx(): MatchContext {
  return {
    fixture: {
      id: 'm1',
      homeTeam: 'A',
      awayTeam: 'B',
      commenceTime: 't',
      competition: 'WC',
      status: 'SCHEDULED',
    },
    news: [],
    odds: undefined,
  }
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = path.join(
    process.cwd(),
    '.tmp-ha-test',
    `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await fs.mkdir(dir, { recursive: true })
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

describe('HumanAugmentedAgent', () => {
  it('includes the analyst notes in the user prompt when the notes file exists', async () => {
    await withTempDir(async (dataDir) => {
      const notesFile = path.join(dataDir, 'agents', 'me-ai', 'notes', 'm1.txt')
      await fs.mkdir(path.dirname(notesFile), { recursive: true })
      await fs.writeFile(notesFile, 'Japan missing two starters.', 'utf8')

      let captured = ''
      const completer: Completer = vi.fn(async (p) => {
        captured = p.messages.find((m: { role: string; content: string }) => m.role === 'user')!.content
        return JSON.stringify({
          agentId: 'me-ai',
          matchId: 'm1',
          resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
          scoreProbs: [],
          confidence: 0.6,
          reasoning: 'r',
          createdAt: '2026-06-14T00:00:00Z',
        })
      })
      const agent = new HumanAugmentedAgent(
        { id: 'me-ai', name: 'You + AI', type: 'human-augmented', baseURL: 'u', apiKeyEnv: 'K', model: 'm' },
        dataDir,
        unusedClient,
        completer,
      )
      await agent.predict(ctx())
      expect(captured).toContain('Analyst notes:')
      expect(captured).toContain('Japan missing two starters.')
    })
  })

  it('works without a notes file (empty notes)', async () => {
    await withTempDir(async (dataDir) => {
      let captured = ''
      const completer: Completer = vi.fn(async (p) => {
        captured = p.messages.find((m: { role: string; content: string }) => m.role === 'user')!.content
        return JSON.stringify({
          agentId: 'me-ai',
          matchId: 'm1',
          resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
          scoreProbs: [],
          confidence: 0.5,
          reasoning: 'r',
          createdAt: '2026-06-14T00:00:00Z',
        })
      })
      const agent = new HumanAugmentedAgent(
        { id: 'me-ai', name: 'You + AI', type: 'human-augmented', baseURL: 'u', apiKeyEnv: 'K', model: 'm' },
        dataDir,
        unusedClient,
        completer,
      )
      const pred = await agent.predict(ctx())
      expect(pred.matchId).toBe('m1')
      expect(captured).not.toContain('Analyst notes:')
    })
  })
})
