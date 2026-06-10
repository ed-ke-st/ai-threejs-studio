import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { BuildResult, PreviewSession, VisualValidationResult } from "@ai-threejs-studio/shared";
import { runVisualValidation } from "./visualValidation.js";

interface PreviewRunnerOptions {
  host: string;
  basePort: number;
  maxConcurrent: number;
  idleTimeoutMs: number;
  viteBinPath: string;
  chromeBinPath?: string;
  projectRootFor(projectId: string): string;
}

interface InternalPreviewSession extends PreviewSession {
  process?: ChildProcessWithoutNullStreams;
  lastAccessedAt: number;
}

// Bounded pool of localhost ports, reclaimed on release. Replaces the old
// ever-incrementing counter so ports can't leak under multi-user load.
class PortPool {
  private readonly free: number[] = [];
  constructor(base: number, size: number) {
    for (let i = 0; i < size; i += 1) this.free.push(base + i);
  }
  acquire(): number | undefined {
    return this.free.shift();
  }
  release(port: number): void {
    if (!this.free.includes(port)) this.free.push(port);
  }
}

export class PreviewRunner {
  private readonly sessions = new Map<string, InternalPreviewSession>();
  private readonly pool: PortPool;
  private reaper?: NodeJS.Timeout;

  constructor(private readonly options: PreviewRunnerOptions) {
    // Headroom (+4) lets transient visual-validation previews run alongside the
    // capped live previews without starving them.
    this.pool = new PortPool(options.basePort, options.maxConcurrent + 4);
  }

  async start(projectId: string): Promise<PreviewSession> {
    return this.startSession(`project:${projectId}`, this.options.projectRootFor(projectId), projectId);
  }

  async startWorkspaceSession(sessionKey: string, workspacePath: string, projectId: string): Promise<PreviewSession> {
    return this.startSession(sessionKey, workspacePath, projectId);
  }

  get(projectId: string): PreviewSession | null {
    return this.getSession(`project:${projectId}`);
  }

  getWorkspaceSession(sessionKey: string): PreviewSession | null {
    return this.getSession(sessionKey);
  }

  stop(projectId: string): void {
    this.releaseSession(`project:${projectId}`);
  }

  stopWorkspaceSession(sessionKey: string): void {
    this.releaseSession(sessionKey);
  }

  private async startSession(sessionKey: string, workspacePath: string, projectId: string): Promise<PreviewSession> {
    const existing = this.sessions.get(sessionKey);

    if (existing && existing.status !== "stopped" && existing.status !== "failed") {
      existing.lastAccessedAt = Date.now();
      return this.publicSession(existing);
    }

    if (existing) {
      this.releaseSession(sessionKey); // reclaim a dead session's port before reusing the key
    }

    // Keep live previews under the concurrency cap by evicting the LRU one(s).
    this.evictActiveToCap(this.options.maxConcurrent - 1);

    const port = this.pool.acquire();
    if (port === undefined) {
      throw new Error("No preview slot is available right now. Please try again shortly.");
    }

    const url = `http://${this.options.host}:${port}/`;
    const session: InternalPreviewSession = {
      projectId,
      status: "starting",
      url,
      port,
      logs: "",
      startedAt: new Date().toISOString(),
      lastAccessedAt: Date.now()
    };

    const child = spawn(process.execPath, [this.options.viteBinPath, "--host", this.options.host, "--port", String(port), "--strictPort"], {
      cwd: workspacePath,
      env: {
        ...process.env,
        BROWSER: "none",
        FORCE_COLOR: "0"
      }
    });

    session.process = child;
    this.sessions.set(sessionKey, session);

    child.stdout.on("data", (chunk: Buffer) => {
      session.logs = trimLogs(`${session.logs}${chunk.toString()}`);
      if (session.status === "starting" && session.logs.includes("Local:")) {
        session.status = "running";
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      session.logs = trimLogs(`${session.logs}${chunk.toString()}`);
      if (session.status === "starting" && /error|failed/i.test(session.logs)) {
        session.status = "failed";
      }
    });

    child.on("exit", (code) => {
      session.status = code === 0 ? "stopped" : "failed";
      session.logs = trimLogs(`${session.logs}\nPreview process exited with code ${code ?? "unknown"}.\n`);
      session.process = undefined;
      this.pool.release(session.port); // reclaim the port when the process dies on its own
    });

    this.ensureReaper();
    await this.waitForStart(session);
    return this.publicSession(session);
  }

  private getSession(sessionKey: string): PreviewSession | null {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return null;
    }
    session.lastAccessedAt = Date.now();
    return this.publicSession(session);
  }

