import type { BetSettlement } from '../domain/types.js'
import type { AccuracyScore } from './scoring.js'

export interface AccuracyStats {
  agentId: string
  totalPoints: number
  matches: number
  exactScores: number
  /** Result-correct but NOT exact-score (exclusive of exactScores; disjoint). */
  correctResults: number
}

export function aggregateAccuracy(rows: { agentId: string; score: AccuracyScore }[]): AccuracyStats[] {
  const map = new Map<string, AccuracyStats>()
  for (const { agentId, score } of rows) {
    const s =
      map.get(agentId) ?? {
        agentId,
        totalPoints: 0,
        matches: 0,
        exactScores: 0,
        correctResults: 0,
      }
    s.totalPoints += score.points
    s.matches += 1
    if (score.exactScore) s.exactScores += 1
    if (score.correctResult) s.correctResults += 1
    map.set(agentId, s)
  }
  return [...map.values()].sort((a, b) => b.totalPoints - a.totalPoints)
}

export interface BettingStats {
  agentId: string
  settledBets: number
  wonBets: number
  totalStakedUnits: number
  totalPnlUnits: number
  roiPct: number
}

export function aggregateBetting(settlements: BetSettlement[]): BettingStats[] {
  const map = new Map<string, BettingStats>()
  for (const s of settlements) {
    const agentId = s.bet.agentId
    const st =
      map.get(agentId) ?? {
        agentId,
        settledBets: 0,
        wonBets: 0,
        totalStakedUnits: 0,
        totalPnlUnits: 0,
        roiPct: 0,
      }
    st.settledBets += 1
    if (s.won) st.wonBets += 1
    st.totalStakedUnits += s.stakeUnits
    st.totalPnlUnits += s.pnlUnits
    map.set(agentId, st)
  }
  const arr = [...map.values()]
  for (const st of arr) {
    st.roiPct = st.totalStakedUnits > 0 ? (st.totalPnlUnits / st.totalStakedUnits) * 100 : 0
  }
  return arr.sort((a, b) => b.totalPnlUnits - a.totalPnlUnits)
}
