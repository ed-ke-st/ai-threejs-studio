# API auth sketch — JWT verify + assertOwner

**DRAFT / reference only.** These are sketches for Phase 2–3 of
`docs/accounts-migration-plan.md`. Nothing here is wired into the running API yet,
and the `jose` dependency is not installed. Treat as the shape to implement, not
finished code.

## 1. Verify the Supabase JWT (`apps/api/src/auth/supabaseAuth.ts`)

Newer Supabase projects sign access tokens asymmetrically (RS256/ES256), so verify
against the project JWKS rather than a shared HS256 secret. `jose` caches the JWKS.

```ts
// apps/api/src/auth/supabaseAuth.ts  (DRAFT)
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest, FastifyInstance } from "fastify";
import { config } from "../config.js";

// JWKS endpoint for the project, e.g. https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
const jwks = createRemoteJWKSet(new URL(config.supabaseJwksUrl));

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

// Routes that must NOT require auth. Shares are public BY TOKEN.
function isPublic(url: string): boolean {
  return (
    url === "/health" ||
    url.startsWith("/shares/")   // GET /shares/:id and /shares/:id/* serve public bundles
  );
}

export function registerAuth(app: FastifyInstance): void {
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublic(request.url)) return;

    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        // Supabase sets aud="authenticated"; issuer is <supabaseUrl>/auth/v1
        audience: "authenticated",
        issuer: `${config.supabaseUrl}/auth/v1`,
      });
      request.userId = payload.sub; // auth.users.id
    } catch {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }
  });
}
```

`config.ts` gains: `supabaseUrl`, `supabaseJwksUrl`, `supabaseServiceRoleKey`
(from `SUPABASE_URL`, derived JWKS url, `SUPABASE_SERVICE_ROLE_KEY`). `server.ts`
calls `registerAuth(app)` after CORS and before `registerRoutes`.

> Legacy fallback: older projects use an HS256 secret — `jwtVerify(token, new
> TextEncoder().encode(config.supabaseJwtSecret), {...})`. Prefer JWKS for new projects.

## 2. Ownership guard (`assertOwner`)

Every project route today follows the same shape:

```ts
const { id } = request.params as { id: string };
const project = projectRepository.getProject(id);
if (!project) return reply.code(404).send({ error: "Project not found" });
```

Replace that with an ownership-aware lookup. Returning **404 (not 403)** on an
owner mismatch avoids leaking which ids exist.

```ts
// helper alongside the routes (DRAFT)
async function requireOwnedProject(
  request: FastifyRequest,
  reply: FastifyReply,
  id: string
): Promise<Project | null> {
  const project = await projectRepository.getProject(id);
  if (!project || project.ownerId !== request.userId) {
    reply.code(404).send({ error: "Project not found" });
    return null;
  }
  return project;
}
```

Usage in a handler — the early-return keeps the existing control flow:

```ts
app.get("/projects/:id/scene3d", async (request, reply) => {
  const { id } = request.params as { id: string };
  const project = await requireOwnedProject(request, reply, id);
  if (!project) return; // 404 already sent
  return { scene: await readScene3D(storage, id) };
});
```

**Apply `requireOwnedProject` at the top of every `/projects/:id*` route:**
`GET /projects/:id`, `/files`, `/files/*` (GET+PUT), `/scene3d` (GET+PUT),
`/scene3d/agent-run`, `/assets` (+upload, +content), `/snapshots` (+create,
+restore), `/preview` (+start), `/build`, `/export/source`, `/export/build`,
`/share`, and `DELETE /projects/:id`.

Scope the list + create routes too:

```ts
app.get("/projects", async (request) => ({
  projects: await projectRepository.listProjects(request.userId!), // owner-scoped
}));

app.post("/projects", async (request, reply) => {
  const input = createProjectSchema.parse(request.body ?? {});
  const project = await projectRepository.createProject({ ...input, ownerId: request.userId! });
  // ...unchanged: write template + Scene3D files, initial snapshot...
});
```

## 3. Repo interface changes (`projects.ts`)

The in-memory `Map` + `.studio/projects.json` repo becomes Postgres-backed
(same class surface, async). Signatures change to carry ownership:

```ts
getProject(projectId: string): Promise<Project | null>   // now async
listProjects(ownerId: string): Promise<Project[]>        // owner-scoped
createProject(input: CreateProjectInput & { ownerId: string }): Promise<Project>
// touchProject / deleteProject unchanged in shape (already keyed by id)
```

`Project` (packages/shared) gains `ownerId: string`.

## 4. Backfill (one-time script)

Existing `.studio/projects.json` records have no owner. Seed/choose a dev account
(its `auth.users.id`), then insert each existing project into `public.projects`
with that `owner_id`, **preserving the existing nanoid id** and `created_at/updated_at`.
Do not delete the on-disk workspaces — keep test artifacts intact.

## Wiring left undone (intentionally plan-only)

- Add `jose` to `apps/api`.
- Add Supabase config fields + `.env` entries.
- `registerAuth(app)` in `server.ts`.
- Swap `LocalProjectRepository` impl to Postgres; make `getProject` async (callers await).
- Edit each route to use `requireOwnedProject`.
