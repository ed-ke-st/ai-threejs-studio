import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { FastifyInstance } from "fastify";
import { getTemplate } from "@ai-threejs-studio/three-templates";
import type { AppSettingsUpdate, BuildResult, PreviewSession, Project, ProjectShare } from "@ai-threejs-studio/shared";
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
import type { PreviewRunner } from "./preview/previewRunner.js";
import type { LocalRagService } from "./rag/localRagService.js";
import type { ProjectStorage } from "./storage/localWorkspaceStorage.js";
import { getBlobStore, putDir } from "./storage/blobStore.js";

const createProjectSchema = z.object({
  name: z.string().min(1).default("Untitled Project"),
  templateId: z
    .enum(["blank-r3f-scene", "glb-viewer", "product-configurator", "room-scene", "interactive-planner"])
    .default("blank-r3f-scene")
});

const writeFileSchema = z.object({
  content: z.string()
});

const searchDocsSchema = z.object({
  query: z.string().min(1),
  collections: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  projectId: z.string().min(1).optional()
});

const uploadAssetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["model/glb", "model/gltf", "texture/image", "environment/hdri", "image/reference", "material/preset"]),
  contentBase64: z.string().min(1)
});

const createSnapshotSchema = z.object({
  label: z.string().min(1).max(80).optional()
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
  geminiApiKey: z.string().optional(),
  openAiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  clearGeminiApiKey: z.boolean().optional(),
  clearOpenAiApiKey: z.boolean().optional(),
  clearAnthropicApiKey: z.boolean().optional()
});

