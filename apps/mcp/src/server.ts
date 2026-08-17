import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateScene3D, type Scene3D } from "@ai-threejs-studio/scene3d";
import type { BuildResult, PreviewSession, Project, ProjectTemplateId } from "@ai-threejs-studio/shared";
import { z } from "zod";
import type { StudioApi } from "./api.js";
import { SCENE_AUTHORING_GUIDE } from "./guide.js";

const PROJECT_TEMPLATES = [
  "blank-r3f-scene",
  "glb-viewer",
  "product-configurator",
  "room-scene",
  "interactive-planner"
] as const satisfies readonly ProjectTemplateId[];

const projectIdSchema = z.string().trim().min(1).describe("Studio project id from studio_list_projects or studio_create_project.");
const sceneSchema = z.unknown().describe("The complete Scene3D JSON document, not a partial patch.");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const REVERSIBLE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

export function createStudioMcpServer(api: StudioApi): McpServer {
  const server = new McpServer(
    { name: "ai-threejs-studio", version: "0.1.0" },
    {
      instructions: [
        "Use this server to author structured Scene3D projects in AI Three.js Studio.",
        "Before changing a scene, call studio_get_scene_authoring_guide and studio_get_scene.",
        "Keep the projectUpdatedAt value returned by studio_get_scene and supply it unchanged to studio_replace_scene.",
        "Validate a proposed full scene before replacement. Replacement creates a rollback snapshot automatically.",
        "Build after replacement and start a preview only when the user needs a viewable URL.",
        "Never invent project ids or local asset URLs. This server intentionally cannot delete, publish, run shell commands, or write arbitrary source files."
      ].join(" ")
    }
  );

  server.registerTool(
    "studio_list_projects",
    {
      title: "List Studio projects",
      description: "List the authenticated user's AI Three.js Studio projects and their current update versions.",
      outputSchema: { projects: z.array(z.unknown()) },
      annotations: READ_ONLY
    },
    async () => toolResult({ projects: await api.listProjects() })
  );

  server.registerTool(
    "studio_create_project",
    {
      title: "Create Studio project",
      description: "Create a Scene3D-backed Studio project. This does not run AI generation or publish anything.",
      inputSchema: {
        name: z.string().trim().min(1).max(80).describe("Human-readable project name."),
        templateId: z.enum(PROJECT_TEMPLATES).default("blank-r3f-scene").describe("Starter project template.")
      },
      outputSchema: { project: z.unknown() },
      annotations: REVERSIBLE_WRITE
    },
    async ({ name, templateId }) => toolResult({ project: await api.createProject({ name, templateId }) })
  );

  server.registerTool(
    "studio_get_scene_authoring_guide",
    {
      title: "Get Scene3D authoring guide",
      description: "Read the supported Scene3D v1 shape, enums, safety rules, editing workflow, and a valid example.",
      outputSchema: { guide: z.unknown() },
      annotations: READ_ONLY
    },
    async () => toolResult({ guide: SCENE_AUTHORING_GUIDE })
  );

  server.registerTool(
    "studio_get_scene",
    {
      title: "Get Studio scene",
      description: "Read a complete Scene3D document and a projectUpdatedAt version for conflict-safe replacement.",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: { project: z.unknown(), projectUpdatedAt: z.string(), scene: z.unknown() },
      annotations: READ_ONLY
    },
    async ({ projectId }) => {
      const { project, scene } = await readConsistentScene(api, projectId);
      return toolResult({ project, projectUpdatedAt: project.updatedAt, scene });
    }
  );

  server.registerTool(
    "studio_validate_scene",
    {
      title: "Validate Scene3D",
      description: "Validate and normalize a proposed complete Scene3D document locally without changing the project.",
      inputSchema: { scene: sceneSchema },
      outputSchema: {
        valid: z.boolean(),
        errorCount: z.number(),
        issues: z.array(z.string()),
        normalizedScene: z.unknown()
      },
      annotations: READ_ONLY
    },
    async ({ scene }) => {
      const validation = validateScene3D(scene);
      return toolResult({
        valid: validation.errorCount === 0,
        errorCount: validation.errorCount,
        issues: validation.issues,
        normalizedScene: validation.scene
      });
    }
  );

  server.registerTool(
    "studio_replace_scene",
    {
      title: "Replace Studio scene",
      description:
        "Replace a project's complete Scene3D document after validation and an update-version check. Creates a rollback snapshot before writing.",
      inputSchema: {
        projectId: projectIdSchema,
        expectedUpdatedAt: z
          .string()
          .trim()
          .min(1)
          .describe("Exact projectUpdatedAt value from the most recent studio_get_scene call."),
        scene: sceneSchema
      },
      outputSchema: {
        project: z.unknown(),
        snapshot: z.unknown(),
        scene: z.unknown(),
        issues: z.array(z.string())
      },
      annotations: REVERSIBLE_WRITE
    },
    async ({ projectId, expectedUpdatedAt, scene }) => {
      const validation = validateScene3D(scene);
      if (validation.errorCount > 0) {
        throw new Error(`Scene replacement blocked by ${validation.errorCount} validation error(s): ${validation.issues.join(" ")}`);
      }

      const currentProject = await api.getProject(projectId);
      if (currentProject.updatedAt !== expectedUpdatedAt) {
        throw new Error(
          `Scene replacement blocked because the project changed. Expected ${expectedUpdatedAt}, current version is ${currentProject.updatedAt}. Call studio_get_scene again and reapply the edit.`
        );
      }

      const snapshot = await api.createSnapshot(projectId, `MCP before ${new Date().toISOString()}`);
      const replacement = await api.replaceScene(projectId, validation.scene);
      const project = await api.getProject(projectId);
      return toolResult({ project, snapshot, scene: replacement.scene, issues: replacement.issues });
    }
  );

  server.registerTool(
    "studio_build_project",
    {
      title: "Build Studio project",
      description: "Run the Studio project's isolated build and visual validation. This can consume hosted build quota.",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: { build: z.unknown() },
      annotations: REVERSIBLE_WRITE
    },
    async ({ projectId }) => toolResult({ build: trimBuild(await api.buildProject(projectId)) })
  );

  server.registerTool(
    "studio_start_preview",
    {
      title: "Start Studio preview",
      description: "Start or refresh a token-gated project preview and return an absolute preview URL. This can trigger a hosted build.",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: { preview: z.unknown() },
      annotations: REVERSIBLE_WRITE
    },
    async ({ projectId }) => {
      const response = await api.startPreview(projectId);
      if (!response.preview) {
        const build = response.build ? trimBuild(response.build) : undefined;
        throw new Error(`Preview could not start.${build ? ` Build result: ${JSON.stringify(build)}` : ""}`);
      }
      const preview = trimPreview(response.preview, api.toAbsoluteUrl(response.preview.url));
      return toolResult({ preview });
    }
  );

  return server;
}

async function readConsistentScene(api: StudioApi, projectId: string): Promise<{ project: Project; scene: Scene3D }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await api.getProject(projectId);
    const scene = await api.getScene(projectId);
    const after = await api.getProject(projectId);
    if (before.updatedAt === after.updatedAt) return { project: after, scene };
  }
  throw new Error("The project changed while its scene was being read. Retry studio_get_scene.");
}

function toolResult<T extends Record<string, unknown>>(structuredContent: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

function trimBuild(build: BuildResult): BuildResult {
  return {
    ...build,
    logs: truncate(build.logs),
    visualValidation: build.visualValidation
      ? { ...build.visualValidation, logs: truncate(build.visualValidation.logs) }
      : undefined
  };
}

function trimPreview(preview: PreviewSession, absoluteUrl: string): PreviewSession {
  return { ...preview, url: absoluteUrl, logs: truncate(preview.logs) };
}

function truncate(value: string, maxLength = 12_000): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n… ${value.length - maxLength} more characters omitted`;
}
