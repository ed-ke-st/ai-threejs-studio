import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProjectFilePath } from "./localWorkspaceStorage.js";

test("normalizes safe project paths", () => {
  assert.equal(normalizeProjectFilePath("/src/scene/scene.config.json"), "src/scene/scene.config.json");
  assert.equal(normalizeProjectFilePath("src\\scene\\Scene.tsx"), "src/scene/Scene.tsx");
});

test("rejects traversal and ambiguous project paths", () => {
  for (const candidate of ["", ".", "..", "../vite.config.ts", "src/../vite.config.ts", "src//Scene.tsx", "src/./Scene.tsx", "src/\0.ts"]) {
    assert.throws(() => normalizeProjectFilePath(candidate), /Invalid project path/);
  }
});
