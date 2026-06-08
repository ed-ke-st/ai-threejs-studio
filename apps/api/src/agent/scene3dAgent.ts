// Scene3DAgent — the lean replacement for the multi-stage plan/spec/metadata
// pipeline. One structured representation, one loop:
//   generate Scene3D JSON -> validate -> write project (shared interpreter) ->
//   build -> visual-validate -> repair on failure.
// Because the scene is data and the renderer is fixed, build failures are rare;
// the meaningful signal is visual validation (does it actually render?).

import { createScene3DSceneFiles, defaultScene3D } from "@ai-threejs-studio/scene3d/codegen";
import { SCENE_CONFIG_PATH, autoFixScene, findNode, lintScene, updateNode, validateScene3D, type LintIssue, type Scene3D, type SceneNode } from "@ai-threejs-studio/scene3d";
import type { BuildResult, RagChunk, VisualValidationResult } from "@ai-threejs-studio/shared";
import type { SceneGenerator } from "./scene3dGenerator.js";
import type { PreviewRunner } from "../preview/previewRunner.js";
import type { ProjectStorage } from "../storage/localWorkspaceStorage.js";

interface Scene3DAgentOptions {
  storage: ProjectStorage;
  previewRunner: PreviewRunner;
  generator: SceneGenerator;
  maxRepairAttempts: number;
}

export interface Scene3DAgentResult {
  ok: boolean;
  scene: Scene3D;
  issues: string[];
  attempts: number;
  build: BuildResult;
  visual: VisualValidationResult | null;
  log: string[];
}

export class Scene3DAgent {
  constructor(private readonly options: Scene3DAgentOptions) {}

  async run(input: {
    projectId: string;
    prompt: string;
    retrievedContext?: RagChunk[];
    mode?: "new" | "refine";
    selectedObjectId?: string;
    onProgress?: (stage: string) => void;
    onNode?: (node: unknown) => void;
  }): Promise<Scene3DAgentResult> {
    const log: string[] = [];
    const retrievedContext = input.retrievedContext ?? [];
    const progress = input.onProgress ?? (() => {});
    const currentScene = await this.readCurrentScene(input.projectId);

    const selectedContext =
      input.mode === "refine" && input.selectedObjectId
        ? describeNode(findNode(currentScene.nodes, input.selectedObjectId))
        : undefined;

    // 1. Generate (or refine) the Scene3D document. When a node callback is
    // provided, stream so each node previews live as it is written.
    progress(input.mode === "refine" ? "Refining the scene" : "Designing the scene");
    // Editor-uploaded image textures are stored inline as data URIs. They'd be
    // huge (and useless) in the model prompt, so strip them to a placeholder on
    // the way in and restore them by node id on the way out.
    const generateInput = {
      prompt: input.prompt,
      currentScene: JSON.stringify(stripTextureData(currentScene), null, 2),
      retrievedContext,
      mode: input.mode,
      selectedContext
    };
    // Hovering/floating is only valid when the prompt asks for it.
    const allowFloating = /\b(float|floating|hover|hovering|levitat|suspend|mid-?air|flying|orbit)\b/i.test(input.prompt);
    const isNew = input.mode !== "refine";

    let scene: Scene3D;
    let issues: string[];
    if (isNew) {
      // New scene: generate the whole document (streamed so the editor builds it up live).
      const generated = input.onNode
        ? await this.options.generator.generateStreaming(generateInput, input.onNode)
        : await this.options.generator.generate(generateInput);
      const validated = validateScene3D(parseJson(generated));
      scene = restoreTextureData(validated.scene, currentScene);
      issues = validated.issues;
    } else {
      // Refine: ask for a small patch and apply it to the current scene, so unrelated
      // objects and the user's manual edits survive verbatim. Fall back to a full-scene
      // refine if the model returns an unusable patch.
      const patch = parseJson(await this.options.generator.refineDiff(generateInput));
      const patched = applyScenePatch(currentScene, patch);
      if (patched) {
        const validated = validateScene3D(patched);
        scene = validated.scene;
        issues = validated.issues;
        log.push(`Refined via patch (${patchOpCount(patch)} op(s)).`);
      } else {
        const generated = await this.options.generator.generate(generateInput);
        const validated = validateScene3D(parseJson(generated));
        scene = restoreTextureData(validated.scene, currentScene);
        issues = validated.issues;
        log.push("Refine patch was unusable; regenerated the full scene.");
      }
    }

    // Deterministic spatial fixes (ground objects + frame camera) on fresh scenes,
    // then lint for the issues the model itself must repair (overlaps, scale).
    scene = this.autoFix(scene, isNew, allowFloating, log);
    let lint = lintScene(scene, { allowFloating });
    log.push(`${isNew ? "Generated" : "Refined"} scene with ${scene.nodes.length} root nodes. ${issues.length} validation, ${lint.length} spatial issue(s).`);

    // 2-4. Write, build, visual-validate, repair.
    let attempts = 0;
    progress("Building the scene");
    let build = await this.writeAndBuild(input.projectId, scene);
    progress("Checking it renders");
    let visual = build.ok ? await this.visualValidate(input.projectId) : null;
    log.push(stepLine(0, build, visual, issues, lint));

    while (attempts < this.options.maxRepairAttempts && !isHealthy(build, visual, lint)) {
      attempts += 1;
      progress(`Fixing issues (attempt ${attempts})`);
      const diagnostics = collectDiagnostics(build, visual, issues, lint);
      const repaired = await this.options.generator.repair({
        prompt: input.prompt,
        currentScene: JSON.stringify(stripTextureData(currentScene), null, 2),
        brokenScene: JSON.stringify(stripTextureData(scene), null, 2),
        diagnostics,
        attempt: attempts,
        retrievedContext
      });
      const result = validateScene3D(parseJson(repaired));
      scene = restoreTextureData(result.scene, currentScene);
      scene = this.autoFix(scene, isNew, allowFloating, log);
      issues = result.issues;
      lint = lintScene(scene, { allowFloating });
      progress("Building the scene");
      build = await this.writeAndBuild(input.projectId, scene);
      progress("Checking it renders");
      visual = build.ok ? await this.visualValidate(input.projectId) : null;
      log.push(stepLine(attempts, build, visual, issues, lint));
    }

    return {
      ok: isHealthy(build, visual, lint),
      scene,
      issues,
      attempts,
      build,
      visual,
      log
    };
  }

