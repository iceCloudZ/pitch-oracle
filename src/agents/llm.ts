/**
 * LlmAgent — pure model prediction.
 *
 * Blind by default (`seeOdds: false`); when `seeOdds` is true the user prompt
 * includes market odds. The model client call is injected via `completer` so
 * tests supply canned JSON; in production the real OpenAI-compatible client
 * is used.
 *
 * The SDK client is constructed lazily (at predict time) when none is passed
 * in, so building agents from config never requires API keys to be present —
 * only an actual predict call needs them.
 */
import type { OpenAI as OpenAIType } from 'openai'
import type { Prediction } from '../domain/types.js'
import { createClient, type Completer, predictViaClient } from './client.js'
import { buildSystemPrompt, buildUserPrompt } from './prompt.js'
import type { Agent, AgentConfig, MatchContext } from './types.js'

export class LlmAgent implements Agent {
  private readonly injectedClient?: OpenAIType

  constructor(
    public readonly config: AgentConfig,
    client?: OpenAIType,
    private readonly completer?: Completer,
  ) {
    this.injectedClient = client
  }

  private get client(): OpenAIType {
    return this.injectedClient ?? createClient(this.config)
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
