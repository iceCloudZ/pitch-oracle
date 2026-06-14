import { describe, expect, it } from 'vitest'
import * as data from './index.js'

describe('data barrel', () => {
  it('re-exports every adapter and helper', () => {
    expect(typeof data.fetchJson).toBe('function')
    expect(typeof data.cached).toBe('function')
    expect(typeof data.fetchFixtures).toBe('function')
    expect(typeof data.fetchOdds).toBe('function')
    expect(typeof data.fetchResults).toBe('function')
    expect(typeof data.fetchNews).toBe('function')
    expect(typeof data.parseDdgHtml).toBe('function')
    expect(typeof data.fetchSportteryFixtures).toBe('function')
    expect(typeof data.fetchSportteryOdds).toBe('function')
    expect(typeof data.fetchSportteryMatches).toBe('function')
    expect(typeof data.fetchFixturesResults).toBe('function')
    expect(typeof data.fetchFixturesResultsWithTeams).toBe('function')
    expect(typeof data.normalizeTeamKey).toBe('function')
  })

  it('exposes the option type families via type-only usage', () => {
    // Compile-time only: ensures the option interfaces are part of the surface.
    let _f: data.FetchFixturesOptions | undefined
    let _o: data.FetchOddsOptions | undefined
    let _r: data.FetchResultsOptions | undefined
    let _n: data.FetchNewsOptions | undefined
    let _j: data.FetchJsonOptions | undefined
    let _c: data.CacheEntry<number> | undefined
    let _s: data.FetchSportteryOptions | undefined
    let _fr: data.FetchFixturesResultsOptions | undefined
    void [_f, _o, _r, _n, _j, _c, _s, _fr]
    expect(true).toBe(true)
  })
})
