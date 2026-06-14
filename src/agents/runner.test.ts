import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPredict, runScore } from './runner.js'
import { MissingManualInputError } from './manual.js'
import type { Agent, RunnerDeps } from './types.js'
import type { Fixture, NewsItem } from '../data/types.js'
import type {
  MatchOdds,
  Prediction,
  RegularTimeResult,
} from '../domain/types.js'

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = path.join(
    process.cwd(),
    '.tmp-runner-test',
    `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await fs.mkdir(dir, { recursive: true })
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const fixture: Fixture = {
  id: 'm1',
  homeTeam: 'Netherlands',
  awayTeam: 'Japan',
  commenceTime: '2026-06-14T18:00:00Z',
  competition: 'WC',
  status: 'SCHEDULED',
}

const odds: MatchOdds = {
  matchId: 'm1',
  home: 2.0,
  draw: 3.5,
  away: 4.0,
  timestamp: '2026-06-14T12:00:00Z',
}

const cannedPred: Prediction = {
  agentId: 'llm-1',
  matchId: 'm1',
  resultProbs: { home: 0.6, draw: 0.25, away: 0.15 },
  scoreProbs: [{ score: '2-1', prob: 0.25 }],
  confidence: 0.7,
  reasoning: 'form',
  createdAt: '2026-06-14T00:00:00Z',
}

/** An agent whose predict() returns a canned Prediction (or throws). */
function stubAgent(
  id: string,
  seeOdds: boolean,
  predict: (ctx: {
    fixture: Fixture
    news: NewsItem[]
    odds?: MatchOdds
  }) => Promise<Prediction>,
): Agent {
  return {
    config: { id, name: id, type: 'llm', seeOdds },
    predict,
  }
}

function baseDeps(dataDir: string, agents: Agent[], overrides: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    agents,
    fetchUpcomingFixtures: async () => [fixture],
    fetchFinishedFixtures: async () => [fixture],
    fetchResults: async () => [],
    fetchNews: async () => [],
    fetchOdds: async () => [odds],
    dataDir,
    bankroll: 1000,
    ...overrides,
  }
}

describe('runPredict', () => {
  it('writes a prediction JSON and a bets JSON when odds exist for the match', async () => {
    await withTempDir(async (dataDir) => {
      const agent = stubAgent('llm-1', false, async () => ({ ...cannedPred }))
      const deps = baseDeps(dataDir, [agent])
      const summary = await runPredict(deps)

      expect(summary.results).toEqual([
        { agentId: 'llm-1', matchId: 'm1', ok: true },
      ])

      const predFile = path.join(
        dataDir,
        'agents',
        'llm-1',
        'predictions',
        'm1.json',
      )
      const betsFile = path.join(dataDir, 'agents', 'llm-1', 'bets', 'm1.json')
      const pred = JSON.parse(await fs.readFile(predFile, 'utf8'))
      expect(pred.agentId).toBe('llm-1')
      const bets = JSON.parse(await fs.readFile(betsFile, 'utf8'))
      expect(Array.isArray(bets)).toBe(true)
      expect(bets.length).toBeGreaterThan(0)
      expect(bets[0].matchId).toBe('m1')
    })
  })

  it('does NOT write a bets file when no odds exist for the match', async () => {
    await withTempDir(async (dataDir) => {
      const agent = stubAgent('llm-1', false, async () => ({ ...cannedPred }))
      const deps = baseDeps(dataDir, [agent], {
        fetchOdds: async () => [], // no odds for m1
      })
      await runPredict(deps)
      const predFile = path.join(dataDir, 'agents', 'llm-1', 'predictions', 'm1.json')
      const betsFile = path.join(dataDir, 'agents', 'llm-1', 'bets', 'm1.json')
      await expect(fs.readFile(predFile, 'utf8')).resolves.toBeTruthy()
      await expect(fs.readFile(betsFile, 'utf8')).rejects.toThrow() // ENOENT
    })
  })

  it('marks the agent DNF (and continues) when predict throws', async () => {
    await withTempDir(async (dataDir) => {
      const thrower = stubAgent('bad', false, async () => {
        throw new MissingManualInputError('bad', 'm1', 'nope')
      })
      const ok = stubAgent('good', false, async () => ({ ...cannedPred, agentId: 'good' }))
      const deps = baseDeps(dataDir, [thrower, ok])
      const summary = await runPredict(deps)
      const byId = Object.fromEntries(summary.results.map((r) => [r.agentId, r]))
      expect(byId.bad.ok).toBe(false)
      expect(byId.bad.error).toMatch(/nope/)
      expect(byId.good.ok).toBe(true)
    })
  })

  it('passes odds to the ctx only when agent.config.seeOdds is true', async () => {
    await withTempDir(async (dataDir) => {
      let blindSaw: MatchOdds | undefined
      let seeingSaw: MatchOdds | undefined
      const blind = stubAgent('blind', false, async (ctx) => {
        blindSaw = ctx.odds
        return { ...cannedPred, agentId: 'blind' }
      })
      const seeing = stubAgent('seeing', true, async (ctx) => {
        seeingSaw = ctx.odds
        return { ...cannedPred, agentId: 'seeing' }
      })
      const deps = baseDeps(dataDir, [blind, seeing])
      await runPredict(deps)
      expect(blindSaw).toBeUndefined()
      expect(seeingSaw).toBeDefined()
      expect(seeingSaw!.home).toBe(2.0)
    })
  })
})

describe('runScore', () => {
  it('scores predictions and settles bets, writing leaderboard.json', async () => {
    await withTempDir(async (dataDir) => {
      // Seed a prediction + bets file on disk for agent 'a'.
      const seededPred: Prediction = { ...cannedPred, agentId: 'a' }
      const predFile = path.join(dataDir, 'agents', 'a', 'predictions', 'm1.json')
      const betsFile = path.join(dataDir, 'agents', 'a', 'bets', 'm1.json')
      await fs.mkdir(path.dirname(predFile), { recursive: true })
      await fs.writeFile(predFile, JSON.stringify(seededPred), 'utf8')
      // Reuse the engine to produce bets so settlement math is realistic.
      const { computeBets } = await import('../engine/bets.js')
      const bets = computeBets(seededPred, odds)
      await fs.mkdir(path.dirname(betsFile), { recursive: true })
      await fs.writeFile(betsFile, JSON.stringify(bets), 'utf8')

      const result: RegularTimeResult = { matchId: 'm1', homeScore: 2, awayScore: 1 }
      const deps = baseDeps(dataDir, [
        stubAgent('a', false, async () => ({ ...cannedPred })),
      ], {
        fetchResults: async () => [result],
        fetchUpcomingFixtures: async () => [],
        fetchOdds: async () => [],
      })

      const summary = await runScore(deps)
      expect(summary.accuracyRows).toBe(1)
      expect(summary.settlements).toBe(bets.length)

      const lb = JSON.parse(
        await fs.readFile(path.join(dataDir, 'leaderboard.json'), 'utf8'),
      )
      // Exact scoreline 2-1 -> 3 points.
      expect(lb.accuracy[0].totalPoints).toBe(3)
      expect(lb.accuracy[0].agentId).toBe('a')
      expect(lb.betting[0].agentId).toBe('a')
      expect(lb.betting[0].settledBets).toBe(bets.length)
    })
  })

  it('skips agents with no prediction file (no throw)', async () => {
    await withTempDir(async (dataDir) => {
      const result: RegularTimeResult = { matchId: 'm1', homeScore: 1, awayScore: 0 }
      const deps = baseDeps(dataDir, [
        stubAgent('ghost', false, async () => ({ ...cannedPred })),
      ], {
        fetchResults: async () => [result],
        fetchUpcomingFixtures: async () => [],
        fetchOdds: async () => [],
      })
      const summary = await runScore(deps)
      expect(summary.accuracyRows).toBe(0)
      expect(summary.settlements).toBe(0)
      // leaderboard still written (empty aggregates).
      const lb = JSON.parse(
        await fs.readFile(path.join(dataDir, 'leaderboard.json'), 'utf8'),
      )
      expect(lb.accuracy).toEqual([])
      expect(lb.betting).toEqual([])
    })
  })
})
