import type postgres from "postgres";
import { config } from "./config.js";
import { getSql } from "./db.js";

export type QuotaKind = "agentRun" | "build";

const COLUMN: Record<QuotaKind, string> = { agentRun: "agent_runs", build: "builds" };
const LIMIT: Record<QuotaKind, number> = {
  agentRun: config.quota.agentRunsPerDay,
  build: config.quota.buildsPerDay
};

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number; // Number.POSITIVE_INFINITY when unlimited
}

export interface UsageService {
  /** Atomically count one use of `kind` today if under the limit; report status. */
  consume(userId: string, kind: QuotaKind): Promise<QuotaStatus>;
  /** Return one previously consumed use (the run failed or was cancelled, so it
   *  shouldn't count against the daily quota). */
  refund(userId: string, kind: QuotaKind): Promise<void>;
  /** Read-only snapshot of today's usage for the UI. */
  status(userId: string): Promise<Record<QuotaKind, QuotaStatus>>;
}

const UNLIMITED: QuotaStatus = { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY };

/** Single-tenant (operator): no quotas. */
export class NoopUsageService implements UsageService {
  async consume(): Promise<QuotaStatus> {
    return UNLIMITED;
  }
  async refund(): Promise<void> {}
  async status(): Promise<Record<QuotaKind, QuotaStatus>> {
    return { agentRun: UNLIMITED, build: UNLIMITED };
  }
}

/** Multi-tenant: per-user, per-day counters in the usage_quota table. */
export class PostgresUsageService implements UsageService {
  constructor(private readonly sql: postgres.Sql) {}

  async consume(userId: string, kind: QuotaKind): Promise<QuotaStatus> {
    const limit = LIMIT[kind];
    if (!Number.isFinite(limit) || limit <= 0) return { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY };
    const col = COLUMN[kind];
    // Atomic: insert today's row at 1, or increment only while still under the
    // limit. The conditional DO UPDATE returns no row when already at the cap.
    const rows = await this.sql.unsafe(
      `insert into usage_quota (user_id, day, ${col}) values ($1, current_date, 1)
       on conflict (user_id, day) do update set ${col} = usage_quota.${col} + 1
         where usage_quota.${col} < $2
       returning ${col} as used`,
      [userId, limit]
    );
    if (rows.length > 0) {
      return { allowed: true, used: Number((rows[0] as unknown as { used: number }).used), limit };
    }
    return { allowed: false, used: limit, limit };
  }

  async refund(userId: string, kind: QuotaKind): Promise<void> {
    const limit = LIMIT[kind];
    if (!Number.isFinite(limit) || limit <= 0) return;
    const col = COLUMN[kind];
    await this.sql.unsafe(
      `update usage_quota set ${col} = greatest(${col} - 1, 0) where user_id = $1 and day = current_date`,
      [userId]
    );
  }

  async status(userId: string): Promise<Record<QuotaKind, QuotaStatus>> {
    const [row] = await this.sql<{ agent_runs: number; builds: number }[]>`
      select agent_runs, builds from usage_quota where user_id = ${userId} and day = current_date
    `;
    const used = { agentRun: row ? Number(row.agent_runs) : 0, build: row ? Number(row.builds) : 0 };
    const one = (kind: QuotaKind): QuotaStatus => {
      const limit = LIMIT[kind];
      const unlimited = !Number.isFinite(limit) || limit <= 0;
      return {
        used: used[kind],
        limit: unlimited ? Number.POSITIVE_INFINITY : limit,
        allowed: unlimited || used[kind] < limit
      };
    };
    return { agentRun: one("agentRun"), build: one("build") };
  }
}

export function createUsageService(): UsageService {
  return config.auth.enabled && config.supabaseDbUrl ? new PostgresUsageService(getSql()) : new NoopUsageService();
}
