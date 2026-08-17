import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createScene3DSceneFiles, defaultScene3D } from "@ai-threejs-studio/scene3d/codegen";
import { templates } from "@ai-threejs-studio/three-templates";
import { assertWorkspaceSourcePolicy, projectSourcePolicyViolation } from "./projectSourcePolicy.js";
import { escapeHtmlText } from "./htmlText.js";

test("allows package and in-src imports", () => {
  assert.equal(projectSourcePolicyViolation("src/main.tsx", 'import React from "react"; import App from "./App";'), null);
  assert.equal(projectSourcePolicyViolation("src/styles/main.css", '@import "./tokens.css"; .hero { background: url("../image.png"); }'), null);
});

test("blocks module and asset paths that escape src", () => {
  assert.match(projectSourcePolicyViolation("src/main.tsx", 'import secrets from "../../../proc/1/environ?raw";') ?? "", /path leaves src/);
  assert.match(projectSourcePolicyViolation("src/view.ts", 'const data = new URL("../../.env", import.meta.url);') ?? "", /path leaves src/);
  assert.match(projectSourcePolicyViolation("src/styles.css", 'body { background: url("../../.env"); }') ?? "", /path leaves src/);
});

test("blocks Vite glob access, external source maps, and Node builtins", () => {
  assert.match(projectSourcePolicyViolation("src/main.ts", 'const files = import.meta.glob("/**/*", { query: "?raw" });') ?? "", /import\.meta\.glob/);
  assert.match(projectSourcePolicyViolation("src/main.ts", 'import fs from "node:fs";') ?? "", /host\/runtime access/);
  assert.match(projectSourcePolicyViolation("src/main.ts", '//# sourceMappingURL=../../proc/1/environ') ?? "", /external source maps/);
});

test("allows every shipped template and generated Scene3D source file", () => {
  const files = [...templates.flatMap((template) => template.files), ...createScene3DSceneFiles(defaultScene3D())];
  for (const file of files.filter((candidate) => /\.(?:ts|tsx|js|jsx|css)$/.test(candidate.path))) {
    assert.equal(projectSourcePolicyViolation(file.path, file.content), null, file.path);
  }
});

test("escapes project names inserted into generated HTML", () => {
  assert.equal(escapeHtmlText('Lights & <script>"on"</script>'), "Lights &amp; &lt;script&gt;&quot;on&quot;&lt;/script&gt;");
});

test("requires immutable build scaffolding and rejects extra root config", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "studio-source-policy-"));
  try {
    for (const file of templates[0].files) {
      const absolute = path.join(workspace, file.path);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      const content = file.path === "index.html" ? file.content.replace("__PROJECT_NAME__", "Safe &amp; Sound") : file.content;
      await fs.writeFile(absolute, content);
    }
    await assert.doesNotReject(assertWorkspaceSourcePolicy(workspace));

    await fs.writeFile(path.join(workspace, "vite.config.js"), 'throw new Error("executed");');
    await assert.rejects(assertWorkspaceSourcePolicy(workspace), /unexpected root entry vite\.config\.js/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
