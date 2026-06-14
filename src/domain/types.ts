export type MatchOutcome = 'home' | 'draw' | 'away'

export interface ResultProbs {
  home: number
  draw: number
  away: number
}

export interface ScoreProb {
  score: string // "2-1"
  prob: number
}

export interface Prediction {
  agentId: string
  matchId: string
  resultProbs: ResultProbs
  scoreProbs: ScoreProb[]
  confidence: number
  reasoning: string
  createdAt: string // ISO
}

export interface MatchOdds {
  matchId: string
  home: number
  draw: number
  away: number
  timestamp: string // ISO — snapshot moment
}

export interface Bet {
  matchId: string
  agentId: string
  market: MatchOutcome // MVP: 1x2 only
  modelProb: number
  impliedProb: number
  decimalOdds: number
  oddsTimestamp: string // ISO
  ev: number
  kellyFraction: number
  recommendedStakePct: number
}

export interface RegularTimeResult {
  matchId: string
  homeScore: number
  awayScore: number
}

export interface BetSettlement {
  bet: Bet
  stakeUnits: number
  pnlUnits: number
  won: boolean
}
