export default function Assumptions({ items }) {
  if (!items?.length) return null

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-100">
        Assumptions Behind These Predictions
      </h2>
      <p className="text-sm text-slate-500">
        Every simulation rests on these. Break one and the whole map shifts.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((a, i) => (
          <li
            key={i}
            className="rise flex gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/15 font-mono text-[11px] font-bold text-amber-300">
              {i + 1}
            </span>
            <span className="text-[13.5px] leading-relaxed text-slate-300">{a}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
