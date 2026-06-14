/**
 * football-data.org v4 fixtures adapter.
 * Normalizes vendor matches into our `Fixture` type.
 *
 * Endpoint: GET /v4/competitions/{competition}/matches?status=SCHEDULED,IN_PLAY,FINISHED
 * Header:   X-Auth-Token: {apiKey}
 */
import type { AdapterOptions, Fixture } from './types.js'
import { fetchJson } from './http.js'

/** Minimal football-data.org v4 match shape used for normalization. */
interface FdMatch {
  id: number | string
  utcDate: string
  status: string
  homeTeam: { name: string } | null
  awayTeam: { name: string } | null
}

interface FdResponse {
  matches: FdMatch[]
}

export interface FetchFixturesOptions extends AdapterOptions {
  /** football-data.org competition code, e.g. 'WC'. */
  competition: string
}

const BASE_URL = 'https://api.football-data.org/v4'

export async function fetchFixtures(
  opts: FetchFixturesOptions,
): Promise<Fixture[]> {
  const url = new URL(
    `${BASE_URL}/competitions/${encodeURIComponent(opts.competition)}/matches`,
  )
  url.searchParams.set('status', 'SCHEDULED,IN_PLAY,FINISHED')

  const body = await fetchJson<FdResponse>(url.toString(), {
    headers: { 'X-Auth-Token': opts.apiKey },
    fetchImpl: opts.fetchImpl,
  })

  return (body.matches ?? [])
    .filter((m) => m && m.homeTeam && m.awayTeam)
    .map<Fixture>((m) => ({
      id: String(m.id),
      homeTeam: m.homeTeam!.name,
      awayTeam: m.awayTeam!.name,
      commenceTime: m.utcDate,
      competition: opts.competition,
      status: m.status,
    }))
}