  // Deterministic spatial cleanup. On a fresh scene: ground objects (sunk +
  // unsupported floating) and frame the camera. On refine: only un-sink objects
  // below the floor (an object below ground is never intentional) — leave floating,
  // positions, and the camera as the user/model arranged them, so a deterministic
  // fix replaces a costly repair round-trip.
  private autoFix(scene: Scene3D, isNew: boolean, allowFloating: boolean, log: string[]): Scene3D {
    const { scene: fixed, applied } = autoFixScene(scene, { ground: true, sunkOnly: !isNew, reframeCamera: isNew, allowFloating });
    if (applied.length > 0) log.push(`Auto-fix: ${applied.join(", ")}.`);
    return fixed;
  }

  private async readCurrentScene(projectId: string): Promise<Scene3D> {
    const file = await this.options.storage.getProjectFile(projectId, SCENE_CONFIG_PATH);
    if (!file) {
      return defaultScene3D();
    }
    try {
      return validateScene3D(JSON.parse(file.content)).scene;
    } catch {
      return defaultScene3D();
    }
  }

  // Writes the full Scene3D-backed source set (shared interpreter + config) so the
  // project always renders through the canonical renderer.
  private async writeAndBuild(projectId: string, scene: Scene3D): Promise<BuildResult> {
    for (const file of createScene3DSceneFiles(scene)) {
      await this.options.storage.writeProjectFile(projectId, file.path, file.content);
    }
    return this.options.previewRunner.build(projectId);
  }

  private async visualValidate(projectId: string): Promise<VisualValidationResult> {
    const root = this.options.storage.getProjectRoot(projectId);
    return this.options.previewRunner.validateWorkspaceVisual(root);
  }
}

function describeNode(node: SceneNode | null): string | undefined {
  if (!node) {
    return undefined;
  }
  const parts: Array<string | null> = [`id="${node.id}"`, node.name ? `name="${node.name}"` : null, `type=${node.type}`];
  if (node.type === "mesh") {
    parts.push(`geometry=${node.geometry?.kind ?? "box"}`);
    if (node.material?.color) parts.push(`color=${node.material.color}`);
  } else if (node.type === "light") {
    parts.push(`light=${node.light}`);
  } else if (node.type === "group") {
    parts.push(`group of ${node.children.length} parts`);
  }
  return parts.filter(Boolean).join(" ");
}

function isHealthy(build: BuildResult, visual: VisualValidationResult | null, lint: LintIssue[]): boolean {
  const lintOk = !lint.some((issue) => issue.severity === "error");
  return build.ok && (visual === null ? false : visual.ok) && lintOk;
}

function collectDiagnostics(build: BuildResult, visual: VisualValidationResult | null, issues: string[], lint: LintIssue[]): string {
  const parts: string[] = [];
  if (issues.length > 0) parts.push(`Scene3D validation:\n${issues.join("\n")}`);
  if (!build.ok) parts.push(`Build failed:\n${build.errorSummary ?? build.logs}`);
  if (visual && !visual.ok) {
    parts.push(`Visual validation failed:\n${visual.findings.map((f) => `[${f.severity}] ${f.code}: ${f.message}`).join("\n")}\n${visual.logs}`);
  }
  if (lint.length > 0) {
    parts.push(
      `Spatial issues (fix by adjusting positions/scale; keep node ids and names unchanged):\n${lint.map((i) => `- [${i.severity}] ${i.message}`).join("\n")}`
    );
  }
  return parts.join("\n\n") || "No diagnostics.";
}

function stepLine(attempt: number, build: BuildResult, visual: VisualValidationResult | null, issues: string[], lint: LintIssue[]): string {
  const label = attempt === 0 ? "initial" : `repair ${attempt}`;
  return `[${label}] build=${build.ok ? "ok" : "fail"} visual=${visual ? visual.status : "skipped"} issues=${issues.length} spatial=${lint.length}`;
}

