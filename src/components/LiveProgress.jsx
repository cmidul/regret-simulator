// Makes a ~53 second CPU-bound generation feel like progress instead of a hang.
// Stages light up as their section of the JSON finishes parsing.

export default function LiveProgress({ partial, elapsedMs, model, retry, retryReason, onAbort }) {
  const has = (k) => Boolean(partial?.[k])
  const optionsDone = has('options') && Array.isArray(partial.options)

  const retryText =
    retryReason === 'structure'
      ? 'Re-running — need at least 2 options to compare'
      : 'Re-running — first attempt was not valid JSON'

  const stages = [
    { label: 'Reading the constraints', done: true },
    { label: 'Identifying the real options', done: optionsDone },
    {
      label: 'Costing best / likely / worst futures',
      done: optionsDone && optionsComplete(partial.options),
    },
    { label: 'Surfacing hidden assumptions', done: has('assumptions') },
    { label: 'Building the low-risk hedge', done: has('hedge_plan') },
    { label: 'Listing what would change the answer', done: has('would_change_mind') },
    { label: 'Delivering the verdict', done: has('verdict') },
  ]

  const doneCount = stages.filter((s) => s.done).length
  const pct = Math.round((doneCount / stages.length) * 100)
  const seconds = Math.round(elapsedMs / 1000)

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-sky-400 pulse-soft" />
          <span className="label-caps !text-sky-300">
            {retry ? retryText : 'Simulating your futures'}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-slate-500">
          {model && <span>{model}</span>}
          <span className="tabular-nums">{seconds}s</span>
        </div>
      </div>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Simulation progress"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Async stage list: screen readers hear each stage as it completes
          instead of waiting for the whole run to finish. */}
      <ul className="mt-5 space-y-2.5" aria-live="polite" aria-busy="true">
        {stages.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span
              className={
                s.done
                  ? 'flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-slate-950'
                  : 'h-4 w-4 rounded-full border border-slate-700'
              }
            >
              {s.done ? '✓' : ''}
            </span>
            <span className={s.done ? 'text-slate-200' : 'text-slate-500'}>{s.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500">
          It streams as it works. On this CPU a full run usually takes 1–3 minutes, depending on how
          many options it invents.
        </p>
        <button
          type="button"
          onClick={onAbort}
          className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function optionsComplete(options) {
  if (!Array.isArray(options) || !options.length) return false
  return options.every(
    (o) =>
      o?.scenarios?.best?.consequences &&
      o?.scenarios?.likely?.consequences &&
      o?.scenarios?.worst?.consequences,
  )
}
