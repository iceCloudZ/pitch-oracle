/**
 * News adapter: Brave Search primary, DuckDuckGo (HTML) best-effort fallback.
 *
 * Brave:   GET https://api.search.brave.com/res/v1/web/search?q={query}&count=10
 *          Header: X-Subscription-Token: {apiKey}
 *          Shape: { web: { results: [{ title, url, description }] } }
 *
 * DDG:     GET https://html.duckduckgo.com/html/?q={query}
 *          Best-effort HTML scrape. Wrapped in try/catch — on ANY failure the
 *          fallback returns [] and never throws.
 */
import type { NewsItem } from './types.js'
import { fetchJson } from './http.js'

export interface FetchNewsOptions {
  query: string
  /** Brave API key. When absent the DuckDuckGo fallback is used. */
  apiKey?: string
  fetchImpl?: typeof fetch
}

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search'
const DDG_URL = 'https://html.duckduckgo.com/html/'

interface BraveResult {
  title: string
  url: string
  description: string
}
interface BraveResponse {
  web?: { results?: BraveResult[] }
}

export async function fetchNews(opts: FetchNewsOptions): Promise<NewsItem[]> {
  if (opts.apiKey) return fetchBrave(opts)
  return fetchDdg(opts)
}

async function fetchBrave(opts: FetchNewsOptions): Promise<NewsItem[]> {
  const url = new URL(BRAVE_URL)
  url.searchParams.set('q', opts.query)
  url.searchParams.set('count', '10')

  const body = await fetchJson<BraveResponse>(url.toString(), {
    headers: { 'X-Subscription-Token': opts.apiKey! },
    fetchImpl: opts.fetchImpl,
  })

  const results = body?.web?.results ?? []
  return results.map<NewsItem>((r) => ({
    title: r.title,
    url: r.url,
    description: r.description ?? '',
  }))
}

/**
 * Best-effort DuckDuckGo HTML scrape. Parses result anchors/snippets with a
 * tolerant regex. NEVER throws: on any error (network, parse, unexpected shape)
 * it resolves to [].
 */
async function fetchDdg(opts: FetchNewsOptions): Promise<NewsItem[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const url = new URL(DDG_URL)
  url.searchParams.set('q', opts.query)

  try {
    const response = await fetchImpl(url.toString())
    if (!response.ok) return []
    const html = await response.text()
    return parseDdgHtml(html)
  } catch {
    return []
  }
}

/**
 * Tolerant DDG HTML parser. Extracts `<a class="result__a" href="...">title</a>`
 * paired with the following `<a class="result__snippet">desc</a>`. Best-effort;
 * malformed input simply yields fewer items.
 */
export function parseDdgHtml(html: string): NewsItem[] {
  const items: NewsItem[] = []
  // Match a result__a anchor and capture its href + inner text.
  const linkRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  // Match a result__snippet anchor and capture its inner text.
  const snippetRe =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

  const links: Array<{ url: string; title: string; index: number }> = []
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const rawUrl = m[1]
    const title = stripTags(m[2]).trim()
    // DDG wraps the real URL in a redirect like //duckduckgo.com/l/?uddg=<encoded>
    const url = resolveDdgUrl(rawUrl)
    if (title && url) {
      links.push({ url, title, index: m.index })
    }
  }

  // Build a position-sorted list of snippets so we can pair each link with the
  // nearest following snippet.
  const snippets: Array<{ text: string; index: number }> = []
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push({ text: stripTags(m[1]).trim(), index: m.index })
  }

  for (const link of links) {
    const desc =
      snippets
        .filter((s) => s.index > link.index)
        .sort((a, b) => a.index - b.index)[0]?.text ?? ''
    items.push({ title: link.title, url: link.url, description: desc })
    if (items.length >= 10) break
  }
  return items
}

/** Resolve a raw DDG href to a usable URL (unwrap the l/?uddg= redirect). */
function resolveDdgUrl(raw: string): string {
  if (!raw) return ''
  try {
    // DuckDuckGo anchors look like "//duckduckgo.com/l/?uddg=<encoded>&rut=..."
    const withProto = raw.startsWith('//') ? `https:${raw}` : raw
    const u = new URL(withProto)
    if (u.pathname === '/l/' || u.pathname.endsWith('/l')) {
      const target = u.searchParams.get('uddg')
      if (target) {
        try {
          return decodeURIComponent(target)
        } catch {
          return target
        }
      }
    }
    return withProto
  } catch {
    return raw
  }
}

/** Strip HTML tags and collapse whitespace. */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
