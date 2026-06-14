import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ManualAgent, MissingManualInputError } from './manual.js'
import type { MatchContext } from './types.js'

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
    '.tmp-manual-test',
    `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await fs.mkdir(dir, { recursive: true })
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

describe('ManualAgent', () => {
  it('reads and validates a hand-written prediction, stamping ids', async () => {
    await withTempDir(async (dataDir) => {
      const file = path.join(dataDir, 'agents', 'me', 'input', 'm1.json')
      const body = {
        // Author may omit agentId/matchId/createdAt.
        resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
        scoreProbs: [{ score: '2-1', prob: 0.3 }],
        confidence: 0.6,
        reasoning: 'gut',
      }
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(body), 'utf8')

      const agent = new ManualAgent({ id: 'me', name: 'You', type: 'manual' }, dataDir)
      const pred = await agent.predict(ctx())
      expect(pred.agentId).toBe('me')
      expect(pred.matchId).toBe('m1')
      expect(pred.createdAt).toBeTruthy()
      expect(pred.resultProbs.home).toBe(0.5)
    })
  })

  it('throws MissingManualInputError when the file is missing', async () => {
    await withTempDir(async (dataDir) => {
      const agent = new ManualAgent({ id: 'me', name: 'You', type: 'manual' }, dataDir)
      await expect(agent.predict(ctx())).rejects.toBeInstanceOf(MissingManualInputError)
    })
  })
})
