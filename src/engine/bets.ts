import type { Bet, MatchOdds, MatchOutcome, Prediction } from '../domain/types.js'
import { normalizeResultProbs, smoothProbs } from './prob.js'
import { impliedProb } from './odds.js'
import { expectedValue, fractionalKelly, kellyFraction, recommendedStakePct } from './value.js'

export interface ComputeBetsOptions {
  evThreshold?: number // default 0
  kellyFractionRatio?: number // default 0.25
  maxPerBet?: number // default 0.1
  eps?: number // default 0.01
}

const MARKETS: MatchOutcome[] = ['home', 'draw', 'away']

export function computeBets(pred: Prediction, odds: MatchOdds, opts: ComputeBetsOptions = {}): Bet[] {
  const evThreshold = opts.evThreshold ?? 0
  const ratio = opts.kellyFractionRatio ?? 0.25
  const maxPerBet = opts.maxPerBet ?? 0.1
  const eps = opts.eps ?? 0.01

  const norm = normalizeResultProbs(pred.resultProbs)
  const [home, draw, away] = smoothProbs([norm.home, norm.draw, norm.away], eps)
  const model: Record<MatchOutcome, number> = { home, draw, away }
  const price: Record<MatchOutcome, number> = { home: odds.home, draw: odds.draw, away: odds.away }

  const bets: Bet[] = []
  for (const market of MARKETS) {
    const decimalOdds = price[market]
    const modelProb = model[market]
    const ev = expectedValue(modelProb, decimalOdds)
    if (ev <= evThreshold) continue
    const kelly = kellyFraction(modelProb, decimalOdds)
    const stake = recommendedStakePct(fractionalKelly(kelly, ratio), maxPerBet)
    bets.push({
      matchId: pred.matchId,
      agentId: pred.agentId,
      market,
      modelProb,
      impliedProb: impliedProb(decimalOdds),
      decimalOdds,
      oddsTimestamp: odds.timestamp,
      ev,
      kellyFraction: kelly,
      recommendedStakePct: stake,
    })
  }
  return bets
}