  private releaseSession(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return;
    }

    session.process?.kill("SIGTERM");
    session.process = undefined;
    session.status = "stopped";
    this.pool.release(session.port);
    this.sessions.delete(sessionKey);
  }

  /** Evict least-recently-used active previews until at most `targetMax` remain. */
  private evictActiveToCap(targetMax: number): void {
    const active = () =>
      [...this.sessions.entries()].filter(([, s]) => s.status === "starting" || s.status === "running");
    let actives = active();
    while (actives.length > targetMax) {
      actives.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
      this.releaseSession(actives[0][0]);
      actives = active();
    }
  }

  private ensureReaper(): void {
    if (this.reaper) return;
    this.reaper = setInterval(() => this.reapIdle(), 60_000);
    this.reaper.unref?.();
  }

  private reapIdle(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      const active = session.status === "starting" || session.status === "running";
      if (!active || now - session.lastAccessedAt > this.options.idleTimeoutMs) {
        this.releaseSession(key);
      }
    }
    if (this.sessions.size === 0 && this.reaper) {
      clearInterval(this.reaper);
      this.reaper = undefined;
    }
  }

  async build(projectId: string, options?: { base?: string }): Promise<BuildResult> {
    return this.buildWorkspace(this.options.projectRootFor(projectId), options);
  }

  async buildWorkspace(workspacePath: string, options?: { base?: string }): Promise<BuildResult> {
    const startedAt = new Date().toISOString();
    const typecheck = await runCommand(workspacePath, "typecheck", process.execPath, [
      requireResolve("typescript/bin/tsc"),
      "-b",
      "--pretty",
      "false"
    ]);
    // `base` lets a share build emit relative asset URLs so the static bundle
    // works when served from a /shares/<id>/ subpath.
    const viteArgs = [this.options.viteBinPath, "build", ...(options?.base ? ["--base", options.base] : [])];
    const viteBuild = typecheck.ok ? await runCommand(workspacePath, "vite build", process.execPath, viteArgs) : null;
    const logs = trimLogs(
      [
        formatStepLogs("typecheck", typecheck.logs),
        viteBuild ? formatStepLogs("vite build", viteBuild.logs) : "Skipped vite build because typecheck failed."
      ].join("\n\n")
    );
    const ok = typecheck.ok && (viteBuild?.ok ?? false);

    return {
      ok,
      buildOk: ok,
      command: "tsc -b --pretty false && vite build",
      logs,
      errorSummary: ok ? undefined : summarizeBuildLogs(logs),
      startedAt,
      finishedAt: new Date().toISOString()
    };
  }

  async validateWorkspaceVisual(workspacePath: string): Promise<VisualValidationResult> {
    let port = this.pool.acquire();
    if (port === undefined) {
      // Free a slot by evicting the least-recently-used live preview.
      this.evictActiveToCap(Math.max(0, this.options.maxConcurrent - 1));
      port = this.pool.acquire();
    }
    if (port === undefined) {
      return {
        status: "warning",
        ok: true,
        screenshotCaptured: false,
        findings: [
          {
            code: "preview-slot-unavailable",
            message: "Visual validation skipped: no preview slot was available.",
            severity: "warning"
          }
        ],
        logs: "Visual validation skipped: preview port pool exhausted."
      };
    }

    const session = await startWorkspacePreview(workspacePath, this.options.host, port, this.options.viteBinPath);

    try {
      if (session.status !== "running") {
        return {
          status: "failed",
          ok: false,
          screenshotCaptured: false,
          findings: [
            {
              code: "preview-start-failed",
              message: "Preview runtime did not become ready for visual validation.",
              severity: "error"
            }
          ],
          logs: session.logs
        };
      }

      return await runVisualValidation(session.url, {
        chromeBinPath: this.options.chromeBinPath
      });
    } finally {
      session.process?.kill("SIGTERM");
      this.pool.release(port);
      await delay(200);
    }
  }

  stopAll(): void {
    if (this.reaper) {
      clearInterval(this.reaper);
      this.reaper = undefined;
    }
    for (const session of this.sessions.values()) {
      session.process?.kill("SIGTERM");
    }
    this.sessions.clear();
  }

  private async waitForStart(session: InternalPreviewSession): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (session.status === "failed" || session.status === "stopped") {
        return;
      }

      if (await isHttpReady(session.url)) {
        session.status = "running";
        return;
      }

      await delay(100);
    }

    if (session.status === "starting") {
      session.status = "failed";
      session.logs = trimLogs(`${session.logs}\nPreview did not become ready within 8 seconds.\n`);
    }
  }

  private publicSession(session: InternalPreviewSession): PreviewSession {
    const { process: _process, lastAccessedAt: _lastAccessedAt, ...previewSession } = session;
    return previewSession;
  }
}

