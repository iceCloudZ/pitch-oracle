import type { Bet, BetSettlement, MatchOutcome } from '../domain/types.js'

export function settleBet(bet: Bet, actual: MatchOutcome, bankroll: number): BetSettlement {
  const stakeUnits = bet.recommendedStakePct * bankroll
  const won = bet.market === actual
  const pnlUnits = won ? stakeUnits * (bet.decimalOdds - 1) : -stakeUnits
  return { bet, stakeUnits, pnlUnits, won }
}
