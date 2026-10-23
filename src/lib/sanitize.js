// The model is a 4.6B quantised one running with Ollama's `format: "json"`,
// which guarantees valid JSON but NOT our schema. In testing it has emitted
// empty option objects and silently dropped `assumptions`. Everything the UI
// renders therefore passes through here first.

const SCENARIO_KEYS = ['best', 'likely', 'worst']
const MAX_OPTIONS = 3

export function sanitize(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const options = (Array.isArray(parsed.options) ? parsed.options : [])
    .map(normalizeOption)
    .filter(Boolean)
    .slice(0, MAX_OPTIONS)

  const plan = parsed.hedge_plan && typeof parsed.hedge_plan === 'object' ? parsed.hedge_plan : null

  return {
    options,
    assumptions: strList(parsed.assumptions, 5),
    hedge_plan: plan
      ? { one_line: str(plan.one_line) || '', steps: strList(plan.steps, 5) }
      : null,
    would_change_mind: strList(parsed.would_change_mind, 5),
    verdict: normalizeVerdict(parsed.verdict, options),
  }
}

function normalizeOption(o, i) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const rawScenarios = o.scenarios
  if (!rawScenarios || typeof rawScenarios !== 'object') return null

  const scenarios = {}
  for (const key of SCENARIO_KEYS) {
    const s = rawScenarios[key]
    if (!s || typeof s !== 'object') continue
    scenarios[key] = {
      title: str(s.title) || '',
      probability: clampNum(s.probability, 0, 1),
      regret: clampNum(s.regret, 0, 100),
      consequences: strList(s.consequences, 6),
    }
  }

  // Nothing usable in this entry — drop it rather than render an empty card.
  if (!Object.keys(scenarios).length) return null

  // Pad the gaps so downstream code never has to branch on presence.
  for (const key of SCENARIO_KEYS) {
    if (!scenarios[key]) {
      scenarios[key] = { title: '', probability: null, regret: null, consequences: [] }
    }
  }

  return {
    id: str(o.id) || String.fromCharCode(65 + i),
    label: str(o.label) || '',
    summary: str(o.summary) || '',
    scenarios,
  }
}

function normalizeVerdict(verdict, options) {
  const v = verdict && typeof verdict === 'object' ? verdict : {}
  const requested = str(v.option_id)
  // Keep the id only if it survived sanitisation, otherwise fall back to the
  // first real option so the UI never points at a card that isn't there.
  const option_id = options.some((o) => o.id === requested) ? requested : options[0]?.id || null
  return { option_id, reason: str(v.reason) || '' }
}

export function str(v) {
  if (typeof v !== 'string') return ''
  const t = v.trim()
  // Models sometimes emit "[]" or "null" as a literal string when a field is empty.
  if (t === '[]' || t === 'null' || t === 'none' || t === 'n/a') return ''
  return t
}

function strList(v, max) {
  if (!Array.isArray(v)) return []
  return v.map(str).filter(Boolean).slice(0, max)
}

function clampNum(v, lo, hi) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(hi, Math.max(lo, n))
}

/** Cheap completeness signal so the UI can be honest about partial results. */
export function coverage(data) {
  const opts = data?.options?.length || 0
  const checks = [
    opts >= 2,
    opts > 0,
    (data?.assumptions?.length || 0) > 0,
    Boolean(data?.hedge_plan?.one_line || data?.hedge_plan?.steps?.length),
    (data?.would_change_mind?.length || 0) > 0,
    Boolean(data?.verdict?.reason),
  ]
  return checks.filter(Boolean).length / checks.length
}
