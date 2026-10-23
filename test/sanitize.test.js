import { coverage, sanitize, str } from '../src/lib/sanitize.js'

let pass = 0
let fail = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`}`,
  )
}

const goodOption = (id, regrets) => ({
  id,
  label: `Option ${id}`,
  summary: 'sum',
  scenarios: {
    best: { title: 't', probability: 0.2, regret: regrets[0], consequences: ['a', 'b', 'c'] },
    likely: { title: 't', probability: 0.6, regret: regrets[1], consequences: ['a', 'b', 'c'] },
    worst: { title: 't', probability: 0.2, regret: regrets[2], consequences: ['a', 'b', 'c'] },
  },
})

console.log('— drops malformed entries (the real failure from production) —')
const withJunk = sanitize({
  options: [goodOption('A', [10, 40, 90]), goodOption('B', [20, 50, 80]), {}, {}, {}, null, 'string'],
  assumptions: [],
  hedge_plan: { one_line: 'x', steps: ['1'] },
  would_change_mind: ['f'],
  verdict: { option_id: 'A', reason: 'r' },
})
check('drops empty objects, nulls and strings', withJunk.options.length, 2)
check('keeps real ids', withJunk.options.map((o) => o.id), ['A', 'B'])
check('empty assumptions -> []', withJunk.assumptions, [])

console.log('\n— pads missing scenario keys —')
const partial = sanitize({
  options: [{ id: 'A', label: 'Only best', scenarios: { best: { regret: 10, probability: 0.5 } } }],
})
check('pads likely', partial.options[0].scenarios.likely, {
  title: '',
  probability: null,
  regret: null,
  consequences: [],
})
check('pads worst too', partial.options[0].scenarios.worst.regret, null)
check('coverage reflects missing sections', coverage(partial), 1 / 6)

console.log('\n— verdict integrity —')
const badVerdict = sanitize({
  options: [goodOption('A', [1, 2, 3]), goodOption('B', [4, 5, 6])],
  verdict: { option_id: 'Z', reason: 'points at nothing' },
})
check('repoints verdict at a real option', badVerdict.verdict.option_id, 'A')

const noVerdict = sanitize({ options: [goodOption('A', [1, 2, 3])] })
check('missing verdict -> null id, empty reason', noVerdict.verdict, { option_id: 'A', reason: '' })

console.log('\n— type coercion / clamping —')
const weird = sanitize({
  options: [
    {
      label: 'No id supplied',
      scenarios: {
        best: { probability: '9', regret: 500, consequences: ['keep', '', '   ', 'drop'] },
        likely: { probability: -3, regret: 'not a number', consequences: 'not an array' },
        worst: { probability: 0.2, regret: 90 },
      },
    },
  ],
  assumptions: 'not an array',
  hedge_plan: 'not an object',
  would_change_mind: ['ok', 42, null, ''],
})
const o = weird.options[0]
check('assigns sequential id when missing', o.id, 'A')
check('clamps probability high', o.scenarios.best.probability, 1)
check('clamps regret high', o.scenarios.best.regret, 100)
check('clamps probability low', o.scenarios.likely.probability, 0)
check('non-numeric regret -> null', o.scenarios.likely.regret, null)
check('non-array consequences -> []', o.scenarios.likely.consequences, [])
check('filters blank/whitespace items, keeps real text', o.scenarios.best.consequences, ['keep', 'drop'])
check('non-array assumptions -> []', weird.assumptions, [])
check('non-object hedge -> null', weird.hedge_plan, null)
check('filters non-string falsifiers', weird.would_change_mind, ['ok'])

console.log('\n— literal placeholder strings the model emits —')
check('"[]"" collapses to empty', str('[]'), '')
check('"null" collapses to empty', str('null'), '')
check('normal text survives', str('  do the thing  '), 'do the thing')

console.log('\n— hard failures —')
check('null input', sanitize(null), null)
check('array input', sanitize([]), null)
check('string input', sanitize('nope'), null)
check('no options -> empty list', sanitize({}).options, [])
check('coverage of nothing', coverage(null), 0)

console.log(`\n${fail === 0 ? 'ALL' : 'SOME'} PASS: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
