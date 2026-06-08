import type { BuildResult, ProjectFile, RagChunk } from "@ai-threejs-studio/shared";

export interface AgentToolContext {
  projectId: string;
  userId?: string;
}

export interface AgentTools {
  listFiles(context: AgentToolContext): Promise<ProjectFile[]>;
  readFile(context: AgentToolContext, path: string): Promise<ProjectFile | null>;
  writeFile(context: AgentToolContext, path: string, content: string): Promise<ProjectFile>;
  patchFile(context: AgentToolContext, path: string, patch: string): Promise<ProjectFile>;
  createFile(context: AgentToolContext, path: string, content: string): Promise<ProjectFile>;
  deleteFile(context: AgentToolContext, path: string): Promise<void>;
  runTypecheck(context: AgentToolContext): Promise<BuildResult>;
  runBuild(context: AgentToolContext): Promise<BuildResult>;
  getBuildLogs(context: AgentToolContext): Promise<string>;
  createSnapshot(context: AgentToolContext): Promise<string>;
  searchDocs(query: string, collections?: string[], limit?: number): Promise<RagChunk[]>;
}
