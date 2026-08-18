import type {
  BuildResult,
  PreviewSession,
  Project,
  ProjectSnapshot,
  ProjectTemplateId
} from "@ai-threejs-studio/shared";
import type { Scene3D } from "@ai-threejs-studio/scene3d";

export interface StudioApi {
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; templateId: ProjectTemplateId }): Promise<Project>;
  getProject(projectId: string): Promise<Project>;
  getScene(projectId: string): Promise<Scene3D>;
  replaceScene(projectId: string, scene: Scene3D): Promise<{ scene: Scene3D; issues: string[] }>;
  createSnapshot(projectId: string, label: string): Promise<ProjectSnapshot>;
  buildProject(projectId: string): Promise<BuildResult>;
  startPreview(projectId: string): Promise<{ preview?: PreviewSession; build?: BuildResult }>;
  toAbsoluteUrl(value: string): string;
}

export interface StudioApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class StudioApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "StudioApiError";
  }
}

export class StudioApiClient implements StudioApi {
  private readonly baseUrl: URL;
  private readonly accessToken?: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: StudioApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.accessToken = options.accessToken?.trim() || undefined;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
      throw new Error("AI_THREEJS_STUDIO_REQUEST_TIMEOUT_MS must be a positive number.");
    }
  }

  async listProjects(): Promise<Project[]> {
    const response = await this.request<{ projects: Project[] }>("projects");
    return response.projects;
  }

  async createProject(input: { name: string; templateId: ProjectTemplateId }): Promise<Project> {
    const response = await this.request<{ project: Project }>("projects", {
      method: "POST",
      body: input
    });
    return response.project;
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.request<{ project: Project }>(`projects/${encodeId(projectId)}`);
    return response.project;
  }

  async getScene(projectId: string): Promise<Scene3D> {
    const response = await this.request<{ scene: Scene3D }>(`projects/${encodeId(projectId)}/scene3d`);
    return response.scene;
  }

  async replaceScene(projectId: string, scene: Scene3D): Promise<{ scene: Scene3D; issues: string[] }> {
    return this.request<{ scene: Scene3D; issues: string[] }>(`projects/${encodeId(projectId)}/scene3d`, {
      method: "PUT",
      body: { scene }
    });
  }

  async createSnapshot(projectId: string, label: string): Promise<ProjectSnapshot> {
    const response = await this.request<{ snapshot: ProjectSnapshot }>(`projects/${encodeId(projectId)}/snapshots`, {
      method: "POST",
      body: { label }
    });
    return response.snapshot;
  }

  async buildProject(projectId: string): Promise<BuildResult> {
    const response = await this.request<{ build: BuildResult }>(`projects/${encodeId(projectId)}/build`, {
      method: "POST",
      acceptedStatuses: [422]
    });
    return response.build;
  }

  async startPreview(projectId: string): Promise<{ preview?: PreviewSession; build?: BuildResult }> {
    return this.request<{ preview?: PreviewSession; build?: BuildResult }>(`projects/${encodeId(projectId)}/preview/start`, {
      method: "POST",
      acceptedStatuses: [422]
    });
  }

  toAbsoluteUrl(value: string): string {
    return new URL(value, this.baseUrl).toString();
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT";
      body?: unknown;
      acceptedStatuses?: number[];
    } = {}
  ): Promise<T> {
    const method = options.method ?? "GET";
    const url = new URL(path.replace(/^\/+/, ""), this.baseUrl);
    const headers = new Headers({ accept: "application/json" });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (this.accessToken) headers.set("authorization", `Bearer ${this.accessToken}`);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.requestTimeoutMs)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new StudioApiError(`Studio API request timed out after ${this.requestTimeoutMs} ms.`);
      }
      throw new StudioApiError(`Could not reach the Studio API at ${this.baseUrl.origin}.`);
    }

    const data = await readJson(response);
    const accepted = response.ok || options.acceptedStatuses?.includes(response.status);
    if (!accepted) {
      const apiMessage = isRecord(data) && typeof data.error === "string" ? data.error : response.statusText;
      throw new StudioApiError(`Studio API ${method} ${url.pathname} failed (${response.status}): ${apiMessage}`, response.status);
    }

    return data as T;
  }
}

function normalizeBaseUrl(value: string): URL {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("AI_THREEJS_STUDIO_API_URL cannot be empty.");

  let url: URL;
  try {
    url = new URL(trimmed.endsWith("/") ? trimmed : `${trimmed}/`);
  } catch {
    throw new Error("AI_THREEJS_STUDIO_API_URL must be an absolute HTTP(S) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("AI_THREEJS_STUDIO_API_URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("Put credentials in AI_THREEJS_STUDIO_ACCESS_TOKEN, not in the API URL.");
  }
  return url;
}

function encodeId(value: string): string {
  return encodeURIComponent(value);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new StudioApiError(`Studio API returned a non-JSON response (${response.status}).`, response.status);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
