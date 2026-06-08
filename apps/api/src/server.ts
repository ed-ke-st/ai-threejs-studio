import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { ProjectAssetLibrary } from "./assets/projectAssetLibrary.js";
import { ProjectExportService } from "./export/projectExport.js";
import { LocalProjectRepository } from "./projects.js";
import { LocalSettingsRepository } from "./settings.js";
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

await app.register(cors, {
  origin: true
});

const settingsRepository = new LocalSettingsRepository(config.settingsPath);
await settingsRepository.load();

const projectRepository = new LocalProjectRepository(config.projectIndexPath);
await projectRepository.load();
const ragService = new LocalRagService(config.ragIndexPath, config.agentExampleBankPath, config.retrievalTuningPath);
await ragService.load();
const storage = new LocalWorkspaceStorage(config.workspaceRoot, config.snapshotRoot);
const assetLibrary = new ProjectAssetLibrary(config.assetRoot, config.publicApiBaseUrl);
const previewRunner = new PreviewRunner({
  host: config.previewHost,
  basePort: config.previewBasePort,
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
  settingsRepository
);

process.once("SIGINT", () => {
  previewRunner.stopAll();
  process.exit(0);
});

process.once("SIGTERM", () => {
  previewRunner.stopAll();
  process.exit(0);
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
