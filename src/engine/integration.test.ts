import { describe, expect, it } from 'vitest'
import { computeBets } from './bets.js'
import { resultOf, scorePrediction } from './scoring.js'
import { settleBet } from './settlement.js'
import { aggregateAccuracy, aggregateBetting } from './leaderboard.js'
import type { MatchOdds, Prediction, RegularTimeResult } from '../domain/types.js'

describe('engine integration', () => {
  const odds: MatchOdds = { matchId: 'm1', home: 2.0, draw: 3.5, away: 4.0, timestamp: 't' }
  const pred: Prediction = {
    agentId: 'claude',
    matchId: 'm1',
    resultProbs: { home: 0.6, draw: 0.25, away: 0.15 },
    scoreProbs: [{ score: '2-1', prob: 0.25 }],
    confidence: 0.7,
    reasoning: 'x',
    createdAt: 't',
  }
  const actual: RegularTimeResult = { matchId: 'm1', homeScore: 2, awayScore: 1 }

  it('flows prediction -> bets -> settlement -> leaderboard', () => {
    const bets = computeBets(pred, odds)
    expect(bets.length).toBeGreaterThan(0)

    const settlements = bets.map((b) => settleBet(b, resultOf(actual), 1000))
    const betting = aggregateBetting(settlements)
    expect(betting[0].agentId).toBe('claude')

    const accuracy = aggregateAccuracy([
      { agentId: 'claude', score: scorePrediction(pred, actual) },
    ])
    expect(accuracy[0].totalPoints).toBe(3) // exact scoreline 2-1
  })
})
