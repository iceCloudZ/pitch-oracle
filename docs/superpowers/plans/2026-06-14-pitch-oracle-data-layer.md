# pitch-oracle Data Layer Implementation Plan (Plan 2 of 4)

> **Execution note:** Implementer authors the full code from these specs (interfaces + API shapes + normalization + tests). Write code + unit tests per module, typecheck your own files, commit per module. **Do NOT run the integrated full `npm test` between modules** — a single end-to-end test pass happens after all of Plans 2–4 land. Live API calls are NOT exercised here (no keys); tests use injected canned responses.

**Goal:** Typed, cached, retrying adapters over the-odds-api (odds + scores), football-data.org (fixtures), and Brave Search (→ DuckDuckGo fallback). Pure, mock-tested.

**Architecture:** Each adapter normalizes a vendor response into our domain types (`MatchOdds`, `RegularTimeResult`) or data-layer types (`Fixture`, `NewsItem`). All adapters accept an injectable `fetchImpl` (default `globalThis.fetch`) for deterministic tests. A small TTL file-cache (built on `src/store/json.ts`) wraps producers to avoid hammering APIs. A shared `fetchJson` helper adds timeout + exponential-backoff retry.

**Tech:** TS ESM, `globalThis.fetch` (Node 20+), Vitest. No new deps.

---

## File Structure

```
src/data/
  types.ts        # Fixture, NewsItem (+ request option types)
  http.ts         # fetchJson(url, opts): retry + backoff + timeout; injectable fetchImpl
  cache.ts        # cached<T>(key, ttlMs, producer): TTL file cache via store/json
  fixtures.ts     # fetchFixtures(opts): football-data.org v4 -> Fixture[]
  odds.ts         # fetchOdds(opts): the-odds-api v4 h2h -> MatchOdds[]
  results.ts      # fetchResults(opts): the-odds-api v4 scores -> RegularTimeResult[]
  news.ts         # fetchNews(opts): Brave -> NewsItem[]; DDG fallback when no key
  index.ts        # barrel
tests co-located as *.test.ts
```

## Module specs

### `src/data/types.ts`
```ts
export interface Fixture {
  id: string
  homeTeam: string
  awayTeam: string
  commenceTime: string // ISO
  competition: string
  status: string // 'SCHEDULED' | 'IN_PLAY' | 'FINISHED' | ... (vendor values, pass-through)
}
export interface NewsItem {
  title: string
  url: string
  description: string
}
export interface AdapterOptions {
  apiKey: string
  fetchImpl?: typeof fetch
}
```

### `src/data/http.ts`
```ts
export interface FetchJsonOptions {
  headers?: Record<string, string>
  timeoutMs?: number   // default 10000
  retries?: number     // default 3
  fetchImpl?: typeof fetch
}
/** fetch + parse JSON. Throws on non-2xx after `retries` retries with exponential backoff (base 500ms, jittered by attempt). */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T>
```
Implementation: loop attempts; AbortController for timeout; on failure (network, non-2xx, 429) sleep `500 * 2^(attempt)` (cap ~8s) and retry; throw last error. Use a module-local `sleep(ms)` (Promise + setTimeout). Tests inject `fetchImpl` that fails twice then succeeds, asserting 3 attempts and a success.

### `src/data/cache.ts`
```ts
import { readJson, writeJsonAtomic } from '../store/json.js'
export interface CacheEntry<T> { expiresAt: number; data: T }
/** If a fresh cached value exists at <cacheDir>/<key>.json (now < expiresAt), return it; else call producer(), store with ttl, return it. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
  cacheDir = 'data/cache',
): Promise<T>
```
Use `Date.now()` (normal Node code — fine). Tests use `mkdtemp` temp dir + a producer spy to assert producer called once on hit-after-miss and not called on hit.

### `src/data/fixtures.ts` — football-data.org v4
- Endpoint: `GET https://api.football-data.org/v4/competitions/{competition}/matches?status=SCHEDULED,IN_PLAY,FINISHED`, header `X-Auth-Token: {apiKey}`.
- Vendor shape (excerpt): `{ matches: [{ id, utcDate, status, homeTeam: { name }, awayTeam: { name } }] }`.
- `fetchFixtures(opts: AdapterOptions & { competition: string }): Promise<Fixture[]>` — map each match → `{ id: String(m.id), homeTeam, awayTeam, commenceTime: m.utcDate, competition, status: m.status }`.
- Test: inject `fetchImpl` returning `{ matches: [ {id:1, utcDate:'2026-06-14T00:00:00Z', status:'SCHEDULED', homeTeam:{name:'Netherlands'}, awayTeam:{name:'Japan'} } ] }`; assert one Fixture with normalized fields.

