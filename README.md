# AI Three.js Studio

An AI-assisted workspace for turning a prompt into an editable Three.js or
React Three Fiber scene. Generate a structured starting point, inspect the scene
hierarchy, tune objects and materials, preview the result, and export source you
can keep.

[View the private-beta landing page](https://ai-threejs-studio-web.vercel.app/) ·
[Request beta access](https://ai-threejs-studio-web.vercel.app/request-access) ·
[Read the architecture](docs/architecture.md)

> The hosted editor is invite-only while build isolation and usage controls are
> tested. The source is available under the [MIT License](LICENSE).

## What it does

- Generates and revises validated Scene3D data with OpenAI, Anthropic, or Gemini.
- Combines a scene hierarchy, visual inspector, prompt workflow, and live preview.
- Handles GLB/glTF models, textures, HDRIs, and project-level asset storage.
- Produces sandboxed share previews and exportable project source.
- Supports local single-user development or Supabase-backed multi-tenant accounts.

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

Optional multi-tenant accounts, per-user encrypted provider keys, prepaid
credits, and PayPal billing run on Supabase (Postgres + Auth + Storage). These
are off by default; the app runs single-tenant with local storage otherwise.

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

## Hosted architecture

The beta web client runs on Vercel, the authenticated API and isolated preview
build worker run on Railway, and Supabase provides Auth, Postgres, and object
storage. The browser reaches the API through a same-origin `/api` proxy; project
ownership is enforced server-side and in Postgres row-level-security policies.

The hosted editor is deliberately not an unrestricted code playground. Editable
source paths and file types are allowlisted, build processes receive a minimal
environment, uploads and usage are capped, and public previews receive a sandbox
content-security policy. If you find a vulnerability, see
[SECURITY.md](SECURITY.md).

## Scripts

- `pnpm dev` — run all apps in watch mode
- `pnpm build` — build all apps/packages
- `pnpm typecheck` / `pnpm lint` — type-check the workspace
- `pnpm --filter @ai-threejs-studio/api test` — API security and crypto tests
- `pnpm rag:ingest` — rebuild the local RAG index from seed docs

## Docs

- [`docs/architecture.md`](docs/architecture.md) — package layout, agent providers
- [`docs/feature-roadmap.md`](docs/feature-roadmap.md) — planned work
- [`docs/accounts-migration-plan.md`](docs/accounts-migration-plan.md) — Supabase accounts migration
- [`docs/billing-live-readiness.md`](docs/billing-live-readiness.md) — going live with PayPal billing
- [`docs/private-beta-operations.md`](docs/private-beta-operations.md) — reviewing requests and inviting beta users
- [`docs/threejs-agent-blueprint.md`](docs/threejs-agent-blueprint.md) — scene agent design

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. The public
API is still evolving, so focused issues and pull requests are preferred.
