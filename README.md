# Regret Simulator

See the best, likely, and worst outcome of any decision — then rewrite the odds and watch the verdict move.

Everything runs on your machine. Your decision never leaves your laptop.

```
Should I accept the job offer in another city, or stay at my current job?
```

becomes

| | Option | Expected regret |
|---|---|---|
| 1 | Accept New Job Offer | **47** |
| 2 | Delay Decision (Explore Further) | 49 |
| 3 | Stay at Current Job | 55 ← AI pick |

…with sliders under it that recalculate the ranking instantly, and a banner that tells you the moment your own odds disagree with the model's.

## What it does

You describe a real decision in plain language. A local LLM works through it and returns:

- **Options** — 2–3 genuinely different paths, not variations of the same one
- **Three futures per option** — best case, likely case, worst case, each with concrete consequences rather than filler
- **Assumptions** — the load-bearing beliefs the predictions rest on
- **A low-risk plan** — the move that keeps optionality open
- **Falsifiers** — what would change the recommendation, so you can go find it before committing
- **A verdict** — which option wins, and why

Then the **Probability Lab** takes over. The model's probabilities are just a guess, so you get sliders for each scenario. Drag them and every score, ranking, and comparison recalculates in the browser — no second model call, no waiting.

## Why expected *regret*

The scoring is regret minimisation, not expected value. Each outcome is rated on a 0–100 "how much would you regret this" scale, and the score is the probability-weighted average across the three futures.

This matters for exactly the decisions this tool is for: ones where the payoffs are hard to compare in raw units, but the sting of a bad outcome is easy to feel. It's a structured way to ask *"which mistake do I less want to be wrong about?"*

The UI is honest about what it's showing you. It calls out when:

- **Your odds flip the verdict** — you disagree with the model, and here's what that costs
- **The model contradicts itself** — its stated probability ordering doesn't match its own ranking
- **One option dominates** — no slider position can change the answer, so stop dragging

## Architecture

```
Browser ──▶ Vite (5173) ──▶ Express (3001) ──▶ Ollama (11434)
  React        /api proxy      NDJSON stream     /api/chat
```

There's a Node proxy rather than calling Ollama from the browser. Two reasons: Ollama's CORS story is a config flag you have to remember to set, and the proxy is where the retry loop and prompt nudges live.

### How a run flows

1. The client posts to `/api/simulate`. The server picks a model from `/api/tags` and streams NDJSON.
2. Tokens arrive raw, but the client runs an **incremental JSON extractor** — a brace-depth scanner that pulls out complete top-level keys as they close. So `options` renders while the model is still writing `assumptions`. On a CPU, a run takes 1–3 minutes, and a blank screen for that long reads as a hang.
3. Output goes through a **sanitizer** before it touches the UI. A 4B model will hand you an options array containing `{"label": ""}`, or silently drop keys. Normalising once at the boundary is cheaper than defensive `?.` chains in eleven components.
4. If the JSON won't parse, or it parses but yields fewer than two options, the client **re-runs once** with a targeted nudge naming the specific failure. Two attempts total — enough to recover from the common failures, bounded so you're not waiting forever.

### The knobs

| Setting | Value | Why |
|---|---|---|
| `format: 'json'` | Ollama grammar | Server-side enforcement kills a whole class of malformed output |
| `temperature` | `0.4` | Below the usual 0.7 — we're buying schema adherence, not prose flair |
| `num_ctx` | `4096` | Room for the schema contract plus the retry nudge |
| `think` | `false` | Doubles latency for no measurable gain at this size |

## Quick start

### Prerequisites

- **Node.js 18+** (needs global `fetch` and `AbortSignal.timeout`)
- **[Ollama](https://ollama.com)** running locally with at least one model pulled

```bash
ollama pull gemma3:4b   # or whatever fits your hardware
ollama serve
```

The app auto-detects the first model Ollama reports, so any model works — smaller ones are just slower and more prone to needing the retry pass.

### Run it

```bash
git clone https://github.com/cmidul/regret-simulator.git
cd regret-simulator
npm install
npm run dev
```

`npm run dev` starts both the Express server and Vite together via `concurrently`. Open **http://localhost:5173**.

The header shows a green dot once it reaches Ollama. If it's red, Ollama isn't running — start it with `ollama serve` and the app will recover on its own.

## Configuration

Both are optional environment variables.

| Variable | Default | |
|---|---|---|
| `PORT` | `3001` | Express port |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint |

```bash
OLLAMA_HOST=http://localhost:11434 PORT=3001 npm run dev
```

## Testing

```bash
node test/regret.test.js     # expected-regret math, dominance, runner-up   35
node test/sanitize.test.js   # model-output normalisation                   26
node test/stream.test.js     # incremental JSON extraction                   8
node test/e2e.test.js        # full run against a live model (slow)
```

69 unit assertions, no test framework — plain Node scripts with a pass/fail counter, so they run in CI without a runner installed.

The suites that matter most are the boring ones. `sanitize.test.js` is a museum of every way a small model has actually failed in practice, and it's why a weird reply degrades into a warning banner instead of a broken page.

`e2e.test.js` hits a live model, so expect a few minutes. It writes the raw model response to `test/last-raw.txt` (gitignored) for inspection when something looks off.

## Project structure

```
server/
  index.js          Express proxy, NDJSON streaming, /api/health
  prompt.js         The schema contract and retry nudges
src/
  App.jsx           Orchestration, retry loop, verdict callout
  components/       8 components — form, progress, map, lab, plan, falsifiers
  lib/
    stream.js       Incremental JSON extractor + NDJSON reader
    sanitize.js     Model-output normalisation
    regret.js       Expected-regret math, dominance detection
test/               Unit suites + live e2e
```

## Notes

- **Latency is hardware-bound.** On a laptop CPU, expect 1–3 minutes depending on how many options the model invents. The progress view is designed around that: stages light up as their section finishes parsing.
- **Incomplete sections are normal, and handled.** Smaller models sometimes skip `hedge_plan` or the verdict's reasoning. The app flags the gap and carries on rather than failing the run.
- **No data leaves your machine.** There's no analytics, no telemetry, and no network call that doesn't go to your own Ollama instance.

## License

No license file yet — all rights reserved by default. Add one before accepting contributions.
