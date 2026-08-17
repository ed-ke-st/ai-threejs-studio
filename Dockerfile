# API service for ai-threejs-studio.
#
# Note: this is NOT a slim runtime image. The API spawns `vite` / `tsc` to build
# user projects and headless Chromium for visual validation, so the running
# container keeps the full toolchain and dev dependencies.
FROM node:22-bookworm-slim

# Chromium for the agent's visual-validation screenshot step.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
ENV CHROME_BIN_PATH=/usr/bin/chromium

RUN corepack enable
WORKDIR /app

# Install workspace deps first (better layer caching). Copy every package manifest
# so pnpm can resolve the workspace graph, then install the full tree.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/agent-tools/package.json packages/agent-tools/
COPY packages/rag/package.json packages/rag/
COPY packages/scene3d/package.json packages/scene3d/
COPY packages/shared/package.json packages/shared/
COPY packages/three-templates/package.json packages/three-templates/
RUN pnpm install --frozen-lockfile

# App source.
COPY . .

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4000
# Everything else (SUPABASE_*, SETTINGS_ENC_KEY, QUOTA_*, …) is supplied at runtime.
# PREVIEW_MODE defaults to "static" because NODE_ENV=production.
EXPOSE 4000

# /app/.studio is ephemeral scratch (hydrated build dirs) — projects and bundles
# live in object storage, so no persistent volume is required. (No Docker VOLUME
# here: Railway rejects it; attach a Railway Volume in the dashboard if you ever
# want to persist e.g. the RAG index.)

# Keep the API and every user-project build away from root privileges. Only the
# scratch workspace needs to be writable at runtime.
RUN mkdir -p /app/.studio && chown -R node:node /app/.studio
USER node

CMD ["pnpm", "--filter", "@ai-threejs-studio/api", "start"]
