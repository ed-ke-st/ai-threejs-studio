import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

test("the executable server completes an MCP handshake over STDIO", async () => {
  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--silent", "--dir", repositoryRoot, "mcp"],
    env: {
      ...getDefaultEnvironment(),
      AI_THREEJS_STUDIO_API_URL: "http://127.0.0.1:4000"
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "stdio-smoke-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 8);
    assert.ok(tools.tools.some((tool) => tool.name === "studio_replace_scene"));
  } finally {
    await client.close();
  }
});
