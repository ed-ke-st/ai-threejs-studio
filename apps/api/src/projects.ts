import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Project, ProjectTemplateId } from "@ai-threejs-studio/shared";

export interface CreateProjectInput {
  name: string;
  templateId: ProjectTemplateId;
}

export class LocalProjectRepository {
  private readonly projects = new Map<string, Project>();

  constructor(private readonly indexPath: string) {}

  async load(): Promise<void> {
    try {
      const records = JSON.parse(await fs.readFile(this.indexPath, "utf8")) as Project[];
      this.projects.clear();

      for (const project of records) {
        this.projects.set(project.id, project);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  listProjects(): Project[] {
    return Array.from(this.projects.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getProject(projectId: string): Project | null {
    return this.projects.get(projectId) ?? null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: nanoid(12),
      name: input.name,
      templateId: input.templateId,
      createdAt: now,
      updatedAt: now
    };

    this.projects.set(project.id, project);
    await this.save();
    return project;
  }

  async touchProject(projectId: string): Promise<Project | null> {
    const project = this.projects.get(projectId);

    if (!project) {
      return null;
    }

    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString()
    };
    this.projects.set(projectId, updatedProject);
    await this.save();
    return updatedProject;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const deleted = this.projects.delete(projectId);

    if (!deleted) {
      return false;
    }

    await this.save();
    return true;
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(this.listProjects(), null, 2), "utf8");
  }
}
