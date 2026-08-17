#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StudioApiClient } from "./api.js";
import { createStudioMcpServer } from "./server.js";

const requestTimeoutMs = Number(process.env.AI_THREEJS_STUDIO_REQUEST_TIMEOUT_MS ?? "120000");
const api = new StudioApiClient({
  baseUrl: process.env.AI_THREEJS_STUDIO_API_URL ?? "http://127.0.0.1:4000",
  accessToken: process.env.AI_THREEJS_STUDIO_ACCESS_TOKEN,
  requestTimeoutMs
});

const server = createStudioMcpServer(api);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Three.js Studio MCP server connected over stdio.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
