import type {
  AppSettings,
  AppSettingsUpdate,
  BuildResult,
  PreviewSession,
  Project,
  ProjectShare
} from "@ai-threejs-studio/shared";
import { create } from "zustand";
import { authHeaders, supabase } from "../auth/supabaseClient";

// Lean, Scene3D-centric store. The scene document itself (load/edit/generate) is
// owned by the Scene3DEditor component talking to /scene3d; this store handles
// project lifecycle, build, preview, share, export, and settings.

export type PreviewSurface = "editor" | "runtime";

interface ProjectState {
  health: "checking" | "connected" | "offline";
  projects: Project[];
  selectedProjectId: string | null;
  statusMessage: string;
  previewSurface: PreviewSurface;
  preview: PreviewSession | null;
  previewFrameKey: number;
  isPreviewStarting: boolean;
  buildResult: BuildResult | null;
  isBuilding: boolean;
  share: ProjectShare | null;
  settings: AppSettings | null;
  busy: boolean;
  /** Transient confirmation message (e.g. a finished download), auto-dismissed by the UI. */
  toast: string | null;

  clearToast: () => void;
  checkHealth: () => Promise<void>;
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => void;
  setPreviewSurface: (surface: PreviewSurface) => void;
  startPreview: () => Promise<void>;
  refreshPreview: () => void;
  runBuild: () => Promise<void>;
  shareProject: () => Promise<void>;
  exportSourceArchive: () => Promise<void>;
  exportBuildArchive: () => Promise<void>;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: AppSettingsUpdate) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  health: "checking",
  projects: [],
  selectedProjectId: null,
  statusMessage: "",
  previewSurface: "editor",
  preview: null,
  previewFrameKey: 0,
  isPreviewStarting: false,
  buildResult: null,
  isBuilding: false,
  share: null,
  settings: null,
  busy: false,
  toast: null,

  clearToast() {
    set({ toast: null });
  },

  async checkHealth() {
    try {
      await api("/health");
      set({ health: "connected" });
    } catch {
      set({ health: "offline" });
    }
  },

  async loadProjects() {
    const data = await api<{ projects: Project[] }>("/projects");
    set((state) => ({
      projects: data.projects,
      selectedProjectId: state.selectedProjectId ?? data.projects[0]?.id ?? null
    }));
  },

  async createProject(name) {
    set({ statusMessage: "Creating project…", busy: true });
    try {
      const data = await api<{ project: Project }>("/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      await get().loadProjects();
      set({ selectedProjectId: data.project.id, previewSurface: "editor", preview: null, buildResult: null, share: null, statusMessage: `Created ${data.project.name}` });
    } finally {
      set({ busy: false });
    }
  },

  async deleteProject(projectId) {
    await api(`/projects/${projectId}`, { method: "DELETE" });
    const next = get().projects.filter((project) => project.id !== projectId);
    set((state) => ({
      projects: next,
      selectedProjectId: state.selectedProjectId === projectId ? next[0]?.id ?? null : state.selectedProjectId,
      statusMessage: "Project deleted"
    }));
  },

  selectProject(projectId) {
    set({ selectedProjectId: projectId, preview: null, buildResult: null, share: null, statusMessage: "" });
  },

  setPreviewSurface(surface) {
    set({ previewSurface: surface });
  },

  async startPreview() {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    set({ isPreviewStarting: true, statusMessage: "Starting preview…" });
    try {
      const data = await api<{ preview: PreviewSession }>(`/projects/${projectId}/preview/start`, { method: "POST" });
      set((state) => ({ preview: data.preview, previewFrameKey: state.previewFrameKey + 1, statusMessage: `Preview ${data.preview.status}` }));
    } finally {
      set({ isPreviewStarting: false });
    }
  },

  refreshPreview() {
    set((state) => ({ previewFrameKey: state.previewFrameKey + 1 }));
  },

  async runBuild() {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    set({ isBuilding: true, statusMessage: "Building…" });
    try {
      const data = await api<{ build: BuildResult }>(`/projects/${projectId}/build`, { method: "POST" });
      set({ buildResult: data.build, statusMessage: data.build.ok ? "Build passed" : "Build failed" });
    } finally {
      set({ isBuilding: false });
    }
  },

  async shareProject() {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    set({ statusMessage: "Creating share link…" });
    const data = await api<{ share: ProjectShare }>(`/projects/${projectId}/share`, { method: "POST" });
    set({ share: data.share, statusMessage: "Share link created" });
  },

  async exportSourceArchive() {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    set({ statusMessage: "Preparing source export…" });
    await downloadProjectArchive(`/api/projects/${projectId}/export/source`, "project-source.zip");
    set({ statusMessage: "Source ZIP downloaded", toast: "Source ZIP downloaded ↓" });
  },

  async exportBuildArchive() {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    set({ statusMessage: "Building export…" });
    const result = await downloadProjectArchive(`/api/projects/${projectId}/export/build`, "project-dist.zip");
    if (result.build) {
      const ok = result.build.ok;
      set({
        buildResult: result.build,
        statusMessage: ok ? "Build ZIP downloaded" : "Build export failed",
        toast: ok ? "Build ZIP downloaded ↓" : "Build export failed"
      });
      return;
    }
    set({ statusMessage: "Build ZIP downloaded", toast: "Build ZIP downloaded ↓" });
  },

  async loadSettings() {
    const data = await api<{ settings: AppSettings }>("/settings");
    set({ settings: data.settings });
  },

  async updateSettings(patch) {
    const data = await api<{ settings: AppSettings }>("/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    set({ settings: data.settings, statusMessage: "Settings saved" });
  }
}));

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...init.headers }
  });
  if (response.status === 401) {
    await supabase?.auth.signOut();
    throw new Error("Session expired");
  }
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function downloadProjectArchive(url: string, fallbackFileName: string): Promise<{ build?: BuildResult }> {
  const response = await fetch(url, { method: "POST", headers: await authHeaders() });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { build?: BuildResult };
    if (data.build) {
      return { build: data.build };
    }
    throw new Error(`Archive request failed: ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileNameFromDisposition(response.headers.get("content-disposition")) ?? fallbackFileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  return {};
}

function fileNameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match ? match[1] : null;
}
