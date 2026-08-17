import fs from "node:fs/promises";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import type { FastifyInstance } from "fastify";
import { getTemplate } from "@ai-threejs-studio/three-templates";
import type { AppSettingsUpdate, BuildResult, PreviewSession, Project, ProjectShare } from "@ai-threejs-studio/shared";
import { listModels } from "./modelCatalog.js";
import { z } from "zod";
import { createScene3DSceneFiles, defaultScene3D } from "@ai-threejs-studio/scene3d/codegen";
import { SCENE_CONFIG_PATH, validateScene3D } from "@ai-threejs-studio/scene3d";
import { config } from "./config.js";
import { Scene3DAgent } from "./agent/scene3dAgent.js";
import { Scene3DGenerator, type SceneGenerator } from "./agent/scene3dGenerator.js";
import { ClaudeSceneGenerator } from "./agent/claudeSceneGenerator.js";
import type { ProjectAssetLibrary } from "./assets/projectAssetLibrary.js";
import type { ProjectExportService } from "./export/projectExport.js";
import type { ProjectRepository } from "./projects.js";
import type { SettingsRepository } from "./settings.js";
import type { QuotaStatus, UsageService } from "./usage.js";
import type { BillingService, CreditReservation } from "./billing.js";
import { requireAdmin } from "./admin.js";
import type { PreviewRunner } from "./preview/previewRunner.js";
import type { LocalRagService } from "./rag/localRagService.js";
import { normalizeProjectFilePath, type ProjectStorage } from "./storage/localWorkspaceStorage.js";
import { getBlobStore, putDir } from "./storage/blobStore.js";
import { getSql } from "./db.js";
import { projectSourcePolicyViolation } from "./security/projectSourcePolicy.js";
import { escapeHtmlText } from "./security/htmlText.js";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80).default("Untitled Project"),
  templateId: z
    .enum(["blank-r3f-scene", "glb-viewer", "product-configurator", "room-scene", "interactive-planner"])
    .default("blank-r3f-scene")
});

const writeFileSchema = z.object({
  content: z.string()
});

const searchDocsSchema = z.object({
  query: z.string().min(1).max(500),
  collections: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  projectId: z.string().min(1).optional()
});

const uploadAssetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["model/glb", "model/gltf", "texture/image", "environment/hdri", "image/reference", "material/preset"]),
  contentBase64: z.string().min(1)
});

const referenceImageSchema = z
  .string()
  .max(1_500_000)
  .regex(/^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i);

const createSnapshotSchema = z.object({
  label: z.string().min(1).max(80).optional()
});

const accessRequestSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  name: z.string().trim().max(80).optional().default(""),
  useCase: z.string().trim().max(1_000).optional().default(""),
  website: z.string().max(200).optional().default(""),
  turnstileToken: z.string().max(2_048).optional().default("")
});

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const sceneTransformSchema = z.object({
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  scale: vector3Schema.optional()
});

const sceneMaterialSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional()
});

const sceneCameraSchema = z.object({
  framing: z.string().min(1),
  position: vector3Schema.optional(),
  target: vector3Schema.optional()
});

const sceneEnvironmentSchema = z.object({
  preset: z.string().min(1),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  notes: z.string().min(1).optional()
});

const sceneObjectSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["mesh", "group", "light", "model"]),
  label: z.string().min(1),
  editable: z.boolean(),
  visible: z.boolean(),
  assetId: z.string().min(1).optional(),
  assetUrl: z.string().min(1).optional(),
  geometry: z.enum(["box", "plane", "sphere", "cylinder", "frame", "wall", "floor", "capsule"]).optional(),
  lightKind: z.enum(["ambient", "point", "directional", "spot"]).optional(),
  intensity: z.number().min(0).max(6).optional(),
  parentId: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  transform: z.object({
    position: vector3Schema,
    rotation: vector3Schema,
    scale: vector3Schema
  }),
  material: z.object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1)
  })
});

const sceneMetadataSchema = z.object({
  objects: z.array(sceneObjectSchema).min(1),
  camera: sceneCameraSchema.optional(),
  environment: sceneEnvironmentSchema.optional()
});

const sceneObjectPatchSchema = sceneObjectSchema
  .omit({ id: true })
  .partial()
  .extend({
    transform: sceneTransformSchema.optional(),
    material: sceneMaterialSchema.optional()
  });

const appSettingsSchema = z.object({
  aiProvider: z.enum(["gemini", "openai", "claude", "auto"]).optional(),
  aiUsageSource: z.enum(["auto", "platform"]).optional(),
  geminiApiKey: z.string().optional(),
  openAiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  clearGeminiApiKey: z.boolean().optional(),
  clearOpenAiApiKey: z.boolean().optional(),
  clearAnthropicApiKey: z.boolean().optional(),
  // Models are validated by the provider at use time (the UI offers the key's
  // actual model list); accept any reasonable id here.
  anthropicCodeModel: z.string().max(100).optional(),
  anthropicRepairModel: z.string().max(100).optional(),
  openAiCodeModel: z.string().max(100).optional(),
  openAiRepairModel: z.string().max(100).optional()
});

const adminOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().min(1).max(80).optional(),
  userId: z.string().uuid().optional()
});

const adminCreditsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const billingOrderLimiter = new Map<string, { count: number; resetAt: number }>();
const BILLING_ORDER_LIMIT = 5;
const BILLING_ORDER_WINDOW_MS = 10 * 60 * 1000;

// Short-lived capability token so the preview can load in an <iframe> (which can't
// send an Authorization header). Owner access is checked when the URL is minted;
// the token then grants read access to that project's preview bundle.
const previewSecret = config.settingsEncKey ?? "local-preview-secret";

function signPreviewToken(projectId: string): string {
  const expiry = Date.now() + 3_600_000; // 1 hour
  const sig = createHmac("sha256", previewSecret).update(`${projectId}.${expiry}`).digest("hex");
  return `${expiry}.${sig}`;
}

function verifyPreviewToken(projectId: string, token: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const expiry = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = createHmac("sha256", previewSecret).update(`${projectId}.${expiry}`).digest("hex");
  try {
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function checkBillingOrderLimit(userId: string): { retryAfterMs: number } | null {
  const now = Date.now();
  const current = billingOrderLimiter.get(userId);
  if (!current || current.resetAt <= now) {
    billingOrderLimiter.set(userId, { count: 1, resetAt: now + BILLING_ORDER_WINDOW_MS });
    return null;
  }
  if (current.count >= BILLING_ORDER_LIMIT) return { retryAfterMs: current.resetAt - now };
  current.count += 1;
  return null;
}

export function registerRoutes(
  app: FastifyInstance,
  storage: ProjectStorage,
  projectRepository: ProjectRepository,
  previewRunner: PreviewRunner,
  ragService: LocalRagService,
  projectExportService: ProjectExportService,
  assetLibrary: ProjectAssetLibrary,
  settingsRepository: SettingsRepository,
  usageService: UsageService,
  billingService: BillingService
): void {
  const blobStore = getBlobStore();

  function editableProjectPath(filePath: string): string | null {
    try {
      const normalized = normalizeProjectFilePath(filePath);
      const parts = normalized.split("/");
      const extension = normalized.slice(normalized.lastIndexOf(".")).toLowerCase();
      const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".glsl", ".vert", ".frag"]);
      if (!normalized.startsWith("src/") || parts.some((part) => part.startsWith(".") || part === "node_modules")) return null;
      return allowedExtensions.has(extension) ? normalized : null;
    } catch {
      return null;
    }
  }

  async function consumeBuildQuota(request: { userId: string }, reply: import("fastify").FastifyReply): Promise<boolean> {
    const quota = await usageService.consume(request.userId, "build");
    if (quota.allowed) return true;
    reply.code(429).send({ error: `Daily build limit reached (${quota.limit}/day). Try again tomorrow.` });
    return false;
  }

  async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
    if (!config.turnstileSecretKey) return true;
    if (!token) return false;
    const body = new URLSearchParams({ secret: config.turnstileSecretKey, response: token, remoteip: remoteIp });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  }

  // Loads a project and enforces ownership. On a missing OR not-owned project it
  // sends 404 (not 403, so project ids aren't probeable) and returns null — the
  // caller should `if (!project) return;`.
  async function requireOwnedProject(
    request: { userId: string },
    reply: import("fastify").FastifyReply,
    id: string
  ): Promise<Project | null> {
    const project = await projectRepository.getProject(id);
    if (!project || project.ownerId !== request.userId) {
      reply.code(404).send({ error: "Project not found" });
      return null;
    }
    return project;
  }

  // --- Static (hosted) preview: serve the project's built dist through the authed
  // API. The production architecture — at deploy time the dist read/write moves to
  // object storage + a signed CDN URL; the flow here is otherwise unchanged.
  // Serves a built-bundle file. The entry (index.html) streams through the API so
  // relative asset paths resolve back here; sub-files redirect to a short-lived
  // signed storage URL so the heavy bytes skip the API (streams for local storage).
  async function serveBundleFile(reply: import("fastify").FastifyReply, prefix: string, relative: string) {
    if (relative.includes("..")) {
      return reply.code(404).send({ error: "Not found" });
    }
    const key = `${prefix}/${relative}`;
    const isPublicShare = prefix.startsWith("shares/");
    const securePublicShare = () => {
      if (!isPublicShare) return;
      reply.header(
        "content-security-policy",
        "sandbox allow-scripts allow-downloads; default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; style-src 'self' 'unsafe-inline' data: https:; img-src 'self' data: blob: https:; connect-src https:; frame-ancestors *;"
      );
      reply.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
      reply.header("referrer-policy", "no-referrer");
      reply.header("x-content-type-options", "nosniff");
    };
    if (relative !== "index.html") {
      const url = await blobStore.signedUrl(key, 3600).catch(() => null);
      if (url) return reply.redirect(url);
    }
    try {
      const content = await blobStore.get(key);
      if (content) {
        if (relative === "index.html") securePublicShare();
        return reply.type(shareContentType(relative)).send(content);
      }
      const index = await blobStore.get(`${prefix}/index.html`);
      if (index) {
        securePublicShare();
        return reply.type("text/html; charset=utf-8").send(index);
      }
    } catch {
      // fall through to 404
    }
    return reply.code(404).send({ error: "Not found" });
  }

  function staticPreviewSession(id: string): PreviewSession {
    return {
      projectId: id,
      status: "running",
      // Public, token-gated path so the <iframe> can load it without a bearer header.
      // Explicit index.html (no trailing slash) so the Vercel /api rewrite matches;
      // relative ./assets/* resolve against the directory and carry the token.
      url: `/api/preview/${id}/${signPreviewToken(id)}/index.html`,
      port: 0, // 0 signals "static" to the client (no live dev server)
      logs: "",
      startedAt: new Date().toISOString()
    };
  }

  // The preview is "fresh" when it was built from the project's current version.
  // The marker stores the project.updatedAt the dist was built from (storage-backend
  // agnostic, unlike a local-file mtime). Returns the build only when it failed.
  async function ensureStaticPreview(
    id: string,
    rawVersion: string,
    beforeBuild?: () => Promise<boolean>
  ): Promise<{ session?: PreviewSession; build?: BuildResult; quotaExceeded?: boolean }> {
    // The format tag invalidates previews built by older code (e.g. the ones
    // uploaded before per-file content-types) so they get rebuilt, not reused.
    const version = `f2:${rawVersion}`;
    const builtVersion = (await blobStore.get(`preview-meta/${id}`))?.toString("utf8");
    if (builtVersion !== version) {
      if (beforeBuild && !(await beforeBuild())) return { quotaExceeded: true };
      const { build, distDir, dispose } = await previewRunner.buildAndKeep(id, { base: "./" });
      try {
        if (!build.ok) return { build };
        await putDir(blobStore, `previews/${id}`, distDir);
        await blobStore.put(`preview-meta/${id}`, version);
      } finally {
        await dispose();
      }
    }
    return { session: staticPreviewSession(id) };
  }

  app.get("/health", async () => ({
    ok: true,
    service: "ai-threejs-studio-api",
    time: new Date().toISOString()
  }));

  app.post(
    "/access-requests",
    {
      config: {
        rateLimit: {
          max: config.rateLimit.accessRequestsPerHour,
          timeWindow: "1 hour"
        }
      }
    },
    async (request, reply) => {
      const parsed = accessRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "Enter a valid email address." });
      // Honeypot submissions receive the same response without touching storage.
      if (parsed.data.website) return reply.code(202).send({ ok: true });
      if (!(await verifyTurnstile(parsed.data.turnstileToken, request.ip))) {
        return reply.code(400).send({ error: "Human verification failed. Please try again." });
      }
      if (!config.supabaseDbUrl) return reply.code(503).send({ error: "Access requests are not configured." });
      await getSql()`
        insert into access_requests (email, name, use_case, source, updated_at)
        values (${parsed.data.email}, ${parsed.data.name || null}, ${parsed.data.useCase || null}, 'landing', now())
        on conflict (email) do update set
          name = excluded.name,
          use_case = excluded.use_case,
          updated_at = now()
      `;
      return reply.code(202).send({ ok: true });
    }
  );

  // Scene3D agent: structured generate -> validate -> build -> visual-validate ->
  // repair. Writes the Scene3D-backed source set (shared interpreter + config).
  app.post("/projects/:id/scene3d/agent-run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;
    const body = z
      .object({
        prompt: z.string().min(1).max(8_000),
        mode: z.enum(["new", "refine"]).optional(),
        selectedObjectId: z.string().min(1).optional(),
        stream: z.boolean().optional(),
        referenceImage: referenceImageSchema.optional(),
        variationCount: z.number().int().min(1).max(3).optional()
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "A prompt is required." });
    }

    const publicSettings = await settingsRepository.getSettings(request.userId);
    const settings = await settingsRepository.getStoredSettings(request.userId);
    // Keys come resolved from the settings repo: single-tenant merges env keys;
    // multi-tenant returns the user's own keys (plus the platform env keys only
    // when ALLOW_PLATFORM_KEYS is set). Do NOT add a config.* fallback here — that
    // would hand every user the platform keys and defeat per-user BYO.
    const openAiKey = settings.openAiApiKey;
    const anthropicKey = settings.anthropicApiKey;
    // Resolve the provider: explicit setting wins; "auto"/"gemini" falls back to
    // whichever provider has a key (preferring OpenAI, then Claude).
    const useClaude =
      settings.aiProvider === "claude" || (settings.aiProvider !== "openai" && !openAiKey && Boolean(anthropicKey));

    const generationModel = useClaude
      ? settings.anthropicCodeModel || config.anthropicCodeModel
      : settings.openAiCodeModel || config.openAiCodeModel;
    const generator: SceneGenerator = useClaude
      ? new ClaudeSceneGenerator({
          apiKey: anthropicKey,
          model: generationModel,
          repairModel: settings.anthropicRepairModel || config.anthropicRepairModel,
          maxTokens: config.anthropicMaxTokens,
          stallTimeoutMs: config.modelStallTimeoutMs,
          totalTimeoutMs: config.modelTotalTimeoutMs
        })
      : new Scene3DGenerator({
          apiKey: openAiKey,
          model: generationModel,
          repairModel: settings.openAiRepairModel || config.openAiRepairModel,
          stallTimeoutMs: config.modelStallTimeoutMs,
          totalTimeoutMs: config.modelTotalTimeoutMs
        });
    if (!generator.enabled) {
      return reply.code(400).send({ error: useClaude ? "No Anthropic API key is configured." : "No OpenAI API key is configured." });
    }

    const variationCount = body.data.mode === "refine" ? 1 : body.data.variationCount ?? 1;
    const shouldUsePlatformCredits =
      config.auth.enabled &&
      config.auth.allowPlatformKeys &&
      (publicSettings.aiUsageSource === "platform" || (useClaude ? !publicSettings.hasAnthropicApiKey : !publicSettings.hasOpenAiApiKey));

    // Per-user daily quota (no-op single-tenant). Counts the attempt before the
    // expensive run; must happen before reply.hijack() so we can still send 429.
    let consumedRuns = 0;
    for (let i = 0; i < variationCount; i += 1) {
      const quota = await usageService.consume(request.userId, "agentRun");
      if (!quota.allowed) {
        for (let j = 0; j < consumedRuns; j += 1) await usageService.refund(request.userId, "agentRun").catch(() => {});
        return reply.code(429).send({ error: `Daily generation limit reached (${quota.limit}/day). Try again tomorrow.` });
      }
      consumedRuns += 1;
    }

    let creditReservation: CreditReservation | null = null;
    if (shouldUsePlatformCredits) {
      try {
        creditReservation = await billingService.consume(request.userId, variationCount, "agent-run");
      } catch (error) {
        for (let j = 0; j < consumedRuns; j += 1) await usageService.refund(request.userId, "agentRun").catch(() => {});
        return reply.code(402).send({ error: error instanceof Error ? error.message : "Not enough platform credits." });
      }
    }

    const retrievedContext = await ragService.searchDocs({
      query: body.data.prompt,
      limit: 6,
      projectId: id,
      projectName: project.name,
      templateId: project.templateId
    });
    const agent = new Scene3DAgent({ storage, previewRunner, generator, maxRepairAttempts: config.maxAgentFixAttempts });

    // Stream progress as newline-delimited JSON: {type:"progress",stage} events
    // followed by a final {type:"result",result} (or {type:"error",message}).
    // This turns the long opaque generate into a live, staged experience.
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no"
    });
    const write = (event: unknown) => {
      if (!reply.raw.writableEnded) reply.raw.write(`${JSON.stringify(event)}\n`);
    };

    // A single model call can legally go minutes without a progress event; pings
    // keep idle-killing proxies/load balancers from dropping the connection (the
    // client ignores unknown event types). On client disconnect, abort the run so
    // the in-flight model call stops burning tokens.
    const heartbeat = setInterval(() => write({ type: "ping" }), 10_000);
    const abort = new AbortController();
    request.raw.on("close", () => {
      if (!reply.raw.writableEnded) abort.abort();
    });

    try {
      // Tell the client which model is running so the progress UI can show it.
      write({ type: "meta", model: generationModel });
      if (variationCount > 1) {
        const originalScene = await readScene3D(storage, id);
        const variations = [];
        try {
          for (let i = 0; i < variationCount; i += 1) {
            await writeScene3D(storage, id, originalScene);
            const label = `Option ${i + 1}`;
            const variationPrompt = `${body.data.prompt}\n\nVariation brief: Generate ${label} of ${variationCount}. Make this candidate meaningfully distinct in composition, object choices, materials, or camera framing while still satisfying the original request.`;
            const result = await agent.run({
              projectId: id,
              prompt: variationPrompt,
              retrievedContext,
              referenceImage: body.data.referenceImage,
              mode: "new",
              signal: abort.signal,
              onProgress: (stage) => write({ type: "progress", stage: `${label}: ${stage}` })
            });
            variations.push({
              id: `variation-${i + 1}`,
              label,
              scene: result.scene,
              issues: result.issues,
              attempts: result.attempts,
              ok: result.ok
            });
          }
        } finally {
          await writeScene3D(storage, id, originalScene).catch(() => {});
        }
        write({ type: "result", result: { variations } });
      } else {
        const result = await agent.run({
          projectId: id,
          prompt: body.data.prompt,
          retrievedContext,
          referenceImage: body.data.referenceImage,
          mode: body.data.mode,
          selectedObjectId: body.data.selectedObjectId,
          signal: abort.signal,
          onProgress: (stage) => write({ type: "progress", stage }),
          onNode: body.data.stream ? (node) => write({ type: "partial-node", node }) : undefined
        });
        await projectRepository.touchProject(id);
        write({ type: "result", result });
      }
    } catch (error) {
      // A failed or cancelled run shouldn't count against the daily quota.
      for (let i = 0; i < consumedRuns; i += 1) await usageService.refund(request.userId, "agentRun").catch(() => {});
      if (creditReservation) await billingService.refund(request.userId, creditReservation).catch(() => {});
      write({ type: "error", message: error instanceof Error ? error.message : "Generation failed." });
    } finally {
      clearInterval(heartbeat);
      reply.raw.end();
    }
  });

  app.get("/projects", async (request) => ({
    projects: await projectRepository.listProjects(request.userId)
  }));

  app.delete("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    previewRunner.stop(id);
    await storage.deleteProject(id);
    await assetLibrary.deleteProjectAssets(id);
    await blobStore.deletePrefix(`previews/${id}`);
    await blobStore.delete(`preview-meta/${id}`);
    if (config.supabaseDbUrl) {
      const shares = await getSql()<Array<{ id: string }>>`
        select id from project_shares where project_id = ${id} and owner_id = ${request.userId}
      `;
      await Promise.all(shares.map((share) => blobStore.deletePrefix(`shares/${share.id}`)));
    }
    await projectRepository.deleteProject(id);

    return reply.code(204).send();
  });

  app.get("/settings", async (request) => {
    return { settings: await settingsRepository.getSettings(request.userId) };
  });

  app.put("/settings", async (request, reply) => {
    const parsed = appSettingsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid settings." });
    }
    const settings = await settingsRepository.updateSettings(request.userId, parsed.data as AppSettingsUpdate);
    return { settings };
  });

  // Models the user's key for a provider actually has access to (for the UI).
  app.get("/settings/models/:provider", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider !== "openai" && provider !== "anthropic") {
      return reply.code(400).send({ error: "Unknown provider." });
    }
    const settings = await settingsRepository.getStoredSettings(request.userId);
    const key = provider === "openai" ? settings.openAiApiKey : settings.anthropicApiKey;
    if (!key) return { models: [] };
    try {
      return { models: await listModels(provider, key) };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Failed to list models." });
    }
  });

  app.get("/billing/packages", async () => ({
    packages: billingService.packages()
  }));

  app.get("/billing/status", async (request) => billingService.status(request.userId));

  app.post("/billing/orders", async (request, reply) => {
    const limited = checkBillingOrderLimit(request.userId);
    if (limited) {
      reply.header("retry-after", String(Math.ceil(limited.retryAfterMs / 1000)));
      return reply.code(429).send({ error: "Too many checkout attempts. Try again shortly." });
    }
    const body = z.object({ packageId: z.string().min(1) }).safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "A packageId is required." });
    try {
      return { order: await billingService.createPayPalOrder(request.userId, body.data.packageId) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not create PayPal order." });
    }
  });

  app.post("/billing/orders/:orderId/capture", async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    try {
      return { order: await billingService.capturePayPalOrder(request.userId, orderId), billing: await billingService.status(request.userId) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not capture PayPal order." });
    }
  });

  app.post("/billing/paypal/webhook", async (request, reply) => {
    try {
      await billingService.handlePayPalWebhook(request.headers, request.body);
      return { ok: true };
    } catch (error) {
      request.log.warn({ error }, "PayPal webhook rejected");
      return reply.code(400).send({ error: "Invalid PayPal webhook." });
    }
  });

  app.get("/admin/me", async (request, reply) => {
    const admin = await requireAdmin(request.userId, reply);
    if (!admin) return;
    return { admin };
  });

  app.get("/admin/billing/orders", async (request, reply) => {
    const admin = await requireAdmin(request.userId, reply);
    if (!admin) return;
    if (!config.supabaseDbUrl) return reply.code(400).send({ error: "Admin billing requires SUPABASE_DB_URL." });
    const parsed = adminOrdersQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid admin billing query." });
    const { limit = 50, status, userId } = parsed.data;
    const statusFilter = status ?? null;
    const userFilter = userId ?? null;
    const sql = getSql();
    const rows = await sql<AdminPayPalOrderRow[]>`
      select id, user_id, package_id, credits, amount_cents, currency,
             paypal_order_id, paypal_capture_id, status, approval_url,
             credited_at, created_at, updated_at
      from paypal_orders
      where (${statusFilter}::text is null or status = ${statusFilter})
        and (${userFilter}::uuid is null or user_id = ${userFilter})
      order by created_at desc
      limit ${limit}
    `;
    return { orders: rows.map(adminOrderRow) };
  });

  app.get("/admin/billing/users/:userId/credits", async (request, reply) => {
    const admin = await requireAdmin(request.userId, reply);
    if (!admin) return;
    if (!config.supabaseDbUrl) return reply.code(400).send({ error: "Admin billing requires SUPABASE_DB_URL." });
    const { userId } = request.params as { userId: string };
    const parsedParams = z.string().uuid().safeParse(userId);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid user id." });
    const parsedQuery = adminCreditsQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "Invalid admin credits query." });
    const sql = getSql();
    const [balance] = await sql<{ paid_credits: number; bonus_credits: number; bonus_granted_at: string | null; updated_at: string }[]>`
      select paid_credits, bonus_credits, bonus_granted_at, updated_at
      from credit_balances
      where user_id = ${parsedParams.data}
      limit 1
    `;
    const ledger = await sql<AdminCreditLedgerRow[]>`
      select id, credit_type, amount, reason, reference_id, metadata, created_at
      from credit_ledger
      where user_id = ${parsedParams.data}
      order by created_at desc
      limit ${parsedQuery.data.limit ?? 100}
    `;
    const paid = balance ? Number(balance.paid_credits) : 0;
    const bonus = balance ? Number(balance.bonus_credits) : 0;
    return {
      userId: parsedParams.data,
      balance: {
        paid,
        bonus,
        total: paid + bonus,
        bonusGrantedAt: balance?.bonus_granted_at ?? null,
        updatedAt: balance?.updated_at ?? null
      },
      ledger: ledger.map(adminLedgerRow)
    };
  });

  // Today's per-user usage vs limits (null limit = unlimited / single-tenant).
  app.get("/usage", async (request) => {
    const usage = await usageService.status(request.userId);
    const billing = await billingService.status(request.userId);
    const clean = (s: QuotaStatus) => ({ used: s.used, limit: Number.isFinite(s.limit) ? s.limit : null, allowed: s.allowed });
    return { usage: { agentRun: clean(usage.agentRun), build: clean(usage.build), credits: billing.credits } };
  });

  app.post("/docs/search", async (request) => {
    const body = searchDocsSchema.parse(request.body ?? {});
    // Only use the project for retrieval context if the caller owns it.
    const project = body.projectId ? await projectRepository.getProject(body.projectId) : null;
    const owned = project && project.ownerId === request.userId ? project : null;
    const chunks = await ragService.searchDocs({
      ...body,
      projectName: owned?.name,
      templateId: owned?.templateId
    });
    return { chunks };
  });

  app.get("/projects/:id/assets", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    return {
      assets: await assetLibrary.listProjectAssets(id)
    };
  });

  app.post("/projects/:id/assets/upload", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const body = uploadAssetSchema.parse(request.body ?? {});

    try {
      const asset = await assetLibrary.createProjectAsset({
        projectId: id,
        name: body.name,
        type: body.type,
        contentBase64: body.contentBase64
      });
      await projectRepository.touchProject(id);
      return reply.code(201).send({ asset });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Asset upload failed" });
    }
  });

  app.get("/projects/:id/assets/:assetId/content", async (request, reply) => {
    const { id, assetId } = request.params as { id: string; assetId: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;

    // Offload the (potentially large) binary to storage via a signed URL.
    const signed = await assetLibrary.signedAssetUrl(id, assetId, 3600).catch(() => null);
    if (signed) return reply.redirect(signed);

    try {
      const file = await assetLibrary.readProjectAssetContent(id, assetId);
      reply.header("cache-control", "public, max-age=3600");
      return reply.type(file.contentType).send(file.content);
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : "Asset not found" });
    }
  });

  // Static share viewer: serve the self-contained bundle copied at share time.
  // No dev server — a shared scene is just files on disk.
  app.get("/shares/:shareId", async (request, reply) => {
    return reply.redirect(`/shares/${(request.params as { shareId: string }).shareId}/`);
  });

  app.get("/shares/:shareId/*", async (request, reply) => {
    const { shareId } = request.params as { shareId: string };
    const wildcard = (request.params as Record<string, string>)["*"] || "index.html";
    return serveBundleFile(reply, `shares/${shareId}`, wildcard === "" ? "index.html" : wildcard);
  });

  // Public, token-gated runtime preview (loadable in an iframe). The token is minted
  // by the owner-checked /preview/start; it grants read access to the preview bundle.
  app.get("/preview/:id/:token/*", async (request, reply) => {
    const { id, token } = request.params as { id: string; token: string };
    if (!verifyPreviewToken(id, token)) {
      return reply.code(403).send({ error: "Invalid or expired preview link." });
    }
    const wildcard = (request.params as Record<string, string>)["*"] || "index.html";
    return serveBundleFile(reply, `previews/${id}`, wildcard === "" ? "index.html" : wildcard);
  });

  app.post("/projects", async (request, reply) => {
    const input = createProjectSchema.parse(request.body ?? {});
    const projects = await projectRepository.listProjects(request.userId);
    if (config.quota.projectsPerUser > 0 && projects.length >= config.quota.projectsPerUser) {
      return reply.code(429).send({ error: `Beta accounts can keep up to ${config.quota.projectsPerUser} projects.` });
    }
    const project = await projectRepository.createProject({ ...input, ownerId: request.userId });

    // New projects are Scene3D-backed: base project files (build config, entry,
    // styles) from the template, overlaid with the shared Scene3D interpreter +
    // a default scene. The agent and editor both operate on the Scene3D JSON.
    const files = new Map(getTemplate(project.templateId).files.map((file) => [file.path, file.content]));
    for (const file of createScene3DSceneFiles(defaultScene3D())) {
      files.set(file.path, file.content);
    }
    for (const [filePath, content] of files) {
      const replacement = filePath === "index.html" ? escapeHtmlText(project.name) : project.name;
      await storage.writeProjectFile(project.id, filePath, content.replaceAll("__PROJECT_NAME__", replacement));
    }

    await storage.createProjectSnapshot(project.id, "initial");
    return reply.code(201).send({ project });
  });

  app.get("/projects/:id/scene3d", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;
    return { scene: await readScene3D(storage, id) };
  });

  app.put("/projects/:id/scene3d", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;
    const body = z.object({ scene: z.unknown() }).safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "A scene is required." });
    }
    const { scene, issues } = validateScene3D(body.data.scene);
    // Regenerate the full source set (not just scene.config.json) so the project's
    // copied SceneView/interpreter stays current with the package — otherwise new
    // renderer features (e.g. image textures) work in the editor but not in the
    // runtime preview / shared bundle. Write only changed files to avoid needless
    // HMR reloads (an up-to-date project only rewrites scene.config.json).
    for (const file of createScene3DSceneFiles(scene)) {
      const existing = await storage.getProjectFile(id, file.path);
      if (!existing || existing.content !== file.content) {
        await storage.writeProjectFile(id, file.path, file.content);
      }
    }
    await projectRepository.touchProject(id);
    return { scene, issues };
  });

  app.get("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    return { project };
  });

  app.get("/projects/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const files = await storage.listProjectFiles(id);
    return { files: files.map(({ content: _content, ...file }) => file) };
  });

  app.get("/projects/:id/files/*", async (request, reply) => {
    const { id, "*": filePath } = request.params as { id: string; "*": string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const file = await storage.getProjectFile(id, filePath);

    if (!file) {
      return reply.code(404).send({ error: "File not found" });
    }

    return { file };
  });

  app.put("/projects/:id/files/*", async (request, reply) => {
    const { id, "*": filePath } = request.params as { id: string; "*": string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const safePath = editableProjectPath(filePath);
    if (!safePath) {
      return reply.code(403).send({ error: "Only source files under src/ can be edited in hosted mode." });
    }
    const body = writeFileSchema.parse(request.body ?? {});
    if (Buffer.byteLength(body.content, "utf8") > config.quota.maxProjectFileBytes) {
      return reply.code(413).send({ error: "Project file is too large." });
    }
    const policyViolation = projectSourcePolicyViolation(safePath, body.content);
    if (policyViolation) return reply.code(422).send({ error: policyViolation });
    const file = await storage.writeProjectFile(id, safePath, body.content);
    // A live local preview may otherwise hot-reload an edit before the source
    // policy gets another chance to validate the workspace.
    previewRunner.stop(id);
    await projectRepository.touchProject(id);
    return reply.code(200).send({ file });
  });

  app.get("/projects/:id/snapshots", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const snapshots = await storage.listProjectSnapshots(id);
    return { snapshots: snapshots.map(({ files: _files, ...snapshot }) => snapshot) };
  });

  app.post("/projects/:id/snapshots", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const snapshots = await storage.listProjectSnapshots(id);
    if (config.quota.snapshotsPerProject > 0 && snapshots.length >= config.quota.snapshotsPerProject) {
      return reply.code(429).send({ error: `A project can keep up to ${config.quota.snapshotsPerProject} snapshots.` });
    }
    const body = createSnapshotSchema.parse(request.body ?? {});
    const snapshot = await storage.createProjectSnapshot(id, normalizeSnapshotLabel(body.label) ?? nanoid(12));
    await projectRepository.touchProject(id);
    return reply.code(201).send({ snapshot: { id: snapshot.id, createdAt: snapshot.createdAt } });
  });

  app.post("/projects/:id/snapshots/:snapshotId/restore", async (request, reply) => {
    const { id, snapshotId } = request.params as { id: string; snapshotId: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const snapshot = await storage.restoreProjectSnapshot(id, snapshotId);
    previewRunner.stop(id);
    await projectRepository.touchProject(id);
    return { snapshot: { id: snapshot.id, createdAt: snapshot.createdAt } };
  });

  app.post("/projects/:id/preview/start", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    if (config.previewMode === "static") {
      const { session, build, quotaExceeded } = await ensureStaticPreview(id, project.updatedAt, () => consumeBuildQuota(request, reply));
      if (quotaExceeded) return;
      if (!session) return reply.code(422).send({ build });
      return { preview: session };
    }

    const preview = await previewRunner.start(id);
    return { preview };
  });

  app.get("/projects/:id/preview", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    if (config.previewMode === "static") {
      const built = (await blobStore.get(`preview-meta/${id}`)) !== null;
      return { preview: built ? staticPreviewSession(id) : null };
    }

    return { preview: previewRunner.get(id) };
  });

  // Authed static serve of the built dist (used when previewMode === "static").
  app.get("/projects/:id/preview/app", async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.redirect(`/projects/${id}/preview/app/`);
  });

  app.get("/projects/:id/preview/app/*", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;

    const wildcard = (request.params as Record<string, string>)["*"] || "index.html";
    return serveBundleFile(reply, `previews/${id}`, wildcard === "" ? "index.html" : wildcard);
  });

  app.post("/projects/:id/build", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    if (!(await consumeBuildQuota(request, reply))) return;

    const build = await previewRunner.build(id);
    return reply.code(build.ok ? 200 : 422).send({ build });
  });

  app.post("/projects/:id/export/source", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    const result = await projectExportService.exportSource(project);
    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${result.fileName}"`)
      .send(result.archive);
  });

  app.post("/projects/:id/export/build", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    if (!(await consumeBuildQuota(request, reply))) return;

    const result = await projectExportService.exportBuild(project);

    if (result.build && !result.build.ok) {
      return reply.code(422).send({ build: result.build });
    }

    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${result.fileName}"`)
      .send(result.archive);
  });

  app.post("/projects/:id/share", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    if (!(await consumeBuildQuota(request, reply))) return;

    if (config.supabaseDbUrl && config.quota.sharesPerProject > 0) {
      const [row] = await getSql()<{ count: string }[]>`
        select count(*)::text as count from project_shares where project_id = ${id} and owner_id = ${request.userId}
      `;
      if (Number(row?.count ?? 0) >= config.quota.sharesPerProject) {
        return reply.code(429).send({ error: `A project can keep up to ${config.quota.sharesPerProject} share links.` });
      }
    }

    // Build a self-contained static bundle (relative asset paths) and upload it to
    // object storage. The shared scene renders with no dev server.
    const shareId = nanoid(12);
    const { build, distDir, dispose } = await previewRunner.buildAndKeep(id, { base: "./" });
    try {
      if (!build.ok) {
        return reply.code(422).send({ build });
      }
      await putDir(blobStore, `shares/${shareId}`, distDir);
    } finally {
      await dispose();
    }

    const host = request.headers.host ?? "127.0.0.1";
    const origin = `${request.protocol}://${host}`;
    const share: ProjectShare = {
      id: shareId,
      projectId: id,
      url: `${origin}/shares/${shareId}/`,
      createdAt: new Date().toISOString()
    };
    if (config.supabaseDbUrl) {
      try {
        await getSql()`
          insert into project_shares (id, project_id, owner_id, url)
          values (${share.id}, ${share.projectId}, ${request.userId}, ${share.url})
        `;
      } catch (error) {
        await blobStore.deletePrefix(`shares/${shareId}`).catch(() => {});
        throw error;
      }
    }
    return reply.code(201).send({ share });
  });

  app.get("/projects/:id/shares", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;
    if (!config.supabaseDbUrl) return { shares: [] };
    const rows = await getSql()<Array<{ id: string; project_id: string; url: string; created_at: Date }>>`
      select id, project_id, url, created_at
      from project_shares
      where project_id = ${id} and owner_id = ${request.userId}
      order by created_at desc
    `;
    return {
      shares: rows.map((row) => ({ id: row.id, projectId: row.project_id, url: row.url, createdAt: row.created_at.toISOString() }))
    };
  });

  app.delete("/projects/:id/shares/:shareId", async (request, reply) => {
    const { id, shareId } = request.params as { id: string; shareId: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;
    if (!config.supabaseDbUrl) return reply.code(404).send({ error: "Share not found" });
    const result = await getSql()`
      delete from project_shares
      where id = ${shareId} and project_id = ${id} and owner_id = ${request.userId}
    `;
    if (result.count === 0) return reply.code(404).send({ error: "Share not found" });
    await blobStore.deletePrefix(`shares/${shareId}`);
    return reply.code(204).send();
  });
}

