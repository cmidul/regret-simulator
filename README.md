# Regret Simulator

[![License: MIT](https://img.shields.io/badge/License-MIT-38bdf8.svg)](LICENSE)

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

### 1. Prerequisites

- **Node.js 18+** — verify with `node --version`. The server uses global `fetch` and `AbortSignal.timeout`, which land in 18.
- **[Ollama](https://ollama.com/download)** — macOS, Windows and Linux.

### 2. Get a model

```bash
ollama pull gemma3:4b    # ~3 GB download, needs ~5 GB of free RAM to run
ollama list              # should now show the model
```

Any instruct model works — the app reads whatever Ollama reports and uses the first one. Size is the main trade-off:

| Model size | RAM to run | What to expect |
|---|---|---|
| 1–3B | ~3 GB | Fastest, but noticeably more malformed output and retry passes |
| 3–8B | ~5–8 GB | The sweet spot for a laptop |
| 14B+ | ~16 GB+ | Much better reasoning, but expect multi-minute waits on a CPU |

**If `ollama list` says it can't connect**, the daemon isn't running. The desktop app and the Windows/macOS installers start it automatically, but a bare Linux install does not — run `ollama serve` in a separate terminal. After installing, open a *new* terminal so `ollama` is on your `PATH`.

### 3. Clone and run

```bash
git clone https://github.com/cmidul/regret-simulator.git
cd regret-simulator
npm install
npm run dev
```

Open **http://localhost:5173**.

`npm run dev` starts two processes via `concurrently` — Vite on **5173** and the API on **3001**, with Vite proxying `/api` across. If either port is busy, stop whatever is holding it.

### 4. Check it worked

The dot in the top-right corner turns **green** once the server reaches Ollama, and shows the model name it picked. If it's **red**, Ollama isn't reachable — start it and the app recovers on its own, no reload needed.

Then type a real decision and press **Simulate Regret**. On a laptop CPU the first run takes **1–3 minutes**; the progress panel fills in as each section of the JSON finishes parsing, so it shouldn't look hung.

## Configuration

Both are optional environment variables.

| Variable | Default | |
|---|---|---|
| `PORT` | `3001` | Express port |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint |

```bash
OLLAMA_HOST=http://localhost:11434 PORT=3001 npm run dev
```

### Server-only variables

These matter once the app is public. Defaults are deliberately conservative.

| Variable | Default | |
|---|---|---|
| `MODEL` | unset locally, `gemma3:4b` in Docker | Pin a specific tag to pull and prefer. Left unset, the app uses whichever model Ollama reports first. |
| `MAX_CONCURRENT` | `2` | Hard cap on simultaneous generations. |
| `RATE_MAX` | `6` | Simulations allowed per IP per `RATE_WINDOW_MS`. |
| `RATE_WINDOW_MS` | `600000` | The rate-limit window (10 minutes). |
| `TRUST_PROXY` | unset | Number of proxies in front of the app. **Set this in production** or the rate limiter treats every visitor as the same IP. |

## Deploying

In production the Express server also serves the built UI, so one process handles both the API and the page. The client already calls `/api/*` with relative URLs, so there is no second origin and nothing to configure for CORS.

### Free, right now: a tunnel off your own machine

If the budget is zero, you can share a working link today without any hosting at all. `cloudflared` gives your local app a public HTTPS URL through Cloudflare — no account, no card.

**Windows:** double-click **`share.cmd`** in the project folder. It starts Ollama if needed, builds the UI, launches the app, and opens a tunnel, leaving the share URL in its own window. Keep all the windows it opens.

**macOS / Linux** — install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), then run these in two separate terminals:

```bash
# terminal 1 — the app
npm run build
TRUST_PROXY=1 RATE_MAX=10 node server/index.js
```

```bash
# terminal 2 — the tunnel
cloudflared tunnel --url http://localhost:3001
```

PowerShell users need the env vars set separately, since inline `VAR=x command` syntax is POSIX-only:

```powershell
npm run build
$env:TRUST_PROXY = "1"; $env:RATE_MAX = "10"; node server/index.js
```

`TRUST_PROXY=1` matters here: cloudflared terminates every connection, so without it the rate limiter sees one IP for the entire internet and throttles all your visitors as a single client.

The trade-offs are real. The link only lives while your machine is on and all the processes keep running, and it changes every time you restart the tunnel. It's a good way to let people try the thing; it is not a deployment.

### Build it

```bash
npm run build      # produces dist/
npm start          # serves dist/ + the API on PORT
```

### Docker

```bash
docker build -t regret-simulator .
docker run -p 8080:8080 -v ollama-models:/models regret-simulator
```

The image ships the app and the Ollama binary. The **model is pulled at first boot** into the `/models` volume — about 3 GB, once. Later boots find it already there and start in seconds. Baking the model into the image would push it past 5 GB and force a re-upload on every rebuild, so the volume is doing real work here; mount one in your platform config or the download repeats on every deploy.

The entrypoint starts Ollama, waits for it to accept requests, pulls `MODEL` if missing, then `exec`s node so it becomes PID 1 and receives SIGTERM on redeploy.

### Sizing

A 4-bit 4B model needs roughly **4 GB of RAM** for the model plus headroom for the runtime, so **8 GB is the safe floor** for a box also serving Node. CPU-only inference is the bottleneck: expect well over a minute per run on shared cores, which is inside the window the progress view was designed for but will feel slow under load. That is exactly why `MAX_CONCURRENT` defaults to 2 — Ollama serialises onto the CPU anyway, and queueing more just adds latency for everyone.

If it needs to be fast, the lever is a GPU instance, not more vCPUs.

### What the guards do

Two things protect a public instance, because each generation burns minutes of CPU:

- **Per-IP rate limit** — returns `429` with a `Retry-After` header. Invalid requests count against it too, so probing the endpoint is not free.
- **Concurrency cap** — refuses with `503` rather than queueing, since a queued generation only delays everyone already waiting.

Both are in-process, which is correct for a single container. If you ever scale to multiple replicas you'll need shared state or an external limiter.

## Testing

The first three are pure unit tests — no Ollama and no server required:

```bash
node test/regret.test.js     # expected-regret math, dominance, runner-up   35
node test/sanitize.test.js   # model-output normalisation                   26
node test/stream.test.js     # incremental JSON extraction                   8
```

69 assertions across them, no test framework — plain Node scripts with a pass/fail counter, so they run in CI without a runner installed.

`e2e.test.js` is different: it posts to `http://localhost:3001/api/simulate`, so it needs **both** Ollama running and the dev server up (`npm run dev` in another terminal, or `npm start` after a build). Then:

```bash
node test/e2e.test.js
node test/e2e.test.js "Should I take the remote job or the office one?"
```

Expect a few minutes, since it waits on a real generation. It writes the raw model response to `test/last-raw.txt` (gitignored) so you can inspect it when something looks off.

The suites that matter most are the boring ones. `sanitize.test.js` is a museum of every way a small model has actually failed in practice, and it's why a weird reply degrades into a warning banner instead of a broken page.

## Project structure

```
server/
  index.js          Express proxy, NDJSON streaming, static UI, rate limits
  prompt.js         The schema contract and retry nudges
src/
  App.jsx           Orchestration, retry loop, verdict callout
  components/       8 components — form, progress, map, lab, plan, falsifiers
  lib/
    stream.js       Incremental JSON extractor + NDJSON reader
    sanitize.js     Model-output normalisation
    regret.js       Expected-regret math, dominance detection
docker/
  entrypoint.sh     Boots Ollama, ensures the model, starts the app
test/               Unit suites + live e2e
Dockerfile          Two-stage: build the UI, then run API + UI + Ollama
```

## Notes

- **Latency is hardware-bound.** On a laptop CPU, expect 1–3 minutes depending on how many options the model invents. The progress view is designed around that: stages light up as their section finishes parsing.
- **Incomplete sections are normal, and handled.** Smaller models sometimes skip `hedge_plan` or the verdict's reasoning. The app flags the gap and carries on rather than failing the run.
- **No data leaves your machine.** There's no analytics, no telemetry, and no network call that doesn't go to your own Ollama instance.

## Troubleshooting

**Red dot in the header** — the server can't reach Ollama. Confirm with `ollama list`. If that fails, the daemon isn't running: `ollama serve`, or start the desktop app. The app polls and recovers by itself, so no reload is needed.

**`ollama` is not recognized** — the installer updates `PATH` for new processes only. Open a fresh terminal, or on Windows sign out and back in.

**`EADDRINUSE` on 3001 or 5173** — something else holds the port. On Windows: `Get-NetTCPConnection -LocalPort 3001 -State Listen` then `Stop-Process -Id <pid>`. On macOS/Linux: `lsof -i :3001`.

**Out of memory, or Ollama exits on load** — the model is too large for your RAM. `ollama pull` something smaller and the app picks it up on the next run.

**Runs take many minutes** — CPU inference. `think: false` and `temperature: 0.4` are already tuned for speed here; the remaining levers are a smaller model or a GPU. This is also why the app streams progress instead of showing a spinner.

**Half the sections are missing** — a small model occasionally skips `hedge_plan` or the verdict's reasoning. The app warns and keeps going rather than failing. Re-running usually fills them in.

**JSON parse errors in the console** — the client retries once automatically. If it keeps happening, your model is likely too small for the schema; try 4B or larger.

## License

[MIT](LICENSE) © 2026 cmidul. Use it, change it, ship it — attribution appreciated but not required.
