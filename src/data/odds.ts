/**
 * the-odds-api v4 h2h (1x2) odds adapter.
 * Normalizes vendor events into our domain `MatchOdds` type.
 *
 * Endpoint: GET /v4/sports/{sportKey}/odds/?regions={region}&markets=h2h
 *           &oddsFormat=decimal&apiKey={apiKey}
 *
 * Canonical bookmaker selection: prefer `pinnacle`; otherwise `bookmakers[0]`.
 * Draw price is taken from the outcome literally named 'Draw'. For World Cup
 * group-stage events the draw market is always offered; if an event lacks a
 * draw price the event is SKIPPED (never throws).
 */
import type { MatchOdds } from '../domain/types.js'
import type { AdapterOptions } from './types.js'
import { fetchJson } from './http.js'

interface Outcome {
  name: string
  price: number
}
interface Market {
  key: string
  outcomes: Outcome[]
}
interface Bookmaker {
  key: string
  title: string
  markets: Market[]
}
interface OddsEvent {
  id: number | string
  sport_key: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: Bookmaker[]
}
type OddsResponse = OddsEvent[]

export interface FetchOddsOptions extends AdapterOptions {
  sportKey: string
  region?: string
}

const BASE_URL = 'https://api.the-odds-api.com/v4'

/** Pick the canonical bookmaker: Pinnacle if present, otherwise the first. */
function pickBookmaker(books: Bookmaker[]): Bookmaker | null {
  if (!books || books.length === 0) return null
  return books.find((b) => b.key === 'pinnacle') ?? books[0]
}

/**
 * Map a single vendor event to a `MatchOdds`, or `null` if it should be
 * skipped (no usable bookmaker, no h2h market, or no draw outcome).
 */
function toMatchOdds(ev: OddsEvent): MatchOdds | null {
  const book = pickBookmaker(ev.bookmakers)
  if (!book) return null
  const h2h = book.markets.find((m) => m.key === 'h2h')
  if (!h2h) return null

  const home = h2h.outcomes.find((o) => o.name === ev.home_team)?.price
  const away = h2h.outcomes.find((o) => o.name === ev.away_team)?.price
  const draw = h2h.outcomes.find((o) => o.name === 'Draw')?.price

  if (home === undefined || away === undefined || draw === undefined) {
    // WC group-stage draw is always offered; skip incomplete events.
    return null
  }

  return {
    matchId: String(ev.id),
    home,
    draw,
    away,
    timestamp: ev.commence_time,
  }
}

export async function fetchOdds(opts: FetchOddsOptions): Promise<MatchOdds[]> {
  const region = opts.region ?? 'eu'
  const url = new URL(`${BASE_URL}/sports/${encodeURIComponent(opts.sportKey)}/odds/`)
  url.searchParams.set('regions', region)
  url.searchParams.set('markets', 'h2h')
  url.searchParams.set('oddsFormat', 'decimal')
  url.searchParams.set('apiKey', opts.apiKey)

  const body = await fetchJson<OddsResponse>(url.toString(), {
    fetchImpl: opts.fetchImpl,
  })

  const out: MatchOdds[] = []
  for (const ev of body ?? []) {
    const mo = toMatchOdds(ev)
    if (mo) out.push(mo)
  }
  return out
}
