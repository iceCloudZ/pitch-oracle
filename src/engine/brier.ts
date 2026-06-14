import type { MatchOutcome, ResultProbs } from '../domain/types.js'

export function brierScore(pred: ResultProbs, actual: MatchOutcome): number {
  const indic = (o: MatchOutcome): number => (o === actual ? 1 : 0)
  const dh = pred.home - indic('home')
  const dd = pred.draw - indic('draw')
  const da = pred.away - indic('away')
  return dh * dh + dd * dd + da * da
}
