import { describe, expect, it } from 'vitest'
import type { Bet, MatchOdds, MatchOutcome, Prediction, RegularTimeResult } from './types.js'

describe('domain types are usable', () => {
  it('constructs a Prediction', () => {
    const p: Prediction = {
      agentId: 'claude',
      matchId: 'm1',
      resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
      scoreProbs: [{ score: '2-1', prob: 0.18 }],
      confidence: 0.6,
      reasoning: 'home advantage',
      createdAt: '2026-06-14T00:00:00Z',
    }
    expect(p.resultProbs.home).toBe(0.5)
  })

  it('constructs a 1x2 Bet', () => {
    const b: Bet = {
      matchId: 'm1',
      agentId: 'claude',
      market: 'home' satisfies MatchOutcome,
      modelProb: 0.5,
      impliedProb: 0.36,
      decimalOdds: 2.78,
      oddsTimestamp: '2026-06-14T00:00:00Z',
      ev: 0.39,
      kellyFraction: 0.2,
      recommendedStakePct: 0.05,
    }
    expect(b.market).toBe('home')
  })

  it('constructs result + odds', () => {
    const r: RegularTimeResult = { matchId: 'm1', homeScore: 2, awayScore: 1 }
    const o: MatchOdds = { matchId: 'm1', home: 2.78, draw: 3.4, away: 2.5, timestamp: 't' }
    expect(r.homeScore + o.home).toBeGreaterThan(0)
  })
})
