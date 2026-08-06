import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import {
  buildCoachSummaryPrompt,
  CoachSummaryParseError,
  parseCoachSummaryBullets,
  type CoachFeedEntry,
} from '../src/lib/aiCoachSummary'

const ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022'
const OPENAI_MODEL = 'gpt-4o-mini'
const MAX_RESPONSE_TOKENS = 400
const ROUTE = '/api/coach-summary'

export type ProviderName = 'anthropic' | 'openai'

const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
}

interface CoachSummaryRequestBody {
  feed: CoachFeedEntry[]
  exerciseName: string
  totalReps: number
}

function isRequestBody(value: unknown): value is CoachSummaryRequestBody {
  if (!value || typeof value !== 'object') return false
  const body = value as Record<string, unknown>
  return (
    Array.isArray(body.feed) &&
    body.feed.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as CoachFeedEntry).message === 'string' &&
        typeof (entry as CoachFeedEntry).severity === 'string',
    ) &&
    typeof body.exerciseName === 'string' &&
    typeof body.totalReps === 'number'
  )
}

export interface CoachSummaryResult {
  status: number
  body: { bullets: string[] } | { error: string }
}

/** Calls Anthropic's Messages API and returns its raw text response. */
async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_RESPONSE_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
  }

  const data = (await response.json()) as { content: { type: string; text: string }[] }
  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

/** Calls OpenAI's Chat Completions API and returns its raw text response. */
async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: MAX_RESPONSE_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`)
  }

  const data = (await response.json()) as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message.content ?? ''
}

function resolveProviderName(env: NodeJS.ProcessEnv): ProviderName {
  return (env.AI_COACH_PROVIDER ?? '').toLowerCase() === 'openai' ? 'openai' : 'anthropic'
}

async function callProvider(name: ProviderName, prompt: string, apiKey: string): Promise<string> {
  return name === 'openai' ? callOpenAI(prompt, apiKey) : callAnthropic(prompt, apiKey)
}

/**
 * Pure request handler, testable without a real dev server: given a parsed
 * body and the current environment, decides what to respond with. `complete`
 * is injected so tests can stand in for the real provider call.
 */
export async function handleCoachSummaryRequest(
  rawBody: unknown,
  env: NodeJS.ProcessEnv,
  complete: (name: ProviderName, prompt: string, apiKey: string) => Promise<string> = callProvider,
): Promise<CoachSummaryResult> {
  if (!isRequestBody(rawBody)) {
    return {
      status: 400,
      body: { error: 'Expected { feed: {message, severity}[], exerciseName, totalReps }' },
    }
  }

  const providerName = resolveProviderName(env)
  const envKey = PROVIDER_ENV_KEYS[providerName]
  const apiKey = env[envKey]
  if (!apiKey) {
    return {
      status: 503,
      body: { error: `${envKey} is not set — AI summaries are disabled until it is.` },
    }
  }

  const prompt = buildCoachSummaryPrompt(rawBody.feed, {
    exerciseName: rawBody.exerciseName,
    totalReps: rawBody.totalReps,
  })

  try {
    const raw = await complete(providerName, prompt, apiKey)
    const bullets = parseCoachSummaryBullets(raw)
    return { status: 200, body: { bullets } }
  } catch (error) {
    const message =
      error instanceof CoachSummaryParseError ? error.message : `AI summary request failed: ${String(error)}`
    return { status: 502, body: { error: message } }
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {})
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Dev-only endpoint that turns the live coaching feed into a 3-bullet AI
 * summary. Provider is Anthropic by default, or OpenAI via AI_COACH_PROVIDER=
 * openai — either way the key stays server-side (read from process.env, never
 * bundled into client code) by only running inside the Vite dev server's Node
 * process. A real deployment would need an equivalent server-side route,
 * this is intentionally scoped to local dev/testing for now.
 */
export function aiCoachSummaryApiPlugin(): Plugin {
  // Vite only auto-exposes VITE_-prefixed vars via import.meta.env and doesn't
  // guarantee unprefixed .env vars land in process.env for plugin code, so
  // load .env explicitly (with no prefix filter) rather than relying on that.
  let env: NodeJS.ProcessEnv = {}

  return {
    name: 'ai-coach-summary-api',
    config(_config, { mode }) {
      env = loadEnv(mode, process.cwd(), '')
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(ROUTE, (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          let body: unknown
          try {
            body = await readJsonBody(req)
          } catch {
            sendJson(res, 400, { error: 'Invalid JSON body' })
            return
          }

          try {
            const result = await handleCoachSummaryRequest(body, env)
            sendJson(res, result.status, result.body)
          } catch (error) {
            sendJson(res, 500, { error: `Unexpected error: ${String(error)}` })
          }
        })()
      })
    },
  }
}
