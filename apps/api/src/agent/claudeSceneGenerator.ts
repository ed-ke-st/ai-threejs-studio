// Claude (Anthropic) Scene3D generator — the SceneGenerator implementation for
// the Anthropic provider, alongside the OpenAI Scene3DGenerator. Uses the official
// @anthropic-ai/sdk with prompt caching on the static schema + few-shot system
// block, and supports generate / streaming generate (object-by-object) / repair.
// Mappable to Haiku, Sonnet, or Opus via the configured model strings.

import Anthropic from "@anthropic-ai/sdk";
import {
  NodeStreamParser,
  SCENE3D_REFINE_DIFF_PREAMBLE,
  SCENE3D_REFINE_PREAMBLE,
  SCENE3D_REPAIR_INSTRUCTION,
  SCENE3D_SYSTEM_INSTRUCTION,
  buildGenerationParts,
  buildRepairParts,
  createStreamWatchdog,
  type GenerateScene3DInput,
  type RepairScene3DInput,
  type SceneGenerator
} from "./scene3dGenerator.js";
import { allFewShotBlock } from "./scene3dExamples.js";

interface ClaudeSceneGeneratorOptions {
  apiKey?: string;
  /** Generation model (e.g. claude-opus-4-8 / claude-sonnet-4-6 / claude-haiku-4-5). */
  model: string;
  /** Optional cheaper/faster model for the mechanical repair loop. Defaults to `model`. */
  repairModel?: string;
  maxTokens: number;
  /** Abort when the model stream goes quiet for this long (the failure signal). */
  stallTimeoutMs: number;
  /** Generous absolute backstop so a slow-but-healthy model is never cut off. */
  totalTimeoutMs: number;
}

const RETURN_JSON = "\n\nReturn only JSON, no markdown.";
// Static, cacheable prefixes. The big schema instruction plus the full few-shot
// library are byte-identical across every NEW generation, so marking them with
// cache_control lets repeat requests read them from cache (~0.1x) instead of
// re-billing the whole prefix. They are large enough to clear the minimum
// cacheable size on all of Haiku/Sonnet/Opus.
const NEW_SYSTEM = `${SCENE3D_SYSTEM_INSTRUCTION}\n\n${allFewShotBlock()}${RETURN_JSON}`;
const REPAIR_SYSTEM = `${SCENE3D_REPAIR_INSTRUCTION}${RETURN_JSON}`;

const CACHE: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

export class ClaudeSceneGenerator implements SceneGenerator {
  private readonly client: Anthropic | null;

  constructor(private readonly options: ClaudeSceneGeneratorOptions) {
    // The SDK's own timeout is set to the total backstop; the watchdog handles
    // the meaningful failure mode (a stalled stream) per call.
    this.client = options.apiKey ? new Anthropic({ apiKey: options.apiKey, timeout: options.totalTimeoutMs }) : null;
  }

  get enabled(): boolean {
    return Boolean(this.options.apiKey);
  }

  async generate(input: GenerateScene3DInput): Promise<string | null> {
    return this.streamCall({
      label: `generate (${input.mode ?? "new"})`,
      model: this.options.model,
      system: this.systemBlocks(input),
      user: this.userContent(input),
      signal: input.signal
    });
  }

  async generateStreaming(input: GenerateScene3DInput, onNode: (node: unknown) => void): Promise<string | null> {
    const parser = new NodeStreamParser();
    return this.streamCall({
      label: `generateStreaming (${input.mode ?? "new"})`,
      model: this.options.model,
      system: this.systemBlocks(input),
      user: this.userContent(input),
      signal: input.signal,
      // Emit each top-level node the moment it finishes streaming.
      onDelta: (delta) => {
        for (const node of parser.push(delta)) {
          onNode(node);
        }
      }
    });
  }

