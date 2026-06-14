import { describe, expect, it } from 'vitest'
import { settleBet } from './settlement.js'
import type { Bet } from '../domain/types.js'

const bet = (market: Bet['market'], odds: number, stakePct: number): Bet => ({
  matchId: 'm1',
  agentId: 'claude',
  market,
  modelProb: 0.5,
  impliedProb: 0.4,
  decimalOdds: odds,
  oddsTimestamp: 't',
  ev: 0.2,
  kellyFraction: 0.2,
  recommendedStakePct: stakePct,
})

describe('settleBet', () => {
  it('wins: profit = stake * (odds - 1)', () => {
    // 10% of 1000 = 100 staked; odds 2.5 -> 100 * 1.5 = 150
    const s = settleBet(bet('home', 2.5, 0.1), 'home', 1000)
    expect(s.won).toBe(true)
    expect(s.stakeUnits).toBeCloseTo(100)
    expect(s.pnlUnits).toBeCloseTo(150)
  })
  it('loses: -stake', () => {
    const s = settleBet(bet('home', 2.5, 0.1), 'away', 1000)
    expect(s.won).toBe(false)
    expect(s.pnlUnits).toBeCloseTo(-100)
  })
})
