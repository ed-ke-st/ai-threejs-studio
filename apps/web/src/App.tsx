import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "./stores/projectStore";
import { Scene3DEditor } from "./scene3d/Scene3DEditor";
import { ProjectMenu } from "./ProjectMenu";
import { ProjectToolbar } from "./ProjectToolbar";
import { CloseIcon, SettingsIcon } from "./ui/icons";
import { authEnabled, supabase } from "./auth/supabaseClient";
import { MODEL_CHOICES, type AppSettingsUpdate } from "@ai-threejs-studio/shared";
import styles from "./App.module.css";

export function App() {
  const health = useProjectStore((s) => s.health);
  const projects = useProjectStore((s) => s.projects);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const statusMessage = useProjectStore((s) => s.statusMessage);
  const previewSurface = useProjectStore((s) => s.previewSurface);
  const preview = useProjectStore((s) => s.preview);
  const previewFrameKey = useProjectStore((s) => s.previewFrameKey);
  const isPreviewStarting = useProjectStore((s) => s.isPreviewStarting);
  const buildResult = useProjectStore((s) => s.buildResult);

  const checkHealth = useProjectStore((s) => s.checkHealth);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadSettings = useProjectStore((s) => s.loadSettings);
  const loadUsage = useProjectStore((s) => s.loadUsage);
  const createProject = useProjectStore((s) => s.createProject);
  const startPreview = useProjectStore((s) => s.startPreview);

  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void checkHealth();
    void loadProjects();
    void loadSettings();
    void loadUsage();
  }, [checkHealth, loadProjects, loadSettings, loadUsage]);

  // Auto-start the preview when the Runtime surface is opened with no running
  // preview. The ref guards against retry storms if a start fails (it resets when
  // you leave runtime, so re-entering tries again).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (previewSurface !== "runtime" || showSettings) {
      autoStartedRef.current = false;
      return;
    }
    // Static preview (port 0) is a built bundle, so re-check freshness on each
    // Runtime entry (rebuilds only if stale). Live preview (port > 0) starts once.
    const isStatic = preview?.port === 0;
    if ((!preview || isStatic) && !isPreviewStarting && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startPreview();
    }
  }, [previewSurface, showSettings, preview, isPreviewStarting, startPreview]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.logo}>3D</span>
          <strong className={styles.brandTitle}>AI Three.js Studio</strong>
          <span className={healthBadgeClass(health)}>{health === "connected" ? "API connected" : health === "offline" ? "API offline" : "…"}</span>
       
                 <ProjectMenu />

        </div>

        <div className={styles.topbarRight}>
          {selectedProject && !showSettings ? <ProjectToolbar /> : null}
          <button className={styles.ghost} onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? <CloseIcon /> : <SettingsIcon />}
          </button>
          {authEnabled ? (
            <button className={styles.ghost} onClick={() => void supabase?.auth.signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>



      <main className={styles.main}>
        {showSettings ? (
          <SettingsPanel />
        ) : !selectedProject ? (
          <div className={styles.empty}>
            <p>Create a project to start building a scene with AI.</p>
            <button className={styles.primary} onClick={() => void createProject("Scene 1")}>
              New project
            </button>
          </div>
        ) : previewSurface === "editor" ? (
          <Scene3DEditor key={selectedProject.id} projectId={selectedProject.id} />
        ) : preview?.url ? (
          <iframe key={previewFrameKey} title="Runtime preview" className={styles.frame} sandbox="allow-scripts allow-same-origin" src={`${preview.url}?v=${previewFrameKey}`} />
        ) : isPreviewStarting ? (
          <div className={styles.empty}>
            <p>Starting preview…</p>
          </div>
        ) : (
          <div className={styles.empty}>
            <p>The preview isn’t running.</p>
            <button className={styles.primary} onClick={() => void startPreview()}>
              Start preview
            </button>
          </div>
        )}
      </main>

      <footer className={styles.statusbar}>
        <span>{statusMessage}</span>
        <span className={styles.spacer} />
        {buildResult ? <span className={buildResult.ok ? styles.buildPassed : styles.buildFailed}>Build {buildResult.ok ? "passed" : "failed"}</span> : null}
      </footer>

      <Toast />
    </div>
  );
}

// Transient confirmation (download finished, etc.), auto-dismissed after a few
// seconds. Reads the store's `toast` so any action can surface a quick message.
function Toast() {
  const toast = useProjectStore((s) => s.toast);
  const clearToast = useProjectStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 3000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;
  return <div className={styles.toast}>{toast}</div>;
}

function ModelRow({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <label className={styles.settingRow}>
      <span>{label}</span>
      <select className={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettingsPanel() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const [openAiKey, setOpenAiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Wrap updates so a failure surfaces its detail instead of failing silently.
  const save = async (patch: AppSettingsUpdate) => {
    setError(null);
    try {
      await updateSettings(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={styles.settings}>
      <h2 className={styles.settingsTitle}>Settings</h2>
      {error ? (
        <details className={styles.settingsError} open>
          <summary>Couldn’t save settings — show details</summary>
          <pre>{error}</pre>
          <span className={styles.settingsErrorHint}>
            This is often transient (e.g. the server restarting after a deploy). Try again in a moment.
          </span>
        </details>
      ) : null}
      <label className={styles.settingRow}>
        <span>AI provider</span>
        <select className={styles.input} value={settings?.aiProvider ?? "auto"} onChange={(e) => void save({ aiProvider: e.target.value as "openai" | "gemini" | "claude" | "auto" })}>
          <option value="auto">Auto</option>
          <option value="openai">OpenAI</option>
          <option value="claude">Claude</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>

      <label className={styles.settingRow}>
        <span>OpenAI API key {settings?.hasOpenAiApiKey ? "✓ set" : ""}</span>
        <span className={styles.settingControl}>
          <input className={styles.input} type="password" placeholder="sk-…" value={openAiKey} onChange={(e) => setOpenAiKey(e.target.value)} />
          <button className={styles.ghost} disabled={!openAiKey} onClick={() => { void save({ openAiApiKey: openAiKey }); setOpenAiKey(""); }}>
            Save
          </button>
        </span>
      </label>

      {settings?.hasOpenAiApiKey ? (
        <>
          <ModelRow label="OpenAI code model" value={settings.openAiCodeModel} options={MODEL_CHOICES.openai} onChange={(v) => void save({ openAiCodeModel: v })} />
          <ModelRow label="OpenAI repair model" value={settings.openAiRepairModel} options={MODEL_CHOICES.openai} onChange={(v) => void save({ openAiRepairModel: v })} />
        </>
      ) : null}

      <label className={styles.settingRow}>
        <span>Anthropic API key {settings?.hasAnthropicApiKey ? "✓ set" : ""}</span>
        <span className={styles.settingControl}>
          <input className={styles.input} type="password" placeholder="sk-ant-…" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
          <button className={styles.ghost} disabled={!anthropicKey} onClick={() => { void save({ anthropicApiKey: anthropicKey }); setAnthropicKey(""); }}>
            Save
          </button>
        </span>
      </label>

      {settings?.hasAnthropicApiKey ? (
        <>
          <ModelRow label="Claude code model" value={settings.anthropicCodeModel} options={MODEL_CHOICES.claude} onChange={(v) => void save({ anthropicCodeModel: v })} />
          <ModelRow label="Claude repair model" value={settings.anthropicRepairModel} options={MODEL_CHOICES.claude} onChange={(v) => void save({ anthropicRepairModel: v })} />
        </>
      ) : null}

      <label className={styles.settingRow}>
        <span>Gemini API key {settings?.hasGeminiApiKey ? "✓ set" : ""}</span>
        <span className={styles.settingControl}>
          <input className={styles.input} type="password" placeholder="AIza…" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
          <button className={styles.ghost} disabled={!geminiKey} onClick={() => { void save({ geminiApiKey: geminiKey }); setGeminiKey(""); }}>
            Save
          </button>
        </span>
      </label>
    </div>
  );
}

function healthBadgeClass(health: "checking" | "connected" | "offline"): string {
  if (health === "connected") return `${styles.healthBadge} ${styles.healthBadgeConnected}`;
  if (health === "offline") return `${styles.healthBadge} ${styles.healthBadgeOffline}`;
  return styles.healthBadge;
}
