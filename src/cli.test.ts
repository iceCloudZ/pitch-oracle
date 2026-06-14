import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAgents, initConfigs } from './cli.js'
import { HumanAugmentedAgent, LlmAgent, ManualAgent } from './agents/index.js'

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = path.join(
    process.cwd(),
    '.tmp-cli-test',
    `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await fs.mkdir(dir, { recursive: true })
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

describe('initConfigs', () => {
  it('writes agents.json + tournament.json when absent', async () => {
    await withTempDir(async (configDir) => {
      const written = await initConfigs(configDir)
      expect(written).toHaveLength(2)
      expect(written.some((p) => p.endsWith('agents.json'))).toBe(true)
      expect(written.some((p) => p.endsWith('tournament.json'))).toBe(true)

      const agents = JSON.parse(
        await fs.readFile(path.join(configDir, 'agents.json'), 'utf8'),
      )
      expect(agents.agents.length).toBe(4)
      expect(agents.agents.some((a: { type: string }) => a.type === 'manual')).toBe(true)

      const tournament = JSON.parse(
        await fs.readFile(path.join(configDir, 'tournament.json'), 'utf8'),
      )
      expect(tournament.competition).toBe('WC')
    })
  })

  it('does NOT overwrite existing files', async () => {
    await withTempDir(async (configDir) => {
      const agentsPath = path.join(configDir, 'agents.json')
      const tournamentPath = path.join(configDir, 'tournament.json')
      await fs.writeFile(
        agentsPath,
        JSON.stringify({ agents: [{ id: 'custom', name: 'Custom', type: 'manual' }] }),
        'utf8',
      )
      await fs.writeFile(
        tournamentPath,
        JSON.stringify({ sportKey: 'custom', competition: 'X', bankroll: 1, footballDataApiKeyEnv: 'A', theOddsApiKeyEnv: 'B' }),
        'utf8',
      )

      const written = await initConfigs(configDir)
      expect(written).toEqual([])

      const agents = JSON.parse(await fs.readFile(agentsPath, 'utf8'))
      expect(agents.agents[0].id).toBe('custom')
    })
  })

  it('writes valid JSON that passes config validation', async () => {
    await withTempDir(async (configDir) => {
      await initConfigs(configDir)
      const { loadAgentConfigs, loadTournamentConfig } = await import('./config.js')
      const agents = await loadAgentConfigs(path.join(configDir, 'agents.json'))
      const tournament = await loadTournamentConfig(path.join(configDir, 'tournament.json'))
      expect(agents.length).toBe(4)
      expect(tournament.bankroll).toBe(1000)
    })
  })
})

describe('buildAgents', () => {
  it('constructs the right Agent subclass per type', () => {
    const configs = [
      { id: 'llm1', name: 'L', type: 'llm' as const, baseURL: 'u', apiKeyEnv: 'K', model: 'm' },
      { id: 'me', name: 'M', type: 'manual' as const },
      { id: 'ha', name: 'H', type: 'human-augmented' as const, baseURL: 'u', apiKeyEnv: 'K', model: 'm' },
    ]
    const agents = buildAgents(configs, 'data')
    expect(agents[0]).toBeInstanceOf(LlmAgent)
    expect(agents[1]).toBeInstanceOf(ManualAgent)
    expect(agents[2]).toBeInstanceOf(HumanAugmentedAgent)
    // config is preserved.
    expect(agents[1].config.id).toBe('me')
  })
})
