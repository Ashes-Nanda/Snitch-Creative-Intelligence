// Server-only OpenRouter adapter. Never import this from browser code: it handles the API key.

export type ProviderErrorKind =
  | 'config'
  | 'auth'
  | 'credits'
  | 'rate_limited'
  | 'timeout'
  | 'model_unavailable'
  | 'unsupported_model'
  | 'bad_request'
  | 'provider'
  | 'invalid_response'
  | 'image_unavailable'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly transient: boolean
  readonly status?: number
  readonly retryAfterSeconds?: number
  /** Billed usage, when the provider charged for a call that still failed. */
  readonly usage?: Usage

  constructor(kind: ProviderErrorKind, message: string, transient = false, status?: number, retryAfterSeconds?: number, usage?: Usage) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    this.transient = transient
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
    this.usage = usage
  }
}

export interface VisionRequest {
  model: string
  prompt: string
  /** The image as a data URL, so the provider never has to fetch a third-party URL itself. */
  imageDataUrl: string
  /** JSON Schema the response must match. */
  schema: object
  signal: AbortSignal
  maxTokens?: number
}

export interface Usage {
  promptTokens: number | null
  completionTokens: number | null
  cost: number | null
  cachedPromptTokens: number | null
}

export interface VisionResponse {
  id: string | null
  model: string
  /** The upstream provider that served the request, when OpenRouter reports it. */
  provider: string | null
  text: string
  usage: Usage
}

/** Context for one provider call. Lets wrappers (e.g. telemetry) attribute calls without seeing prompts or images. */
export interface CallMeta {
  runId: string
  workflow: 'image_analysis'
  creativeId: string
  /** 1 for the first call, incremented on each retry. */
  attempt: number
  origin: 'live' | 'test'
}

export interface ModelInfo {
  id: string
  acceptsImages: boolean
  structuredOutputs: boolean
}

export interface OpenRouterClient {
  complete(request: VisionRequest, meta?: CallMeta): Promise<VisionResponse>
  modelInfo(model: string): Promise<ModelInfo | null>
}

const BASE_URL = 'https://openrouter.ai/api/v1'

function classify(status: number, message: string, retryAfter: number | undefined): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('auth', 'OpenRouter rejected the API key or request permissions.', false, status)
  if (status === 402) return new ProviderError('credits', 'OpenRouter reports insufficient credits for this key.', false, status)
  if (status === 429) return new ProviderError('rate_limited', 'OpenRouter rate limit reached.', true, status, retryAfter)
  if (status === 408) return new ProviderError('timeout', 'OpenRouter timed out.', true, status, retryAfter)
  if (status === 400 && /model/i.test(message)) return new ProviderError('model_unavailable', 'The configured model was not accepted by OpenRouter.', false, status)
  if (status === 400) return new ProviderError('bad_request', 'OpenRouter rejected the request as invalid.', false, status)
  if (status >= 500) return new ProviderError('provider', 'The model provider is unavailable or returned an error.', true, status, retryAfter)
  return new ProviderError('provider', `OpenRouter returned HTTP ${status}.`, false, status)
}

export function createOpenRouterClient({
  apiKey,
  fetch = globalThis.fetch,
  appTitle = 'Creative Intelligence prototype',
}: {
  apiKey: string
  fetch?: typeof globalThis.fetch
  appTitle?: string
}): OpenRouterClient {
  // Headers are built here and never logged or included in errors.
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': appTitle }
  let models: Promise<ModelInfo[]> | null = null

  return {
    async complete(req) {
      let res: Response
      try {
        res = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers,
          signal: req.signal,
          body: JSON.stringify({
            model: req.model,
            max_tokens: req.maxTokens ?? 1500,
            temperature: 0,
            usage: { include: true },
            response_format: { type: 'json_schema', json_schema: { name: 'creative_analysis', strict: true, schema: req.schema } },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: req.prompt },
                  { type: 'image_url', image_url: { url: req.imageDataUrl } },
                ],
              },
            ],
          }),
        })
      } catch (e) {
        if (req.signal.aborted || (e instanceof Error && e.name === 'AbortError')) throw new ProviderError('timeout', 'The analysis request timed out.', true)
        throw new ProviderError('provider', 'Could not reach OpenRouter.', true)
      }

      const body = (await res.json().catch(() => null)) as {
        id?: string
        model?: string
        provider?: string
        error?: { message?: string; code?: number }
        choices?: { message?: { content?: unknown } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } }
      } | null
      const retryAfter = Number(res.headers.get('retry-after')) || undefined
      if (!res.ok) throw classify(res.status, body?.error?.message ?? '', retryAfter)
      if (body?.error) throw classify(body.error.code ?? 502, body.error.message ?? '', retryAfter)

      const usage: Usage = {
        promptTokens: body?.usage?.prompt_tokens ?? null,
        completionTokens: body?.usage?.completion_tokens ?? null,
        cost: body?.usage?.cost ?? null,
        cachedPromptTokens: body?.usage?.prompt_tokens_details?.cached_tokens ?? null,
      }
      const content = body?.choices?.[0]?.message?.content
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => (p as { text?: string }).text ?? '').join('') : null
      if (!text) throw new ProviderError('invalid_response', 'The model returned no content.', false, res.status, undefined, usage)
      return { id: body?.id ?? null, model: body?.model ?? req.model, provider: body?.provider ?? null, text, usage }
    },

    async modelInfo(model) {
      models ??= fetch(`${BASE_URL}/models`, { headers })
        .then((r) => {
          if (!r.ok) throw classify(r.status, '', undefined)
          return r.json() as Promise<{ data: { id: string; architecture?: { input_modalities?: string[] }; supported_parameters?: string[] }[] }>
        })
        .then((b: { data: { id: string; architecture?: { input_modalities?: string[] }; supported_parameters?: string[] }[] }) =>
          b.data.map((m) => ({
            id: m.id,
            acceptsImages: m.architecture?.input_modalities?.includes('image') ?? false,
            structuredOutputs: m.supported_parameters?.includes('structured_outputs') ?? false,
          })),
        )
        .catch((e) => {
          models = null // don't cache a failed lookup
          throw e
        })
      return (await models).find((m) => m.id === model) ?? null
    },
  }
}
