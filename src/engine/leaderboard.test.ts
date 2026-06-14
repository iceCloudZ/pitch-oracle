import { describe, expect, it } from 'vitest'
import { aggregateAccuracy, aggregateBetting } from './leaderboard.js'
import type { AccuracyScore } from './scoring.js'
import type { Bet, BetSettlement } from '../domain/types.js'

const sc = (points: number, exactScore = false, correctResult = false): AccuracyScore => ({
  points,
  exactScore,
  correctResult,
})

describe('aggregateAccuracy', () => {
  it('sums per agent and sorts by total desc', () => {
    const out = aggregateAccuracy([
      { agentId: 'a', score: sc(3, true) },
      { agentId: 'b', score: sc(1) },
      { agentId: 'a', score: sc(1) },
    ])
    expect(out[0].agentId).toBe('a')
    expect(out[0].totalPoints).toBe(4)
    expect(out[0].matches).toBe(2)
    expect(out[0].exactScores).toBe(1)
    expect(out[1].totalPoints).toBe(1)
  })
})

describe('aggregateBetting', () => {
  const mkBet = (agentId: string): Bet => ({
    matchId: 'm1',
    agentId,
    market: 'home',
    modelProb: 0.6,
    impliedProb: 0.5,
    decimalOdds: 2.5,
    oddsTimestamp: 't',
    ev: 0.5,
    kellyFraction: 0.3,
    recommendedStakePct: 0.1,
  })
  it('sums P/L and computes ROI', () => {
    const settlements: BetSettlement[] = [
      { bet: mkBet('a'), stakeUnits: 100, pnlUnits: 150, won: true },
      { bet: mkBet('a'), stakeUnits: 100, pnlUnits: -100, won: false },
    ]
    const out = aggregateBetting(settlements)
    expect(out[0].agentId).toBe('a')
    expect(out[0].settledBets).toBe(2)
    expect(out[0].wonBets).toBe(1)
    expect(out[0].totalStakedUnits).toBeCloseTo(200)
    expect(out[0].totalPnlUnits).toBeCloseTo(50)
    expect(out[0].roiPct).toBeCloseTo(25) // 50 / 200
  })
})