  async refineDiff(input: GenerateScene3DInput): Promise<string | null> {
    // Schema cached (shared with new/refine), diff preamble follows uncached.
    return this.streamCall({
      label: "refineDiff",
      model: this.options.model,
      system: [
        { type: "text", text: SCENE3D_SYSTEM_INSTRUCTION, cache_control: CACHE },
        { type: "text", text: `${SCENE3D_REFINE_DIFF_PREAMBLE}\n\nReturn only the JSON patch object, no markdown.` }
      ],
      user: this.userContent(input),
      signal: input.signal
    });
  }

  async repair(input: RepairScene3DInput): Promise<string | null> {
    return this.streamCall({
      label: "repair",
      model: this.options.repairModel ?? this.options.model,
      system: [{ type: "text", text: REPAIR_SYSTEM, cache_control: CACHE }],
      user: joinParts(buildRepairParts(input)),
      signal: input.signal
    });
  }

  // The single model-call path: ALWAYS streams (a long non-streaming request is
  // the thing that times out on slow/advanced models), guarded by the stall/total
  // watchdog instead of a fixed wall-clock abort.
  private async streamCall(call: {
    label: string;
    model: string;
    system: Anthropic.TextBlockParam[];
    user: Anthropic.MessageParam["content"];
    signal?: AbortSignal;
    onDelta?: (delta: string) => void;
  }): Promise<string | null> {
    if (!this.client) return null;
    const watchdog = createStreamWatchdog({
      stallMs: this.options.stallTimeoutMs,
      totalMs: this.options.totalTimeoutMs,
      signal: call.signal
    });

    try {
      const stream = this.client.messages.stream(
        {
          model: call.model,
          max_tokens: this.options.maxTokens,
          system: call.system,
          messages: [{ role: "user", content: call.user }]
        },
        { signal: watchdog.signal }
      );
      stream.on("text", (delta) => {
        watchdog.bump();
        call.onDelta?.(delta);
      });
      const final = await stream.finalMessage();
      logUsage(call.label, call.model, final.usage);
      return extractText(final).trim() || null;
    } catch (error) {
      throw watchdog.describeError(error);
    } finally {
      watchdog.dispose();
    }
  }

  // The schema (and, for NEW mode, the full few-shot library) is cached; the
  // refine preamble follows uncached so refine and new share the schema cache.
  private systemBlocks(input: GenerateScene3DInput): Anthropic.TextBlockParam[] {
    if (input.mode === "refine") {
      return [
        { type: "text", text: SCENE3D_SYSTEM_INSTRUCTION, cache_control: CACHE },
        { type: "text", text: `${SCENE3D_REFINE_PREAMBLE}${RETURN_JSON}` }
      ];
    }
    return [{ type: "text", text: NEW_SYSTEM, cache_control: CACHE }];
  }

  // Few-shot lives in the cached system block, so exclude it from the user turn.
  private userText(input: GenerateScene3DInput): string {
    return joinParts(buildGenerationParts(input, { includeFewShot: false }));
  }

  private userContent(input: GenerateScene3DInput): Anthropic.MessageParam["content"] {
    const text = this.userText(input);
    const image = input.referenceImage ? parseDataImage(input.referenceImage) : null;
    if (!image) return text;
    return [
      { type: "text", text },
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }
    ];
  }
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n\n");
}

function parseDataImage(dataUri: string): { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } | null {
  const match = dataUri.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const mediaType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  if (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/webp" && mediaType !== "image/gif") return null;
  return { mediaType, data: match[2] };
}

// Logs token usage with a cache-hit breakdown so caching can be verified at a
// glance: `cache_read` tokens are billed at ~0.1x input, `cache_creation` at
// ~1.25x (the one-time write). A healthy repeat request shows most input tokens
// under cache_read.
function logUsage(label: string, model: string, usage: Anthropic.Usage): void {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const freshInput = usage.input_tokens;
  const cachedPortion = cacheRead + cacheWrite;
  const hitRate = cachedPortion > 0 ? Math.round((cacheRead / cachedPortion) * 100) : 0;
  console.log(
    `[claude usage] ${label} model=${model} ` +
      `input=${freshInput} output=${usage.output_tokens} ` +
      `cache_read=${cacheRead} cache_write=${cacheWrite} cache_hit=${hitRate}%`
  );
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
