import postgres from "postgres";
import { config } from "./config.js";

let sql: postgres.Sql | null = null;

/**
 * Shared Supabase Postgres connection pool, used by the Postgres-backed repos in
 * multi-tenant mode. Lazily created so single-tenant runs never open a connection.
 */
export function getSql(): postgres.Sql {
  if (!config.supabaseDbUrl) {
    throw new Error("SUPABASE_DB_URL is not configured");
  }
  if (!sql) {
    sql = postgres(config.supabaseDbUrl, { ssl: "require", max: 10 });
  }
  return sql;
}

export async function closeSql(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