interface CommandResult {
  ok: boolean;
  logs: string;
}

async function runCommand(workspacePath: string, label: string, command: string, args: string[]): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: workspacePath,
    env: {
      ...process.env,
      FORCE_COLOR: "0"
    }
  });
  let logs = "";

  child.stdout.on("data", (chunk: Buffer) => {
    logs = trimLogs(`${logs}${chunk.toString()}`);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    logs = trimLogs(`${logs}${chunk.toString()}`);
  });

  const exitCode = await Promise.race([
    new Promise<number | null>((resolve) => child.on("exit", resolve)),
    delay(30_000).then(() => {
      child.kill("SIGTERM");
      logs = trimLogs(`${logs}\n${label} timed out after 30 seconds.\n`);
      return 124;
    })
  ]);

  return {
    ok: exitCode === 0,
    logs
  };
}

async function startWorkspacePreview(
  workspacePath: string,
  host: string,
  port: number,
  viteBinPath: string
): Promise<InternalPreviewSession> {
  const url = `http://${host}:${port}/`;
  const session: InternalPreviewSession = {
    projectId: `workspace:${port}`,
    status: "starting",
    url,
    port,
    logs: "",
    startedAt: new Date().toISOString(),
    lastAccessedAt: Date.now()
  };

  const child = spawn(process.execPath, [viteBinPath, "--host", host, "--port", String(port), "--strictPort"], {
    cwd: workspacePath,
    env: {
      ...process.env,
      BROWSER: "none",
      FORCE_COLOR: "0"
    }
  });

  session.process = child;

  child.stdout.on("data", (chunk: Buffer) => {
    session.logs = trimLogs(`${session.logs}${chunk.toString()}`);
    if (session.status === "starting" && session.logs.includes("Local:")) {
      session.status = "running";
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    session.logs = trimLogs(`${session.logs}${chunk.toString()}`);
    if (session.status === "starting" && /error|failed/i.test(session.logs)) {
      session.status = "failed";
    }
  });

  child.on("exit", (code) => {
    session.status = code === 0 ? "stopped" : "failed";
    session.logs = trimLogs(`${session.logs}\nPreview process exited with code ${code ?? "unknown"}.\n`);
    session.process = undefined;
  });

  await waitForWorkspacePreview(session);
  return session;
}

async function waitForWorkspacePreview(session: InternalPreviewSession): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (session.status === "failed" || session.status === "stopped") {
      return;
    }

    if (await isHttpReady(session.url)) {
      session.status = "running";
      return;
    }

    await delay(100);
  }

  if (session.status === "starting") {
    session.status = "failed";
    session.logs = trimLogs(`${session.logs}\nPreview did not become ready within 8 seconds.\n`);
  }
}

function requireResolve(id: string): string {
  return import.meta.resolve(id).replace(/^file:\/\//, "");
}

function formatStepLogs(label: string, logs: string): string {
  return [`$ ${label}`, logs.trim() || "(no output)"].join("\n");
}

function trimLogs(logs: string): string {
  return logs.length > 20_000 ? logs.slice(-20_000) : logs;
}

function summarizeBuildLogs(logs: string): string {
  const lines = logs
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const importantLines = lines.filter((line) =>
    /error|failed|cannot find|could not resolve|does not exist|not assignable|timed out/i.test(line)
  );

  return (importantLines.length > 0 ? importantLines : lines).slice(0, 8).join("\n");
}

async function isHttpReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(500)
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
