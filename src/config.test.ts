import { describe, expect, it } from 'vitest'
import {
  agentConfigSchema,
  agentConfigsFileSchema,
  loadAgentConfigs,
  loadTournamentConfig,
  tournamentConfigSchema,
} from './config.js'

const validAgentsFile = {
  agents: [
    {
      id: 'claude-blind',
      name: 'Claude (blind)',
      type: 'llm',
      baseURL: 'https://api.anthropic.com/v1/',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      model: 'claude-sonnet-4-6',
      seeOdds: false,
    },
    {
      id: 'me',
      name: 'You',
      type: 'manual', // no baseURL/model/apiKeyEnv
    },
    {
      id: 'me-ai',
      name: 'You + AI',
      type: 'human-augmented',
      baseURL: 'https://api.anthropic.com/v1/',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      model: 'claude-sonnet-4-6',
    },
  ],
}

describe('config schemas', () => {
  it('accepts valid agents including a manual agent with no model/endpoint', () => {
    expect(() => agentConfigsFileSchema.parse(validAgentsFile)).not.toThrow()
  })

  it('rejects an llm agent missing model', () => {
    const bad = {
      agents: [
        {
          id: 'x',
          name: 'X',
          type: 'llm',
          baseURL: 'https://api.anthropic.com/v1/',
          apiKeyEnv: 'K',
          // model missing
        },
      ],
    }
    expect(() => agentConfigsFileSchema.parse(bad)).toThrow(/model/)
  })

  it('rejects an llm agent missing apiKeyEnv', () => {
    const bad = {
      agents: [
        {
          id: 'x',
          name: 'X',
          type: 'llm',
          baseURL: 'https://api.anthropic.com/v1/',
          model: 'm',
        },
      ],
    }
    expect(() => agentConfigsFileSchema.parse(bad)).toThrow(/apiKeyEnv/)
  })

  it('rejects a bad agent type', () => {
    expect(() =>
      agentConfigSchema.parse({
        id: 'x',
        name: 'X',
        type: 'bogus',
        baseURL: 'u',
        apiKeyEnv: 'K',
        model: 'm',
      }),
    ).toThrow()
  })

  it('rejects unknown keys', () => {
    expect(() =>
      agentConfigSchema.parse({
        id: 'x',
        name: 'X',
        type: 'manual',
        bogus: true,
      }),
    ).toThrow()
  })

  it('accepts a valid tournament config', () => {
    expect(() =>
      tournamentConfigSchema.parse({
        sportKey: 'soccer_fifa_world_cup',
        competition: 'WC',
        region: 'eu',
        bankroll: 1000,
        footballDataApiKeyEnv: 'FOOTBALL_DATA_API_KEY',
        theOddsApiKeyEnv: 'THE_ODDS_API_KEY',
        braveApiKeyEnv: 'BRAVE_API_KEY',
        betting: { kellyFractionRatio: 0.25, maxPerBet: 0.1 },
      }),
    ).not.toThrow()
  })

  it('rejects non-positive bankroll', () => {
    expect(() =>
      tournamentConfigSchema.parse({
        sportKey: 's',
        competition: 'WC',
        bankroll: 0,
        footballDataApiKeyEnv: 'A',
        theOddsApiKeyEnv: 'B',
      }),
    ).toThrow()
  })
})

describe('loadAgentConfigs', () => {
  it('reads and parses a valid file', async () => {
    const readFile = async () => JSON.stringify(validAgentsFile)
    const agents = await loadAgentConfigs('ignored', { readFile })
    expect(agents).toHaveLength(3)
    expect(agents[1].type).toBe('manual')
    // manual agent genuinely omits model/endpoint
    expect(agents[1].model).toBeUndefined()
  })

  it('throws on malformed JSON config (missing model)', async () => {
    const bad = {
      agents: [
        { id: 'x', name: 'X', type: 'llm', baseURL: 'u', apiKeyEnv: 'K' },
      ],
    }
    const readFile = async () => JSON.stringify(bad)
    await expect(loadAgentConfigs('p', { readFile })).rejects.toThrow(/model/)
  })
})

describe('loadTournamentConfig', () => {
  it('reads and parses a valid file', async () => {
    const readFile = async () =>
      JSON.stringify({
        sportKey: 'soccer_fifa_world_cup',
        competition: 'WC',
        bankroll: 1000,
        footballDataApiKeyEnv: 'A',
        theOddsApiKeyEnv: 'B',
      })
    const cfg = await loadTournamentConfig('p', { readFile })
    expect(cfg.competition).toBe('WC')
    expect(cfg.bankroll).toBe(1000)
  })

  it('throws on missing competition', async () => {
    const readFile = async () =>
      JSON.stringify({
        sportKey: 's',
        bankroll: 1000,
        footballDataApiKeyEnv: 'A',
        theOddsApiKeyEnv: 'B',
      })
    await expect(loadTournamentConfig('p', { readFile })).rejects.toThrow()
  })
})
