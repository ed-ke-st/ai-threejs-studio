import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

/**
 * Minimal object store. Keys are "/"-separated (e.g. "shares/<id>/index.html").
 * Content types aren't stored — callers set them on serve (from the asset index
 * or the file extension). Backed by the local disk in dev and Supabase Storage
 * (S3-compatible) in production; the same interface fronts a future S3/R2 adapter.
 */
export interface BlobStore {
  init(): Promise<void>;
  put(key: string, body: Buffer | string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
}

/** Uploads every file under `localDir` to `keyPrefix`, preserving relative paths. */
export async function putDir(store: BlobStore, keyPrefix: string, localDir: string): Promise<void> {
  const files = await walkFiles(localDir);
  await Promise.all(
    files.map(async (absolutePath) => {
      const rel = path.relative(localDir, absolutePath).split(path.sep).join("/");
      await store.put(`${keyPrefix}/${rel}`, await fs.readFile(absolutePath));
    })
  );
}

async function walkFiles(root: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const abs = path.join(root, entry.name);
      return entry.isDirectory() ? walkFiles(abs) : Promise.resolve([abs]);
    })
  );
  return nested.flat();
}

function safeSegments(key: string): string[] {
  const segments = key.split("/").filter((s) => s.length > 0);
  for (const segment of segments) {
    if (segment === ".." || segment === "." || segment.includes("\\")) {
      throw new Error(`Invalid blob key: ${key}`);
    }
  }
  return segments;
}

class LocalBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  private toPath(key: string): string {
    return path.join(this.root, ...safeSegments(key));
  }

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  async put(key: string, body: Buffer | string): Promise<void> {
    const file = this.toPath(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof body === "string" ? Buffer.from(body) : body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.toPath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.toPath(prefix);
    const files = await walkFiles(base);
    const prefixClean = safeSegments(prefix).join("/");
    return files.map((abs) => `${prefixClean}/${path.relative(base, abs).split(path.sep).join("/")}`);
  }

  async deletePrefix(prefix: string): Promise<void> {
    await fs.rm(this.toPath(prefix), { recursive: true, force: true });
  }
}

class SupabaseBlobStore implements BlobStore {
  private readonly client: SupabaseClient;
  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket: string
  ) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async init(): Promise<void> {
    const { data } = await this.client.storage.getBucket(this.bucket);
    if (!data) {
      const { error } = await this.client.storage.createBucket(this.bucket, { public: false });
      // Ignore "already exists" races.
      if (error && !/exists/i.test(error.message)) throw error;
    }
  }

  async put(key: string, body: Buffer | string): Promise<void> {
    const bytes = typeof body === "string" ? Buffer.from(body) : body;
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(key, bytes, { upsert: true, contentType: "application/octet-stream" });
    if (error) throw error;
  }

  async get(key: string): Promise<Buffer | null> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) return null; // download errors are effectively "not found" for serving
    return Buffer.from(await data.arrayBuffer());
  }

  async list(prefix: string): Promise<string[]> {
    const results: string[] = [];
    const walk = async (folder: string): Promise<void> => {
      const { data, error } = await this.client.storage.from(this.bucket).list(folder, { limit: 1000 });
      if (error || !data) return;
      for (const item of data) {
        const full = folder ? `${folder}/${item.name}` : item.name;
        // Supabase marks folders with id === null.
        if (item.id === null) await walk(full);
        else results.push(full);
      }
    };
    await walk(prefix.replace(/\/+$/, ""));
    return results;
  }

  async deletePrefix(prefix: string): Promise<void> {
    const keys = await this.list(prefix);
    if (keys.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove(keys);
    if (error) throw error;
  }
}

let store: BlobStore | null = null;

export function getBlobStore(): BlobStore {
  if (store) return store;
  if (config.blob.backend === "supabase") {
    if (!config.auth.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error("BLOB_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    store = new SupabaseBlobStore(config.auth.supabaseUrl, config.supabaseServiceRoleKey, config.blob.bucket);
  } else {
    store = new LocalBlobStore(config.blob.localRoot);
  }
  return store;
}
