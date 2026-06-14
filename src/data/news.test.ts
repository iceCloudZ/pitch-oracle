import { describe, expect, it, vi } from 'vitest'
import { fetchNews, parseDdgHtml } from './news.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

describe('fetchNews — Brave path', () => {
  it('maps Brave web.results to NewsItem[]', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('api.search.brave.com/res/v1/web/search')
      expect(url).toContain('q=world+cup')
      expect(url).toContain('count=10')
      expect(init?.headers).toEqual({ 'X-Subscription-Token': 'brave-key' })
      return jsonResponse({
        web: {
          results: [
            {
              title: 'WC preview',
              url: 'https://example.com/a',
              description: 'A preview of the tournament.',
            },
            {
              title: 'Squad news',
              url: 'https://example.com/b',
              description: '',
            },
          ],
        },
      })
    }) as unknown as typeof fetch

    const news = await fetchNews({
      query: 'world cup',
      apiKey: 'brave-key',
      fetchImpl,
    })
    expect(news).toEqual([
      {
        title: 'WC preview',
        url: 'https://example.com/a',
        description: 'A preview of the tournament.',
      },
      {
        title: 'Squad news',
        url: 'https://example.com/b',
        description: '',
      },
    ])
  })

  it('returns [] when Brave has no results', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ web: { results: [] } })) as unknown as typeof fetch
    const news = await fetchNews({ query: 'x', apiKey: 'k', fetchImpl })
    expect(news).toEqual([])
  })
})

describe('fetchNews — DuckDuckGo fallback', () => {
  it('parses canned DDG HTML into NewsItem[]', async () => {
    const html = `
      <html><body>
        <div class="result">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone&rut=abc">First <b>Title</b></a>
          <a class="result__snippet">First &amp; description here</a>
        </div>
        <div class="result">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ftwo&rut=def">Second Title</a>
          <a class="result__snippet">Second description</a>
        </div>
      </body></html>`
    const fetchImpl = vi.fn(async () => textResponse(html)) as unknown as typeof fetch

    const news = await fetchNews({ query: 'world cup', fetchImpl })
    expect(news).toEqual([
      {
        title: 'First Title',
        url: 'https://example.com/one',
        description: 'First & description here',
      },
      {
        title: 'Second Title',
        url: 'https://example.com/two',
        description: 'Second description',
      },
    ])
  })

  it('parseDdgHtml handles malformed input gracefully', () => {
    expect(parseDdgHtml('')).toEqual([])
    expect(parseDdgHtml('<html>no results here</html>')).toEqual([])
    // Unclosed/odd anchors yield nothing rather than throwing.
    expect(parseDdgHtml('<a class="result__a">no href</a>')).toEqual([])
  })

  it('NEVER throws on fetch failure — returns []', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down')
    }) as unknown as typeof fetch
    const news = await fetchNews({ query: 'world cup', fetchImpl })
    expect(news).toEqual([])
  })

  it('NEVER throws on non-2xx — returns []', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('rate limited', { status: 429 }),
    ) as unknown as typeof fetch
    const news = await fetchNews({ query: 'world cup', fetchImpl })
    expect(news).toEqual([])
  })
})
