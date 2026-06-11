import { nanoid } from "nanoid";
import type { Asset } from "@ai-threejs-studio/shared";
import type { BlobStore } from "../storage/blobStore.js";

const SUPPORTED_ASSET_TYPES = new Set<Asset["type"]>(["model/glb", "model/gltf"]);

export class ProjectAssetLibrary {
  constructor(
    private readonly blob: BlobStore,
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
    const assets = await this.readIndex(input.projectId);

    const contentType = input.type === "model/gltf" ? "model/gltf+json" : "model/gltf-binary";
    await this.blob.put(this.fileKey(input.projectId, fileName), buffer, contentType);

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
    await this.blob.deletePrefix(this.projectPrefix(projectId));
  }

  /** A short-lived direct-download URL for the asset, or null (local / missing). */
  async signedAssetUrl(projectId: string, assetId: string, expiresInSeconds: number): Promise<string | null> {
    const asset = await this.getProjectAsset(projectId, assetId);
    if (!asset) return null;
    return this.blob.signedUrl(this.fileKey(projectId, `${asset.id}-${sanitizeFileName(asset.name)}`), expiresInSeconds);
  }

  async readProjectAssetContent(projectId: string, assetId: string): Promise<{ asset: Asset; content: Buffer; contentType: string }> {
    const asset = await this.getProjectAsset(projectId, assetId);

    if (!asset) {
      throw new Error("Asset not found.");
    }

    const content = await this.blob.get(this.fileKey(projectId, `${asset.id}-${sanitizeFileName(asset.name)}`));
    if (!content) {
      throw new Error("Asset not found.");
    }

    return {
      asset,
      content,
      contentType: asset.type === "model/gltf" ? "model/gltf+json" : "model/gltf-binary"
    };
  }

  private async readIndex(projectId: string): Promise<Asset[]> {
    const content = await this.blob.get(this.indexKey(projectId));
    if (!content) return [];
    const parsed = JSON.parse(content.toString("utf8")) as Asset[];
    return parsed.filter((asset) => asset.projectId === projectId);
  }

  private async writeIndex(projectId: string, assets: Asset[]): Promise<void> {
    await this.blob.put(this.indexKey(projectId), `${JSON.stringify(assets, null, 2)}\n`);
  }

  private projectPrefix(projectId: string): string {
    return `assets/${sanitizeSegment(projectId)}`;
  }

  private indexKey(projectId: string): string {
    return `${this.projectPrefix(projectId)}/index.json`;
  }

  private fileKey(projectId: string, fileName: string): string {
    return `${this.projectPrefix(projectId)}/files/${fileName}`;
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
