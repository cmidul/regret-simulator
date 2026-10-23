import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DecisionForm from './components/DecisionForm.jsx'
import LiveProgress from './components/LiveProgress.jsx'
import DecisionMap from './components/DecisionMap.jsx'
import ProbabilityLab from './components/ProbabilityLab.jsx'
import Assumptions from './components/Assumptions.jsx'
import HedgePlan from './components/HedgePlan.jsx'
import Falsifiers from './components/Falsifiers.jsx'
import { extractTopLevel, parseComplete, readSimulation } from './lib/stream.js'
import { sanitize } from './lib/sanitize.js'
import {
  compareVerdicts,
  defaultProbs,
  normalize,
  scoreOptions,
} from './lib/regret.js'

const MAX_ATTEMPT = 1 // two runs total, to bound the worst-case wait

const JSON_NUDGE =
  'Your last reply was not valid JSON. Return ONLY the JSON object, starting with { and ending with }. No markdown, no explanation.'

const STRUCTURE_NUDGE =
  'Your reply did not contain at least 2 entries in "options", so nothing can be compared. Return 2 or 3 genuinely different options (ids "A" and "B", plus "C" only if a third real path exists). Every option MUST carry its own DIFFERENT regret numbers. Also return "assumptions" (3 items), "hedge_plan", "would_change_mind" (3 items) and "verdict".'

