import fs from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import type { AppSettings, AppSettingsUpdate } from "@ai-threejs-studio/shared";
import { config } from "./config.js";
import { getSql } from "./db.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

export interface StoredAppSettings {
  aiProvider: AppSettings["aiProvider"];
  geminiApiKey: string;
  openAiApiKey: string;
  anthropicApiKey: string;
  // Per-user model choices ("" = use the server default).
  anthropicCodeModel: string;
  anthropicRepairModel: string;
  openAiCodeModel: string;
  openAiRepairModel: string;
}

export interface SettingsRepository {
  load(): Promise<void>;
  /** UI-facing booleans (which keys the user has set) + provider + effective models. */
  getSettings(userId: string): Promise<AppSettings>;
  /** Resolved keys + model choices for server-side provider calls. */
  getStoredSettings(userId: string): Promise<StoredAppSettings>;
  updateSettings(userId: string, patch: AppSettingsUpdate): Promise<AppSettings>;
}

const EMPTY: StoredAppSettings = {
  aiProvider: "auto",
  geminiApiKey: "",
  openAiApiKey: "",
  anthropicApiKey: "",
  anthropicCodeModel: "",
  anthropicRepairModel: "",
  openAiCodeModel: "",
  openAiRepairModel: ""
};

function toAppSettings(settings: StoredAppSettings): AppSettings {
  return {
    aiProvider: settings.aiProvider,
    hasGeminiApiKey: Boolean(settings.geminiApiKey),
    hasOpenAiApiKey: Boolean(settings.openAiApiKey),
    hasAnthropicApiKey: Boolean(settings.anthropicApiKey),
    // Show the effective model (the user's choice or the server default).
    anthropicCodeModel: settings.anthropicCodeModel || config.anthropicCodeModel,
    anthropicRepairModel: settings.anthropicRepairModel || config.anthropicRepairModel,
    openAiCodeModel: settings.openAiCodeModel || config.openAiCodeModel,
    openAiRepairModel: settings.openAiRepairModel || config.openAiRepairModel
  };
}

function applyKey(current: string, next: string | undefined, clear: boolean | undefined): string {
  if (clear) return "";
  if (next !== undefined && next.trim().length > 0) return next.trim();
  return current;
}

function applyModel(current: string, next: string | undefined): string {
  return next !== undefined ? next.trim() : current;
}

function applyModelPatch(current: StoredAppSettings, patch: AppSettingsUpdate): Pick<StoredAppSettings, "anthropicCodeModel" | "anthropicRepairModel" | "openAiCodeModel" | "openAiRepairModel"> {
  return {
    anthropicCodeModel: applyModel(current.anthropicCodeModel, patch.anthropicCodeModel),
    anthropicRepairModel: applyModel(current.anthropicRepairModel, patch.anthropicRepairModel),
    openAiCodeModel: applyModel(current.openAiCodeModel, patch.openAiCodeModel),
    openAiRepairModel: applyModel(current.openAiRepairModel, patch.openAiRepairModel)
  };
}

/**
 * Single-tenant settings: one global JSON file, with environment variables taking
 * precedence for the keys (the operator's own keys). userId is ignored.
 */
export class LocalSettingsRepository implements SettingsRepository {
  private storedSettings: StoredAppSettings = { ...EMPTY };

  constructor(private readonly settingsPath: string) {}

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(data) as Partial<StoredAppSettings>;
      this.storedSettings = { ...EMPTY, ...parsed, aiProvider: parsed.aiProvider ?? "auto" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.storedSettings = { ...EMPTY };
    }
  }

  async getSettings(): Promise<AppSettings> {
    return toAppSettings(this.getResolvedSettings());
  }

  async getStoredSettings(): Promise<StoredAppSettings> {
    return this.getResolvedSettings();
  }

  async updateSettings(_userId: string, patch: AppSettingsUpdate): Promise<AppSettings> {
    this.storedSettings = {
      aiProvider: patch.aiProvider ?? this.storedSettings.aiProvider,
      geminiApiKey: applyKey(this.storedSettings.geminiApiKey, patch.geminiApiKey, patch.clearGeminiApiKey),
      openAiApiKey: applyKey(this.storedSettings.openAiApiKey, patch.openAiApiKey, patch.clearOpenAiApiKey),
      anthropicApiKey: applyKey(this.storedSettings.anthropicApiKey, patch.anthropicApiKey, patch.clearAnthropicApiKey),
      ...applyModelPatch(this.storedSettings, patch)
    };
    await this.save();
    return this.getSettings();
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(this.storedSettings, null, 2), "utf8");
  }

  private getResolvedSettings(): StoredAppSettings {
    return {
      ...this.storedSettings,
      aiProvider: (process.env.AI_SCENE_PROVIDER as StoredAppSettings["aiProvider"]) ?? this.storedSettings.aiProvider,
      geminiApiKey: process.env.GEMINI_API_KEY ?? this.storedSettings.geminiApiKey,
      openAiApiKey: process.env.OPENAI_API_KEY ?? this.storedSettings.openAiApiKey,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? this.storedSettings.anthropicApiKey
    };
  }
}

