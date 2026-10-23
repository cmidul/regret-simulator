// Streaming JSON extraction.
//
// A full simulation takes ~53s on this machine's CPU. Rather than hold a spinner
// for that long, we parse the growing buffer repeatedly and hand back whichever
// top-level keys have finished closing, so the UI renders section by section.

function ws(raw, i) {
  const n = raw.length
  while (i < n && (raw[i] === ' ' || raw[i] === '\n' || raw[i] === '\r' || raw[i] === '\t')) i++
  return i
}

function scanString(raw, i) {
  const n = raw.length
  if (raw[i] !== '"') return { ok: false }
  i++
  while (i < n) {
    const c = raw[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '"') return { ok: true, end: i + 1 }
    i++
  }
  // Ran out of buffer mid-string: still being streamed.
  return { ok: false, incomplete: true }
}

const PRIMITIVE = /^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/

function scanValue(raw, i) {
  const n = raw.length
  i = ws(raw, i)
  if (i >= n) return { ok: false, incomplete: true }

  const c = raw[i]
  if (c === '"') return scanString(raw, i)

  if (c === '{' || c === '[') {
    const close = c === '{' ? '}' : ']'
    i++
    while (true) {
      i = ws(raw, i)
      if (i >= n) return { ok: false, incomplete: true }
      if (raw[i] === close) return { ok: true, end: i + 1 }
      if (raw[i] === ',') {
        i++
        continue
      }
      if (c === '{') {
        if (raw[i] !== '"') return { ok: false, incomplete: true }
        const k = scanString(raw, i)
        if (!k.ok) return { ok: false, incomplete: true }
        i = ws(raw, k.end)
        if (raw[i] !== ':') return { ok: false, incomplete: true }
        const v = scanValue(raw, i + 1)
        if (!v.ok) return { ok: false, incomplete: true }
        i = v.end
      } else {
        const v = scanValue(raw, i)
        if (!v.ok) return { ok: false, incomplete: true }
        i = v.end
      }
    }
  }

  const m = PRIMITIVE.exec(raw.slice(i))
  if (!m) return { ok: false, incomplete: true }
  // A number touching the end of the buffer may still be growing ("0." -> "0.55").
  if (i + m[0].length >= n) return { ok: false, incomplete: true }
  return { ok: true, end: i + m[0].length }
}

// Pulls out the finished elements of an array whose closing bracket has not
// arrived yet, so option cards can appear one at a time.
function extractIncompleteArray(raw, start) {
  const n = raw.length
  let i = ws(raw, start)
  if (raw[i] !== '[') return []
  i++
  const items = []
  while (true) {
    i = ws(raw, i)
    if (i >= n) break
    if (raw[i] === ']') break
    if (raw[i] === ',') {
      i++
      continue
    }
    const v = scanValue(raw, i)
    if (!v.ok) break
    let parsed
    try {
      parsed = JSON.parse(raw.slice(i, v.end))
    } catch {
      break
    }
    items.push(parsed)
    i = v.end
  }
  return items
}

/**
 * Extract every top-level key whose value has fully arrived.
 * Keys still mid-stream are omitted (or, for arrays, returned as partial lists).
 */
export function extractTopLevel(raw) {
  const out = {}
  if (!raw) return out
  const n = raw.length

  let i = raw.indexOf('{')
  if (i === -1) return out
  i++

  while (true) {
    i = ws(raw, i)
    if (i >= n || raw[i] === '}') break
    if (raw[i] === ',') {
      i++
      continue
    }
    if (raw[i] !== '"') break

    const k = scanString(raw, i)
    if (!k.ok) break
    let key
    try {
      key = JSON.parse(raw.slice(i, k.end))
    } catch {
      break
    }

    i = ws(raw, k.end)
    if (raw[i] !== ':') break

    const vStart = i + 1
    const v = scanValue(raw, vStart)
    if (!v.ok) {
      const p = ws(raw, vStart)
      if (raw[p] === '[') {
        const items = extractIncompleteArray(raw, p)
        if (items.length) out[key] = items
      }
      break // this key is unfinished, so nothing after it can be finished either
    }

    try {
      out[key] = JSON.parse(raw.slice(vStart, v.end))
    } catch {
      break
    }
    i = v.end
  }

  return out
}

/** Strict parse, then lenient repair for the classic small-model slip-ups. */
export function parseComplete(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) return { data: null, ok: false }

  try {
    return { data: JSON.parse(trimmed), ok: true }
  } catch {
    /* fall through to repair */
  }

  const candidates = []
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1))

  // Models sometimes wrap JSON in ```json fences despite instructions.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.push(fence[1].trim())

  // Trailing comma before a closing brace/bracket.
  for (const c of [...candidates]) candidates.push(c.replace(/,(\s*[}\]])/g, '$1'))

  for (const c of candidates) {
    try {
      return { data: JSON.parse(c), ok: true }
    } catch {
      /* try next */
    }
  }
  return { data: null, ok: false }
}

/**
 * Consumes the server's NDJSON event stream.
 * Throws on error events so the caller can decide whether to retry once.
 */
export async function readSimulation(decision, { onToken, onMeta, signal, attempt = 0, nudge = '' } = {}) {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, attempt, nudge }),
    signal,
  })

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`
    try {
      msg = (await res.json()).error || msg
    } catch {
      /* keep default */
    }
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })

    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let ev
      try {
        ev = JSON.parse(line)
      } catch {
        continue
      }
      if (ev.type === 'meta') onMeta?.(ev)
      else if (ev.type === 'token') onToken?.(ev.text)
      else if (ev.type === 'error') throw new Error(ev.message)
    }
  }
}
