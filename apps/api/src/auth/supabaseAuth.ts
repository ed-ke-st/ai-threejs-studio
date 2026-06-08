import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    // Populated by the auth preHandler: the owning user for this request.
    userId: string;
  }
}

// Routes that must work without authentication. Shares are public BY TOKEN.
function isPublic(url: string): boolean {
  const path = url.split("?")[0];
  return path === "/health" || path === "/shares" || path.startsWith("/shares/");
}

/**
 * Registers the auth preHandler.
 *
 * Single-tenant (auth disabled): every request acts as the constant local owner,
 * preserving the original no-login behavior.
 *
 * Multi-tenant (auth enabled): verify the Supabase access token (JWKS, with an
 * HS256 fallback for legacy projects) and set request.userId from its subject.
 */
export function registerAuth(app: FastifyInstance): void {
  if (!config.auth.enabled) {
    app.log.warn("Auth disabled (no SUPABASE_URL / SUPABASE_DB_URL) — running single-tenant as local owner");
    app.addHook("preHandler", async (request) => {
      request.userId = config.auth.localOwnerId;
    });
    return;
  }

  const jwks = config.auth.supabaseJwksUrl ? createRemoteJWKSet(new URL(config.auth.supabaseJwksUrl)) : null;
  const hsSecret = config.auth.supabaseJwtSecret ? new TextEncoder().encode(config.auth.supabaseJwtSecret) : null;
  const verifyOptions = {
    audience: "authenticated",
    issuer: `${config.auth.supabaseUrl}/auth/v1`
  };

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublic(request.url)) return;

    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    try {
      const { payload } = jwks
        ? await jwtVerify(token, jwks, verifyOptions)
        : await jwtVerify(token, hsSecret!, verifyOptions);
      if (!payload.sub) {
        return reply.code(401).send({ error: "Invalid token: missing subject" });
      }
      request.userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }
  });
}
