/**
 * OpenAI-compatible model client + JSON-mode prediction helper.
 *
 * `createClient` builds an SDK client pointed at the agent's `baseURL` with the
 * key resolved from `cfg.apiKeyEnv` at call time (the key never lives in
 * config — only the env-var name does).
 *
 * `predictViaClient` makes one chat call requesting `json_object` output,
 * parses + Zod-validates the body against `predictionSchema`, and retries
 * ONCE on validation failure with a corrective nudge before throwing.
 *
 * The SDK call is injectable via `completer` so tests never hit the network:
 * when omitted, the real client is used.
 */
import OpenAI, { type OpenAI as OpenAIType } from 'openai'
import { modelPredictionSchema } from '../domain/schemas.js'
import type { Prediction } from '../domain/types.js'
import type { AgentConfig } from './types.js'

/** Injectable completion function: given chat params, return raw content. */
export type Completer = (params: {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  response_format?: { type: 'json_object' }
}) => Promise<string>

export function createClient(cfg: AgentConfig): OpenAIType {
  return new OpenAI({
    baseURL: cfg.baseURL,
    apiKey: process.env[cfg.apiKeyEnv ?? ''] ?? '',
    // Without a timeout a hung connection stalls the whole predict pass (seen
    // with Qwen's thinking mode). 60s is ample for a single prediction.
    timeout: 60_000,
    maxRetries: 0,
  })
}

function describeIssues(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err) {
    try {
      return JSON.stringify((err as { issues: unknown[] }).issues)
    } catch {
      /* fall through */
    }
  }
  return String(err)
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * One chat call requesting JSON; parses + Zod-validates into a `Prediction`.
 * On Zod (or JSON.parse) failure, retries ONCE with a corrective nudge that
 * quotes the bad output; on a second failure throws. A test-supplied
 * `completer` (returning the raw content string) bypasses the real SDK
 * entirely — no network, no API key required.
 */
export async function predictViaClient(
  client: OpenAIType,
  model: string,
  system: string,
  user: string,
  agentId: string,
  matchId: string,
  completer?: Completer,
  baseURL?: string,
): Promise<Prediction> {
  const response_format = { type: 'json_object' as const }
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  // Qwen (DashScope) defaults to enable_thinking=true, which makes each call
  // slow and prone to hanging on structured output. Disable it — we want fast,
  // deterministic JSON, not chain-of-thought.
  const isQwen = baseURL?.includes('dashscope') ?? false

  async function callOnce(messages: ChatMessage[]): Promise<string> {
    if (completer) return completer({ model, messages, response_format })
    const params: Record<string, unknown> = {
      model,
      messages,
      response_format,
    }
    if (isQwen) params.enable_thinking = false
    const completion = await client.chat.completions.create(
      params as unknown as Parameters<typeof client.chat.completions.create>[0],
    )
    if (!('choices' in completion)) {
      throw new Error(`agent "${agentId}" match "${matchId}": unexpected streaming response`)
    }
    const content = completion.choices[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error(
        `agent "${agentId}" match "${matchId}": model returned no string content`,
      )
    }
    return content
  }

  const firstRaw = await callOnce(baseMessages)
  const firstParsed = tryParseAndValidate(firstRaw, agentId, matchId)
  if ('ok' in firstParsed) return firstParsed.ok

  // Retry once: quote the bad output and ask for valid JSON.
  const retryMessages: ChatMessage[] = [
    ...baseMessages,
    { role: 'assistant', content: firstRaw },
    {
      role: 'user',
      content: `Your previous JSON was invalid: ${describeIssues(
        firstParsed.err,
      )}. Return ONLY valid JSON matching the required schema.`,
    },
  ]
  const retryRaw = await callOnce(retryMessages)
  const retryParsed = tryParseAndValidate(retryRaw, agentId, matchId)
  if ('ok' in retryParsed) return retryParsed.ok

  throw new Error(
    `agent "${agentId}" match "${matchId}": prediction failed validation after retry: ${describeIssues(
      retryParsed.err,
    )}`,
  )
}

/**
 * Parse + validate the model's JSON against `modelPredictionSchema` (the keys
 * the prompt asks for), then stamp the engine-managed identity fields. Returns
 * `{ok: Prediction}` on success or `{err: unknown}` describing the failure.
 */
function tryParseAndValidate(
  raw: string,
  agentId: string,
  matchId: string,
): { ok: Prediction } | { err: unknown } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { err: new Error(`model output was not valid JSON: ${raw}`) }
  }
  const validated = modelPredictionSchema.safeParse(parsed)
  if (!validated.success) return { err: validated.error }
  return {
    ok: {
      ...validated.data,
      agentId,
      matchId,
      createdAt: new Date().toISOString(),
    },
  }
}
