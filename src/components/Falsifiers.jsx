export default function Falsifiers({ items }) {
  if (!items?.length) return null

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sm text-sky-300"
        >
          ?
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            What Would Change This Recommendation
          </h2>
          <p className="text-sm text-slate-500">
            Go find these before you commit. Any one of them can flip the verdict.
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {items.map((f, i) => (
          <li
            key={i}
            className="rise flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span
              aria-hidden="true"
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400"
            />
            <span className="text-[14px] leading-relaxed text-slate-300">{f}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
