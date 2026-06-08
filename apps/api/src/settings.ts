import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings, AppSettingsUpdate } from "@ai-threejs-studio/shared";

interface StoredAppSettings {
  aiProvider: AppSettings["aiProvider"];
  geminiApiKey: string;
  openAiApiKey: string;
  anthropicApiKey: string;
}

const EMPTY: StoredAppSettings = { aiProvider: "auto", geminiApiKey: "", openAiApiKey: "", anthropicApiKey: "" };

export class LocalSettingsRepository {
  private storedSettings: StoredAppSettings = { ...EMPTY };

  constructor(private readonly settingsPath: string) {}

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(data) as Partial<StoredAppSettings>;
      this.storedSettings = {
        aiProvider: parsed.aiProvider ?? "auto",
        geminiApiKey: parsed.geminiApiKey ?? "",
        openAiApiKey: parsed.openAiApiKey ?? "",
        anthropicApiKey: parsed.anthropicApiKey ?? ""
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // If the file doesn't exist, rely entirely on environment variables.
      this.storedSettings = { ...EMPTY };
    }
  }

  getSettings(): AppSettings {
    const settings = this.getResolvedSettings();
    return {
      aiProvider: settings.aiProvider,
      hasGeminiApiKey: Boolean(settings.geminiApiKey),
      hasOpenAiApiKey: Boolean(settings.openAiApiKey),
      hasAnthropicApiKey: Boolean(settings.anthropicApiKey)
    };
  }

  getStoredSettings(): StoredAppSettings {
    return this.getResolvedSettings();
  }

  async updateSettings(patch: AppSettingsUpdate): Promise<AppSettings> {
    this.storedSettings = {
      aiProvider: patch.aiProvider ?? this.storedSettings.aiProvider,
      geminiApiKey: applyKey(this.storedSettings.geminiApiKey, patch.geminiApiKey, patch.clearGeminiApiKey),
      openAiApiKey: applyKey(this.storedSettings.openAiApiKey, patch.openAiApiKey, patch.clearOpenAiApiKey),
      anthropicApiKey: applyKey(this.storedSettings.anthropicApiKey, patch.anthropicApiKey, patch.clearAnthropicApiKey)
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
      aiProvider: (process.env.AI_SCENE_PROVIDER as StoredAppSettings["aiProvider"]) ?? this.storedSettings.aiProvider,
      geminiApiKey: process.env.GEMINI_API_KEY ?? this.storedSettings.geminiApiKey,
      openAiApiKey: process.env.OPENAI_API_KEY ?? this.storedSettings.openAiApiKey,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? this.storedSettings.anthropicApiKey
    };
  }
}

function applyKey(current: string, next: string | undefined, clear: boolean | undefined): string {
  if (clear) return "";
  if (next !== undefined && next.trim().length > 0) return next.trim();
  return current;
}
