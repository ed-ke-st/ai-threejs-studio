import assert from "node:assert/strict";
import test from "node:test";
import type { BuildResult, Project } from "@ai-threejs-studio/shared";
import { StudioApiClient, StudioApiError } from "./api.js";

const PROJECT: Project = {
  id: "project-1",
  ownerId: "owner-1",
  name: "Test project",
  templateId: "blank-r3f-scene",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

test("StudioApiClient preserves an API path prefix and sends bearer auth", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const client = new StudioApiClient({
    baseUrl: "https://studio.example/api",
    accessToken: "secret-token",
    fetchImpl: (async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return Response.json({ projects: [PROJECT] });
    }) as typeof fetch
  });

  assert.deepEqual(await client.listProjects(), [PROJECT]);
  assert.equal(requests[0]?.url, "https://studio.example/api/projects");
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer secret-token");
  assert.equal(client.toAbsoluteUrl("/preview/project-1/token/"), "https://studio.example/preview/project-1/token/");
});

test("StudioApiClient returns a structured failed build from HTTP 422", async () => {
  const build: BuildResult = {
    ok: false,
    command: "pnpm build",
    logs: "TypeScript failed",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z"
  };
  const client = new StudioApiClient({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (async () => Response.json({ build }, { status: 422 })) as typeof fetch
  });

  assert.deepEqual(await client.buildProject(PROJECT.id), build);
});

test("StudioApiClient reports API errors without exposing the access token", async () => {
  const client = new StudioApiClient({
    baseUrl: "https://studio.example/api",
    accessToken: "must-not-leak",
    fetchImpl: (async () => Response.json({ error: "Project not found" }, { status: 404 })) as typeof fetch
  });

  await assert.rejects(
    () => client.getProject("missing"),
    (error: unknown) =>
      error instanceof StudioApiError &&
      error.status === 404 &&
      error.message.includes("Project not found") &&
      !error.message.includes("must-not-leak")
  );
});
