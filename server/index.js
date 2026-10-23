import express from 'express'
import { SYSTEM_PROMPT, RETRY_PROMPT } from './prompt.js'
const PORT = process.env.PORT || 3001
const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434'

const app = express()
app.use(express.json({ limit: '64kb' }))

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
  if (!models.length) throw new Error('No models installed. Run: ollama pull gemma4:e2b')
  cachedModel = models[0]
  return cachedModel
}

app.get('/api/health', async (_req, res) => {
  try {
    const models = await listModels()
    res.json({ ok: true, ollama: OLLAMA, models, active: models[0] || null })
  } catch (err) {
    res.status(503).json({ ok: false, ollama: OLLAMA, error: err.message })
  }
})

app.post('/api/simulate', async (req, res) => {
  const decision = String(req.body?.decision || '').trim()
  if (decision.length < 8) {
    return res.status(400).json({ error: 'Tell me a bit more about the decision (at least a sentence).' })
  }
  if (decision.length > 2000) {
    return res.status(400).json({ error: 'That decision is too long. Trim it to the essentials.' })
  }

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

app.listen(PORT, () => {
  console.log(`[regret-simulator] server on http://localhost:${PORT} -> ${OLLAMA}`)
})
