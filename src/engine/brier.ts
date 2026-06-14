import type { MatchOutcome, ResultProbs } from '../domain/types.js'

/**
 * Unscaled 3-outcome Brier score: sum of squared errors over home/draw/away,
 * range 0 (perfect) to 2 (perfectly wrong). Reference-only metric; halve it
 * if comparing against the 0–1 convention some literature uses.
 */
export function brierScore(pred: ResultProbs, actual: MatchOutcome): number {
  const indic = (o: MatchOutcome): number => (o === actual ? 1 : 0)
  const dh = pred.home - indic('home')
  const dd = pred.draw - indic('draw')
  const da = pred.away - indic('away')
  return dh * dh + dd * dd + da * da
}