### `src/data/odds.ts` — the-odds-api v4 (h2h / 1x2)
- Endpoint: `GET https://api.the-odds-api.com/v4/sports/{sportKey}/odds/?regions={region}&markets=h2h&oddsFormat=decimal&apiKey={apiKey}`.
- Vendor shape: array of `{ id, sport_key, commence_time, home_team, away_team, bookmakers: [{ key, title, markets: [{ key:'h2h', outcomes: [{ name, price }] }] }] }`. Each outcome `name` is the team name, or `'Draw'`.
- Pick a **canonical bookmaker** (prefer `pinnacle` if present, else `bookmakers[0]`). From its h2h outcomes: home price = outcome whose name === home_team; away price = name === away_team; draw price = name === 'Draw' (omit draw if absent).
- `fetchOdds(opts: AdapterOptions & { sportKey: string; region?: string }): Promise<MatchOdds[]>` → map each event → `MatchOdds { matchId: String(ev.id), home, draw (default 0 if absent — but MatchOdds requires >1; if draw absent, set draw price to a large sentinel? No — for 1x2 WC it's always present) , away, timestamp: ev.commence_time }`. For WC group stage, draw is always offered. If draw price missing, throw/ skip — keep simple: require draw, else skip event (log).
- Test: inject fetchImpl returning one event with Pinnacle + another bookmaker; assert Pinnacle chosen and MatchOdds mapped correctly (home/draw/away decimal prices).

### `src/data/results.ts` — the-odds-api v4 scores
- Endpoint: `GET https://api.the-odds-api.com/v4/sports/{sportKey}/scores/?daysFrom={daysFrom}&apiKey={apiKey}`.
- Vendor shape: array of `{ id, sport_key, commence_time, completed: boolean, home_team, away_team, scores: [{ name, score }] }`.
- Filter `completed === true`. For each, find home/away score by matching `scores[].name` to `home_team`/`away_team`.
- `fetchResults(opts: AdapterOptions & { sportKey: string; daysFrom?: number }): Promise<RegularTimeResult[]>` → `{ matchId: String(ev.id), homeScore, awayScore }`.
- **Caveat (document in a comment):** the-odds-api `scores` is the **final** score; for knockout matches it may include extra time. For group stage (MVP scope) this equals regular time. Knockout regular-time handling deferred.

### `src/data/news.ts` — Brave Search (→ DuckDuckGo fallback)
- Brave: `GET https://api.search.brave.com/res/v1/web/search?q={query}&count=10`, header `X-Subscription-Token: {apiKey}`. Shape: `{ web: { results: [{ title, url, description }] } }`.
- `fetchNews(opts: { query: string; apiKey?: string; fetchImpl?: typeof fetch }): Promise<NewsItem[]>`:
  - If `apiKey` present → Brave; map `web.results` → `{ title, url, description }`.
  - Else → DuckDuckGo fallback: `GET https://html.duckduckgo.com/html/?q={query}` (best-effort HTML scrape). Parse the result anchors/snippets with a simple regex over `<a class="result__a" href="...">title</a>` + `<a class="result__snippet">desc</a>`. Best-effort, may be fragile — wrap in try/catch and return `[]` on failure (never throw for the fallback).
- Tests: Brave path with injected fetchImpl returning `{ web: { results: [...] } }`; DDG path with a small canned HTML string asserting parsed items; DDG failure → `[]`.

### `src/data/index.ts`
```ts
export * from './types.js'
export * from './http.js'
export * from './cache.js'
export * from './fixtures.js'
export * from './odds.js'
export * from './results.js'
export * from './news.js'
```

## Self-check before reporting
- Every adapter accepts `fetchImpl` and is unit-tested with canned data (no network).
- `http.ts` retry tested (fail-then-succeed).
- `cache.ts` TTL tested (miss→produce→hit).
- `tsc --noEmit` clean for the files you wrote.
- Commit per module: `feat(data): add <module>` (+ trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
- Do NOT run the full `npm test`; a single integrated pass runs after Plans 2–4.

## Exit criteria (checked at the final integrated pass)
- `npm run typecheck` clean.
- All new `src/data/*.test.ts` pass.
- No real network calls in any test.
