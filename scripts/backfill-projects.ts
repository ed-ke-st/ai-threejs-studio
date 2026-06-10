/**
 * One-time backfill: copy the local single-tenant project index
 * (.studio/projects.json) into Supabase Postgres, assigning every project to a
 * chosen owner. Ids and timestamps are preserved so the on-disk workspaces
 * (.studio/projects/<id>) keep matching. Idempotent (on conflict do nothing).
 *
 * Usage:
 *   SUPABASE_DB_URL=... BACKFILL_OWNER_ID=<auth.users.id> tsx scripts/backfill-projects.ts
 *
 * Run after applying supabase/migrations/0001_init_accounts.sql and after the
 * owner account exists. Does NOT delete the local index or workspaces.
 */
import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

interface LocalProjectRecord {
  id: string;
  name: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
}

const dbUrl = process.env.SUPABASE_DB_URL;
const ownerId = process.env.BACKFILL_OWNER_ID;

if (!dbUrl) throw new Error("Set SUPABASE_DB_URL");
if (!ownerId) throw new Error("Set BACKFILL_OWNER_ID to an existing auth.users.id");

const indexPath = path.resolve(process.cwd(), ".studio/projects.json");
const raw = await fs.readFile(indexPath, "utf8");
const projects = JSON.parse(raw) as LocalProjectRecord[];

const sql = postgres(dbUrl, { ssl: "require" });

let inserted = 0;
for (const project of projects) {
  const result = await sql`
    insert into projects (id, owner_id, name, template_id, created_at, updated_at)
    values (${project.id}, ${ownerId}, ${project.name}, ${project.templateId},
            ${project.createdAt}, ${project.updatedAt})
    on conflict (id) do nothing
  `;
  inserted += result.count;
}

console.log(`Backfilled ${inserted}/${projects.length} projects to owner ${ownerId}`);
await sql.end();
