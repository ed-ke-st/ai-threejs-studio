import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type postgres from "postgres";
import type { Project, ProjectTemplateId } from "@ai-threejs-studio/shared";
import { config } from "./config.js";
import { getSql } from "./db.js";

export interface CreateProjectInput {
  name: string;
  templateId: ProjectTemplateId;
  ownerId: string;
}

export interface ProjectRepository {
  load(): Promise<void>;
  /** Projects owned by `ownerId`, most-recently-updated first. */
  listProjects(ownerId: string): Promise<Project[]>;
  /** Look up by id only (NOT owner-scoped) — ownership is enforced by the caller. */
  getProject(projectId: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  touchProject(projectId: string): Promise<Project | null>;
  deleteProject(projectId: string): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Single-tenant repo: an in-memory map flushed to a local JSON index. Legacy
 * records created before accounts have no ownerId, so they are adopted by the
 * configured local owner on load.
 */
export class LocalProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  constructor(
    private readonly indexPath: string,
    private readonly defaultOwnerId: string
  ) {}

  async load(): Promise<void> {
    try {
      const records = JSON.parse(await fs.readFile(this.indexPath, "utf8")) as Array<Partial<Project> & Project>;
      this.projects.clear();

      for (const project of records) {
        // Adopt pre-accounts records into the local owner.
        this.projects.set(project.id, { ...project, ownerId: project.ownerId ?? this.defaultOwnerId });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async listProjects(ownerId: string): Promise<Project[]> {
    return Array.from(this.projects.values())
      .filter((project) => project.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.projects.get(projectId) ?? null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: nanoid(12),
      ownerId: input.ownerId,
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

  async close(): Promise<void> {
    // No resources to release for the local index.
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    const all = Array.from(this.projects.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await fs.writeFile(this.indexPath, JSON.stringify(all, null, 2), "utf8");
  }
}

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  template_id: ProjectTemplateId;
  created_at: Date;
  updated_at: Date;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    templateId: row.template_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

/** Multi-tenant repo backed by Supabase Postgres. Ownership is enforced by callers. */
export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async load(): Promise<void> {
    await this.sql`select 1`;
  }

  async listProjects(ownerId: string): Promise<Project[]> {
    const rows = await this.sql<ProjectRow[]>`
      select * from projects where owner_id = ${ownerId} order by updated_at desc
    `;
    return rows.map(toProject);
  }

  async getProject(projectId: string): Promise<Project | null> {
    const [row] = await this.sql<ProjectRow[]>`
      select * from projects where id = ${projectId} limit 1
    `;
    return row ? toProject(row) : null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = nanoid(12);
    const [row] = await this.sql<ProjectRow[]>`
      insert into projects (id, owner_id, name, template_id)
      values (${id}, ${input.ownerId}, ${input.name}, ${input.templateId})
      returning *
    `;
    return toProject(row);
  }

  async touchProject(projectId: string): Promise<Project | null> {
    const [row] = await this.sql<ProjectRow[]>`
      update projects set updated_at = now() where id = ${projectId} returning *
    `;
    return row ? toProject(row) : null;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const result = await this.sql`delete from projects where id = ${projectId}`;
    return result.count > 0;
  }

  async close(): Promise<void> {
    // The shared pool is closed centrally via closeSql().
  }
}

/** Picks the repo implementation based on whether accounts/auth is configured. */
export async function createProjectRepository(): Promise<ProjectRepository> {
  const repository: ProjectRepository =
    config.auth.enabled && config.supabaseDbUrl
      ? new PostgresProjectRepository(getSql())
      : new LocalProjectRepository(config.projectIndexPath, config.auth.localOwnerId);
  await repository.load();
  return repository;
}
