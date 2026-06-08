import fs from "node:fs/promises";
import path from "node:path";

export interface ProjectFileRecord {
  path: string;
  content: string;
  updatedAt: string;
}

export interface ProjectSnapshot {
  id: string;
  createdAt: string;
  files: ProjectFileRecord[];
}

export interface ProjectStorage {
  getProjectRoot(projectId: string): string;
  listProjectFiles(projectId: string): Promise<ProjectFileRecord[]>;
  getProjectFile(projectId: string, filePath: string): Promise<ProjectFileRecord | null>;
  writeProjectFile(projectId: string, filePath: string, content: string): Promise<ProjectFileRecord>;
  deleteProjectFile(projectId: string, filePath: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  listProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]>;
  createProjectSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot>;
  restoreProjectSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot>;
}

export class LocalWorkspaceStorage implements ProjectStorage {
  constructor(
    private readonly workspaceRoot: string,
    private readonly snapshotRoot: string
  ) {}

  getProjectRoot(projectId: string): string {
    return this.projectRoot(projectId);
  }

  async listProjectFiles(projectId: string): Promise<ProjectFileRecord[]> {
    const root = this.projectRoot(projectId);
    await fs.mkdir(root, { recursive: true });
    const paths = await this.walk(root);

    return Promise.all(
      paths.map(async (absolutePath) => {
        const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
        return {
          path: relativePath,
          content: await fs.readFile(absolutePath, "utf8"),
          updatedAt: new Date((await fs.stat(absolutePath)).mtimeMs).toISOString()
        };
      })
    );
  }

  async getProjectFile(projectId: string, filePath: string): Promise<ProjectFileRecord | null> {
    const absolutePath = this.safeProjectPath(projectId, filePath);

    try {
      return {
        path: this.normalizeRelativePath(filePath),
        content: await fs.readFile(absolutePath, "utf8"),
        updatedAt: new Date((await fs.stat(absolutePath)).mtimeMs).toISOString()
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async writeProjectFile(projectId: string, filePath: string, content: string): Promise<ProjectFileRecord> {
    const absolutePath = this.safeProjectPath(projectId, filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");

    return {
      path: this.normalizeRelativePath(filePath),
      content,
      updatedAt: new Date().toISOString()
    };
  }

  async deleteProjectFile(projectId: string, filePath: string): Promise<void> {
    await fs.rm(this.safeProjectPath(projectId, filePath), { force: true });
  }

  async deleteProject(projectId: string): Promise<void> {
    await fs.rm(this.projectRoot(projectId), { force: true, recursive: true });
    await fs.rm(path.join(this.snapshotRoot, this.safeId(projectId)), { force: true, recursive: true });
  }

  async listProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    const root = path.join(this.snapshotRoot, this.safeId(projectId));

    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const snapshots = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map(async (entry) => {
            const content = await fs.readFile(path.join(root, entry.name), "utf8");
            return JSON.parse(content) as ProjectSnapshot;
          })
      );

      return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async createProjectSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot> {
    const snapshot: ProjectSnapshot = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      files: await this.listProjectFiles(projectId)
    };

    const snapshotPath = this.snapshotPath(projectId, snapshotId);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
    return snapshot;
  }

  async restoreProjectSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot> {
    const snapshot = JSON.parse(await fs.readFile(this.snapshotPath(projectId, snapshotId), "utf8")) as ProjectSnapshot;
    const root = this.projectRoot(projectId);
    await fs.rm(root, { force: true, recursive: true });

    for (const file of snapshot.files) {
      await this.writeProjectFile(projectId, file.path, file.content);
    }

    return snapshot;
  }

  private async walk(root: string): Promise<string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(root, entry.name);
        if (entry.isDirectory()) {
          return this.walk(absolutePath);
        }

        return [absolutePath];
      })
    );

    return files.flat().sort();
  }

  private projectRoot(projectId: string): string {
    return path.join(this.workspaceRoot, this.safeId(projectId));
  }

  private snapshotPath(projectId: string, snapshotId: string): string {
    return path.join(this.snapshotRoot, this.safeId(projectId), `${this.safeId(snapshotId)}.json`);
  }

  private safeProjectPath(projectId: string, filePath: string): string {
    const root = this.projectRoot(projectId);
    const absolutePath = path.resolve(root, this.normalizeRelativePath(filePath));

    if (!absolutePath.startsWith(`${root}${path.sep}`) && absolutePath !== root) {
      throw new Error(`Invalid project path: ${filePath}`);
    }

    return absolutePath;
  }

  private normalizeRelativePath(filePath: string): string {
    return filePath.replace(/^\/+/, "").split("\\").join("/");
  }

  private safeId(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error(`Invalid id: ${id}`);
    }

    return id;
  }
}
