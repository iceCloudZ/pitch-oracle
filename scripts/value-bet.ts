#!/usr/bin/env tsx
/**
 * Minimal value-bet calculator — use the engine instantly, no API keys.
 *
 *   npx tsx scripts/value-bet.ts <homeOdds> <drawOdds> <awayOdds> <homeProb> <drawProb> <awayProb> [bankroll]
 *
 * Example:
 *   npx tsx scripts/value-bet.ts 2.0 3.5 4.0 0.55 0.25 0.20 1000
 *
 * Prints EV, Kelly fraction, fractional-Kelly (1/4) stake, and value bets per 1x2 market.
 *
 *   ⚠️  模拟试算，非财务建议。理性博彩，18+。Simulated bankroll only.
 */
import { computeBets } from '../src/engine/bets.js'
import { impliedProb } from '../src/engine/odds.js'
import type { MatchOdds, Prediction } from '../src/domain/types.js'

const args = process.argv.slice(2)
if (args.length < 6) {
  console.error(
    'Usage: npx tsx scripts/value-bet.ts <homeOdds> <drawOdds> <awayOdds> <homeProb> <drawProb> <awayProb> [bankroll=1000]',
  )
  console.error('Example: npx tsx scripts/value-bet.ts 2.0 3.5 4.0 0.55 0.25 0.20 1000')
  process.exit(1)
}

const nums = args.map(Number)
const [ho, dop, ao, hp, dp, ap] = nums
const bankroll = args.length >= 7 && Number.isFinite(nums[6]) && nums[6] > 0 ? nums[6] : 1000

if ([ho, dop, ao].some((x) => !Number.isFinite(x) || x <= 1)) {
  console.error('Error: all three odds must be numbers > 1')
  process.exit(1)
}
if ([hp, dp, ap].some((x) => !Number.isFinite(x) || x < 0)) {
  console.error('Error: probabilities must be numbers >= 0 (they get normalized)')
  process.exit(1)
}

const ts = new Date().toISOString()
const odds: MatchOdds = { matchId: 'm', home: ho, draw: dop, away: ao, timestamp: ts }
const pred: Prediction = {
  agentId: 'you',
  matchId: 'm',
  resultProbs: { home: hp, draw: dp, away: ap },
  scoreProbs: [],
  confidence: 0,
  reasoning: 'manual',
  createdAt: ts,
}

const bets = computeBets(pred, odds)
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

console.log(`\nVirtual bankroll: ${bankroll} units   (1/4 Kelly, max 10% per bet)\n`)
console.log(
  ['market', 'odds', 'implied', 'yours', 'EV', 'value?', 'stake%', 'stake']
    .map((h) => h.padStart(7))
    .join('  '),
)
console.log('-'.repeat(72))

const rows: Array<['home' | 'draw' | 'away', number, number]> = [
  ['home', odds.home, pred.resultProbs.home],
  ['draw', odds.draw, pred.resultProbs.draw],
  ['away', odds.away, pred.resultProbs.away],
]
for (const [m, o, p] of rows) {
  const ev = p * o - 1
  const bet = bets.find((b) => b.market === m)
  const stakePct = bet?.recommendedStakePct ?? 0
  const stake = stakePct * bankroll
  const evStr = `${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(1)}%`
  console.log(
    [
      m.padStart(7),
      o.toFixed(2).padStart(7),
      pct(impliedProb(o)).padStart(7),
      pct(p).padStart(7),
      evStr.padStart(7),
      (ev > 0 ? 'YES' : 'no').padStart(7),
      pct(stakePct).padStart(7),
      stake.toFixed(1).padStart(7),
    ].join('  '),
  )
}

console.log('')
if (bets.length === 0) {
  console.log('No value bets — your probabilities don’t beat the market anywhere. Pass.')
} else {
  console.log('Value bets:')
  for (const b of bets) {
    console.log(
      `  → ${b.market.toUpperCase()} @ ${b.decimalOdds.toFixed(2)}: stake ${(
        b.recommendedStakePct * bankroll
      ).toFixed(1)} units (${pct(b.recommendedStakePct)} of bankroll), EV ${pct(b.ev)}`,
    )
  }
  const total = bets.reduce((s, b) => s + b.recommendedStakePct, 0) * bankroll
  console.log(`  Total staked: ${total.toFixed(1)} units (${pct(total / bankroll)} of bankroll)`)
}
console.log('\n⚠️  模拟试算，非财务建议。理性博彩，18+。')
