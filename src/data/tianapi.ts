/**
 * TianAPI (天聚数行) football news adapter.
 *
 * The /football/index endpoint returns the latest football news feed (not a
 * per-match search). To get match-relevant items we pull a page of the feed
 * and filter titles by the team names parsed out of the runner's query string,
 * which has the shape "${home} vs ${away} preview".
 *
 * This keeps the existing `fetchNews(query) => NewsItem[]` contract intact so
 * the runner doesn't care which provider backs it. When no team names can be
 * parsed, or none match, the latest football headlines are returned as-is
 * (still useful general context for an odds-aware model).
 *
 * Mainland-accessible, no VPN. Free tier: ~100 calls/day.
 */
import type { NewsItem } from './types.js'
import { fetchJson } from './http.js'

interface TianApiItem {
  id: string
  title: string
  description?: string
  source?: string
  url: string
  ctime?: string
}
interface TianApiResponse {
  code: number
  msg?: string
  result?: { newslist?: TianApiItem[] }
}

export interface FetchTianApiOptions {
  query: string
  apiKey: string
  /** Page size per request (max 50). Default 30. */
  num?: number
  /** Max pages to walk when filtering by team name. Default 3. */
  maxPages?: number
  fetchImpl?: typeof fetch
}

const BASE_URL = 'https://apis.tianapi.com/football/index'

/**
 * Parse team names from a runner query shaped like "荷兰 vs 日本 preview".
 * Returns the two sides (Chinese names as written). The sporttery feed uses
 * Chinese names, and TianAPI titles are Chinese too, so matching is direct.
 * Returns [] when the query doesn't look like an "X vs Y" fixture.
 */
export function parseTeamsFromQuery(query: string): string[] {
  const m = query.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+preview)?$/i)
  if (!m) return []
  const home = m[1].trim()
  const away = m[2].trim()
  return home && away ? [home, away] : []
}

/**
 * Fetch football news from TianAPI, optionally filtered to a fixture's teams.
 * Pulls up to `maxPages` pages of the feed and keeps items whose title mentions
 * either side; when the query can't be parsed or nothing matches, the most
 * recent page is returned as general football context.
 *
 * Never throws — on any error returns [] so the runner degrades gracefully.
 */
export async function fetchTianApiNews(opts: FetchTianApiOptions): Promise<NewsItem[]> {
  const num = Math.min(opts.num ?? 30, 50)
  const maxPages = opts.maxPages ?? 3
  const teams = parseTeamsFromQuery(opts.query)

  const collected: NewsItem[] = []
  const matched: NewsItem[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(BASE_URL)
    url.searchParams.set('key', opts.apiKey)
    url.searchParams.set('num', String(num))
    url.searchParams.set('page', String(page))

    let body: TianApiResponse
    try {
      body = await fetchJson<TianApiResponse>(url.toString(), {
        fetchImpl: opts.fetchImpl,
      })
    } catch {
      // Network/timeout — stop paging and return what we have.
      break
    }
    if (body.code !== 200) break
    const list = body.result?.newslist ?? []

    for (const item of list) {
      const news: NewsItem = {
        title: item.title,
        url: item.url,
        description: item.description ?? '',
      }
      collected.push(news)
      if (teams.length > 0 && teams.some((t) => item.title.includes(t))) {
        matched.push(news)
      }
    }

    // When filtering, stop early once we have enough matched items.
    if (teams.length > 0 && matched.length >= 6) break
    // Short feed — no point paging further.
    if (list.length < num) break
  }

  // Prefer match-relevant items; fall back to the latest feed when filtering
  // yielded nothing (the model still benefits from general football context).
  return teams.length > 0 && matched.length > 0 ? matched.slice(0, 6) : collected.slice(0, 6)
}
