import fs from "node:fs/promises";
import path from "node:path";
import type { BuildResult } from "@ai-threejs-studio/shared";
import type { Project } from "@ai-threejs-studio/shared";
import type { PreviewRunner } from "../preview/previewRunner.js";
import type { ProjectStorage } from "../storage/localWorkspaceStorage.js";
import { zipDirectory } from "./zip.js";

export interface ZipExportResult {
  fileName: string;
  archive: Buffer;
  build?: BuildResult;
}

export class ProjectExportService {
  constructor(
    private readonly storage: ProjectStorage,
    private readonly previewRunner: PreviewRunner
  ) {}

  async exportSource(project: Project): Promise<ZipExportResult> {
    const root = this.storage.getProjectRoot(project.id);
    const archive = await zipDirectory(root, {
      rootFolder: safeArchiveName(project.name),
      exclude: ["dist/**", "node_modules/**", ".vite/**"]
    });

    return {
      fileName: `${safeArchiveName(project.name)}-source.zip`,
      archive
    };
  }

  async exportBuild(project: Project): Promise<ZipExportResult> {
    const build = await this.previewRunner.build(project.id);

    if (!build.ok) {
      return {
        fileName: `${safeArchiveName(project.name)}-dist.zip`,
        archive: Buffer.alloc(0),
        build
      };
    }

    const distPath = path.join(this.storage.getProjectRoot(project.id), "dist");
    await fs.access(distPath);
    const archive = await zipDirectory(distPath, {
      rootFolder: `${safeArchiveName(project.name)}-dist`
    });

    return {
      fileName: `${safeArchiveName(project.name)}-dist.zip`,
      archive,
      build
    };
  }
}

function safeArchiveName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "ai-threejs-project";
}
