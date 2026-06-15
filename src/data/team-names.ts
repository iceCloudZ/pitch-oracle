/**
 * Chinese ↔ English team-name mapping for cross-source joining.
 *
 * The sporttery (体彩) API returns Chinese team names (荷兰/日本); football-data.org
 * returns English names (Netherlands/Japan). To settle predictions made against
 * sporttery fixtures using football-data results, both sides must be normalized
 * to a single canonical key. This module owns that mapping.
 *
 * `normalizeTeamKey` accepts either a Chinese name or an English name and returns
 * the uppercase canonical key, or `null` when no alias matches. Mapped teams that
 * cannot be joined are skipped by the caller (never crash) — the table is meant
 * to be extended as gaps surface.
 */

/**
 * Canonical key → accepted aliases (Chinese and English variants).
 * The canonical key is the uppercase football-data.org English name, which is
 * also a valid alias of itself (matched via the direct-English fallback).
 */
export const SPORTTERY_TEAM_ALIASES: Record<string, string[]> = {
  // Group A
  MEXICO: ['墨西哥'],
  CANADA: ['加拿大'],
  USA: ['美国', 'United States'],
  PANAMA: ['巴拿马'],

  // Group B
  ECUADOR: ['厄瓜多尔'],
  SENEGAL: ['塞内加尔'],
  NETHERLANDS: ['荷兰'],
  QATAR: ['卡塔尔'],

  // Group C
  ARGENTINA: ['阿根廷'],
  SAUDI_ARABIA: ['沙特', '沙特阿拉伯', 'Saudi Arabia'],
  DENMARK: ['丹麦'],
  TUNISIA: ['突尼斯'],

  // Group D
  FRANCE: ['法国'],
  AUSTRALIA: ['澳大利亚', '澳洲'],

  // Group E
  SPAIN: ['西班牙'],
  GERMANY: ['德国', '德意志'],
  JAPAN: ['日本'],
  COSTA_RICA: ['哥斯达黎加'],

  // Group F
  BELGIUM: ['比利时'],
  MOROCCO: ['摩洛哥'],
  CROATIA: ['克罗地亚'],

  // Group G
  BRAZIL: ['巴西'],
  SERBIA: ['塞尔维亚'],
  SWITZERLAND: ['瑞士'],
  CAMEROON: ['喀麦隆'],

  // Group H
  PORTUGAL: ['葡萄牙'],
  GHANA: ['加纳'],
  URUGUAY: ['乌拉圭'],
  SOUTH_KOREA: ['韩国', '南韩', 'Korea Republic', 'Korea South'],

  // Group I
  IRAN: ['伊朗'],
  ENGLAND: ['英格兰'],
  NEW_ZEALAND: ['新西兰'],
  WALES: ['威尔士'],

  // Group J
  COLOMBIA: ['哥伦比亚'],
  PERU: ['秘鲁'],
  UZBEKISTAN: ['乌兹别克', '乌兹别克斯坦'],
  IVORY_COAST: ['科特迪瓦', '象牙海岸', 'Ivory Coast', "Côte d'Ivoire", 'Cote d\'Ivoire'],

  // Group K
  ITALY: ['意大利'],
  AUSTRIA: ['奥地利'],
  NIGERIA: ['尼日利亚'],
  JORDAN: ['约旦'],

  // Group L
  POLAND: ['波兰'],
  EGYPT: ['埃及'],
  PARAGUAY: ['巴拉圭'],
  CAPE_VERDE: ['佛得角', '佛得角群岛', 'Cape Verde Islands'],

  // Group M
  UKRAINE: ['乌克兰'],
  ALGERIA: ['阿尔及利亚', '阿尔及利'],
  RWANDA: ['卢旺达'],
  CURACAO: ['库拉索', "Curaçao", 'Curacao'],

  // Group N
  SWEDEN: ['瑞典'],
  NORWAY: ['挪威'],
  IRAQ: ['伊拉克'],
  CONGO_DR: ['刚果金', '刚果(金)', '刚果民主共和国', 'Congo DR', 'DR Congo'],

  // Additional WC 2026 sides not in the core 13 match set above.
  SOUTH_AFRICA: ['南非', 'South Africa'],
  CZECHIA: ['捷克', 'Czechia', 'Czech Republic'],
  BOSNIA_HERZEGOVINA: ['波黑', 'Bosnia-Herzegovina', 'Bosnia and Herzegovina'],
  HAITI: ['海地'],
  SCOTLAND: ['苏格兰'],
  TURKEY: ['土耳其', 'Türkiye', 'Turkiye'],
}

/** Precomputed reverse index: alias → canonical key. Built once at load. */
const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [canonical, aliases] of Object.entries(SPORTTERY_TEAM_ALIASES)) {
    // The canonical English name itself is a valid key.
    m.set(canonical, canonical)
    for (const alias of aliases) m.set(alias, canonical)
  }
  return m
})()

/**
 * Normalize a team name (Chinese or English) to its uppercase canonical key.
 * Matching is case-insensitive on Latin characters. Returns `null` when no
 * alias matches — callers skip the match rather than crashing.
 */
export function normalizeTeamKey(name: string): string | null {
  if (!name) return null
  const trimmed = name.trim()
  if (!trimmed) return null

  // Exact match first.
  const exact = ALIAS_INDEX.get(trimmed)
  if (exact) return exact

  // Case-insensitive fallback for Latin-script names/aliases.
  for (const [alias, canonical] of ALIAS_INDEX) {
    if (/^[A-Za-z0-9 _'-]+$/u.test(alias) && alias.toLowerCase() === trimmed.toLowerCase()) {
      return canonical
    }
  }

  return null
}
