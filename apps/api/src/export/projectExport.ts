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
    const ws = await this.storage.materializeWorkspace(project.id);
    try {
      const archive = await zipDirectory(ws.dir, {
        rootFolder: safeArchiveName(project.name),
        exclude: ["dist/**", "node_modules/**", ".vite/**"]
      });
      return {
        fileName: `${safeArchiveName(project.name)}-source.zip`,
        archive
      };
    } finally {
      await ws.dispose();
    }
  }

  async exportBuild(project: Project): Promise<ZipExportResult> {
    const { build, distDir, dispose } = await this.previewRunner.buildAndKeep(project.id);
    try {
      if (!build.ok) {
        return {
          fileName: `${safeArchiveName(project.name)}-dist.zip`,
          archive: Buffer.alloc(0),
          build
        };
      }

      await fs.access(distDir);
      const archive = await zipDirectory(distDir, {
        rootFolder: `${safeArchiveName(project.name)}-dist`
      });

      return {
        fileName: `${safeArchiveName(project.name)}-dist.zip`,
        archive,
        build
      };
    } finally {
      await dispose();
    }
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
