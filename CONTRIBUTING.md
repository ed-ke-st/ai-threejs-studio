# Contributing

Thanks for your interest in AI Three.js Studio. The project is still settling
its public API and contribution model, so start with a focused issue before a
large change.

## Local setup

You need Node.js 22 and pnpm 10.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Accounts and cloud services are optional for local development. Leave the
Supabase variables blank to use the single-tenant local mode.

## Before opening a pull request

```bash
pnpm typecheck
pnpm --filter @ai-threejs-studio/api test
pnpm build
pnpm audit --prod --audit-level high
```

Keep pull requests narrow, explain user-visible behavior, and include screenshots
for interface changes. Never commit provider keys, Supabase secrets, database
URLs, user projects, or generated local `.studio` data.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public
issue.
