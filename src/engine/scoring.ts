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

/**
 * Points: exact scoreline = +3 (exclusive); else correct W/D/L = +1; else 0.
 *
 * `exactScore` and `correctResult` are derived independently — `exactScore`
 * from the top scoreline (topScore), the result signal from argmax(resultProbs)
 * — so the headline score and the argmax result can imply different outcomes.
 * To keep leaderboard counters disjoint, the reported `correctResult` is
 * EXCLUSIVE of exact (false when exactScore is true): the two flags never
 * overlap, so `exactScores + correctResults <= matches`.
 */
export function scorePrediction(pred: Prediction, actual: RegularTimeResult): AccuracyScore {
  const resultCorrect = argmaxResult(pred.resultProbs) === resultOf(actual)
  const headline = topScore(pred)
  const exactScore = headline !== null && headline === `${actual.homeScore}-${actual.awayScore}`
  const points = exactScore ? 3 : resultCorrect ? 1 : 0
  const correctResult = !exactScore && resultCorrect
  return { points, exactScore, correctResult }
}
