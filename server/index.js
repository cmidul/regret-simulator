import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SYSTEM_PROMPT, RETRY_PROMPT } from './prompt.js'
const PORT = process.env.PORT || 3001
const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434'

// Public deployments sit behind a platform proxy (Railway, Fly, nginx). Without
// this, req.ip is the proxy for every visitor and the rate limiter below would
// throttle the whole world as one client.
const TRUST_PROXY = process.env.TRUST_PROXY
if (TRUST_PROXY) app.set('trust proxy', Number(TRUST_PROXY) || 1)

const app = express()
app.use(express.json({ limit: '64kb' }))

// ---- Abuse protection ------------------------------------------------------
// A single generation holds a CPU for one to three minutes, so the budget here
// is deliberately tight. Without this a handful of visitors can pin every core
// and make the app unusable for everyone else.

// Per-IP ceiling. Fixed window is enough at this request rate and keeps the
// dependency surface at zero.
function makeLimiter({ windowMs, max }) {
  const hits = new Map()
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key)
  }, windowMs)
  sweep.unref?.()

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    let entry = hits.get(key)
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs }
      hits.set(key, entry)
    }
    entry.count += 1
    if (entry.count > max) {
      const retry = Math.ceil((entry.reset - now) / 1000)
      res.setHeader('Retry-After', String(retry))
      return res.status(429).json({
        error: `That is a lot of simulations in a short window. Try again in about ${Math.max(1, Math.ceil(retry / 60))} minute(s).`,
      })
    }
    next()
  }
}

// Ollama serialises onto the CPU anyway, so queued requests just pile up latency
// for everyone. Better to refuse politely and let the client retry.
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2)
let active = 0

const simulateLimit = makeLimiter({
  windowMs: Number(process.env.RATE_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_MAX || 6),
})

// Model is discovered at request time so the app survives `ollama pull` / restarts.
let cachedModel = null

async function listModels() {
  const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
  const data = await res.json()
  return (data.models || []).map((m) => m.name)
}

async function resolveModel() {
  if (cachedModel) return cachedModel
  const models = await listModels()
  if (!models.length) {
    throw new Error(`No models installed. Run: ollama pull ${process.env.MODEL || 'gemma3:4b'}`)
  }
  // MODEL pins a specific tag when set; otherwise fall back to whatever Ollama
  // reports first, so the app still works on a box with only one model.
  const preferred = process.env.MODEL
  cachedModel =
    (preferred && (models.includes(preferred) ? preferred : null)) ||
    (preferred && models.find((m) => m.startsWith(`${preferred}:`))) ||
    models[0]
  return cachedModel
}

app.get('/api/health', async (_req, res) => {
  try {
    const models = await listModels()
    res.json({ ok: true, ollama: OLLAMA, models, active: models[0] || null, running: active })
  } catch (err) {
    res.status(503).json({ ok: false, ollama: OLLAMA, error: err.message, running: active })
  }
})

app.post('/api/simulate', simulateLimit, async (req, res) => {
  const decision = String(req.body?.decision || '').trim()
  if (decision.length < 8) {
    return res.status(400).json({ error: 'Tell me a bit more about the decision (at least a sentence).' })
  }
  if (decision.length > 2000) {
    return res.status(400).json({ error: 'That decision is too long. Trim it to the essentials.' })
  }

  // Checked before headers are committed so we can still answer with plain JSON
  // the client renders as an ordinary error.
  if (active >= MAX_CONCURRENT) {
    return res.status(503).json({
      error: 'Every worker is busy right now. Give it a minute and try again.',
    })
  }
  active += 1

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (obj) => {
    try { res.write(JSON.stringify(obj) + '\n') } catch { /* client gone */ }
  }

  // Attempt 0 is the normal run. Attempts 1+ carry a targeted nudge: either the
  // payload would not parse, or it parsed but had too few options to compare.
  const attempt = Number.isFinite(req.body?.attempt) ? Number(req.body.attempt) : 0
  const nudge =
    typeof req.body?.nudge === 'string' && req.body.nudge.trim()
      ? req.body.nudge.slice(0, 400)
      : attempt > 0
        ? RETRY_PROMPT
        : ''

  let model
  try {
    model = await resolveModel()
  } catch (err) {
    send({ type: 'error', message: `Cannot reach Ollama at ${OLLAMA}. Start it with: ollama serve` })
    return res.end()
  }

  send({ type: 'meta', model, attempt })

  const started = Date.now()

  try {
    await streamCompletion({
      model,
      decision,
      nudge,
      onToken: (t) => send({ type: 'token', text: t }),
    })
    send({ type: 'done', model, attempt, total_ms: Date.now() - started })
  } catch (err) {
    send({ type: 'error', message: err.message })
  } finally {
    active -= 1
    res.end()
  }
})

// Streams from Ollama. `think:false` is the single biggest latency lever here:
// with thinking enabled this same payload took ~98s instead of ~53s on this machine.
async function streamCompletion({ model, decision, nudge, onToken }) {
  const body = {
    model,
    stream: true,
    think: false,
    // Ollama enforces the JSON grammar server-side, which removes a whole
    // class of malformed-output failures that small models are prone to.
    format: 'json',
    // Lower than typical: we are buying schema adherence (2-3 options, correct
    // shapes) rather than prose flair, and 0.7 produced junk option entries.
    options: { temperature: 0.4, num_ctx: 4096 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${nudge ? `${nudge}\n` : ''}Decision: ${decision}` },
    ],
  }

  const upstream = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`Ollama error ${upstream.status}: ${text.slice(0, 200)}`)
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { continue }
      if (parsed.error) throw new Error(parsed.error)
      const piece = parsed.message?.content
      if (piece) onToken(piece)
    }
  }
}

// ---- Static UI -------------------------------------------------------------
// In dev Vite serves the client and proxies /api here. In production (Docker,
// any Node host) this one process serves both, so there is no second origin to
// configure and no CORS to think about. The client already calls /api with
// relative URLs, so no build-time change is needed.
const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(here, '..', 'dist')

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h', immutable: false }))

  // SPA fallback for anything that is not an API route. The app is a single
  // page, but this keeps a refresh on a deep link from 404ing.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(DIST, 'index.html'))
  })
} else if (process.env.NODE_ENV === 'production') {
  console.warn('[regret-simulator] NODE_ENV=production but dist/ is missing — run `npm run build`.')
}

// Anything unmatched, once static has had its turn.
app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` })
})

app.listen(PORT, () => {
  const serving = fs.existsSync(DIST) ? 'api + UI' : 'api only (no dist/ found)'
  console.log(`[regret-simulator] ${serving} on http://localhost:${PORT} -> ${OLLAMA}`)
  console.log(`[regret-simulator] concurrency cap ${MAX_CONCURRENT}`)
})
