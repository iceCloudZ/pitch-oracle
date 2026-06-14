/**
 * 中国体彩 (sporttery) 竞彩足球 adapter.
 *
 * One endpoint serves both fixtures and odds for all in-sale (在售) matches:
 *   GET https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry
 *       ?channel=c_web&poolCode=had
 *   Headers: User-Agent + Referer (the WAF rejects requests lacking these).
 *
 * The response groups matches by businessDate (售卖日). Each match carries team
 * names (Chinese), matchId/matchNumStr, and a `had` object with decimal odds
 * {h, d, a} (胜/平/负). A match whose `had` is an empty object has no 胜平负
 * market on sale and is skipped by the odds mapper (never throws).
 *
 * Because fixtures and odds come from the same payload, we fetch once into a
 * normalized `SportteryMatch[]` and let `fetchSportteryFixtures` /
 * `fetchSportteryOdds` project it independently — guaranteeing the two lists
 * share identical matchIds.
 *
 * No API key required; reachable from mainland China without a VPN.
 */
import type { MatchOdds } from '../domain/types.js'
import type { Fixture } from './types.js'
import { fetchJson } from './http.js'

const BASE_URL = 'https://webapi.sporttery.cn'
const ENDPOINT = '/gateway/uniform/football/getMatchCalculatorV1.qry'
const REFERER = 'https://m.sporttery.cn/mjc/jsq/zqspf/'
const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

/** Pool codes: 'had' = 胜平负, 'hhad' = 让球胜平负, etc. MVP uses 'had'. */
export type SportteryPool = 'had' | 'hhad' | 'crs' | 'ttg' | 'hafu'

/** Minimal shapes of the vendor response we normalize from. */
interface HadOdds {
  h?: string // 胜 (home win)
  d?: string // 平 (draw)
  a?: string // 负 (away win)
}
interface SubMatch {
  matchId: number | string
  matchNumStr?: string
  matchDate?: string
  matchTime?: string
  businessDate?: string
  matchStatus?: string
  homeTeamAbbName?: string
  homeTeamAllName?: string
  awayTeamAbbName?: string
  awayTeamAllName?: string
  leagueAbbName?: string
  had?: HadOdds
}
interface MatchInfoDay {
  businessDate?: string
  subMatchList?: SubMatch[]
}
interface CalculatorValue {
  matchInfoList?: MatchInfoDay[]
  lastUpdateTime?: string
}
interface CalculatorResponse {
  errorCode?: number | string // live API returns "0" as a string
  errorMessage?: string
  value?: CalculatorValue
}

export interface FetchSportteryOptions {
  /** Market pool. Defaults to 'had' (胜平负). */
  poolCode?: SportteryPool
  fetchImpl?: typeof fetch
}

/**
 * The normalized per-match row shared by fixtures + odds projection.
 * Fetches the raw payload once and flattens the businessDate groups.
 */
export interface SportteryMatch {
  matchId: string
  matchNum: string
  matchDate: string
  matchTime: string
  status: string
  homeTeam: string
  homeTeamFull: string
  awayTeam: string
  awayTeamFull: string
  league: string
  had?: HadOdds
  lastUpdateTime: string
}

/** Fetch + flatten the calculator payload into normalized per-match rows. */
export async function fetchSportteryMatches(
  opts: FetchSportteryOptions = {},
): Promise<SportteryMatch[]> {
  const poolCode = opts.poolCode ?? 'had'
  const url = new URL(BASE_URL + ENDPOINT)
  url.searchParams.set('channel', 'c_web')
  url.searchParams.set('poolCode', poolCode)

  const body = await fetchJson<CalculatorResponse>(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
    fetchImpl: opts.fetchImpl,
  })

  // The live API returns errorCode as a STRING ("0"); tolerate both shapes.
  const code = body.errorCode
  const ok = code === 0 || code === '0'
  if (!ok || !body.value?.matchInfoList) {
    return []
  }

  const lastUpdateTime = body.value.lastUpdateTime ?? new Date().toISOString()
  const out: SportteryMatch[] = []
  for (const day of body.value.matchInfoList) {
    for (const m of day.subMatchList ?? []) {
      if (m.homeTeamAllName == null && m.homeTeamAbbName == null) continue
      out.push({
        matchId: String(m.matchId),
        matchNum: m.matchNumStr ?? '',
        matchDate: m.matchDate ?? '',
        matchTime: m.matchTime ?? '',
        status: m.matchStatus ?? '',
        homeTeam: m.homeTeamAbbName ?? m.homeTeamAllName ?? '',
        homeTeamFull: m.homeTeamAllName ?? m.homeTeamAbbName ?? '',
        awayTeam: m.awayTeamAbbName ?? m.awayTeamAllName ?? '',
        awayTeamFull: m.awayTeamAllName ?? m.awayTeamAbbName ?? '',
        league: m.leagueAbbName ?? '',
        had: m.had,
        lastUpdateTime,
      })
    }
  }
  return out
}

/**
 * Project sporttery matches into domain `Fixture[]`.
 * `id` is the sporttery matchId; `matchNum` carries the buyable session
 * number (e.g. '周日010') so the user can match it against a paper ticket.
 */
export async function fetchSportteryFixtures(
  opts: FetchSportteryOptions = {},
): Promise<Fixture[]> {
  const matches = await fetchSportteryMatches(opts)
  return matches.map((m) => ({
    id: m.matchId,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    commenceTime: combineDateTime(m.matchDate, m.matchTime),
    competition: m.league || '竞彩',
    status: m.status,
    matchNum: m.matchNum,
  }))
}

/**
 * Project sporttery matches into domain `MatchOdds[]`.
 * Matches whose `had` object is absent or lacks all three prices are skipped
 * (no 胜平负 market on sale) — never throws.
 */
export async function fetchSportteryOdds(
  opts: FetchSportteryOptions = {},
): Promise<MatchOdds[]> {
  const matches = await fetchSportteryMatches(opts)
  const out: MatchOdds[] = []
  for (const m of matches) {
    const home = toNum(m.had?.h)
    const draw = toNum(m.had?.d)
    const away = toNum(m.had?.a)
    if (home == null || draw == null || away == null) continue
    out.push({
      matchId: m.matchId,
      home,
      draw,
      away,
      timestamp: m.lastUpdateTime,
    })
  }
  return out
}

/** Parse a vendor odds string ("1.86") into a number, or undefined if blank/invalid. */
function toNum(s: string | undefined): number | undefined {
  if (s == null || s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Combine a 'YYYY-MM-DD' date and 'HH:MM:SS' time into an ISO timestamp. */
function combineDateTime(date: string, time: string): string {
  if (!date) return ''
  const t = time?.slice(0, 5) ?? ''
  // Sporttery dates are in Beijing time (UTC+8); encode the offset explicitly
  // so downstream consumers can localize correctly.
  return t ? `${date}T${t}:00+08:00` : `${date}T00:00:00+08:00`
}
