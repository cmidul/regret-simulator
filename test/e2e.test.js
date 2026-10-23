// End-to-end: hits the real /api/simulate endpoint and applies the exact same
// progressive logic the browser uses, so we verify the whole path at once.
import { extractTopLevel, parseComplete } from '../src/lib/stream.js'
import { sanitize, coverage } from '../src/lib/sanitize.js'

// Prerequisite: the dev server must already be running (`npm run dev` in
// another terminal) — this hits the local endpoint, not Ollama directly.
// Pass a decision as argv[2] to test something else.
const decision =
  process.argv[2] ||
  'I have an exam tomorrow, but my project deadline is tonight. What should I prioritize?'

console.log('decision:', decision)
console.log('waiting on model (expect 1-3 minutes on a CPU)...\n')

const t0 = Date.now()
const res = await fetch('http://localhost:3001/api/simulate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ decision }),
})

if (!res.ok) {
  console.log('HTTP', res.status, await res.text())
  process.exit(1)
}

const reader = res.body.getReader()
const dec = new TextDecoder()
let buf = ''
let raw = ''
let firstTokenMs = null
let lastStageLog = 0
let model = ''

const stageNames = ['decision', 'options', 'assumptions', 'hedge_plan', 'would_change_mind', 'verdict']
const shown = new Set()

function logStages(force) {
  const partial = extractTopLevel(raw)
  for (const k of stageNames) {
    if (partial[k] !== undefined && !shown.has(k)) {
      shown.add(k)
      const optCount = Array.isArray(partial.options) ? partial.options.length : 0
      console.log(`  +${String(Date.now() - t0).padStart(5)}ms  section ready: ${k}${k === 'options' ? ` (${optCount} option${optCount === 1 ? '' : 's'})` : ''}`)
    }
  }
  if (force) lastStageLog = Date.now()
}

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
    if (ev.type === 'meta') {
      model = ev.model
      console.log(`  model=${ev.model} retry=${ev.retry}`)
    } else if (ev.type === 'token') {
      if (firstTokenMs === null) firstTokenMs = Date.now() - t0
      raw += ev.text
      logStages()
    } else if (ev.type === 'error') {
      console.log('ERROR:', ev.message)
      process.exit(1)
    } else if (ev.type === 'done') {
      console.log(`  server done in ${ev.total_ms}ms`)
    }
  }
}

const total = Date.now() - t0
logStages(true)

console.log('\n— results —')
console.log('first token :', firstTokenMs, 'ms')
console.log('total       :', total, 'ms')
console.log('bytes       :', raw.length)

const parsed = parseComplete(raw)
console.log('parses OK   :', parsed.ok)

// Always keep the raw payload so shape problems can be diagnosed offline.
const fs = await import('node:fs')
fs.writeFileSync(new URL('./last-raw.txt', import.meta.url), raw)

if (!parsed.ok) {
  console.log('\nraw tail:', raw.slice(-400))
  process.exit(1)
}

const rawShape = parsed.data
console.log('top keys    :', Object.keys(rawShape).join(', '))
console.log('RAW options :', (rawShape.options || []).length, '| RAW assumptions:', JSON.stringify(rawShape.assumptions ?? '(absent)'))

// This is exactly what the browser renders.
const d = sanitize(parsed.data)
console.log('decision    :', d.decision ?? '(dropped from schema — client already knows it)')
console.log('options     :', (d.options || []).length)
for (const o of d.options || []) {
  const s = o.scenarios || {}
  const probs = ['best', 'likely', 'worst']
    .map((k) => `${k[0]}=${s[k]?.probability ?? '?'}`)
    .join(' ')
  const sum = ['best', 'likely', 'worst'].reduce((a, k) => a + (Number(s[k]?.probability) || 0), 0)
  const reg = ['best', 'likely', 'worst'].map((k) => s[k]?.regret ?? '?').join('/')
  const consLens = ['best', 'likely', 'worst'].map((k) => s[k]?.consequences?.length ?? 0).join('/')

  // Flag violations of the prompt's hard rules so we know when to tighten them.
  const over10 = ['best', 'likely', 'worst'].flatMap((k) => s[k]?.consequences || []).filter((c) => String(c).split(/\s+/).length > 10)

  console.log(`   ${o.id}: ${o.label}`)
  console.log(`       ${probs}  sum=${sum.toFixed(2)}  regret=${reg}  counts=${consLens}${over10.length ? `  ** ${over10.length} consequence(s) over 10 words` : ''}`)
}
console.log('assumptions :', (d.assumptions || []).length)
console.log('hedge steps :', (d.hedge_plan?.steps || []).length, '| one_line:', d.hedge_plan?.one_line ? 'yes' : 'MISSING')
console.log('falsifiers  :', (d.would_change_mind || []).length)
console.log('verdict     :', d.verdict?.option_id, '-', d.verdict?.reason)

const badProb = (d.options || []).filter((o) => {
  const s = o.scenarios || {}
  const sum = ['best', 'likely', 'worst'].reduce((a, k) => a + (Number(s[k]?.probability) || 0), 0)
  return Math.abs(sum - 1) > 0.02
})
console.log('\nprobabilities summing to 1:', badProb.length === 0 ? 'YES' : `NO (${badProb.length} off)`)

const knownIds = new Set((d.options || []).map((o) => o.id))
console.log('verdict points at real option:', knownIds.has(d.verdict?.option_id))

// The whole Probability Lab depends on this: if every option reports the same
// regret profile, expected regret always ties and no slider can ever flip
// the verdict. This is the invariant that makes the product work.
const sig = (o) => {
  const s = o.scenarios || {}
  return ['best', 'likely', 'worst'].map((k) => s[k]?.regret).join('/')
}
const signatures = (d.options || []).map(sig)
const distinct = new Set(signatures).size === signatures.length
console.log('regret profiles distinct per option:', distinct ? 'YES' : `NO -> ${signatures.join('  |  ')}`)

const expected = (d.options || []).map((o) => {
  const s = o.scenarios || {}
  return ['best', 'likely', 'worst'].reduce(
    (acc, k) => acc + (Number(s[k]?.probability) || 0) * (Number(s[k]?.regret) || 0),
    0,
  )
})
const spread = Math.max(...expected) - Math.min(...expected)
console.log(`expected-regret spread under AI odds: ${spread.toFixed(1)}  [${expected.map((e) => e.toFixed(1)).join(', ')}]`)

if (!distinct || spread < 1) {
  console.log('\nFAIL: options not differentiated — the probability lab cannot flip anything.')
  process.exit(1)
}

const cov = coverage(d)
console.log(`section coverage: ${(cov * 100).toFixed(0)}%`)
console.log('SANITISED options:', d.options.length, '| assumptions:', d.assumptions.length, '| falsifiers:', d.would_change_mind.length, '| hedge:', d.hedge_plan ? 'yes' : 'no')

if (d.options.length < 2) {
  console.log('\nFAIL: fewer than 2 usable options after sanitising — no decision map possible.')
  process.exit(1)
}
console.log('\nE2E PASS')
