/**
 * football-data.org v4 results adapter — derives `RegularTimeResult[]` from the
 * same `/matches` endpoint used for fixtures, reading `score.fullTime`.
 *
 * Endpoint: GET /v4/competitions/{competition}/matches?status=FINISHED
 * Header:   X-Auth-Token: {apiKey}
 *
 * The returned `matchId` is the football-data.org match id. When this provider
 * is used alongside the sporttery (体彩) fixtures/odds source, the team-name
 * join in `src/engine/join.ts` re-maps these ids onto sporttery matchIds so the
 * runner's `resultIndex` lines up with predictions keyed by sporttery matchId.
 *
 * Caveat: `score.fullTime` is the final score including, for knockout ties, any
 * extra time. For the MVP group-stage scope this equals regular time.
 */
import type { RegularTimeResult } from '../domain/types.js'
import type { AdapterOptions } from './types.js'
import { fetchJson } from './http.js'

interface ScoreSide {
  home?: number | null
  away?: number | null
}
interface FdScore {
  fullTime?: ScoreSide | null
}
interface FdMatch {
  id: number | string
  status?: string
  score?: FdScore | null
  homeTeam?: { name?: string } | null
  awayTeam?: { name?: string } | null
}
interface FdResponse {
  matches?: FdMatch[]
}

export interface FetchFixturesResultsOptions extends AdapterOptions {
  /** football-data.org competition code, e.g. 'WC'. */
  competition: string
}

/** A result enriched with its football-data team names for cross-source joining. */
export interface ResultWithTeams extends RegularTimeResult {
  homeTeam: string
  awayTeam: string
}

const BASE_URL = 'https://api.football-data.org/v4'

/** Finite-or-undefined number coercion for vendor score fields. */
function toFinite(n: number | null | undefined): number | undefined {
  if (n == null) return undefined
  return Number.isFinite(n) ? n : undefined
}

export async function fetchFixturesResults(
  opts: FetchFixturesResultsOptions,
): Promise<RegularTimeResult[]> {
  const rows = await fetchFixturesResultsWithTeams(opts)
  return rows.map((r) => ({
    matchId: r.matchId,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  }))
}

/**
 * Like {@link fetchFixturesResults} but also carries the football-data team
 * names, so a caller can join results onto sporttery-keyed fixtures by team.
 */
export async function fetchFixturesResultsWithTeams(
  opts: FetchFixturesResultsOptions,
): Promise<ResultWithTeams[]> {
  const url = new URL(
    `${BASE_URL}/competitions/${encodeURIComponent(opts.competition)}/matches`,
  )
  url.searchParams.set('status', 'FINISHED')

  const body = await fetchJson<FdResponse>(url.toString(), {
    headers: { 'X-Auth-Token': opts.apiKey },
    fetchImpl: opts.fetchImpl,
  })

  const out: ResultWithTeams[] = []
  for (const m of body.matches ?? []) {
    const full = m.score?.fullTime
    const home = toFinite(full?.home)
    const away = toFinite(full?.away)
    if (home == null || away == null) continue // score not settled / partial
    out.push({
      matchId: String(m.id),
      homeScore: home,
      awayScore: away,
      homeTeam: m.homeTeam?.name ?? '',
      awayTeam: m.awayTeam?.name ?? '',
    })
  }
  return out
}
