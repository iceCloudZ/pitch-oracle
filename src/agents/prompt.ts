/**
 * Prompt builders for the LLM-based agents.
 *
 * `buildSystemPrompt` is odds-agnostic: it frames the model as a football
 * analyst and pins the required JSON shape. `buildUserPrompt` describes the
 * fixture + news, and only includes the market 1x2 odds when `seeOdds` is
 * true (blind agents never see them).
 */
import type { MatchContext } from './types.js'

export function buildSystemPrompt(): string {
  return [
    'You are a disciplined football (soccer) analyst producing probabilistic match forecasts.',
    'Reason only about regular time — the 90 minutes plus stoppage, NOT extra time or penalties.',
    'Calibrate honestly: your probabilities should reflect genuine uncertainty, not false certainty.',
    '',
    'Respond with ONLY a single JSON object (no markdown, no prose) with EXACTLY these keys:',
    '- "resultProbs": object { "home": number, "draw": number, "away": number } summing to ~1.0',
    '- "scoreProbs": array of at most 5 objects { "score": "h-a", "prob": number }, the most likely scorelines (e.g. "2-1")',
    '- "confidence": number between 0 and 1 (your overall confidence in the forecast)',
    '- "reasoning": short string explaining the key factors',
    '',
    'Do not include any other keys. Do not wrap the JSON in backticks.',
  ].join('\n')
}

function summarizeNews(ctx: MatchContext): string {
  const items = ctx.news ?? []
  if (items.length === 0) return 'No relevant news found.'
  const lines = items
    .slice(0, 6)
    .map((n, i) => `  ${i + 1}. ${n.title}${n.description ? ` — ${n.description}` : ''}`)
    .join('\n')
  return `Recent context:\n${lines}`
}

function formatOdds(ctx: MatchContext): string {
  const o = ctx.odds
  if (!o) return ''
  return [
    '',
    'Current 1x2 decimal odds (market consensus):',
    `  Home win: ${o.home}`,
    `  Draw: ${o.draw}`,
    `  Away win: ${o.away}`,
    'You may reference the market consensus implied by these odds.',
  ].join('\n')
}

export function buildUserPrompt(ctx: MatchContext, seeOdds: boolean): string {
  const f = ctx.fixture
  const lines: string[] = [
    `Match: ${f.homeTeam} vs ${f.awayTeam}`,
    `Competition: ${f.competition}`,
    `Kickoff (UTC): ${f.commenceTime}`,
    '',
    summarizeNews(ctx),
  ]
  if (seeOdds) {
    lines.push(formatOdds(ctx))
  }
  lines.push('', 'Provide your forecast now as the required JSON object.')
  return lines.join('\n')
}

/**
 * Human-augmented variant: identical to `buildUserPrompt` but with an analyst
 * notes block prepended/inserted. Used by `HumanAugmentedAgent`.
 */
export function buildHumanAugmentedUserPrompt(
  ctx: MatchContext,
  seeOdds: boolean,
  notes: string,
): string {
  const base = buildUserPrompt(ctx, seeOdds)
  const trimmed = notes.trim()
  if (!trimmed) return base
  return [`Analyst notes:\n${trimmed}`, '', base].join('\n')
}
