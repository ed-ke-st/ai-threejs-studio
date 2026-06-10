import fs from "node:fs/promises";
import path from "node:path";
import type { BlobStore } from "./blobStore.js";
import type { MaterializedWorkspace, ProjectFileRecord, ProjectSnapshot, ProjectStorage } from "./localWorkspaceStorage.js";

/**
 * Project workspace backed by object storage (canonical source of truth, so any
 * instance can serve/build any project). Builds still need a local directory, so
 * materializeWorkspace() hydrates a temp dir that is built then disposed.
 */
export class BlobWorkspaceStorage implements ProjectStorage {
  constructor(
    private readonly blob: BlobStore,
    // Where hydrated build dirs live — must be inside the monorepo so the project's
    // hoisted node_modules (vite/react/three) resolves during the build.
    private readonly materializeRoot: string
  ) {}

  getProjectRoot(): string {
    throw new Error("getProjectRoot is unsupported with object-storage workspaces; use materializeWorkspace().");
  }

  async listProjectFiles(projectId: string): Promise<ProjectFileRecord[]> {
    const prefix = this.filePrefix(projectId);
    const keys = await this.blob.list(prefix);
    return Promise.all(
      keys.map(async (key) => ({
        path: key.slice(prefix.length + 1),
        content: (await this.blob.get(key))?.toString("utf8") ?? "",
        updatedAt: new Date().toISOString()
      }))
    );
  }

  async getProjectFile(projectId: string, filePath: string): Promise<ProjectFileRecord | null> {
    const content = await this.blob.get(this.fileKey(projectId, filePath));
    if (content === null) return null;
    return { path: this.normalize(filePath), content: content.toString("utf8"), updatedAt: new Date().toISOString() };
  }

  async writeProjectFile(projectId: string, filePath: string, content: string): Promise<ProjectFileRecord> {
    await this.blob.put(this.fileKey(projectId, filePath), content);
    return { path: this.normalize(filePath), content, updatedAt: new Date().toISOString() };
  }

  async deleteProjectFile(projectId: string, filePath: string): Promise<void> {
    await this.blob.delete(this.fileKey(projectId, filePath));
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.blob.deletePrefix(this.filePrefix(projectId));
    await this.blob.deletePrefix(this.snapshotPrefix(projectId));
  }

  async listProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    const keys = await this.blob.list(this.snapshotPrefix(projectId));
    const snapshots = await Promise.all(
      keys.map(async (key) => {
        const content = await this.blob.get(key);
        return content ? (JSON.parse(content.toString("utf8")) as ProjectSnapshot) : null;
      })
    );
    return snapshots
      .filter((s): s is ProjectSnapshot => s !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createProjectSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot> {
    const snapshot: ProjectSnapshot = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      files: await this.listProjectFiles(projectId)
    };
    await this.blob.put(this.snapshotKey(projectId, snapshotId), JSON.stringify(snapshot));
    return snapshot;
  }

  async restoreProjectSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot> {
    const content = await this.blob.get(this.snapshotKey(projectId, snapshotId));
    if (!content) throw new Error("Snapshot not found.");
    const snapshot = JSON.parse(content.toString("utf8")) as ProjectSnapshot;
    await this.blob.deletePrefix(this.filePrefix(projectId));
    for (const file of snapshot.files) {
      await this.writeProjectFile(projectId, file.path, file.content);
    }
    return snapshot;
  }

  async materializeWorkspace(projectId: string): Promise<MaterializedWorkspace> {
    await fs.mkdir(this.materializeRoot, { recursive: true });
    const dir = await fs.mkdtemp(path.join(this.materializeRoot, `ws-${this.safeId(projectId)}-`));
    const prefix = this.filePrefix(projectId);
    const keys = await this.blob.list(prefix);
    await Promise.all(
      keys.map(async (key) => {
        const content = await this.blob.get(key);
        if (content === null) return;
        const abs = path.join(dir, key.slice(prefix.length + 1));
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content);
      })
    );
    return { dir, dispose: async () => fs.rm(dir, { recursive: true, force: true }) };
  }

  private safeId(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid id: ${id}`);
    return id;
  }

  private normalize(filePath: string): string {
    return filePath.replace(/^\/+/, "").split("\\").join("/");
  }

  private fileKey(projectId: string, filePath: string): string {
    return `${this.filePrefix(projectId)}/${this.normalize(filePath)}`;
  }

  private filePrefix(projectId: string): string {
    return `workspace/${this.safeId(projectId)}`;
  }

  private snapshotKey(projectId: string, snapshotId: string): string {
    return `${this.snapshotPrefix(projectId)}/${this.safeId(snapshotId)}.json`;
  }

  private snapshotPrefix(projectId: string): string {
    return `wsnapshots/${this.safeId(projectId)}`;
  }
}

/** Picks the workspace storage backend; pairs with the blob backend / NODE_ENV. */
export async function createWorkspaceStorage(): Promise<ProjectStorage> {
  const { config } = await import("../config.js");
  const { LocalWorkspaceStorage } = await import("./localWorkspaceStorage.js");
  if (config.workspaceBackend === "blob") {
    const { getBlobStore } = await import("./blobStore.js");
    return new BlobWorkspaceStorage(getBlobStore(), config.materializeRoot);
  }
  return new LocalWorkspaceStorage(config.workspaceRoot, config.snapshotRoot);
}
