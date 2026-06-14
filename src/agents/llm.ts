/**
 * LlmAgent — pure model prediction.
 *
 * Blind by default (`seeOdds: false`); when `seeOdds` is true the user prompt
 * includes market odds. The model client call is injected via `completer` so
 * tests supply canned JSON; in production the real OpenAI-compatible client
 * is used.
 */
import type { OpenAI as OpenAIType } from 'openai'
import type { Prediction } from '../domain/types.js'
import { createClient, type Completer, predictViaClient } from './client.js'
import {
  buildSystemPrompt,
  buildUserPrompt,
} from './prompt.js'
import type { Agent, AgentConfig, MatchContext } from './types.js'

export class LlmAgent implements Agent {
  private readonly client: OpenAIType

  constructor(
    public readonly config: AgentConfig,
    client?: OpenAIType,
    private readonly completer?: Completer,
  ) {
    this.client = client ?? createClient(config)
  }

  async predict(ctx: MatchContext): Promise<Prediction> {
    const system = buildSystemPrompt()
    const user = buildUserPrompt(ctx, this.config.seeOdds ?? false)
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
}
