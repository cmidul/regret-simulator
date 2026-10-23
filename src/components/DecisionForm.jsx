import { useRef, useState } from 'react'
// Shows an example (per the placeholder guideline) and trails with an ellipsis.
const PLACEHOLDER =
  'e.g. I have an exam tomorrow, but my project deadline is tonight — what should I prioritize…'

export default function DecisionForm({ onSubmit, busy, health, onRetryHealth }) {
  const [text, setText] = useState('')
  const [attempted, setAttempted] = useState(false)
  const inputRef = useRef(null)

  const down = health && health.ok === false
  const tooShort = text.trim().length > 0 && text.trim().length < 8

  function submit(e) {
    e.preventDefault()
    if (busy) return
    const value = text.trim()

    if (value.length < 8) {
      // Guidelines: focus the first error rather than just colouring it.
      setAttempted(true)
      requestAnimationFrame(() => inputRef.current?.focus())
      return
    }
    setAttempted(false)
    onSubmit(value)
  }

  const showError = attempted && text.trim().length < 8

  return (
    <form onSubmit={submit} className="panel p-5 sm:p-6">
      <label htmlFor="decision" className="label-caps block">
        The Decision on the Table
      </label>

      <textarea
        ref={inputRef}
        id="decision"
        name="decision"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e)
        }}
        rows={3}
        disabled={busy}
        placeholder={PLACEHOLDER}
        aria-describedby="decision-hint"
        aria-invalid={showError || undefined}
        className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-[15px] leading-relaxed text-slate-100 placeholder:text-slate-500 transition-colors focus:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:opacity-60"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* Polite live region: announces the validation hint without stealing focus. */}
        <p id="decision-hint" role="status" className="text-xs text-slate-500">
          {showError ? (
            <span className="text-amber-400">
              Add a little more detail — a full sentence helps.
            </span>
          ) : (
            <>
              Be specific about constraints and deadlines.{' '}
              <span className="text-slate-600">Ctrl&nbsp;+&nbsp;Enter to run</span>
            </>
          )}
        </p>

        <button type="submit" disabled={busy || text.trim().length < 8} className="btn-primary">
          {busy ? (
            <>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent"
              />
              Simulating…
            </>
          ) : (
            <>Simulate Regret</>
          )}
        </button>
      </div>

      {down && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <p className="font-semibold text-red-300">Ollama is not responding</p>
          <p className="mt-1 text-red-200/80">{health?.error}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded bg-slate-950/70 px-2 py-1 font-mono text-xs text-red-200">
              ollama serve
            </code>
            <button
              type="button"
              onClick={onRetryHealth}
              className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20"
            >
              Check Again
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
