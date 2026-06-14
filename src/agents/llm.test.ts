import { describe, expect, it, vi } from 'vitest'
import { LlmAgent } from './llm.js'
import type { Completer } from './client.js'
import type { MatchContext } from './types.js'
import type { Prediction } from '../domain/types.js'

const unusedClient = {} as never

function ctx(): MatchContext {
  return {
    fixture: {
      id: 'm1',
      homeTeam: 'Netherlands',
      awayTeam: 'Japan',
      commenceTime: '2026-06-14T18:00:00Z',
      competition: 'WC',
      status: 'SCHEDULED',
    },
    news: [],
    odds: undefined,
  }
}

describe('LlmAgent', () => {
  it('returns the completer-provided prediction stamped with agent/match id', async () => {
    const canned: Prediction = {
      agentId: 'a',
      matchId: 'm1',
      resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
      scoreProbs: [{ score: '2-1', prob: 0.3 }],
      confidence: 0.7,
      reasoning: 'r',
      createdAt: '2026-06-14T00:00:00Z',
    }
    const completer: Completer = vi.fn(async () => JSON.stringify(canned))
    const agent = new LlmAgent(
      { id: 'a', name: 'A', type: 'llm', baseURL: 'u', apiKeyEnv: 'K', model: 'm', seeOdds: false },
      unusedClient,
      completer,
    )
    const pred = await agent.predict(ctx())
    expect(pred.agentId).toBe('a')
    expect(pred.matchId).toBe('m1')
    expect(pred.resultProbs.home).toBe(0.5)
  })

  it('does NOT include odds in the user prompt when seeOdds=false', async () => {
    let captured = ''
    const completer: Completer = vi.fn(async (p) => {
      captured = p.messages.find((m: { role: string; content: string }) => m.role === 'user')!.content
      return JSON.stringify({
        agentId: 'a',
        matchId: 'm1',
        resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
        scoreProbs: [],
        confidence: 0.5,
        reasoning: 'r',
        createdAt: '2026-06-14T00:00:00Z',
      })
    })
    const agent = new LlmAgent(
      { id: 'a', name: 'A', type: 'llm', baseURL: 'u', apiKeyEnv: 'K', model: 'm', seeOdds: false },
      unusedClient,
      completer,
    )
    await agent.predict(ctx())
    expect(/decimal odds/i.test(captured)).toBe(false)
  })

  it('DOES include odds in the user prompt when seeOdds=true', async () => {
    let captured = ''
    const completer: Completer = vi.fn(async (p) => {
      captured = p.messages.find((m: { role: string; content: string }) => m.role === 'user')!.content
      return JSON.stringify({
        agentId: 'a',
        matchId: 'm1',
        resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
        scoreProbs: [],
        confidence: 0.5,
        reasoning: 'r',
        createdAt: '2026-06-14T00:00:00Z',
      })
    })
    const agent = new LlmAgent(
      { id: 'a', name: 'A', type: 'llm', baseURL: 'u', apiKeyEnv: 'K', model: 'm', seeOdds: true },
      unusedClient,
      completer,
    )
    const ctxWithOdds: MatchContext = {
      ...ctx(),
      odds: { matchId: 'm1', home: 2.0, draw: 3.5, away: 4.0, timestamp: 't' },
    }
    await agent.predict(ctxWithOdds)
    expect(/decimal odds/i.test(captured)).toBe(true)
    expect(captured).toContain('market consensus')
  })
})
