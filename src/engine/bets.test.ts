import { describe, expect, it } from 'vitest'
import { computeBets } from './bets.js'
import type { MatchOdds, Prediction } from '../domain/types.js'

const pred = (resultProbs: Prediction['resultProbs']): Prediction => ({
  agentId: 'claude',
  matchId: 'm1',
  resultProbs,
  scoreProbs: [],
  confidence: 0.6,
  reasoning: 'x',
  createdAt: '2026-06-14T00:00:00Z',
})

const odds: MatchOdds = {
  matchId: 'm1',
  home: 2.0,
  draw: 3.5,
  away: 4.0,
  timestamp: '2026-06-14T00:00:00Z',
}

describe('computeBets', () => {
  it('emits a value bet where the model beats the market', () => {
    const bets = computeBets(pred({ home: 0.6, draw: 0.25, away: 0.15 }), odds)
    const home = bets.find((b) => b.market === 'home')
    expect(home).toBeTruthy()
    expect(home!.ev).toBeGreaterThan(0)
    expect(home!.recommendedStakePct).toBeGreaterThan(0)
    expect(home!.oddsTimestamp).toBe(odds.timestamp)
  })

  it('skips markets with no edge', () => {
    const bets = computeBets(pred({ home: 0.6, draw: 0.2, away: 0.2 }), odds)
    expect(bets.find((b) => b.market === 'away')).toBeUndefined()
  })

  it('caps stake at maxPerBet', () => {
    const bets = computeBets(pred({ home: 0.9, draw: 0.05, away: 0.05 }), odds, { maxPerBet: 0.1 })
    const home = bets.find((b) => b.market === 'home')
    expect(home!.recommendedStakePct).toBeLessThanOrEqual(0.1)
  })
})
