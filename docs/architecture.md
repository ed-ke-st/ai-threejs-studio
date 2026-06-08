# Architecture Notes

AI Three.js Studio starts as a local-first monorepo with a React/Vite web app, a Fastify API, shared types, and internal agent tool interfaces.

The MVP stores active project files in local workspaces under `.studio/projects`. The storage API is intentionally adapter-shaped so durable snapshots and assets can move to Supabase Storage without changing the agent or editor contracts.

## Packages

- `apps/web`: editor shell, file tree, chat/agent panel, and preview placeholder.
- `apps/api`: project CRUD, file operations, snapshots, and agent-run stubs.
- `packages/shared`: shared TypeScript contracts.
- `packages/agent-tools`: internal tool interfaces that can later be exposed through MCP.
- `packages/rag`: RAG collection definitions and official source references.
- `packages/three-templates`: starter template metadata.

## Agent Providers

The API can run the scene agent with Gemini, OpenAI, or the local fallback generator.

Use Gemini:

```bash
AI_SCENE_PROVIDER=gemini
GEMINI_AGENT_ENABLED=true
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

Use OpenAI:

```bash
AI_SCENE_PROVIDER=openai
OPENAI_AGENT_ENABLED=true
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
```

If `AI_SCENE_PROVIDER=auto`, the API prefers Gemini when `GEMINI_AGENT_ENABLED=true` and a Gemini key is present, then OpenAI when `OPENAI_AGENT_ENABLED=true` and an OpenAI key is present, then the local fallback.
