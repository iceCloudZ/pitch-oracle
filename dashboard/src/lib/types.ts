/**
 * Dashboard-side view types. These are plain shapes that mirror the JSON
 * emitted by the engine (see src/engine/leaderboard.ts, src/domain/types.ts in
 * the repo root). We re-declare them here rather than importing from the root
 * `src/` because the dashboard is a separate package with its own tsconfig and
 * does not depend on the engine at build time.
 */

export interface AccuracyStats {
  agentId: string
  totalPoints: number
  matches: number
  exactScores: number
  /** Result-correct but NOT exact-score (disjoint from exactScores). */
  correctResults: number
}

export interface BettingStats {
  agentId: string
  settledBets: number
  wonBets: number
  totalStakedUnits: number
  totalPnlUnits: number
  roiPct: number
}

/** Shape of /data/leaderboard.json written by runScore(). */
export interface Leaderboard {
  accuracy?: AccuracyStats[]
  betting?: BettingStats[]
  generatedAt?: string
}

export type MatchOutcome = 'home' | 'draw' | 'away'

export interface ResultProbs {
  home: number
  draw: number
  away: number
}

export interface ScoreProb {
  score: string
  prob: number
}

export interface Prediction {
  agentId: string
  matchId: string
  resultProbs: ResultProbs
  scoreProbs: ScoreProb[]
  confidence: number
  reasoning: string
  createdAt: string
}

export interface Bet {
  matchId: string
  agentId: string
  market: MatchOutcome
  modelProb: number
  impliedProb: number
  decimalOdds: number
  oddsTimestamp: string
  ev: number
  kellyFraction: number
  recommendedStakePct: number
}

/** A fixture row (subset of the data-layer Fixture that matters for listing). */
export interface Fixture {
  id: string
  homeTeam: string
  awayTeam: string
  /** ISO kick-off time, if known. */
  date?: string
  status?: string
}
