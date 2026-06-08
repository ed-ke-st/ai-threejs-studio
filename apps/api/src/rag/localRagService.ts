import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectTemplateId, RagChunk, RagRetrievalTuningProfile } from "@ai-threejs-studio/shared";
import { createRagIndex, searchRagChunks, type RagIndex } from "@ai-threejs-studio/rag";

export interface SearchDocsInput {
  query: string;
  collections?: string[];
  limit?: number;
  projectId?: string;
  projectName?: string;
  templateId?: ProjectTemplateId;
}

export class LocalRagService {
  private index: RagIndex | null = null;
  private tuningProfile: RagRetrievalTuningProfile | null = null;
  private tuningProfileMtimeMs: number | null = null;

  constructor(
    private readonly indexPath: string,
    // Retained for call-site compatibility; the agent-example bank was retired
    // with the old pipeline, so only the doc index + tuning profile are loaded.
    _exampleBankPath: string = path.join(path.dirname(indexPath), "agent-examples.json"),
    private readonly tuningPath: string = path.join(path.dirname(indexPath), "retrieval-tuning.json")
  ) {}

  async load(): Promise<void> {
    await Promise.all([this.loadIndex(), this.loadTuningProfile()]);
  }

  async searchDocs(input: SearchDocsInput): Promise<RagChunk[]> {
    if (!this.index) {
      await this.load();
    }
    await this.loadTuningProfile();

    return searchRagChunks(this.index?.chunks ?? [], input.query, {
      collections: input.collections,
      limit: input.limit,
      projectId: input.projectId,
      projectName: input.projectName,
      templateId: input.templateId,
      tuningProfile: this.tuningProfile ?? undefined
    });
  }

  private async save(): Promise<void> {
    if (!this.index) {
      return;
    }
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), "utf8");
  }

  private async loadIndex(): Promise<void> {
    try {
      this.index = JSON.parse(await fs.readFile(this.indexPath, "utf8")) as RagIndex;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.index = createRagIndex();
      await this.save();
    }
  }

  private async loadTuningProfile(): Promise<void> {
    try {
      const stats = await fs.stat(this.tuningPath);
      if (this.tuningProfile && this.tuningProfileMtimeMs === stats.mtimeMs) {
        return;
      }
      this.tuningProfile = JSON.parse(await fs.readFile(this.tuningPath, "utf8")) as RagRetrievalTuningProfile;
      this.tuningProfileMtimeMs = stats.mtimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.tuningProfile = null;
      this.tuningProfileMtimeMs = null;
    }
  }
}
