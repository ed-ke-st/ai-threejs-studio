export type ProjectTemplateId =
  | "blank-r3f-scene"
  | "glb-viewer"
  | "product-configurator"
  | "room-scene"
  | "interactive-planner";

export interface Project {
  id: string;
  /** Owning user (auth.users.id in Supabase mode; a constant local owner in single-tenant mode). */
  ownerId: string;
  name: string;
  templateId: ProjectTemplateId;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  projectId: string;
  path: string;
  content: string;
  updatedAt: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  label?: string;
  createdAt: string;
}

export interface ProjectSnapshot {
  id: string;
  createdAt: string;
}

export interface VisualValidationFinding {
  code: string;
  message: string;
  severity: "warning" | "error";
}

export type VisualValidationStatus = "passed" | "failed" | "warning";

export interface VisualValidationMetrics {
  width: number;
  height: number;
  meanLuminance: number;
  luminanceStdDev: number;
  nearBlackFraction: number;
  brightFraction: number;
  alphaCoverage: number;
  uniqueBuckets: number;
}

export interface VisualValidationResult {
  status: VisualValidationStatus;
  ok: boolean;
  screenshotCaptured: boolean;
  findings: VisualValidationFinding[];
  metrics?: VisualValidationMetrics;
  logs: string;
}

export interface Asset {
  id: string;
  userId: string;
  projectId?: string;
  name: string;
  type: "model/glb" | "model/gltf" | "texture/image" | "environment/hdri" | "image/reference" | "material/preset";
  url: string;
  thumbnailUrl?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  createdAt: string;
}

export interface BuildResult {
  ok: boolean;
  buildOk?: boolean;
  command: string;
  logs: string;
  errorSummary?: string;
  visualValidation?: VisualValidationResult;
  startedAt: string;
  finishedAt: string;
}

export type PreviewStatus = "starting" | "running" | "failed" | "stopped";

export interface PreviewSession {
  projectId: string;
  status: PreviewStatus;
  url: string;
  port: number;
  logs: string;
  startedAt: string;
}

export interface ProjectShare {
  id: string;
  projectId: string;
  url: string;
  /** Legacy live-preview URL. Static shares serve a self-contained bundle at `url`. */
  previewUrl?: string;
  createdAt: string;
}

export type RagRetrievalReasonCode =
  | "query-overlap"
  | "title-match"
  | "collection-match"
  | "scene-type-match"
  | "pattern-match"
  | "failure-mode-match"
  | "recipe-prior"
  | "example-prior"
  | "accepted-example"
  | "project-match"
  | "template-match"
  | "project-name-match"
  | "collection-tuning";

export interface RagRetrievalReason {
  code: RagRetrievalReasonCode;
  label: string;
  weight: number;
  detail?: string;
}

export interface RagRetrievalMetadata {
  score: number;
  matchedTerms: string[];
  reasons: RagRetrievalReason[];
}

export interface RagRetrievalTuningReasonAdjustment {
  code: RagRetrievalReasonCode;
  label: string;
  multiplier: number;
  passedCount: number;
  failedCount: number;
  rationale: string;
}

export interface RagRetrievalTuningCollectionAdjustment {
  collection: string;
  weight: number;
  passedCount: number;
  failedCount: number;
  rationale: string;
}

export interface RagRetrievalTuningProfile {
  version: 1;
  generatedAt: string;
  sourceReportIds: string[];
  passRate: number;
  reasonAdjustments: RagRetrievalTuningReasonAdjustment[];
  collectionAdjustments: RagRetrievalTuningCollectionAdjustment[];
}

export interface RagChunk {
  id: string;
  collection: string;
  title: string;
  url?: string;
  content: string;
  retrieval?: RagRetrievalMetadata;
  metadata: {
    sourceKind?: "reference" | "recipe" | "example";
    outcome?: "accepted" | "rejected";
    package?: string;
    topic?: string;
    apiName?: string;
    version?: string;
    sceneType?: string;
    pattern?: string;
    failureMode?: string;
    failureLabels?: string[];
    filePath?: string;
    projectId?: string;
    projectName?: string;
    runId?: string;
    templateId?: ProjectTemplateId;
  };
}

// Selectable models per provider (also used to validate updates server-side).
export const MODEL_CHOICES = {
  claude: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: ["gpt-5", "gpt-4.1", "gpt-4.1-mini"]
} as const;

export interface AppSettings {
  aiProvider: "gemini" | "openai" | "claude" | "auto";
  hasGeminiApiKey: boolean;
  hasOpenAiApiKey: boolean;
  hasAnthropicApiKey: boolean;
  // Effective models (the user's choice, or the server default when unset).
  anthropicCodeModel: string;
  anthropicRepairModel: string;
  openAiCodeModel: string;
  openAiRepairModel: string;
}

export interface AppSettingsUpdate {
  aiProvider?: "gemini" | "openai" | "claude" | "auto";
  geminiApiKey?: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  clearGeminiApiKey?: boolean;
  clearOpenAiApiKey?: boolean;
  clearAnthropicApiKey?: boolean;
  anthropicCodeModel?: string;
  anthropicRepairModel?: string;
  openAiCodeModel?: string;
  openAiRepairModel?: string;
}
