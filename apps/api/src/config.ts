import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

export const repoRoot = findRepoRoot(path.resolve(new URL("../../..", import.meta.url).pathname));

loadEnv({ path: path.join(repoRoot, ".env") });

// Accounts/auth. When both a Supabase URL and a Postgres connection string are
// present the API runs multi-tenant: it verifies Supabase JWTs and stores project
// metadata in Postgres. Otherwise it runs single-tenant (the original behavior),
// where every request acts as one constant local owner and metadata lives in the
// local JSON index. This keeps the app working with no Supabase setup.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseDbUrl = process.env.SUPABASE_DB_URL;
const authEnabled = Boolean(supabaseUrl && supabaseDbUrl);

export const config = {
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? 4000),
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? `http://${process.env.API_HOST ?? "127.0.0.1"}:${Number(process.env.API_PORT ?? 4000)}`,
  previewHost: process.env.PREVIEW_HOST ?? "127.0.0.1",
  previewBasePort: Number(process.env.PREVIEW_BASE_PORT ?? 4300),
  viteBinPath: path.resolve(repoRoot, "node_modules/vite/bin/vite.js"),
  chromeBinPath:
    process.env.CHROME_BIN_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  aiSceneProvider: process.env.AI_SCENE_PROVIDER ?? "auto",
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-5",
  openAiFastModel: process.env.OPENAI_FAST_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openAiCodeModel: process.env.OPENAI_CODE_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1",
  openAiRepairModel: process.env.OPENAI_REPAIR_MODEL ?? process.env.OPENAI_CODE_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1",
  openAiAgentEnabled: process.env.OPENAI_AGENT_ENABLED === "true",
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiFastModel: process.env.GEMINI_FAST_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiCodeModel: process.env.GEMINI_CODE_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiRepairModel: process.env.GEMINI_REPAIR_MODEL ?? process.env.GEMINI_CODE_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
  geminiAgentEnabled: process.env.GEMINI_AGENT_ENABLED === "true",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  // Sonnet 4.6 is the default generator — very capable on structured Scene3D JSON
  // at ~0.6x Opus token cost; bump to ANTHROPIC_CODE_MODEL=claude-opus-4-8 for the
  // hardest scenes. Repairs run on cheap/fast Haiku by default since the repair
  // loop is mechanical (fix diagnostics against an existing scene).
  anthropicCodeModel: process.env.ANTHROPIC_CODE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  anthropicRepairModel: process.env.ANTHROPIC_REPAIR_MODEL ?? "claude-haiku-4-5",
  anthropicMaxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 16_000),
  modelRequestTimeoutMs: Number(process.env.MODEL_REQUEST_TIMEOUT_MS ?? 90_000),
  maxAgentFixAttempts: Number(process.env.MAX_AGENT_FIX_ATTEMPTS ?? 3),
  auth: {
    enabled: authEnabled,
    supabaseUrl,
    // Newer Supabase projects sign access tokens asymmetrically; verify via JWKS.
    supabaseJwksUrl: supabaseUrl ? `${supabaseUrl}/auth/v1/.well-known/jwks.json` : undefined,
    // Legacy HS256 fallback for older projects.
    supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET,
    // The implicit owner of all projects when auth is disabled (single-tenant).
    localOwnerId: process.env.LOCAL_OWNER_ID ?? "local-owner",
    // When true, users without their own provider key fall back to the platform
    // env keys (otherwise BYO-only). Pairs with usage metering (Phase 5).
    allowPlatformKeys: process.env.ALLOW_PLATFORM_KEYS === "true"
  },
  supabaseDbUrl,
  // Secret that encrypts per-user provider keys at rest (required when auth is on).
  settingsEncKey: process.env.SETTINGS_ENC_KEY,
  // Per-user daily quotas (multi-tenant only). Protect server resources now, and
  // become the cost cap if platform/test tokens are ever enabled. <= 0 = unlimited.
  quota: {
    agentRunsPerDay: Number(process.env.QUOTA_AGENT_RUNS_PER_DAY ?? 100),
    buildsPerDay: Number(process.env.QUOTA_BUILDS_PER_DAY ?? 200)
  },
  projectIndexPath: path.resolve(repoRoot, ".studio/projects.json"),
  settingsPath: path.resolve(repoRoot, ".studio/settings.json"),
  workspaceRoot: path.resolve(repoRoot, process.env.STUDIO_WORKSPACE_ROOT ?? ".studio/projects"),
  assetRoot: path.resolve(repoRoot, process.env.STUDIO_ASSET_ROOT ?? ".studio/assets"),
  snapshotRoot: path.resolve(repoRoot, process.env.STUDIO_SNAPSHOT_ROOT ?? ".studio/snapshots"),
  shareRoot: path.resolve(repoRoot, process.env.STUDIO_SHARE_ROOT ?? ".studio/shares"),
  ragIndexPath: path.resolve(repoRoot, process.env.STUDIO_RAG_INDEX ?? ".studio/rag-index.json"),
  agentExampleBankPath: path.resolve(repoRoot, process.env.STUDIO_AGENT_EXAMPLES ?? ".studio/agent-examples.json"),
  retrievalTuningPath: path.resolve(repoRoot, process.env.STUDIO_RETRIEVAL_TUNING ?? ".studio/retrieval-tuning.json")
};

/**
 * Fails fast on a half-configured accounts setup (the most common multi-tenant
 * footgun) and surfaces soft misconfigurations as warnings. Call at startup.
 * Returns warning strings; throws on a hard misconfiguration.
 */
export function validateConfig(): string[] {
  const warnings: string[] = [];
  const hasUrl = Boolean(supabaseUrl);
  const hasDb = Boolean(supabaseDbUrl);

  if (hasUrl !== hasDb) {
    warnings.push(
      `Partial Supabase config: ${hasUrl ? "SUPABASE_URL is set but SUPABASE_DB_URL is missing" : "SUPABASE_DB_URL is set but SUPABASE_URL is missing"}. ` +
        "Running SINGLE-TENANT — set BOTH to enable accounts."
    );
  }

  if (authEnabled && !process.env.SETTINGS_ENC_KEY) {
    throw new Error(
      "Accounts are enabled (SUPABASE_URL + SUPABASE_DB_URL) but SETTINGS_ENC_KEY is missing. " +
        "It encrypts per-user provider keys at rest. Generate one with `openssl rand -hex 32`."
    );
  }

  if (authEnabled && !config.auth.supabaseJwksUrl && !config.auth.supabaseJwtSecret) {
    throw new Error("Accounts are enabled but no JWT verification source is available (need SUPABASE_URL for JWKS).");
  }

  return warnings;
}

function findRepoRoot(startPath: string): string {
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    if (fs.existsSync(path.join(currentPath, "pnpm-workspace.yaml"))) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return startPath;
}
