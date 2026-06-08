// Scene3D generator: a single OpenAI call that emits a complete Scene3D JSON
// document. This is the "AI emits structured data, not code" path — far more
// reliable than codegen and directly editable + round-trippable. Mirrors the
// Responses-API usage in openAiSceneGenerator.ts.

import type { RagChunk } from "@ai-threejs-studio/shared";
import { selectFewShotBlock } from "./scene3dExamples.js";

interface Scene3DGeneratorOptions {
  apiKey?: string;
  model: string;
  /** Optional cheaper/faster model for the mechanical repair loop. Defaults to `model`. */
  repairModel?: string;
  requestTimeoutMs: number;
}

export interface GenerateScene3DInput {
  prompt: string;
  currentScene: string; // current scene.config.json (Scene3D)
  retrievedContext: RagChunk[];
  /** "new" rebuilds from scratch; "refine" edits the current scene minimally. */
  mode?: "new" | "refine";
  /** In refine mode, a description of the node the user has selected so that
   * "this"/"it"/"the selected object" resolves to it. */
  selectedContext?: string;
}

export interface RepairScene3DInput extends GenerateScene3DInput {
  brokenScene: string;
  diagnostics: string;
  attempt: number;
}

// Provider-agnostic contract so the agent can run on OpenAI or Claude.
export interface SceneGenerator {
  readonly enabled: boolean;
  generate(input: GenerateScene3DInput): Promise<string | null>;
  generateStreaming(input: GenerateScene3DInput, onNode: (node: unknown) => void): Promise<string | null>;
  /** Refine via a small JSON patch (ops by node id) instead of a whole-scene regen. */
  refineDiff(input: GenerateScene3DInput): Promise<string | null>;
  repair(input: RepairScene3DInput): Promise<string | null>;
}

// Shared user-message parts (provider-agnostic). `includeFewShot` is true for
// providers that put the relevance-selected examples in the user turn (OpenAI);
// Claude sets it false and caches the full example library in the system block.
export function buildGenerationParts(
  input: GenerateScene3DInput,
  options?: { includeFewShot?: boolean }
): Array<string | null | undefined> {
  const refine = input.mode === "refine";
  const includeFewShot = options?.includeFewShot ?? true;
  return [
    `${refine ? "Requested change to the current scene" : "User request"}:\n${input.prompt}`,
    refine && input.selectedContext
      ? `The user has SELECTED this node — interpret "this", "it", "the selected object", "the selected light", etc. as referring to it, and edit it in place (keep its id). Leave other nodes unchanged unless the request clearly implies otherwise:\n${input.selectedContext}`
      : null,
    refine || !includeFewShot ? null : selectFewShotBlock(input.prompt),
    `Relevant reference context:\n${formatContext(input.retrievedContext)}`,
    `Current scene.config.json (Scene3D):\n${input.currentScene}`
  ];
}

export function buildRepairParts(input: RepairScene3DInput): Array<string | null | undefined> {
  return [
    `Original user request:\n${input.prompt}`,
    `Repair attempt: ${input.attempt}`,
    `Diagnostics (validation / build / visual):\n${input.diagnostics}`,
    `Broken scene.config.json:\n${input.brokenScene}`,
    `Relevant reference context:\n${formatContext(input.retrievedContext)}`
  ];
}

export class Scene3DGenerator implements SceneGenerator {
  constructor(private readonly options: Scene3DGeneratorOptions) {}

  get enabled(): boolean {
    return Boolean(this.options.apiKey);
  }

  async generate(input: GenerateScene3DInput): Promise<string | null> {
    const { instructions, parts } = this.buildGeneration(input);
    return this.call(this.options.model, instructions, parts);
  }

