export default function HedgePlan({ plan }) {
  if (!plan) return null
  const steps = plan.steps || []

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-800 bg-gradient-to-r from-emerald-500/10 to-transparent p-5 sm:p-6">
        <span className="label-caps !text-emerald-300">Low-Risk Action Plan</span>
        <p className="mt-2.5 text-lg font-medium leading-snug text-slate-100">
          {plan.one_line || 'No plan was returned.'}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          The hedge that keeps every option alive while you gather more information.
        </p>
      </div>

      {steps.length > 0 && (
        <ol className="divide-y divide-slate-800">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-4 px-5 py-4 sm:px-6">
              <span className="font-mono text-sm font-bold text-emerald-400/70">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[14.5px] leading-relaxed text-slate-300">{s}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
