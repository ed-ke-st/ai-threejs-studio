import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Scene3D } from "@ai-threejs-studio/scene3d";
import type { BuildResult, PreviewSession, Project, ProjectSnapshot, ProjectTemplateId } from "@ai-threejs-studio/shared";
import type { StudioApi } from "./api.js";
import { EXAMPLE_SCENE } from "./guide.js";
import { createStudioMcpServer } from "./server.js";

test("MCP protocol exposes the bounded tool set and performs snapshot-first scene replacement", async () => {
  const events: string[] = [];
  let scene: Scene3D = structuredClone(EXAMPLE_SCENE);
  let project: Project = {
    id: "project-1",
    ownerId: "owner-1",
    name: "MCP project",
    templateId: "blank-r3f-scene",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "version-1"
  };

  const api: StudioApi = {
    async listProjects() {
      return [project];
    },
    async createProject(input: { name: string; templateId: ProjectTemplateId }) {
      return { ...project, name: input.name, templateId: input.templateId };
    },
    async getProject() {
      return project;
    },
    async getScene() {
      return scene;
    },
    async replaceScene(_projectId: string, nextScene: Scene3D) {
      events.push("replace");
      scene = nextScene;
      project = { ...project, updatedAt: "version-2" };
      return { scene, issues: [] };
    },
    async createSnapshot() {
      events.push("snapshot");
      return { id: "snapshot-1", createdAt: "2026-01-01T00:00:01.000Z" } satisfies ProjectSnapshot;
    },
    async buildProject() {
      return {
        ok: true,
        command: "pnpm build",
        logs: "ok",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z"
      } satisfies BuildResult;
    },
    async startPreview() {
      return {
        preview: {
          projectId: project.id,
          status: "running",
          url: "/preview/project-1/token/",
          port: 0,
          logs: "ready",
          startedAt: "2026-01-01T00:00:01.000Z"
        } satisfies PreviewSession
      };
    },
    toAbsoluteUrl(value: string) {
      return new URL(value, "https://studio.example").toString();
    }
  };

  const server = createStudioMcpServer(api);
  const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "studio_build_project",
        "studio_create_project",
        "studio_get_scene",
        "studio_get_scene_authoring_guide",
        "studio_list_projects",
        "studio_replace_scene",
        "studio_start_preview",
        "studio_validate_scene"
      ]
    );
    assert.equal(tools.tools.find((tool) => tool.name === "studio_get_scene")?.annotations?.readOnlyHint, true);
    assert.equal(tools.tools.find((tool) => tool.name === "studio_replace_scene")?.annotations?.destructiveHint, false);

    const read = await client.callTool({ name: "studio_get_scene", arguments: { projectId: project.id } });
    assert.equal(asRecord(read.structuredContent).projectUpdatedAt, "version-1");

    const invalid = await client.callTool({ name: "studio_validate_scene", arguments: { scene: {} } });
    assert.equal(asRecord(invalid.structuredContent).valid, false);

    const replacement = await client.callTool({
      name: "studio_replace_scene",
      arguments: { projectId: project.id, expectedUpdatedAt: "version-1", scene: EXAMPLE_SCENE }
    });
    assert.equal(replacement.isError, undefined);
    assert.deepEqual(events, ["snapshot", "replace"]);
    assert.equal(asRecord(asRecord(replacement.structuredContent).project).updatedAt, "version-2");

    const stale = await client.callTool({
      name: "studio_replace_scene",
      arguments: { projectId: project.id, expectedUpdatedAt: "version-1", scene: EXAMPLE_SCENE }
    });
    assert.equal(stale.isError, true);
    assert.deepEqual(events, ["snapshot", "replace"]);

    const preview = await client.callTool({ name: "studio_start_preview", arguments: { projectId: project.id } });
    assert.equal(asRecord(asRecord(preview.structuredContent).preview).url, "https://studio.example/preview/project-1/token/");
  } finally {
    await client.close();
    await server.close();
  }
});

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}