  // Streaming variant: emits each top-level scene node via `onNode` the moment it
  // finishes being written, so the editor can build the scene up live. Returns the
  // full output text for the agent to validate as usual.
  async generateStreaming(input: GenerateScene3DInput, onNode: (node: unknown) => void): Promise<string | null> {
    if (!this.options.apiKey) {
      return null;
    }
    const { instructions, parts } = this.buildGeneration(input);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.options.model,
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: parts.filter(Boolean).join("\n\n") }] }],
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI Scene3D streaming failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const nodeParser = new NodeStreamParser();
    let sseBuffer = "";
    let deltaText = "";
    let finalText: string | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = sseBuffer.indexOf("\n")) >= 0) {
        const line = sseBuffer.slice(0, newline).trim();
        sseBuffer = sseBuffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let event: { type?: string; delta?: string; response?: OpenAiResponse };
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          deltaText += event.delta;
          for (const node of nodeParser.push(event.delta)) {
            onNode(node);
          }
        } else if (event.type === "response.completed" && event.response) {
          // Authoritative full text (covers any unexpected delta event shape).
          finalText = extractOutputText(event.response);
        }
      }
    }

    return (finalText ?? deltaText)?.trim() || null;
  }

  private buildGeneration(input: GenerateScene3DInput): { instructions: string; parts: Array<string | null | undefined> } {
    const base = input.mode === "refine" ? SCENE3D_REFINE_INSTRUCTION : SCENE3D_SYSTEM_INSTRUCTION;
    return {
      instructions: `${base}\n\nReturn only JSON, no markdown.`,
      parts: buildGenerationParts(input)
    };
  }

  async refineDiff(input: GenerateScene3DInput): Promise<string | null> {
    return this.call(this.options.model, `${SCENE3D_REFINE_DIFF_INSTRUCTION}\n\nReturn only the JSON patch object, no markdown.`, buildGenerationParts(input));
  }

  async repair(input: RepairScene3DInput): Promise<string | null> {
    return this.call(this.options.repairModel ?? this.options.model, `${SCENE3D_REPAIR_INSTRUCTION} Return only JSON, no markdown.`, buildRepairParts(input));
  }

  private async call(model: string, instructions: string, parts: Array<string | null | undefined>): Promise<string | null> {
    if (!this.options.apiKey) {
      return null;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: parts.filter(Boolean).join("\n\n") }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI Scene3D generation failed with status ${response.status}`);
    }

    const data = (await response.json()) as OpenAiResponse;
    return extractOutputText(data)?.trim() ?? null;
  }
}

// Pulls complete top-level node objects out of a streaming JSON document as soon
// as each one's closing brace arrives. It scans the `nodes` array, brace-matching
// while respecting strings/escapes, so a whole group node (with nested children)
// emits once it fully closes.
export class NodeStreamParser {
  private buffer = "";
  private started = false;
  private scanPos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private nodeStart = -1;
  private finished = false;

  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const out: unknown[] = [];
    if (this.finished) {
      return out;
    }

    if (!this.started) {
      const keyIndex = this.buffer.indexOf('"nodes"');
      if (keyIndex < 0) return out;
      const bracket = this.buffer.indexOf("[", keyIndex);
      if (bracket < 0) return out;
      this.started = true;
      this.scanPos = bracket + 1;
    }

    for (let i = this.scanPos; i < this.buffer.length; i += 1) {
      const ch = this.buffer[i];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (ch === '"') {
        this.inString = true;
      } else if (ch === "{") {
        if (this.depth === 0) this.nodeStart = i;
        this.depth += 1;
      } else if (ch === "}") {
        this.depth -= 1;
        if (this.depth === 0 && this.nodeStart >= 0) {
          try {
            out.push(JSON.parse(this.buffer.slice(this.nodeStart, i + 1)));
          } catch {
            // ignore — a malformed slice just won't preview
          }
          this.nodeStart = -1;
        }
      } else if (ch === "]" && this.depth === 0) {
        this.finished = true;
        this.scanPos = i + 1;
        return out;
      }
    }

    this.scanPos = this.buffer.length;
    return out;
  }
}

export const SCENE3D_SYSTEM_INSTRUCTION = [
  "You author a Scene3D JSON document for a React Three Fiber scene. The same JSON is rendered by a fixed interpreter AND edited by users in a visual editor, so it must be complete and structured.",
  "Top-level shape: { metadata: { name, version: 1 }, background?: hexColor, fog?: { color, near, far }, camera?: { position:[x,y,z], target:[x,y,z], fov }, nodes: SceneNode[] }.",
  "A SceneNode is one of:",
  "- mesh: { id, type:\"mesh\", name, visible?, transform?:{position,rotation,scale}, geometry:{ kind, args? }, material?:{...}, castShadow?, receiveShadow? }",
  "- group: { id, type:\"group\", name, transform?, children: SceneNode[] }",
  "- light: { id, type:\"light\", name, light:\"ambient\"|\"hemisphere\"|\"directional\"|\"point\"|\"spot\", color?, intensity?, distance?, angle?, penumbra?, groundColor?, transform? }",
  "- model: { id, type:\"model\", name, assetUrl? } (only when a local project asset already exists; never invent assetUrl).",
  "geometry.kind is one of: box, sphere, cylinder, cone, plane, torus, torusKnot, capsule, icosahedron. args is the THREE.js geometry args array (optional; sensible defaults applied).",
  "material fields: type?:\"standard\"|\"physical\"|\"basic\", color, roughness(0..1), metalness(0..1), emissive(hex), emissiveIntensity, opacity(0..1), transmission(0..1, needs type physical for glass), ior, thickness, wireframe, flatShading.",
  "Rules: every id unique; rotation in radians; include at least one light and one visible mesh; use emissive + a coloured light for glow; use physical+transmission for glass/crystal; keep the subject framed by the camera.",
  "COMPOSITION — build scenes like a 3D artist:",
  "- Group every multi-part object into a single group node with a descriptive name. A chair = a group {seat, backrest, 4 legs}; a lamp = {base, stem, shade}; a tree = {trunk, foliage}; a table = {top, legs}. Put the object's overall placement on the GROUP transform so it can be moved and scaled as one unit; position the child parts relative to the group.",
  "- Use realistic relative proportions and consistent units (treat 1 = roughly one metre). A chair seat is ~0.45m high, a mug fits on a table, a tree is taller than a person.",
  "- Rest objects on surfaces: a mesh's lowest point should sit on the floor or its supporting surface (offset position.y by half its height), never floating — unless the prompt explicitly asks for floating/hovering.",
  "- Avoid intersecting or overlapping geometry; space objects deliberately and leave breathing room.",
  "- Give EVERY node a clear human-readable name (e.g. \"Oak Chair\", \"Seat\", \"Front-left leg\") — names are shown in the editor outliner and used when the user asks to refine a specific object.",
  "- Build depth and contrast: a ground/floor plane, one clear focal subject, supporting elements, and varied materials so objects read distinctly.",
  "The camera is a TOP-LEVEL field, never a node. \"light\" is a STRING, never an object.",
  "Example: {\"metadata\":{\"name\":\"Demo\",\"version\":1},\"background\":\"#0b0f17\",\"camera\":{\"position\":[3,2,4],\"target\":[0,1,0],\"fov\":45},\"nodes\":[{\"id\":\"ground\",\"type\":\"mesh\",\"name\":\"Ground\",\"geometry\":{\"kind\":\"box\",\"args\":[20,0.2,20]},\"transform\":{\"position\":[0,-0.1,0]},\"material\":{\"color\":\"#161d2b\",\"roughness\":0.9}},{\"id\":\"key\",\"type\":\"light\",\"name\":\"Key\",\"light\":\"directional\",\"color\":\"#fff1dc\",\"intensity\":2.5,\"transform\":{\"position\":[4,6,3]}}]}",
  "Use only procedural geometry, colours, and lights. No remote URLs, no textures, no external assets."
].join(" ");

export const SCENE3D_REFINE_PREAMBLE = [
  "You are REFINING an existing Scene3D JSON document, not creating a new one.",
  "Apply the requested change to the provided current scene with the smallest edit that satisfies it.",
  "Preserve existing node ids, names, transforms, materials, hierarchy, and any objects unrelated to the request — only add, remove, or modify what the request implies.",
  "If the user refers to an object by description (e.g. \"the crystal\"), match it to the existing node by name/role and edit that node in place (keep its id).",
  "Return the COMPLETE updated Scene3D document, following the same schema and rules:"
].join(" ");

const SCENE3D_REFINE_INSTRUCTION = `${SCENE3D_REFINE_PREAMBLE} ${SCENE3D_SYSTEM_INSTRUCTION}`;

// Targeted-diff refine: the model returns a small JSON patch (operations on nodes
// by id) instead of the whole scene, so unrelated objects and the user's manual
// edits are preserved verbatim, and far fewer tokens move.
export const SCENE3D_REFINE_DIFF_PREAMBLE = [
  "You EDIT an existing Scene3D scene by returning a small JSON PATCH — never the whole scene.",
  'Output exactly this shape: { "ops": Operation[] }. Each Operation is one of:',
  '- { "op": "update", "id": string, "node": SceneNode } — replace the existing node that has this id with the COMPLETE updated node (same id).',
  '- { "op": "add", "parentId": string | null, "node": SceneNode } — add a new node; parentId is a group id to nest under, or null for the scene root.',
  '- { "op": "remove", "id": string } — delete the node with this id (and its children if it is a group).',
  '- { "op": "scene", "patch": { background?, fog?, camera?, metadata? } } — change scene-level fields only.',
  "Include ONLY the operations needed for the request. Touch the fewest nodes possible; never restate unchanged nodes.",
  'Match objects the user names (e.g. "the crystal") to the existing node by name/role and update THAT id in place.',
  "Preserve every id and name unless the request is specifically about renaming. New nodes need unique ids and human-readable names.",
  "When updating a node you do NOT need to include its texture — existing image textures are preserved automatically.",
  "Each SceneNode follows the same schema and composition rules:"
].join(" ");

export const SCENE3D_REFINE_DIFF_INSTRUCTION = `${SCENE3D_REFINE_DIFF_PREAMBLE} ${SCENE3D_SYSTEM_INSTRUCTION}`;

export const SCENE3D_REPAIR_INSTRUCTION = [
  "You repair a Scene3D JSON document after validation, build, or visual-validation failures.",
  "Make the smallest correction that resolves the diagnostics while preserving the user's intent.",
  "For validation errors: fix invalid ids, geometry kinds, light kinds, or asset references.",
  "For visual failures (blank/black/flat frame): add or strengthen lights, raise emissive/contrast, reposition the subject into the camera frame, or add a visible mesh.",
  "Keep the same top-level Scene3D shape and node schema as the original document."
].join(" ");

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
}

function extractOutputText(response: OpenAiResponse): string | null {
  if (response.output_text) {
    return response.output_text;
  }
  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("\n");
  return text || null;
}

export function formatContext(chunks: RagChunk[]): string {
  if (chunks.length === 0) return "No retrieved context.";
  return chunks
    .slice(0, 6)
    .map((chunk, index) => `${index + 1}. ${chunk.title}\n${chunk.content}`)
    .join("\n\n");
}
