// Expected-regret math. Everything here is pure and instant, which is the whole
// point: the model pays ~53s to describe the futures, then the user plays with
// them forever without spending another token.

export function normalize(b, l, w) {
  const sum = b + l + w
  if (sum <= 0) return [1 / 3, 1 / 3, 1 / 3]
  return [b / sum, l / sum, w / sum]
}

/** Seed the sliders with the model's own averaged probabilities. */
export function defaultProbs(parsed) {
  const options = parsed?.options || []
  if (!options.length) return [0.2, 0.6, 0.2]
  let b = 0
  let l = 0
  let w = 0
  for (const o of options) {
    b += num(o?.scenarios?.best?.probability, 0.2)
    l += num(o?.scenarios?.likely?.probability, 0.6)
    w += num(o?.scenarios?.worst?.probability, 0.2)
  }
  const n = options.length
  return normalize(b / n, l / n, w / n)
}

function num(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function expectedRegret(scenarios, probs) {
  return (
    num(scenarios?.best?.regret, 0) * probs[0] +
    num(scenarios?.likely?.regret, 0) * probs[1] +
    num(scenarios?.worst?.regret, 0) * probs[2]
  )
}

/** Attach live scores to every option under the current probability weights. */
export function scoreOptions(parsed, probs) {
  return (parsed?.options || []).map((o) => {
    const expected = expectedRegret(o.scenarios, probs)
    const worstRegret = num(o?.scenarios?.worst?.regret, 0)
    return {
      ...o,
      expected,
      // Tail risk: how bad the downside gets once you let the worst case in.
      downside: worstRegret * probs[2],
      spread: worstRegret - num(o?.scenarios?.best?.regret, 0),
    }
  })
}

/** Lowest expected regret wins. Ties fall back to the option listed first. */
export function pickWinner(scored) {
  if (!scored.length) return null
  return scored.reduce((best, o) => (o.expected < best.expected - 1e-9 ? o : best))
}

/**
 * The headline comparison: did the user's own odds change the AI's answer?
 * Returns { aiWinner, userWinner, flipped }.
 */
export function compareVerdicts(parsed, scored) {
  const userWinner = pickWinner(scored)
  const aiId = parsed?.verdict?.option_id
  const aiWinner = scored.find((o) => o.id === aiId) || scored[0] || null
  return {
    aiWinner,
    userWinner,
    flipped: Boolean(aiWinner && userWinner && aiWinner.id !== userWinner.id),
  }
}

/**
 * An option that is weakly better than every rival in ALL three scenarios.
 * No probability weighting can ever overturn it, so telling the user to drag
 * sliders would be misleading — we say so instead.
 */
export function findDominator(scored) {
  if (!Array.isArray(scored) || scored.length < 2) return null

  const triple = (o) => [
    num(o?.scenarios?.best?.regret, 0),
    num(o?.scenarios?.likely?.regret, 0),
    num(o?.scenarios?.worst?.regret, 0),
  ]

  for (const a of scored) {
    const ra = triple(a)
    let weaklyBetter = true
    let strictlyBetter = false
    for (const b of scored) {
      if (a === b) continue
      const rb = triple(b)
      for (let k = 0; k < 3; k++) {
        if (ra[k] > rb[k]) {
          weaklyBetter = false
          break
        }
        if (ra[k] < rb[k]) strictlyBetter = true
      }
      if (!weaklyBetter) break
    }
    // Identical profiles mean a permanent tie, not dominance.
    if (weaklyBetter && strictlyBetter) return a
  }
  return null
}

/** The option that would win if the first-placed one were removed. */
export function runnerUp(scored, winnerId) {
  const others = (scored || []).filter((o) => o.id !== winnerId)
  if (!others.length) return null
  return others.reduce((best, o) => (o.expected < best.expected ? o : best))
}

export function regretTone(value) {
  const v = Math.max(0, Math.min(100, num(value, 0)))
  if (v <= 25) return 'best'
  if (v <= 60) return 'likely'
  return 'worst'
}

export const TONE_TEXT = {
  best: 'text-emerald-300',
  likely: 'text-amber-300',
  worst: 'text-red-300',
}

export const TONE_BG = {
  best: 'bg-emerald-400',
  likely: 'bg-amber-400',
  worst: 'bg-red-400',
}

export function pct(x) {
  return `${Math.round(x * 100)}%`
}
