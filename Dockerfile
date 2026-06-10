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

# Project workspaces are written under /app/.studio — mount a volume there until
# bundles move to object storage (see docs/accounts/DEPLOY.md).
VOLUME ["/app/.studio"]

CMD ["pnpm", "--filter", "@ai-threejs-studio/api", "start"]