interface UserSettingsRow {
  ai_provider: StoredAppSettings["aiProvider"];
  gemini_api_key: string | null;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  anthropic_code_model: string | null;
  anthropic_repair_model: string | null;
  openai_code_model: string | null;
  openai_repair_model: string | null;
}

/**
 * Multi-tenant settings: per-user rows in Postgres with provider keys encrypted
 * at rest. Model choices are plain text.
 */
export class PostgresSettingsRepository implements SettingsRepository {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly encKey: string,
    private readonly allowPlatformKeys: boolean
  ) {}

  async load(): Promise<void> {
    await this.sql`select 1`;
  }

  private decryptField(value: string | null): string {
    if (!value) return "";
    try {
      return decryptSecret(value, this.encKey);
    } catch {
      return "";
    }
  }

  private async readOwn(userId: string): Promise<StoredAppSettings> {
    const [row] = await this.sql<UserSettingsRow[]>`
      select ai_provider, gemini_api_key, openai_api_key, anthropic_api_key,
             anthropic_code_model, anthropic_repair_model, openai_code_model, openai_repair_model
      from user_settings where user_id = ${userId} limit 1
    `;
    if (!row) return { ...EMPTY };
    return {
      aiProvider: row.ai_provider,
      geminiApiKey: this.decryptField(row.gemini_api_key),
      openAiApiKey: this.decryptField(row.openai_api_key),
      anthropicApiKey: this.decryptField(row.anthropic_api_key),
      anthropicCodeModel: row.anthropic_code_model ?? "",
      anthropicRepairModel: row.anthropic_repair_model ?? "",
      openAiCodeModel: row.openai_code_model ?? "",
      openAiRepairModel: row.openai_repair_model ?? ""
    };
  }

  async getSettings(userId: string): Promise<AppSettings> {
    return toAppSettings(await this.readOwn(userId));
  }

  async getStoredSettings(userId: string): Promise<StoredAppSettings> {
    const own = await this.readOwn(userId);
    if (!this.allowPlatformKeys) return own;
    return {
      ...own,
      geminiApiKey: own.geminiApiKey || process.env.GEMINI_API_KEY || "",
      openAiApiKey: own.openAiApiKey || process.env.OPENAI_API_KEY || "",
      anthropicApiKey: own.anthropicApiKey || process.env.ANTHROPIC_API_KEY || ""
    };
  }

  async updateSettings(userId: string, patch: AppSettingsUpdate): Promise<AppSettings> {
    const current = await this.readOwn(userId);
    const next: StoredAppSettings = {
      aiProvider: patch.aiProvider ?? current.aiProvider,
      geminiApiKey: applyKey(current.geminiApiKey, patch.geminiApiKey, patch.clearGeminiApiKey),
      openAiApiKey: applyKey(current.openAiApiKey, patch.openAiApiKey, patch.clearOpenAiApiKey),
      anthropicApiKey: applyKey(current.anthropicApiKey, patch.anthropicApiKey, patch.clearAnthropicApiKey),
      ...applyModelPatch(current, patch)
    };
    const enc = (value: string): string | null => (value ? encryptSecret(value, this.encKey) : null);
    const blank = (value: string): string | null => (value ? value : null);
    await this.sql`
      insert into user_settings (
        user_id, ai_provider, gemini_api_key, openai_api_key, anthropic_api_key,
        anthropic_code_model, anthropic_repair_model, openai_code_model, openai_repair_model, updated_at
      ) values (
        ${userId}, ${next.aiProvider}, ${enc(next.geminiApiKey)}, ${enc(next.openAiApiKey)}, ${enc(next.anthropicApiKey)},
        ${blank(next.anthropicCodeModel)}, ${blank(next.anthropicRepairModel)}, ${blank(next.openAiCodeModel)}, ${blank(next.openAiRepairModel)}, now()
      )
      on conflict (user_id) do update set
        ai_provider = excluded.ai_provider,
        gemini_api_key = excluded.gemini_api_key,
        openai_api_key = excluded.openai_api_key,
        anthropic_api_key = excluded.anthropic_api_key,
        anthropic_code_model = excluded.anthropic_code_model,
        anthropic_repair_model = excluded.anthropic_repair_model,
        openai_code_model = excluded.openai_code_model,
        openai_repair_model = excluded.openai_repair_model,
        updated_at = now()
    `;
    return toAppSettings(next);
  }
}

export async function createSettingsRepository(): Promise<SettingsRepository> {
  let repository: SettingsRepository;
  if (config.auth.enabled && config.supabaseDbUrl) {
    if (!config.settingsEncKey) {
      throw new Error("SETTINGS_ENC_KEY is required when accounts are enabled (it encrypts per-user provider keys).");
    }
    repository = new PostgresSettingsRepository(getSql(), config.settingsEncKey, config.auth.allowPlatformKeys);
  } else {
    repository = new LocalSettingsRepository(config.settingsPath);
  }
  await repository.load();
  return repository;
}
