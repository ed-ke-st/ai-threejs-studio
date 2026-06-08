# Postgres-backed project repository — reference

**DRAFT / reference only.** Phase 3 of `docs/accounts-migration-plan.md`. Not wired
in; `postgres` (postgres.js) is not installed yet. This replaces the in-memory
`Map` + `.studio/projects.json` repo with a Postgres-backed one of the same class
surface (now async + owner-aware), removing the multi-instance / concurrent-write
hazard at the metadata layer.

## Client choice

Use **postgres.js** (`postgres`) against the Supabase Postgres connection string
(`SUPABASE_DB_URL`). The API connects with the service-role / direct DB credentials
and enforces ownership in code, so it does not rely on RLS. Supabase requires TLS
(`ssl: "require"`). On a long-lived container use the direct (5432) or session-pooler
connection string; avoid the transaction pooler (6543) for this stateful service.

> Alternative: `@supabase/supabase-js` with the service-role key (one lib for auth-admin
> + data). postgres.js is preferred here since the repo is plain SQL.

## `apps/api/src/projects.ts` (DRAFT replacement)

```ts
import postgres from "postgres";
import { nanoid } from "nanoid";
import type { Project, ProjectTemplateId } from "@ai-threejs-studio/shared";

export interface CreateProjectInput {
  name: string;
  templateId: ProjectTemplateId;
  ownerId: string;            // NEW — set from request.userId
}

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  template_id: ProjectTemplateId;
  created_at: Date;
  updated_at: Date;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    templateId: row.template_id,
    createdAt: row.created_at.toISOString(),   // app uses ISO strings
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresProjectRepository {
  private readonly sql: postgres.Sql;

  constructor(connectionString: string) {
    this.sql = postgres(connectionString, { ssl: "require", max: 10 });
  }

  // Kept for interface parity with the old repo; just a connectivity check now.
  async load(): Promise<void> {
    await this.sql`select 1`;
  }

  async listProjects(ownerId: string): Promise<Project[]> {
    const rows = await this.sql<ProjectRow[]>`
      select * from projects
      where owner_id = ${ownerId}
      order by updated_at desc
    `;
    return rows.map(toProject);
  }

  // NOT owner-scoped — ownership is enforced by requireOwnedProject(), and share-token
  // resolution needs to look projects up regardless of the current user.
  async getProject(projectId: string): Promise<Project | null> {
    const [row] = await this.sql<ProjectRow[]>`
      select * from projects where id = ${projectId} limit 1
    `;
    return row ? toProject(row) : null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = nanoid(12);   // preserve existing id scheme
    const [row] = await this.sql<ProjectRow[]>`
      insert into projects (id, owner_id, name, template_id)
      values (${id}, ${input.ownerId}, ${input.name}, ${input.templateId})
      returning *
    `;
    return toProject(row);
  }

  async touchProject(projectId: string): Promise<Project | null> {
    const [row] = await this.sql<ProjectRow[]>`
      update projects set updated_at = now()
      where id = ${projectId}
      returning *
    `;
    return row ? toProject(row) : null;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const result = await this.sql`delete from projects where id = ${projectId}`;
    return result.count > 0;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
```

## Caller-side ripple

- **`packages/shared`**: add `ownerId: string` to `Project`.
- **`server.ts`**: construct `new PostgresProjectRepository(config.supabaseDbUrl)` instead
  of `LocalProjectRepository`; still `await repo.load()`. Add `repo.close()` to the
  SIGINT/SIGTERM handlers.
- **`getProject` is now async** — every route awaits it (mechanical, but touches all
  `/projects/:id*` handlers; folds in naturally with the `requireOwnedProject` edit).
- **`config.ts`**: add `supabaseDbUrl` (`SUPABASE_DB_URL`).
- `config.projectIndexPath` (`.studio/projects.json`) becomes unused once backfilled —
  keep the file around as the backfill source / rollback, don't delete it.

## Backfill script (DRAFT — `scripts/backfill-projects.ts`)

One-time: assign existing `.studio/projects.json` records to a chosen account,
preserving ids + timestamps. Keep the on-disk `.studio/projects/<id>` workspaces.

```ts
import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const ownerId = process.env.BACKFILL_OWNER_ID;      // an existing auth.users.id
if (!ownerId) throw new Error("Set BACKFILL_OWNER_ID to a real auth user id");

const sql = postgres(process.env.SUPABASE_DB_URL!, { ssl: "require" });
const file = path.resolve(".studio/projects.json");
const projects = JSON.parse(await fs.readFile(file, "utf8")) as Array<{
  id: string; name: string; templateId: string; createdAt: string; updatedAt: string;
}>;

for (const p of projects) {
  await sql`
    insert into projects (id, owner_id, name, template_id, created_at, updated_at)
    values (${p.id}, ${ownerId}, ${p.name}, ${p.templateId}, ${p.createdAt}, ${p.updatedAt})
    on conflict (id) do nothing
  `;
}
console.log(`Backfilled ${projects.length} projects to owner ${ownerId}`);
await sql.end();
```

Run with `tsx scripts/backfill-projects.ts` after Phase 1 SQL is applied and the
owner account exists. `on conflict do nothing` makes it idempotent.

## What this buys

- Metadata layer is now concurrency-safe and multi-instance-safe.
- **Still single-instance overall** until: (a) project files move to object storage,
  and (b) the in-memory preview-session map in `PreviewRunner` moves out of process.
  Both remain parked.
