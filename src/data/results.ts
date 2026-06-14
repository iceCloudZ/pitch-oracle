/**
 * the-odds-api v4 scores adapter.
 * Normalizes completed events into our domain `RegularTimeResult` type.
 *
 * Endpoint: GET /v4/sports/{sportKey}/scores/?daysFrom={daysFrom}&apiKey={apiKey}
 *
 * NOTE / caveat: the-odds-api `scores` reflects the FINAL score. For knockout
 * matches it MAY INCLUDE extra time (and penalties). For the MVP group-stage
 * scope this equals regular time, so the value is a faithful
 * `RegularTimeResult`. Proper knockout regular-time handling is deferred.
 */
import type { RegularTimeResult } from '../domain/types.js'
import type { AdapterOptions } from './types.js'
import { fetchJson } from './http.js'

interface ScoreEntry {
  name: string
  score: string | number
}
interface ScoresEvent {
  id: number | string
  sport_key: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  scores: ScoreEntry[]
}
type ScoresResponse = ScoresEvent[]

export interface FetchResultsOptions extends AdapterOptions {
  sportKey: string
  daysFrom?: number
}

const BASE_URL = 'https://api.the-odds-api.com/v4'

function toNumber(score: string | number): number | undefined {
  if (typeof score === 'number') return Number.isFinite(score) ? score : undefined
  const n = Number(score)
  return Number.isFinite(n) ? n : undefined
}

export async function fetchResults(
  opts: FetchResultsOptions,
): Promise<RegularTimeResult[]> {
  const daysFrom = opts.daysFrom ?? 3
  const url = new URL(`${BASE_URL}/sports/${encodeURIComponent(opts.sportKey)}/scores/`)
  url.searchParams.set('daysFrom', String(daysFrom))
  url.searchParams.set('apiKey', opts.apiKey)

  const body = await fetchJson<ScoresResponse>(url.toString(), {
    fetchImpl: opts.fetchImpl,
  })

  const out: RegularTimeResult[] = []
  for (const ev of body ?? []) {
    if (!ev.completed) continue
    const homeScore = ev.scores?.find((s) => s.name === ev.home_team)
    const awayScore = ev.scores?.find((s) => s.name === ev.away_team)
    const h = homeScore ? toNumber(homeScore.score) : undefined
    const a = awayScore ? toNumber(awayScore.score) : undefined
    if (h === undefined || a === undefined) continue

    out.push({ matchId: String(ev.id), homeScore: h, awayScore: a })
  }
  return out
}
