import { createHash } from "node:crypto";

export type ModelProvider = "openai" | "anthropic";

interface CacheEntry {
  models: string[];
  expires: number;
}

// Model lists change rarely; cache per key for a few minutes to avoid hammering
// the provider on every Settings open. Keyed by a hash of the API key, not the key.
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

/** Lists the models the given API key has access to, filtered to chat-capable ones. */
export async function listModels(provider: ModelProvider, key: string): Promise<string[]> {
  if (!key) return [];
  const cacheKey = `${provider}:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.models;

  const models = provider === "openai" ? await listOpenAi(key) : await listAnthropic(key);
  cache.set(cacheKey, { models, expires: Date.now() + TTL_MS });
  return models;
}

async function listOpenAi(key: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`OpenAI model list failed (${res.status}).`);
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? [])
    .map((m) => m.id)
    // Text/code generation models only.
    .filter((id) => /^(gpt-|o1|o3|o4|chatgpt-)/.test(id))
    // Drop other modalities + specialized variants (audio, image, realtime, search…).
    .filter((id) => !/(audio|transcribe|tts|realtime|whisper|image|search|embedding|moderation|dall|research)/.test(id))
    // Drop the heavy/slow extended-reasoning tier (…-pro, …-codex-max) — these
    // routinely exceed the request timeout for synchronous scene generation.
    .filter((id) => !/-(pro|max)$/.test(id))
    // Drop dated snapshots (gpt-4o-2024-…, gpt-4-0613) to keep the list clean.
    .filter((id) => !/\d{4}-\d{2}-\d{2}/.test(id) && !/-\d{3,4}$/.test(id))
    .sort();
}

async function listAnthropic(key: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`Anthropic model list failed (${res.status}).`);
  const body = (await res.json()) as { data?: { id: string }[] };
  // Newest-first (Anthropic returns roughly chronological).
  return (body.data ?? []).map((m) => m.id).sort().reverse();
}
