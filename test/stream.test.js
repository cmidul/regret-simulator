import { extractTopLevel, parseComplete } from '../src/lib/stream.js'

const full = JSON.stringify({
  decision: 'exam vs deadline',
  options: [
    {
      id: 'A',
      label: 'Project first',
      summary: 's',
      scenarios: {
        best: { title: 'bt', probability: 0.2, regret: 10, consequences: ['c1', 'c2', 'c3'] },
        likely: { title: 'lt', probability: 0.6, regret: 45, consequences: ['c1', 'c2', 'c3'] },
        worst: { title: 'wt', probability: 0.2, regret: 90, consequences: ['c1', 'c2', 'c3'] },
      },
    },
    {
      id: 'B',
      label: 'Exam first',
      summary: 's',
      scenarios: {
        best: { title: 'bt', probability: 0.3, regret: 15, consequences: ['c1', 'c2', 'c3'] },
        likely: { title: 'lt', probability: 0.5, regret: 50, consequences: ['c1', 'c2', 'c3'] },
        worst: { title: 'wt', probability: 0.2, regret: 85, consequences: ['c1', 'c2', 'c3'] },
      },
    },
  ],
  assumptions: ['a1', 'a2', 'a3'],
  hedge_plan: { one_line: 'do x', steps: ['s1', 's2', 's3'] },
  would_change_mind: ['f1', 'f2', 'f3'],
  verdict: { option_id: 'A', reason: 'r' },
})

console.log('total length', full.length)

// Walk the buffer from 1 char to the end, recording whenever the visible
// key set changes. This is exactly what the UI does while streaming.
const seen = []
for (let cut = 1; cut <= full.length; cut++) {
  const r = extractTopLevel(full.slice(0, cut))
  const k = Object.keys(r).join(',')
  if (!seen.length || seen[seen.length - 1].k !== k) seen.push({ at: cut, k, opts: r.options?.length ?? 0 })
}
console.log('\nprogressive reveal:')
seen.forEach((s) => console.log(`  at ${String(s.at).padStart(4)} -> ${s.k || '(none)'}  [options=${s.opts}]`))

const final = extractTopLevel(full)
console.log('\nfinal keys:', Object.keys(final).join(','))
console.log('final options:', final.options.length)
console.log('assumptions:', final.assumptions.length, '| verdict:', final.verdict.option_id)

const fence = '```json\n' + full + '\n```'
const trailing = full.replace('"a3"', '"a3",')

console.log('\nparseComplete clean      :', parseComplete(full).ok)
console.log('parseComplete fenced     :', parseComplete(fence).ok)
console.log('parseComplete trailing , :', parseComplete(trailing).ok)
console.log('parseComplete garbage    :', parseComplete('not json at all').ok)
console.log('parseComplete empty      :', parseComplete('').ok)

// Edge cases that break naive parsers.
const edgeCases = [
  ['string with braces', JSON.stringify({ a: 'text with } and { and "quotes"', b: 1 })],
  ['escaped quotes', JSON.stringify({ a: 'he said "hi" \\ ok', b: 2 })],
  ['nested arrays', JSON.stringify({ a: [[1, 2], [3, 4]], b: 'x' })],
  ['unicode', JSON.stringify({ a: 'héllo ✓ 日本語', b: 3 })],
  ['numbers', JSON.stringify({ a: [0.25, -1, 1e3, 0], b: true, c: null })],
  ['empty obj value', JSON.stringify({ a: {}, b: [] })],
  ['key containing colon', JSON.stringify({ 'we:ird': 'v', ok: 1 })],
]
console.log('\nedge cases:')
let allPass = true
for (const [name, json] of edgeCases) {
  const r = extractTopLevel(json)
  const ok = JSON.stringify(r) === json
  if (!ok) allPass = false
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  got: ' + JSON.stringify(r)}`)

  // Also verify every prefix parses without throwing (crash-safety).
  for (let i = 1; i <= json.length; i++) {
    try {
      extractTopLevel(json.slice(0, i))
    } catch (e) {
      allPass = false
      console.log(`        THREW at prefix ${i}/${json.length}: ${e.message}`)
      break
    }
  }
}

console.log('\nALL_PASS =', allPass)