export default function App() {
  const [health, setHealth] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | streaming | done | error
  const [raw, setRaw] = useState('')
  const [decision, setDecision] = useState('')
  const [model, setModel] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [retryReason, setRetryReason] = useState('')
  const [error, setError] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [rawProbs, setRawProbs] = useState([20, 60, 20])

  const rawRef = useRef('')
  const controllerRef = useRef(null)
  const startedRef = useRef(0)
  // Tracks which result the sliders were last seeded from, so they reset to the
  // model's own odds once per new simulation but not on every re-render.
  const seededRef = useRef('')

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health')
      setHealth(await res.json())
    } catch (err) {
      setHealth({ ok: false, error: err.message })
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  // Elapsed clock only runs while generating.
  useEffect(() => {
    if (phase !== 'streaming') return undefined
    const id = setInterval(() => setElapsedMs(Date.now() - startedRef.current), 250)
    return () => clearInterval(id)
  }, [phase])

  const run = useCallback(async (text, attempt = 0, nudge = '') => {
    const controller = new AbortController()
    controllerRef.current = controller
    startedRef.current = Date.now()
    setElapsedMs(0)

    if (attempt === 0) {
      rawRef.current = ''
      setRaw('')
      setError('')
      setRetrying(false)
      setRetryReason('')
      seededRef.current = ''
    } else {
      setRetrying(true)
      setRetryReason(nudge === JSON_NUDGE ? 'json' : 'structure')
    }

    try {
      await readSimulation(text, {
        signal: controller.signal,
        attempt,
        nudge,
        onMeta: (ev) => setModel(ev.model || ''),
        onToken: (t) => {
          rawRef.current += t
          setRaw(rawRef.current)
        },
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        setPhase('idle')
        return
      }
      setError(err.message)
      setPhase('error')
      return
    }

    // The stream finished — but is it actually usable?
    const parsed = parseComplete(rawRef.current)
    const usable = (sanitize(parsed.data)?.options?.length || 0) >= 2

    if (attempt < MAX_ATTEMPT && (!parsed.ok || !usable)) {
      rawRef.current = ''
      setRaw('')
      await run(text, attempt + 1, !parsed.ok ? JSON_NUDGE : STRUCTURE_NUDGE)
      return
    }

    if (!parsed.ok) {
      setError('The response could not be parsed, even after a retry.')
      setPhase('error')
      return
    }
    if (!usable) {
      setError(
        'The model kept returning a single option, so there is nothing to compare. Try naming the choices explicitly in your decision.',
      )
      setPhase('error')
      return
    }

    setPhase('done')
  }, [])

  const submit = useCallback(
    (text) => {
      setDecision(text)
      setPhase('streaming')
      run(text)
    },
    [run],
  )

  const abort = useCallback(() => {
    controllerRef.current?.abort()
    setPhase('idle')
    setRaw('')
    rawRef.current = ''
    setRetrying(false)
    setRetryReason('')
  }, [])

  const reset = useCallback(() => {
    setPhase('idle')
    setRaw('')
    rawRef.current = ''
    setDecision('')
    setError('')
    setRetrying(false)
    setRetryReason('')
  }, [])

  const partial = useMemo(() => extractTopLevel(raw), [raw])
  const finalParse = useMemo(() => parseComplete(raw), [raw])

  // While streaming we render from the partial extraction; once finished we use
  // the strict parse (which may still be null on a hard failure).
  const rawResult = phase === 'streaming' ? partial : finalParse.data || partial
  // Never trust the model's shape — see lib/sanitize.js.
  const result = useMemo(() => sanitize(rawResult), [rawResult])

  // Seed the sliders with the model's own probabilities, once per finished result.
  useEffect(() => {
    if (phase !== 'done' || !result?.options?.length) return
    const key = `${decision.length}:${raw.length}`
    if (seededRef.current === key) return
    seededRef.current = key
    setRawProbs(defaultProbs(result))
  }, [phase, result, raw, decision])

  const probs = useMemo(() => normalize(rawProbs[0], rawProbs[1], rawProbs[2]), [rawProbs])

  const scored = useMemo(() => scoreOptions(result, probs), [result, probs])

  const compare = useMemo(
    () => compareVerdicts(result, scored),
    [result, scored],
  )

  const isDefaultProbs =
    Math.abs(rawProbs[0] - 20) + Math.abs(rawProbs[1] - 60) + Math.abs(rawProbs[2] - 20) < 0.001

  const showResults = phase === 'done' || phase === 'error' || phase === 'streaming'
  const hasOptions = Boolean(scored.length)

  return (
    <div className="min-h-screen">
      {/* Skip link: hidden until focused, so keyboard users can reach results
          without tabbing through the form on every pass. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-sky-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-950"
      >
        Skip to results
      </a>

      <Header health={health} onRetryHealth={checkHealth} />

      <main id="main" tabIndex={-1} className="app-main mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Hero visible={phase === 'idle' && !decision} />

        <div className="mt-6">
          <DecisionForm
            onSubmit={submit}
            busy={phase === 'streaming'}
            health={health}
            onRetryHealth={checkHealth}
          />
        </div>

        {phase === 'streaming' && (
          <div className="mt-6 space-y-6">
            <LiveProgress
              partial={partial}
              elapsedMs={elapsedMs}
              model={model}
              retry={retrying}
              retryReason={retryReason}
              onAbort={abort}
            />
            {hasOptions && (
              <DecisionMap
                options={scored}
                probs={probs}
                aiWinnerId={compare.aiWinner?.id}
                userWinnerId={compare.userWinner?.id}
                flipped={compare.flipped}
              />
            )}
          </div>
        )}

        {showResults && phase !== 'streaming' && (
          <div className="mt-6 space-y-6">
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
              >
                <p className="font-semibold text-red-300">Simulation failed</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            {hasOptions ? (
              <>
                <MissingSections result={result} />

                <DecisionMap
                  options={scored}
                  probs={probs}
                  aiWinnerId={compare.aiWinner?.id}
                  userWinnerId={compare.userWinner?.id}
                  flipped={compare.flipped}
                />

                <ProbabilityLab
                  raw={rawProbs}
                  setRaw={setRawProbs}
                  probs={probs}
                  scored={scored}
                  compare={compare}
                  onReset={() => setRawProbs(defaultProbs(result))}
                  isDefault={isDefaultProbs}
                />

                <VerdictCall result={result} compare={compare} />
                <Assumptions items={result?.assumptions} />
                <HedgePlan plan={result?.hedge_plan} />
                <Falsifiers items={result?.would_change_mind} />
              </>
            ) : (
              !error && (
                <p className="text-sm text-slate-500">
                  Waiting for the option map to finish parsing…
                </p>
              )
            )}

            <div className="flex justify-center pt-2">
              <button type="button" onClick={reset} className="btn-ghost">
                Simulate Another Decision
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        Runs entirely on your machine via Ollama
        {model ? (
          <>
            {' '}
            ·<span translate="no"> {model}</span>
          </>
        ) : (
          ''
        )}{' '}
        · nothing is sent anywhere
      </footer>
    </div>
  )
}

function MissingSections({ result }) {
  const missing = []
  if (!result?.assumptions?.length) missing.push('assumptions')
  if (!result?.hedge_plan?.one_line && !result?.hedge_plan?.steps?.length) missing.push('action plan')
  if (!result?.would_change_mind?.length) missing.push('what would change this')
  if (!result?.verdict?.reason) missing.push('verdict reasoning')

  if (!missing.length) return null

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 font-bold">
        !
      </span>
      <p>
        The model skipped {listWords(missing)} this time. The map and the probability lab above are
        still complete. Re-running usually fills them in.
      </p>
    </div>
  )
}

function listWords(items) {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function VerdictCall({ result, compare }) {
  const reason = result?.verdict?.reason
  if (!reason) return null
  const picked = compare.aiWinner

  return (
    <section className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:p-6">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sm font-bold text-sky-300"
      >
        ✓
      </span>
      <div>
        <p className="label-caps !text-sky-300">The AI’s Call{picked ? ` — ${picked.label}` : ''}</p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-200">{reason}</p>
        {compare.flipped && (
          <p className="mt-2 text-sm text-emerald-300/90">
            Your own odds disagree — see the probability lab above.
          </p>
        )}
      </div>
    </section>
  )
}

function Hero({ visible }) {
  if (!visible) return null
  return (
    <section className="pt-10 sm:pt-16">
      <span className="label-caps !text-sky-400">Regret Simulator</span>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-[1.08] tracking-tight text-slate-50 sm:text-5xl">
        See what could go wrong
        <span className="block bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
          before you decide.
        </span>
      </h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-400">
        Describe a real decision. The model lays out the best, likely and worst future of every
        option — then you rewrite the odds and watch the verdict move. Assumptions, a low-risk
        plan and what would change the answer are included.
      </p>
    </section>
  )
}

function Header({ health, onRetryHealth }) {
  const status =
    health === null
      ? { text: 'Checking…', dot: 'bg-slate-500' }
      : health.ok
        ? { text: `${health.active || 'connected'}`, dot: 'bg-emerald-400' }
        : { text: 'Offline', dot: 'bg-red-400' }

  return (
    <header className="app-header sticky top-0 z-40 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between py-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-emerald-400 text-sm font-black text-slate-950"
          >
            R
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-200">
            Regret Simulator
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRetryHealth}
            aria-label={`Ollama status: ${status.text}. Activate to check again.`}
            className="flex items-center gap-2 rounded-full border border-slate-800 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            <span aria-hidden="true" translate="no">
              {status.text}
            </span>
          </button>
          {/* Separate live region: aria-label above suppresses the visible text,
              so the announcement needs somewhere to come from. */}
          <span role="status" className="sr-only">
            {status.text}
          </span>
        </div>
      </div>
    </header>
  )
}