// Inline image textures (data URIs) must not be sent to the model — they bloat
// the prompt by hundreds of KB. We replace them with a short placeholder and put
// the real data back afterward, matching by node id.
const TEXTURE_PLACEHOLDER = "__editor_image_texture__";

function isDataUri(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

function stripTextureData(scene: Scene3D): Scene3D {
  const clone = JSON.parse(JSON.stringify(scene)) as Scene3D;
  const walk = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (node.type === "mesh" && node.material?.texture && isDataUri(node.material.texture.imageUrl)) {
        node.material.texture.imageUrl = TEXTURE_PLACEHOLDER;
      }
      if (node.type === "group") walk(node.children);
    }
  };
  walk(clone.nodes);
  return clone;
}

function restoreTextureData(target: Scene3D, source: Scene3D): Scene3D {
  const originals = new Map<string, string>();
  const collect = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (node.type === "mesh" && node.material?.texture && isDataUri(node.material.texture.imageUrl)) {
        originals.set(node.id, node.material.texture.imageUrl as string);
      }
      if (node.type === "group") collect(node.children);
    }
  };
  collect(source.nodes);

  const restore = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (node.type === "mesh" && node.material?.texture && node.material.texture.imageUrl === TEXTURE_PLACEHOLDER) {
        const original = originals.get(node.id);
        if (original) {
          node.material.texture.imageUrl = original;
        } else {
          // Placeholder with no matching original (new/renamed node) — drop it.
          delete node.material.texture;
        }
      }
      if (node.type === "group") restore(node.children);
    }
  };
  restore(target.nodes);
  return target;
}

// Applies a refine patch ({ ops: [...] }) to the scene. Operates on the real
// current scene (textures intact); update preserves an existing image texture the
// model couldn't see. Returns null if the patch is unusable (→ caller falls back).
function applyScenePatch(scene: Scene3D, patch: unknown): Scene3D | null {
  if (!isRecord(patch) || !Array.isArray(patch.ops) || patch.ops.length === 0) return null;
  let result: Scene3D = JSON.parse(JSON.stringify(scene)) as Scene3D;
  let changed = false;

  for (const raw of patch.ops) {
    if (!isRecord(raw)) continue;
    const op = raw.op;
    if (op === "update" && typeof raw.id === "string" && isRecord(raw.node)) {
      const existing = findNode(result.nodes, raw.id);
      const node = preserveTexture(raw.node as unknown as SceneNode, existing);
      result = existing ? { ...result, nodes: updateNode(result.nodes, raw.id, () => node) } : { ...result, nodes: [...result.nodes, node] };
      changed = true;
    } else if (op === "add" && isRecord(raw.node)) {
      const node = raw.node as unknown as SceneNode;
      const parentId = typeof raw.parentId === "string" ? raw.parentId : null;
      const parent = parentId ? findNode(result.nodes, parentId) : null;
      if (parent && parent.type === "group") {
        result = { ...result, nodes: updateNode(result.nodes, parentId as string, (g) => (g.type === "group" ? { ...g, children: [...g.children, node] } : g)) };
      } else {
        result = { ...result, nodes: [...result.nodes, node] };
      }
      changed = true;
    } else if (op === "remove" && typeof raw.id === "string") {
      result = { ...result, nodes: removeById(result.nodes, raw.id) };
      changed = true;
    } else if (op === "scene" && isRecord(raw.patch)) {
      const p = raw.patch;
      if (typeof p.background === "string") result = { ...result, background: p.background };
      if (isRecord(p.camera)) result = { ...result, camera: { ...result.camera, ...(p.camera as Scene3D["camera"]) } };
      if (isRecord(p.fog)) result = { ...result, fog: p.fog as Scene3D["fog"] };
      if (isRecord(p.metadata)) result = { ...result, metadata: { ...result.metadata, ...(p.metadata as Scene3D["metadata"]) } };
      changed = true;
    }
  }

  return changed ? result : null;
}

// On update, keep the node's existing image texture if the model's replacement
// dropped it or left the stripped placeholder (the model never saw the real data).
function preserveTexture(node: SceneNode, existing: SceneNode | null): SceneNode {
  if (!existing || existing.type !== "mesh" || node.type !== "mesh") return node;
  const original = existing.material?.texture;
  if (!original || !isDataUri(original.imageUrl)) return node;
  const next = node.material?.texture;
  const nextIsRealImage = next && next.imageUrl && next.imageUrl !== TEXTURE_PLACEHOLDER && isDataUri(next.imageUrl);
  if (nextIsRealImage) return node;
  return { ...node, material: { ...(node.material ?? {}), texture: original } };
}

function removeById(nodes: SceneNode[], id: string): SceneNode[] {
  return nodes.filter((n) => n.id !== id).map((n) => (n.type === "group" ? { ...n, children: removeById(n.children, id) } : n));
}

function patchOpCount(patch: unknown): number {
  return isRecord(patch) && Array.isArray(patch.ops) ? patch.ops.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Last resort: grab the outermost JSON object.
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
