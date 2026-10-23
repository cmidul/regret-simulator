import OptionCard from './OptionCard.jsx'

export default function DecisionMap({ options, probs, aiWinnerId, userWinnerId, flipped }) {
  if (!options?.length) return null

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">The Decision Map</h2>
          <p className="text-sm text-slate-500">
            Three futures per option, with the regret each one would cost you.
          </p>
        </div>
        <span className="label-caps hidden sm:block">0 = nothing · 100 = devastating</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {options.map((o, i) => (
          <div key={o.id || i} className="rise h-full">
            <div className="h-full">
              <OptionCard
                option={o}
                index={i}
                probs={probs}
                isAiWinner={o.id === aiWinnerId}
                isUserWinner={o.id === userWinnerId}
                flipped={flipped}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
