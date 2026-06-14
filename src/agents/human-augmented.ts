/**
 * HumanAugmentedAgent — an LLM agent augmented with human analyst notes.
 *
 * Like `LlmAgent`, but the user prompt is extended with notes read from
 * `<dataDir>/agents/{id}/notes/{matchId}.txt` (empty string when absent).
 * The human shapes the analysis; the model still produces calibrated
 * probabilities; the engine still computes the bets.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { OpenAI as OpenAIType } from 'openai'
import type { Prediction } from '../domain/types.js'
import { createClient, type Completer, predictViaClient } from './client.js'
import { buildHumanAugmentedUserPrompt, buildSystemPrompt } from './prompt.js'
import type { Agent, AgentConfig, MatchContext } from './types.js'

export class HumanAugmentedAgent implements Agent {
  private readonly client: OpenAIType

  constructor(
    public readonly config: AgentConfig,
    private readonly dataDir: string,
    client?: OpenAIType,
    private readonly completer?: Completer,
  ) {
    this.client = client ?? createClient(config)
  }

  async predict(ctx: MatchContext): Promise<Prediction> {
    const notes = await this.readNotes(ctx.fixture.id)
    const system = buildSystemPrompt()
    const user = buildHumanAugmentedUserPrompt(
      ctx,
      this.config.seeOdds ?? false,
      notes,
    )
    return predictViaClient(
      this.client,
      this.config.model!,
      system,
      user,
      this.config.id,
      ctx.fixture.id,
      this.completer,
    )
  }

  private async readNotes(matchId: string): Promise<string> {
    const file = path.join(
      this.dataDir,
      'agents',
      this.config.id,
      'notes',
      `${matchId}.txt`,
    )
    try {
      return await fs.readFile(file, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw e
    }
  }
}
