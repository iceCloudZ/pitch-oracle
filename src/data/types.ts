/**
 * Data-layer types: vendor-neutral shapes produced by the adapters.
 * Domain types (`MatchOdds`, `RegularTimeResult`) live in `src/domain/types.ts`
 * and are re-used by the odds/results adapters.
 */

/** A normalized fixture/match from football-data.org (or equivalent). */
export interface Fixture {
  id: string
  homeTeam: string
  awayTeam: string
  commenceTime: string // ISO 8601
  competition: string
  /** Vendor status value, pass-through (e.g. 'SCHEDULED' | 'IN_PLAY' | 'FINISHED'). */
  status: string
}

/** A normalized news/search result item. */
export interface NewsItem {
  title: string
  url: string
  description: string
}

/** Common adapter options: API key + injectable fetch for deterministic tests. */
export interface AdapterOptions {
  apiKey: string
  fetchImpl?: typeof fetch
}