async function readScene3D(storage: ProjectStorage, projectId: string) {
  const file = await storage.getProjectFile(projectId, SCENE_CONFIG_PATH);
  if (!file) {
    return defaultScene3D();
  }
  try {
    return validateScene3D(JSON.parse(file.content)).scene;
  } catch {
    return defaultScene3D();
  }
}

async function writeScene3D(storage: ProjectStorage, projectId: string, scene: unknown): Promise<void> {
  const { scene: validated } = validateScene3D(scene);
  for (const file of createScene3DSceneFiles(validated)) {
    const existing = await storage.getProjectFile(projectId, file.path);
    if (!existing || existing.content !== file.content) {
      await storage.writeProjectFile(projectId, file.path, file.content);
    }
  }
}

function shareContentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".glb")) return "model/gltf-binary";
  if (file.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

interface AdminPayPalOrderRow {
  id: string;
  user_id: string;
  package_id: string;
  credits: number;
  amount_cents: number;
  currency: string;
  paypal_order_id: string;
  paypal_capture_id: string | null;
  status: string;
  approval_url: string | null;
  credited_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminCreditLedgerRow {
  id: string;
  credit_type: "paid" | "bonus";
  amount: number;
  reason: string;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function adminOrderRow(row: AdminPayPalOrderRow) {
  return {
    id: row.id,
    userId: row.user_id,
    packageId: row.package_id,
    credits: Number(row.credits),
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    paypalOrderId: row.paypal_order_id,
    paypalCaptureId: row.paypal_capture_id,
    status: row.status,
    approvalUrl: row.approval_url,
    creditedAt: row.credited_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function adminLedgerRow(row: AdminCreditLedgerRow) {
  return {
    id: row.id,
    creditType: row.credit_type,
    amount: Number(row.amount),
    reason: row.reason,
    referenceId: row.reference_id,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function normalizeSnapshotLabel(label: string | undefined): string | null {
  if (!label) {
    return null;
  }

  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized.length > 0 ? normalized : null;
}
