import { describe, expect, it } from 'vitest'
import { normalizeTeamKey, SPORTTERY_TEAM_ALIASES } from './team-names.js'

describe('normalizeTeamKey', () => {
  it('matches a Chinese alias to its canonical English key', () => {
    expect(normalizeTeamKey('荷兰')).toBe('NETHERLANDS')
    expect(normalizeTeamKey('日本')).toBe('JAPAN')
    expect(normalizeTeamKey('沙特')).toBe('SAUDI_ARABIA')
  })

  it('matches multiple Chinese aliases for the same team', () => {
    expect(normalizeTeamKey('沙特阿拉伯')).toBe('SAUDI_ARABIA')
    expect(normalizeTeamKey('科特迪瓦')).toBe('IVORY_COAST')
    expect(normalizeTeamKey('象牙海岸')).toBe('IVORY_COAST')
  })

  it('matches the canonical English name directly (exact)', () => {
    expect(normalizeTeamKey('Netherlands')).toBe('NETHERLANDS')
    expect(normalizeTeamKey('Japan')).toBe('JAPAN')
  })

  it('matches an English name case-insensitively', () => {
    expect(normalizeTeamKey('netherlands')).toBe('NETHERLANDS')
    expect(normalizeTeamKey('NETHERLANDS')).toBe('NETHERLANDS')
    expect(normalizeTeamKey('Cape Verde Islands')).toBe('CAPE_VERDE')
  })

  it('matches the English name "Ivory Coast" (football-data.org wording)', () => {
    expect(normalizeTeamKey('Ivory Coast')).toBe('IVORY_COAST')
    expect(normalizeTeamKey("Côte d'Ivoire")).toBe('IVORY_COAST')
    expect(normalizeTeamKey('科特迪瓦')).toBe('IVORY_COAST')
  })

  it('matches tricky aliases: 刚果金 and Congo DR both resolve to CONGO_DR', () => {
    expect(normalizeTeamKey('刚果金')).toBe('CONGO_DR')
    expect(normalizeTeamKey('Congo DR')).toBe('CONGO_DR')
    expect(normalizeTeamKey('库拉索')).toBe('CURACAO')
  })

  it('trims whitespace before matching', () => {
    expect(normalizeTeamKey('  荷兰  ')).toBe('NETHERLANDS')
    expect(normalizeTeamKey(' Japan')).toBe('JAPAN')
  })

  it('returns null for an unknown team name', () => {
    expect(normalizeTeamKey('火星队')).toBeNull()
    expect(normalizeTeamKey('Atlantis')).toBeNull()
  })

  it('returns null for empty / whitespace input', () => {
    expect(normalizeTeamKey('')).toBeNull()
    expect(normalizeTeamKey('   ')).toBeNull()
  })
})

describe('SPORTTERY_TEAM_ALIASES', () => {
  it('covers the World Cup 2026 sides seen in the live feed', () => {
    const required = [
      'NETHERLANDS', 'JAPAN', 'IVORY_COAST', 'ECUADOR', 'SWEDEN', 'TUNISIA',
      'BELGIUM', 'EGYPT', 'SAUDI_ARABIA', 'URUGUAY', 'IRAN', 'NEW_ZEALAND',
      'FRANCE', 'SENEGAL', 'ARGENTINA', 'ALGERIA', 'AUSTRIA', 'JORDAN',
      'PORTUGAL', 'CONGO_DR', 'ENGLAND', 'CROATIA', 'GHANA', 'PANAMA',
      'UZBEKISTAN', 'COLOMBIA', 'CAPE_VERDE', 'CURACAO', 'GERMANY',
    ]
    for (const key of required) {
      expect(SPORTTERY_TEAM_ALIASES[key], `missing canonical key ${key}`).toBeDefined()
    }
  })
})
