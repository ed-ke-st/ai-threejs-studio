# AI Three.js Studio

An AI-assisted development studio for Three.js / React Three Fiber. Describe a
3D scene, product configurator, interactive planner, or GLB viewer, and an
agent creates or edits the project — with a live preview, an asset library
(GLB/glTF models, textures, HDRIs, images), and safe, inspectable edits.

## Stack

- **`apps/web`** — React + Vite editor: scene canvas (`@react-three/fiber` /
  `drei`), inspector, chat/agent panel, Monaco-based file view, live preview.
- **`apps/api`** — Fastify API: project CRUD, file/asset operations,
  snapshots, and the scene agent (Claude, OpenAI, or Gemini).
- **`packages/shared`** — shared TypeScript contracts.
- **`packages/scene3d`** — the structured Scene3D JSON schema and helpers.
- **`packages/agent-tools`** — internal agent tool interfaces (MCP-ready).
- **`packages/rag`** — curated Three.js / R3F / Drei knowledge for retrieval.
- **`packages/three-templates`** — starter template metadata.

Optional multi-tenant accounts, per-user provider keys, prepaid credits, and
PayPal billing run on Supabase (Postgres + Auth + Storage) — all off by
default; the app runs single-tenant with local storage otherwise.

See [`docs/architecture.md`](docs/architecture.md) for more detail.

## Getting started

Requires Node 22+ and [pnpm](https://pnpm.io) 10.

```bash
pnpm install
cp .env.example .env   # fill in at least one AI provider key
pnpm dev                # runs web + api together
```

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:4000

### Configuration

Copy `.env.example` to `.env` and set what you need:

- **AI provider** — set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or
  `GEMINI_API_KEY` (see `docs/architecture.md` for per-provider env vars).
- **Accounts (optional)** — set `SUPABASE_URL` and `SUPABASE_DB_URL` to enable
  multi-tenant login; leave blank to run single-tenant with no auth.
- **Billing (optional)** — requires accounts plus `ALLOW_PLATFORM_KEYS=true`
  and PayPal credentials; see
  [`docs/billing-live-readiness.md`](docs/billing-live-readiness.md).

Everything else has a sane default for local development.

## Scripts

- `pnpm dev` — run all apps in watch mode
- `pnpm build` — build all apps/packages
- `pnpm typecheck` / `pnpm lint` — type-check the workspace
- `pnpm rag:ingest` — rebuild the local RAG index from seed docs

## Docs

- [`docs/architecture.md`](docs/architecture.md) — package layout, agent providers
- [`docs/feature-roadmap.md`](docs/feature-roadmap.md) — planned work
- [`docs/accounts-migration-plan.md`](docs/accounts-migration-plan.md) — Supabase accounts migration
- [`docs/billing-live-readiness.md`](docs/billing-live-readiness.md) — going live with PayPal billing
- [`docs/threejs-agent-blueprint.md`](docs/threejs-agent-blueprint.md) — scene agent design
