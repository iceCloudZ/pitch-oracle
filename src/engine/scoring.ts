import type { MatchOutcome, Prediction, RegularTimeResult, ResultProbs } from '../domain/types.js'

export function resultOf(r: RegularTimeResult): MatchOutcome {
  if (r.homeScore > r.awayScore) return 'home'
  if (r.homeScore < r.awayScore) return 'away'
  return 'draw'
}

export function argmaxResult(rp: ResultProbs): MatchOutcome {
  if (rp.home >= rp.draw && rp.home >= rp.away) return 'home'
  if (rp.draw >= rp.away) return 'draw'
  return 'away'
}

/** Highest-probability scoreline, or null if none given. */
export function topScore(pred: Prediction): string | null {
  if (pred.scoreProbs.length === 0) return null
  return [...pred.scoreProbs].sort((a, b) => b.prob - a.prob)[0].score
}

export interface AccuracyScore {
  points: number
  exactScore: boolean
  correctResult: boolean
}

/** Exact scoreline = +3 (exclusive); else correct W/D/L = +1; else 0. */
export function scorePrediction(pred: Prediction, actual: RegularTimeResult): AccuracyScore {
  const correctResult = argmaxResult(pred.resultProbs) === resultOf(actual)
  const headline = topScore(pred)
  const exactScore = headline !== null && headline === `${actual.homeScore}-${actual.awayScore}`
  const points = exactScore ? 3 : correctResult ? 1 : 0
  return { points, exactScore, correctResult }
}
