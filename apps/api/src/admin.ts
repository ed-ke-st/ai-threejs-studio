import type { FastifyReply } from "fastify";
import { config } from "./config.js";
import { getSql } from "./db.js";

export interface AdminProfile {
  id: string;
  role: "user" | "admin";
  displayName: string | null;
}

export async function getAdminProfile(userId: string): Promise<AdminProfile | null> {
  if (!config.auth.enabled) {
    return { id: userId, role: "admin", displayName: "Local admin" };
  }
  const sql = getSql();
  const [row] = await sql<{ id: string; role: "user" | "admin"; display_name: string | null }[]>`
    select id, role, display_name
    from profiles
    where id = ${userId}
    limit 1
  `;
  if (!row) return null;
  return { id: row.id, role: row.role, displayName: row.display_name };
}

export async function requireAdmin(userId: string, reply: FastifyReply): Promise<AdminProfile | null> {
  const profile = await getAdminProfile(userId);
  if (profile?.role !== "admin") {
    reply.code(403).send({ error: "Admin access required." });
    return null;
  }
  return profile;
}
