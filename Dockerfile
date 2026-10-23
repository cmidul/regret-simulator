# syntax=docker/dockerfile:1
# Two stages: build the UI, then run API + UI + Ollama in one container.
#
# The model is pulled at *runtime* into a mounted volume, not baked into the
# image. Baking it in would push the image past 5 GB and make every rebuild
# re-upload gigabytes; a volume means the ~3 GB download happens once per
# deployment target and survives restarts.

# ---- Stage 1: build the client ---------------------------------------------
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:20-slim
ENV DEBIAN_FRONTEND=noninteractive

# ca-certificates + curl for the Ollama download and the startup health probe.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# TARGETARCH is set automatically by BuildKit (amd64 / arm64).
ARG TARGETARCH=amd64
RUN curl -fsSL "https://ollama.com/download/ollama-linux-${TARGETARCH}.tgz" -o /tmp/ollama.tgz \
 && tar -xzf /tmp/ollama.tgz -C /usr/local \
 && rm /tmp/ollama.tgz \
 && ollama --version

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./
# Prod deps only — the build toolchain stays in stage 1.
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=8080 \
    NODE_ENV=production \
    OLLAMA_HOST=http://127.0.0.1:11434 \
    OLLAMA_MODELS=/models \
    MODEL=gemma3:4b \
    MAX_CONCURRENT=2 \
    TRUST_PROXY=1

# Mount a volume here in the platform config so the model survives redeploys.
VOLUME /models
EXPOSE 8080

# Ollama holds the model in memory; give the runtime a real ceiling rather than
# letting it take whatever the box has.
ENV OLLAMA_KEEP_ALIVE=5m

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
