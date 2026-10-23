import {
  compareVerdicts,
  defaultProbs,
  expectedRegret,
  findDominator,
  normalize,
  pickWinner,
  regretTone,
  runnerUp,
  scoreOptions,
} from '../src/lib/regret.js'

let pass = 0
let fail = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`}`)
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

console.log('— normalize —')
check('normalises to sum 1', normalize(20, 60, 20).map((x) => +x.toFixed(4)), [0.2, 0.6, 0.2])
check('handles zero guard', normalize(0, 0, 0).map((x) => +x.toFixed(4)), [0.3333, 0.3333, 0.3333])
check('handles unbalanced sums to 1', near(normalize(1, 1, 2).reduce((a, b) => a + b, 0), 1), true)

console.log('\n— expected regret —')
// best=10, likely=45, worst=90 at 20/60/20 => 2 + 27 + 18 = 47
check('weighted sum', expectedRegret(
  { best: { regret: 10 }, likely: { regret: 45 }, worst: { regret: 90 } },
  [0.2, 0.6, 0.2],
), 47)
check('all-worst weights', expectedRegret(
  { best: { regret: 10 }, likely: { regret: 45 }, worst: { regret: 90 } },
  [0, 0, 1],
), 90)
check('missing scenarios -> 0', expectedRegret({}, [0.2, 0.6, 0.2]), 0)
check('garbage regret -> 0', expectedRegret(
  { best: { regret: 'x' }, likely: { regret: null }, worst: {} },
  [1, 0, 0],
), 0)

console.log('\n— verdict selection —')
const options = [
  { id: 'A', label: 'Project first', scenarios: {
    best: { regret: 10, probability: 0.2 },
    likely: { regret: 40, probability: 0.6 },
    worst: { regret: 95, probability: 0.2 } } },
  { id: 'B', label: 'Exam first', scenarios: {
    best: { regret: 25, probability: 0.3 },
    likely: { regret: 45, probability: 0.5 },
    worst: { regret: 80, probability: 0.2 } } },
]
const parsed = { options, verdict: { option_id: 'A' } }

const optimistic = normalize(40, 50, 10)
const scoredOpt = scoreOptions(parsed, optimistic)
const cmpOpt = compareVerdicts(parsed, scoredOpt)
console.log(`  optimistic odds -> A=${scoredOpt[0].expected.toFixed(1)} B=${scoredOpt[1].expected.toFixed(1)} winner=${cmpOpt.userWinner.id} flipped=${cmpOpt.flipped}`)
check('optimistic keeps AI pick A', cmpOpt.userWinner.id, 'A')
check('no flip reported', cmpOpt.flipped, false)

const pessimistic = normalize(0, 15, 85)
const scoredPes = scoreOptions(parsed, pessimistic)
const cmpPes = compareVerdicts(parsed, scoredPes)
console.log(`  pessimistic odds -> A=${scoredPes[0].expected.toFixed(1)} B=${scoredPes[1].expected.toFixed(1)} winner=${cmpPes.userWinner.id} flipped=${cmpPes.flipped}`)
check('pessimistic flips to B', cmpPes.userWinner.id, 'B')
check('flip reported', cmpPes.flipped, true)

check('downside = worst * p(worst)',
  Math.round(scoredPes[0].downside),
  Math.round(95 * pessimistic[2]))

console.log('\n— scoring robustness —')
check('empty options -> []', scoreOptions({ options: [] }, [0.2, 0.6, 0.2]), [])
check('null result -> []', scoreOptions(null, [0.2, 0.6, 0.2]), [])
check('pickWinner empty -> null', pickWinner([]), null)
check('pickWinner tie -> first', pickWinner([
  { id: 'A', expected: 50 }, { id: 'B', expected: 50 },
]).id, 'A')
check('defaultProbs empty -> 20/60/20', defaultProbs({}), [0.2, 0.6, 0.2])
check('defaultProbs averages model odds', (() => {
  const p = defaultProbs({ options })
  return p.map((x) => +x.toFixed(4))
})(), [0.25, 0.55, 0.2])

console.log('\n— tone buckets —')
check('0 -> best', regretTone(0), 'best')
check('25 -> best', regretTone(25), 'best')
check('26 -> likely', regretTone(26), 'likely')
check('60 -> likely', regretTone(60), 'likely')
check('61 -> worst', regretTone(61), 'worst')
check('100 -> worst', regretTone(100), 'worst')
check('clamps -10', regretTone(-10), 'best')
check('clamps 500', regretTone(500), 'worst')
check('NaN -> best', regretTone(NaN), 'best')

console.log('\n— dominance (drives the "this one is settled" banner) —')
// B beats A in every scenario: no slider weighting can ever overturn it.
const dominant = scoreOptions(
  {
    options: [
      { id: 'A', scenarios: { best: { regret: 20 }, likely: { regret: 55 }, worst: { regret: 95 } } },
      { id: 'B', scenarios: { best: { regret: 15 }, likely: { regret: 40 }, worst: { regret: 85 } } },
    ],
  },
  [0.2, 0.6, 0.2],
)
check('detects a strictly dominant option', findDominator(dominant)?.id, 'B')

// Crossing profiles: each option wins somewhere, so no dominator exists.
const crossing = scoreOptions(
  {
    options: [
      { id: 'A', scenarios: { best: { regret: 10 }, likely: { regret: 60 }, worst: { regret: 60 } } },
      { id: 'B', scenarios: { best: { regret: 30 }, likely: { regret: 30 }, worst: { regret: 99 } } },
    ],
  },
  [0.2, 0.6, 0.2],
)
check('no dominator when profiles cross', findDominator(crossing), null)

const identical = scoreOptions(
  {
    options: [
      { id: 'A', scenarios: { best: { regret: 10 }, likely: { regret: 40 }, worst: { regret: 90 } } },
      { id: 'B', scenarios: { best: { regret: 10 }, likely: { regret: 40 }, worst: { regret: 90 } } },
    ],
  },
  [0.2, 0.6, 0.2],
)
check('identical profiles are a tie, not dominance', findDominator(identical), null)
check('single option -> no dominator', findDominator(dominant.slice(0, 1)), null)
check('empty -> null', findDominator([]), null)

console.log('\n— runner up —')
const ranked = scoreOptions(
  {
    options: [
      { id: 'A', scenarios: { best: { regret: 50 }, likely: { regret: 50 }, worst: { regret: 50 } } },
      { id: 'B', scenarios: { best: { regret: 10 }, likely: { regret: 10 }, worst: { regret: 10 } } },
      { id: 'C', scenarios: { best: { regret: 30 }, likely: { regret: 30 }, worst: { regret: 30 } } },
    ],
  },
  [1, 0, 0],
)
check('picks second-best when winner excluded', runnerUp(ranked, 'B')?.id, 'C')
check('falls back to best when winner unknown', runnerUp(ranked, 'Z')?.id, 'B')
check('no alternatives -> null', runnerUp([ranked[0]], 'A'), null)

console.log(`\n${fail === 0 ? 'ALL' : 'SOME'} PASS: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
