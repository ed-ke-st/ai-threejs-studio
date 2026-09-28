import { defineConfig } from "tsup";

// Proof-of-concept bundle: inlines the two workspace packages plus the MCP SDK
// and zod so the output runs with zero node_modules, outside the pnpm
// workspace entirely. See docs/mcp.md and the plan that introduced this for
// why (hosted users shouldn't need to clone the monorepo to run this server).
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/@ai-threejs-studio\//, "@modelcontextprotocol/sdk", "zod"]
  // No banner needed: tsup auto-preserves the shebang already on src/index.ts.
});
