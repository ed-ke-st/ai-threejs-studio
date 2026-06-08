import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Asset } from "@ai-threejs-studio/shared";

const SUPPORTED_ASSET_TYPES = new Set<Asset["type"]>(["model/glb", "model/gltf"]);

export class ProjectAssetLibrary {
  constructor(
    private readonly assetRoot: string,
    private readonly publicApiBaseUrl: string
  ) {}

  async listProjectAssets(projectId: string): Promise<Asset[]> {
    return this.readIndex(projectId);
  }

  async createProjectAsset(input: {
    projectId: string;
    name: string;
    type: Asset["type"];
    contentBase64: string;
  }): Promise<Asset> {
    if (!SUPPORTED_ASSET_TYPES.has(input.type)) {
      throw new Error(`Unsupported asset type: ${input.type}`);
    }

    const buffer = Buffer.from(input.contentBase64, "base64");
    const now = new Date().toISOString();
    const assetId = nanoid(12);
    const fileName = `${assetId}-${sanitizeFileName(input.name)}`;
    const filePath = path.join(this.filesDir(input.projectId), fileName);
    const assets = await this.readIndex(input.projectId);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    const asset: Asset = {
      id: assetId,
      userId: "local-dev",
      projectId: input.projectId,
      name: input.name,
      type: input.type,
      url: `${this.publicApiBaseUrl}/projects/${encodeURIComponent(input.projectId)}/assets/${encodeURIComponent(assetId)}/content`,
      metadata: {
        byteLength: buffer.byteLength,
        originalFileName: input.name
      },
      tags: ["uploaded"],
      createdAt: now
    };

    assets.unshift(asset);
    await this.writeIndex(input.projectId, assets);
    return asset;
  }

  async getProjectAsset(projectId: string, assetId: string): Promise<Asset | null> {
    const assets = await this.readIndex(projectId);
    return assets.find((asset) => asset.id === assetId) ?? null;
  }

  async deleteProjectAssets(projectId: string): Promise<void> {
    await fs.rm(this.projectDir(projectId), { force: true, recursive: true });
  }

  async readProjectAssetContent(projectId: string, assetId: string): Promise<{ asset: Asset; content: Buffer; contentType: string }> {
    const asset = await this.getProjectAsset(projectId, assetId);

    if (!asset) {
      throw new Error("Asset not found.");
    }

    const filePath = path.join(this.filesDir(projectId), `${asset.id}-${sanitizeFileName(asset.name)}`);
    const content = await fs.readFile(filePath);
    return {
      asset,
      content,
      contentType: asset.type === "model/gltf" ? "model/gltf+json" : "model/gltf-binary"
    };
  }

  private async readIndex(projectId: string): Promise<Asset[]> {
    try {
      const content = await fs.readFile(this.indexPath(projectId), "utf8");
      const parsed = JSON.parse(content) as Asset[];
      return parsed.filter((asset) => asset.projectId === projectId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  private async writeIndex(projectId: string, assets: Asset[]): Promise<void> {
    const indexPath = this.indexPath(projectId);
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, `${JSON.stringify(assets, null, 2)}\n`, "utf8");
  }

  private indexPath(projectId: string): string {
    return path.join(this.projectDir(projectId), "index.json");
  }

  private filesDir(projectId: string): string {
    return path.join(this.projectDir(projectId), "files");
  }

  private projectDir(projectId: string): string {
    return path.join(this.assetRoot, sanitizeSegment(projectId));
  }
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.length > 0 ? normalized : "asset.glb";
}

function sanitizeSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid asset segment: ${value}`);
  }

  return value;
}
