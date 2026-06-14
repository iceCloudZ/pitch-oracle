import { describe, expect, it, vi } from 'vitest'
import { fetchTianApiNews, parseTeamsFromQuery } from './tianapi.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function item(title: string, url = 'https://x/' + title): { title: string; url: string; id: string } {
  return { title, url, id: title }
}

function feed(items: Array<{ title: string; url: string; id: string }>) {
  return { code: 200, msg: 'success', result: { newslist: items } }
}

describe('parseTeamsFromQuery', () => {
  it('parses "X vs Y preview" into the two sides', () => {
    expect(parseTeamsFromQuery('荷兰 vs 日本 preview')).toEqual(['荷兰', '日本'])
    expect(parseTeamsFromQuery('科特迪瓦 vs. 厄瓜多尔 preview')).toEqual(['科特迪瓦', '厄瓜多尔'])
  })
  it('returns [] for a query that is not a fixture shape', () => {
    expect(parseTeamsFromQuery('just some search')).toEqual([])
    expect(parseTeamsFromQuery('')).toEqual([])
  })
})

describe('fetchTianApiNews', () => {
  it('filters the feed to titles mentioning either team', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/football/index')
      expect(url).toContain('key=k1')
      expect(url).toContain('page=1')
      return jsonResponse(
        feed([
          item('死亡之组开战!两大神数据支持 荷兰或小胜日本'),
          item('头名之争？神数据或助巴西力克摩洛哥抢占先机'),
          item('世界杯开门红 韩国赢得让人心服口服'),
          item('暗战打响 伊朗要将世界杯变成反美战场'),
        ]),
      )
    }) as unknown as typeof fetch

    const news = await fetchTianApiNews({
      query: '荷兰 vs 日本 preview',
      apiKey: 'k1',
      fetchImpl,
    })
    expect(news).toHaveLength(1)
    expect(news[0].title).toContain('荷兰')
    expect(news[0].title).toContain('日本')
    expect(news[0].url).toBeTruthy()
  })

  it('stops paging once 6 matched items are collected', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      return jsonResponse(
        feed([
          item(`荷兰前瞻 ${calls}-a`),
          item(`日本备战 ${calls}-b`),
          item('无关新闻 a'),
          item('无关新闻 b'),
        ]),
      )
    }) as unknown as typeof fetch

    const news = await fetchTianApiNews({
      query: '荷兰 vs 日本 preview',
      apiKey: 'k1',
      num: 4,
      maxPages: 5,
      fetchImpl,
    })
    expect(news.length).toBe(6)
    expect(news.every((n) => n.title.includes('荷兰') || n.title.includes('日本'))).toBe(true)
    // 2 matches per page -> need 3 pages to reach 6.
    expect(calls).toBe(3)
  })

  it('falls back to the latest feed when no team names parse', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(feed([item('世界杯揭幕战'), item('穆里尼奥回归皇马')])),
    ) as unknown as typeof fetch
    const news = await fetchTianApiNews({ query: 'just a phrase', apiKey: 'k1', fetchImpl })
    expect(news).toHaveLength(2)
  })

  it('falls back to the latest feed when nothing matches the teams', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(feed([item('世界杯揭幕战'), item('韩国开门红')])),
    ) as unknown as typeof fetch
    const news = await fetchTianApiNews({ query: '荷兰 vs 日本 preview', apiKey: 'k1', fetchImpl })
    // No title mentions 荷兰/日本 -> return latest feed as general context.
    expect(news).toHaveLength(2)
  })

  it('returns [] on a non-200 code without throwing', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: 160, msg: '尚未申请该API' }),
    ) as unknown as typeof fetch
    const news = await fetchTianApiNews({ query: '荷兰 vs 日本 preview', apiKey: 'k1', fetchImpl })
    expect(news).toEqual([])
  })

  it('returns [] on a network error without throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed')
    }) as unknown as typeof fetch
    const news = await fetchTianApiNews({ query: '荷兰 vs 日本 preview', apiKey: 'k1', fetchImpl })
    expect(news).toEqual([])
  })
})