export function registerRoutes(
  app: FastifyInstance,
  storage: ProjectStorage,
  projectRepository: ProjectRepository,
  previewRunner: PreviewRunner,
  ragService: LocalRagService,
  projectExportService: ProjectExportService,
  assetLibrary: ProjectAssetLibrary,
  settingsRepository: SettingsRepository,
  usageService: UsageService
): void {
  const blobStore = getBlobStore();

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
    if (relative !== "index.html") {
      const url = await blobStore.signedUrl(key, 3600).catch(() => null);
      if (url) return reply.redirect(url);
    }
    try {
      const content = await blobStore.get(key);
      if (content) return reply.type(shareContentType(relative)).send(content);
      const index = await blobStore.get(`${prefix}/index.html`);
      if (index) return reply.type("text/html; charset=utf-8").send(index);
    } catch {
      // fall through to 404
    }
    return reply.code(404).send({ error: "Not found" });
  }

  function staticPreviewSession(id: string): PreviewSession {
    return {
      projectId: id,
      status: "running",
      // Explicit index.html (not a trailing slash) so the Vercel /api rewrite matches;
      // relative ./assets/* still resolve against the .../app/ directory.
      url: `/api/projects/${id}/preview/app/index.html`,
      port: 0, // 0 signals "static" to the client (no live dev server)
      logs: "",
      startedAt: new Date().toISOString()
    };
  }

  // The preview is "fresh" when it was built from the project's current version.
  // The marker stores the project.updatedAt the dist was built from (storage-backend
  // agnostic, unlike a local-file mtime). Returns the build only when it failed.
  async function ensureStaticPreview(id: string, version: string): Promise<{ session?: PreviewSession; build?: BuildResult }> {
    const builtVersion = (await blobStore.get(`preview-meta/${id}`))?.toString("utf8");
    if (builtVersion !== version) {
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

  // Scene3D agent: structured generate -> validate -> build -> visual-validate ->
  // repair. Writes the Scene3D-backed source set (shared interpreter + config).
  app.post("/projects/:id/scene3d/agent-run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);
    if (!project) return;
    const body = z
      .object({
        prompt: z.string().min(1),
        mode: z.enum(["new", "refine"]).optional(),
        selectedObjectId: z.string().min(1).optional(),
        stream: z.boolean().optional()
      })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "A prompt is required." });
    }

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

    const generator: SceneGenerator = useClaude
      ? new ClaudeSceneGenerator({
          apiKey: anthropicKey,
          model: config.anthropicCodeModel,
          repairModel: config.anthropicRepairModel,
          maxTokens: config.anthropicMaxTokens,
          requestTimeoutMs: config.modelRequestTimeoutMs
        })
      : new Scene3DGenerator({
          apiKey: openAiKey,
          model: config.openAiCodeModel,
          repairModel: config.openAiRepairModel,
          requestTimeoutMs: config.modelRequestTimeoutMs
        });
    if (!generator.enabled) {
      return reply.code(400).send({ error: useClaude ? "No Anthropic API key is configured." : "No OpenAI API key is configured." });
    }

    // Per-user daily quota (no-op single-tenant). Counts the attempt before the
    // expensive run; must happen before reply.hijack() so we can still send 429.
    const quota = await usageService.consume(request.userId, "agentRun");
    if (!quota.allowed) {
      return reply.code(429).send({ error: `Daily generation limit reached (${quota.limit}/day). Try again tomorrow.` });
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
    const write = (event: unknown) => reply.raw.write(`${JSON.stringify(event)}\n`);

    try {
      const result = await agent.run({
        projectId: id,
        prompt: body.data.prompt,
        retrievedContext,
        mode: body.data.mode,
        selectedObjectId: body.data.selectedObjectId,
        onProgress: (stage) => write({ type: "progress", stage }),
        onNode: body.data.stream ? (node) => write({ type: "partial-node", node }) : undefined
      });
      await projectRepository.touchProject(id);
      write({ type: "result", result });
    } catch (error) {
      write({ type: "error", message: error instanceof Error ? error.message : "Generation failed." });
    } finally {
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
    await projectRepository.deleteProject(id);

    return reply.code(204).send();
  });

  app.get("/settings", async (request) => {
    return { settings: await settingsRepository.getSettings(request.userId) };
  });

  app.put("/settings", async (request) => {
    const body = appSettingsSchema.parse(request.body ?? {}) as AppSettingsUpdate;
    const settings = await settingsRepository.updateSettings(request.userId, body);
    return { settings };
  });

  // Today's per-user usage vs limits (null limit = unlimited / single-tenant).
  app.get("/usage", async (request) => {
    const usage = await usageService.status(request.userId);
    const clean = (s: QuotaStatus) => ({ used: s.used, limit: Number.isFinite(s.limit) ? s.limit : null, allowed: s.allowed });
    return { usage: { agentRun: clean(usage.agentRun), build: clean(usage.build) } };
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

  app.post("/projects", async (request, reply) => {
    const input = createProjectSchema.parse(request.body ?? {});
    const project = await projectRepository.createProject({ ...input, ownerId: request.userId });

    // New projects are Scene3D-backed: base project files (build config, entry,
    // styles) from the template, overlaid with the shared Scene3D interpreter +
    // a default scene. The agent and editor both operate on the Scene3D JSON.
    const files = new Map(getTemplate(project.templateId).files.map((file) => [file.path, file.content]));
    for (const file of createScene3DSceneFiles(defaultScene3D())) {
      files.set(file.path, file.content);
    }
    for (const [filePath, content] of files) {
      await storage.writeProjectFile(project.id, filePath, content.replaceAll("__PROJECT_NAME__", project.name));
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

    const body = writeFileSchema.parse(request.body ?? {});
    const file = await storage.writeProjectFile(id, filePath, body.content);
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
    await projectRepository.touchProject(id);
    return { snapshot: { id: snapshot.id, createdAt: snapshot.createdAt } };
  });

  app.post("/projects/:id/preview/start", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await requireOwnedProject(request, reply, id);

    if (!project) return;

    if (config.previewMode === "static") {
      const { session, build } = await ensureStaticPreview(id, project.updatedAt);
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

    const quota = await usageService.consume(request.userId, "build");
    if (!quota.allowed) {
      return reply.code(429).send({ error: `Daily build limit reached (${quota.limit}/day). Try again tomorrow.` });
    }

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
    return reply.code(201).send({ share });
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
