import { TONE_BG, TONE_TEXT, pct, regretTone } from '../lib/regret.js'

const SCENARIOS = [
  { key: 'best', label: 'Best case', tone: 'best' },
  { key: 'likely', label: 'Likely case', tone: 'likely' },
  { key: 'worst', label: 'Worst case', tone: 'worst' },
]

export default function OptionCard({
  option,
  probs,
  isAiWinner,
  isUserWinner,
  flipped,
  index,
}) {
  const tone = regretTone(option.expected)
  const shownScenarios = SCENARIOS.filter((s) => option?.scenarios?.[s.key])

  return (
    <article
      className={[
        'panel relative flex flex-col overflow-hidden p-5 transition',
        isUserWinner
          ? 'ring-2 ring-emerald-400/70 shadow-[0_0_40px_-12px_rgba(52,211,153,0.5)]'
          : 'hover:border-slate-700',
      ].join(' ')}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <Badge label="AI's verdict" show={isAiWinner} tone="sky" />
      <Badge
        label={flipped ? 'Winner under YOUR odds' : 'Lowest expected regret'}
        show={isUserWinner}
        tone="emerald"
      />

      <header className={isAiWinner || isUserWinner ? 'mb-4 pt-7' : 'mb-4'}>
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 font-mono text-sm font-bold text-slate-200">
            {option.id || '?'}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-snug text-slate-100">
              {option.label || 'Untitled option'}
            </h3>
            {option.summary && (
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{option.summary}</p>
            )}
          </div>
        </div>
      </header>

      {/* Live scores, recomputed on every slider move with no AI call. */}
      <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <div>
          <p className="label-caps">Expected regret</p>
          <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>
            {option.expected.toFixed(0)}
          </p>
        </div>
        <div>
          <p className="label-caps">Downside exposure</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-400">
            {option.downside.toFixed(0)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {shownScenarios.map((s) => (
          <ScenarioBlock
            key={s.key}
            label={s.label}
            tone={s.tone}
            scenario={option.scenarios[s.key]}
            liveProb={probs[SCENARIOS.findIndex((x) => x.key === s.key)]}
          />
        ))}
      </div>
    </article>
  )
}

function ScenarioBlock({ label, tone, scenario, liveProb }) {
  const regret = Number(scenario.regret)
  const barTone = regretTone(regret)

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${TONE_TEXT[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_BG[tone]}`} />
          {label}
        </span>
        <span className="font-mono text-[11px] text-slate-500" title="Your current weighting">
          {pct(liveProb)}
        </span>
      </div>

      {scenario.title && (
        <p className="mt-2 text-[13px] font-medium leading-snug text-slate-200">{scenario.title}</p>
      )}

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="label-caps !text-[10px]">Regret</span>
          <span className={`font-mono text-sm font-bold tabular-nums ${TONE_TEXT[barTone]}`}>
            {Number.isFinite(regret) ? regret : '–'}
            <span className="text-slate-600">/100</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${TONE_BG[barTone]} transition-[width] duration-500`}
            style={{ width: `${Math.max(0, Math.min(100, regret || 0))}%` }}
          />
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {(scenario.consequences || []).map((c, i) => (
          <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-slate-400">
            <span aria-hidden="true" className="text-slate-600">
              ›
            </span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Badge({ label, show, tone }) {
  if (!show) return null
  const styles =
    tone === 'emerald'
      ? 'bg-emerald-500 text-slate-950'
      : 'bg-sky-400 text-slate-950'
  return (
    <span
      className={`absolute right-4 top-4 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${styles}`}
    >
      {label}
    </span>
  )
}
