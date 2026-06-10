import Fastify from "fastify";
import cors from "@fastify/cors";
import { config, validateConfig } from "./config.js";
import { ProjectAssetLibrary } from "./assets/projectAssetLibrary.js";
import { ProjectExportService } from "./export/projectExport.js";
import { createProjectRepository } from "./projects.js";
import { registerAuth } from "./auth/supabaseAuth.js";
import { createSettingsRepository } from "./settings.js";
import { createUsageService } from "./usage.js";
import { closeSql } from "./db.js";
import { PreviewRunner } from "./preview/previewRunner.js";
import { LocalRagService } from "./rag/localRagService.js";
import { registerRoutes } from "./routes.js";
import { LocalWorkspaceStorage } from "./storage/localWorkspaceStorage.js";

const app = Fastify({
  // Scenes embed uploaded image textures inline as data URIs, so a scene save can
  // be several MB — well past Fastify's 1 MiB default (which silently 413'd saves).
  bodyLimit: 32 * 1024 * 1024,
  logger: {
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss"
            }
          }
  }
});

// Fail fast on a half-configured accounts setup; log soft misconfigurations.
for (const warning of validateConfig()) {
  app.log.warn(warning);
}

await app.register(cors, {
  origin: true
});

// Resolves request.userId (Supabase JWT in multi-tenant mode; constant local owner
// otherwise). Must run before the routes so ownership checks have a user.
registerAuth(app);

const settingsRepository = await createSettingsRepository();
const usageService = createUsageService();

const projectRepository = await createProjectRepository();
const ragService = new LocalRagService(config.ragIndexPath, config.agentExampleBankPath, config.retrievalTuningPath);
await ragService.load();
const storage = new LocalWorkspaceStorage(config.workspaceRoot, config.snapshotRoot);
const assetLibrary = new ProjectAssetLibrary(config.assetRoot, config.publicApiBaseUrl);
const previewRunner = new PreviewRunner({
  host: config.previewHost,
  basePort: config.previewBasePort,
  maxConcurrent: config.previewMaxConcurrent,
  idleTimeoutMs: config.previewIdleTimeoutMs,
  viteBinPath: config.viteBinPath,
  chromeBinPath: config.chromeBinPath,
  projectRootFor: (projectId) => storage.getProjectRoot(projectId)
});
const projectExportService = new ProjectExportService(storage, previewRunner);

registerRoutes(
  app,
  storage,
  projectRepository,
  previewRunner,
  ragService,
  projectExportService,
  assetLibrary,
  settingsRepository,
  usageService
);

process.once("SIGINT", () => {
  previewRunner.stopAll();
  void projectRepository.close();
  void closeSql();
  process.exit(0);
});

process.once("SIGTERM", () => {
  previewRunner.stopAll();
  void projectRepository.close();
  void closeSql();
  process.exit(0);
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
