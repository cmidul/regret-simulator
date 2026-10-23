import { findDominator, pct, regretTone, runnerUp, TONE_BG, TONE_TEXT } from '../lib/regret.js'

const KNOBS = [
  { key: 'best', label: 'Best case', tone: 'best', color: 'text-emerald-300', hex: '#34d399' },
  { key: 'likely', label: 'Likely case', tone: 'likely', color: 'text-amber-300', hex: '#fbbf24' },
  { key: 'worst', label: 'Worst case', tone: 'worst', color: 'text-red-300', hex: '#f87171' },
]

const TRACK_EMPTY = 'rgba(148, 163, 184, 0.2)'

/**
 * The interaction that makes this a simulator rather than a transcript.
 * Sliders rewrite the scenario probabilities and every score recalculates
 * instantly in the browser — no model call, no waiting.
 */
export default function ProbabilityLab({
  raw,
  setRaw,
  probs,
  scored,
  compare,
  onReset,
  isDefault,
}) {
  const ranking = [...scored].sort((a, b) => a.expected - b.expected)
  const { aiWinner, userWinner, flipped } = compare
  const worst = ranking.length ? ranking[ranking.length - 1] : null
  const dominator = findDominator(scored)
  const second = runnerUp(scored, aiWinner?.id)

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold text-slate-100">Probability Lab</h2>
          <p className="text-sm leading-relaxed text-slate-500">
            The AI's odds are only a guess. Move them to match what you actually believe and the
            ranking recalculates instantly — no new model call.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={isDefault}
          className="rounded-lg border border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset to AI’s Odds
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          {KNOBS.map((k, i) => (
            <div key={k.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <label
                  htmlFor={`knob-${k.key}`}
                  className={`flex items-center gap-2 text-sm font-medium ${k.color}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${
                      k.tone === 'best'
                        ? 'bg-emerald-400'
                        : k.tone === 'likely'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`}
                  />
                  {k.label}
                </label>
                <span className="font-mono text-sm font-bold tabular-nums text-slate-300">
                  {pct(probs[i])}
                </span>
              </div>
              <input
                id={`knob-${k.key}`}
                type="range"
                name={`weight-${k.key}`}
                min="0"
                max="100"
                step="1"
                value={raw[i]}
                onChange={(e) => {
                  const next = [...raw]
                  next[i] = Number(e.target.value)
                  // Never allow all three to bottom out; keep the math defined.
                  if (next.every((v) => v === 0)) next[i] = 1
                  setRaw(next)
                }}
                aria-valuetext={`${pct(probs[i])} after normalising`}
                // Filled track: shows this knob's raw weight before normalisation.
                style={{
                  background: `linear-gradient(to right, ${k.hex} ${raw[i]}%, ${TRACK_EMPTY} ${raw[i]}%)`,
                }}
                className={`tone-${k.tone}`}
              />
            </div>
          ))}

          <p className="rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-[11px] text-slate-500">
            weights {raw.map((v) => Math.round(v)).join(' : ')} → normalised{' '}
            {probs.map((p) => p.toFixed(2)).join(' · ')}
          </p>
        </div>

        <div className="space-y-4">
          <VerdictBanner
            flipped={flipped}
            aiWinner={aiWinner}
            userWinner={userWinner}
            dominator={dominator}
            second={second}
            isDefault={isDefault}
          />

          <div className="space-y-3">
            {ranking.map((o, i) => {
              const tone = regretTone(o.expected)
              return (
                <div key={o.id || i} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 font-mono text-xs text-slate-600">{i + 1}</span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
                      o.id === userWinner?.id
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {o.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                    {o.label}
                    {o.id === aiWinner?.id && (
                      <span className="ml-2 text-[11px] text-sky-400">AI pick</span>
                    )}
                  </span>
                  <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-800 sm:w-40">
                    <div
                      className={`h-full rounded-full ${TONE_BG[tone]} transition-[width] duration-300`}
                      style={{ width: `${Math.max(2, Math.min(100, o.expected))}%` }}
                    />
                  </div>
                  <span
                    className={`w-10 shrink-0 text-right font-mono text-sm font-bold tabular-nums ${TONE_TEXT[tone]}`}
                  >
                    {o.expected.toFixed(0)}
                  </span>
                </div>
              )
            })}
          </div>

          {worst && (
            <p className="text-xs text-slate-500">
              Most regretful path right now: <span className="text-slate-300">{worst.label}</span>{' '}
              at <span className="font-mono text-slate-300">{worst.expected.toFixed(0)}</span>.
              Its downside exposure is{' '}
              <span className="font-mono text-slate-300">{worst.downside.toFixed(0)}</span>.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function VerdictBanner({ flipped, aiWinner, userWinner, dominator, second, isDefault }) {
  if (!aiWinner || !userWinner) return null

  if (flipped) {
    // With the sliders untouched, any disagreement is the model contradicting
    // its own arithmetic — not the user changing their mind. Say so precisely
    // rather than crediting odds the user never moved.
    if (isDefault) {
      return (
        <div className="rise rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-300">
            The model's stated verdict disagrees with its own numbers.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/80">
            It picked <strong>{aiWinner.label}</strong>, but feeding its own probabilities into its
            own regret scores ranks <strong>{userWinner.label}</strong> lowest at{' '}
            <span className="font-mono font-bold">{userWinner.expected.toFixed(0)}</span> against{' '}
            <span className="font-mono font-bold">{aiWinner.expected.toFixed(0)}</span>. Trust the
            arithmetic, or move the sliders to see how firm this is.
          </p>
        </div>
      )
    }

    return (
      <div className="rise rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
        <p className="text-sm font-semibold text-emerald-300">The verdict flipped.</p>
        <p className="mt-1 text-sm leading-relaxed text-emerald-100/80">
          At <em>your</em> odds, <strong>{userWinner.label}</strong> wins with an expected regret of{' '}
          <span className="font-mono font-bold">{userWinner.expected.toFixed(0)}</span>. The AI chose{' '}
          <strong>{aiWinner.label}</strong>, which now scores{' '}
          <span className="font-mono font-bold">{aiWinner.expected.toFixed(0)}</span>.
        </p>
      </div>
    )
  }

  if (dominator && dominator.id === aiWinner.id) {
    return (
      <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4">
        <p className="text-sm font-semibold text-sky-300">This one is settled.</p>
        <p className="mt-1 text-sm leading-relaxed text-sky-100/80">
          <strong>{dominator.label}</strong> scores lower than every alternative in all three
          futures, so no slider can overturn it. The sliders only matter where the scenarios trade
          off against each other.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <p className="text-sm font-semibold text-slate-200">The verdict holds.</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">
        <strong className="text-slate-300">{aiWinner.label}</strong> stays the lowest-regret choice
        at these odds — scoring{' '}
        <span className="font-mono text-slate-300">{aiWinner.expected.toFixed(0)}</span> against{' '}
        {second ? (
          <>
            <span className="font-mono text-slate-300">{second.expected.toFixed(0)}</span> for{' '}
            <strong className="text-slate-300">{second.label}</strong>
          </>
        ) : (
          'no alternative'
        )}
        .
      </p>
    </div>
  )
}
