// McpConnectSection — a "Connect via MCP" card in Settings that templates the
// local-vs-hosted setup instructions from docs/mcp.md. Mode is detected from
// authEnabled (apps/web/src/auth/supabaseClient.ts), the same signal App.tsx
// already uses to decide whether to show the sign-in wall: no Supabase config
// means local/single-tenant (no bearer token needed), Supabase configured
// means the hosted deployment, where the MCP client needs the current
// session's access token as a bearer header.

import { useState } from "react";
import { authEnabled, supabase } from "../auth/supabaseClient";
import styles from "../App.module.css";

const REPO_PATH_KEY = "studio:mcpRepoPath";
const REPO_PATH_PLACEHOLDER = "/absolute/path/to/ai-threejs-studio";

function loadRepoPath(): string {
  try {
    return localStorage.getItem(REPO_PATH_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveRepoPath(value: string): void {
  try {
    if (value) localStorage.setItem(REPO_PATH_KEY, value);
    else localStorage.removeItem(REPO_PATH_KEY);
  } catch {
    // localStorage unavailable — the field just won't remember the path.
  }
}

// Matches the Codex config in docs/mcp.md exactly, so the two stay in sync.
function localMcpConfig(repoPath: string): string {
  return `[mcp_servers.ai_threejs_studio]
command = "pnpm"
args = [
  "--silent",
  "--dir",
  "${repoPath || REPO_PATH_PLACEHOLDER}",
  "mcp"
]

[mcp_servers.ai_threejs_studio.env]
AI_THREEJS_STUDIO_API_URL = "http://127.0.0.1:4000"`;
}

// apps/mcp talks to this origin directly (no /api prefix, see apps/mcp/src/api.ts),
// bypassing the browser's same-origin Vercel proxy (apps/web/vercel.json rewrites
// /api/* to this same Railway origin). window.location.origin is the Vercel domain,
// not this one, so it would send MCP requests into the SPA fallback instead of the
// API. Override with VITE_MCP_API_URL if the Railway origin ever changes.
const HOSTED_API_URL = import.meta.env.VITE_MCP_API_URL?.trim() || "https://ai-threejs-studioapi-production.up.railway.app";

export function McpConnectSection() {
  return (
    <section className={styles.billingCard}>
      <div className={styles.billingHeader}>
        <div>
          <strong>Connect via MCP</strong>
          <span>Let an MCP client (Claude, Codex, ChatGPT desktop, …) author scenes here using its own model.</span>
        </div>
      </div>

      {authEnabled ? <HostedConfig /> : <LocalConfig />}

      <details>
        <summary className={styles.mcpSummary}>Tools &amp; troubleshooting</summary>
        <ul className={styles.mcpToolList}>
          <li>
            <code>studio_list_projects</code>, <code>studio_create_project</code>
          </li>
          <li>
            <code>studio_get_scene_authoring_guide</code>, <code>studio_get_scene</code>
          </li>
          <li>
            <code>studio_validate_scene</code>, <code>studio_replace_scene</code>
          </li>
          <li>
            <code>studio_build_project</code>, <code>studio_start_preview</code>
          </li>
        </ul>
        <p className={styles.mcpHint}>
          401/403 means the bearer token is missing, invalid, or expired — copy a fresh one below. Full setup and
          client examples: <code>docs/mcp.md</code> in the repository.
        </p>
      </details>
    </section>
  );
}

function LocalConfig() {
  const [repoPath, setRepoPath] = useState(loadRepoPath);

  const onRepoPathChange = (value: string) => {
    setRepoPath(value);
    saveRepoPath(value);
  };

  return (
    <div>
      <p className={styles.mcpHint}>
        Run <code>pnpm dev</code> in the repo, then add this to your MCP client's config (Codex shown; other clients
        use the same command/args/env in their own format):
      </p>
      <div className={styles.settingRow}>
        <span>Repo path</span>
        <input
          className={styles.input}
          type="text"
          placeholder={REPO_PATH_PLACEHOLDER}
          value={repoPath}
          onChange={(e) => onRepoPathChange(e.target.value)}
        />
      </div>
      <CopyBlock value={localMcpConfig(repoPath)} />
    </div>
  );
}

function HostedConfig() {
  const [tokenStatus, setTokenStatus] = useState<"idle" | "copied" | "empty" | "error">("idle");

  const copyToken = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      setTokenStatus("empty");
      return;
    }
    try {
      await navigator.clipboard.writeText(accessToken);
      setTokenStatus("copied");
    } catch {
      setTokenStatus("error");
    }
  };

  return (
    <div>
      <p className={styles.mcpHint}>Point your MCP client at this deployment and provide your current session token:</p>
      <CopyBlock value={`AI_THREEJS_STUDIO_API_URL=${HOSTED_API_URL}`} />
      <div className={styles.settingRow}>
        <span>AI_THREEJS_STUDIO_ACCESS_TOKEN</span>
        <span className={styles.settingControl}>
          <button className={styles.ghost} type="button" onClick={() => void copyToken()}>
            Copy current access token
          </button>
        </span>
        <span className={styles.mcpHint}>
          {tokenStatus === "copied"
            ? "✓ Copied. Tokens expire — copy a fresh one if your client reports 401/403."
            : tokenStatus === "empty"
              ? "Sign in first."
              : tokenStatus === "error"
                ? "Couldn't access the clipboard — copy it manually from your browser session."
                : "Treat this like a password: keep it out of the repo, terminal history, and screenshots."}
        </span>
      </div>
    </div>
  );
}

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — the text is still visible to select manually.
    }
  };

  return (
    <div className={styles.mcpCodeRow}>
      <pre className={styles.mcpCode}>{value}</pre>
      <button className={styles.ghost} type="button" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
