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
  const loadBilling = useProjectStore((s) => s.loadBilling);
  const createProject = useProjectStore((s) => s.createProject);
  const startPreview = useProjectStore((s) => s.startPreview);

  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void checkHealth();
    void loadProjects();
    void loadSettings();
    void loadUsage();
    void loadBilling();
  }, [checkHealth, loadProjects, loadSettings, loadUsage, loadBilling]);

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
  // Always include the current value so the selected model shows even if it's not
  // in the fetched list (e.g. a server default not returned by the provider).
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className={styles.settingRow}>
      <span>{label}</span>
      <select className={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((model) => (
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
  const billing = useProjectStore((s) => s.billing);
  const createBillingOrder = useProjectStore((s) => s.createBillingOrder);
  const captureBillingOrder = useProjectStore((s) => s.captureBillingOrder);
  const logError = useProjectStore((s) => s.logError);
  const fetchModels = useProjectStore((s) => s.fetchModels);
  const [openAiKey, setOpenAiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openAiModels, setOpenAiModels] = useState<string[]>([]);
  const [anthropicModels, setAnthropicModels] = useState<string[]>([]);
  const [pendingOrder, setPendingOrder] = useState<{ id: string; label: string; credits: number } | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const activeBilling = billing?.credits.enabled ? billing : null;
  const platformCreditsEnabled = Boolean(activeBilling);

  // Pull the models each key actually has access to (falls back to MODEL_CHOICES).
  const hasOpenAi = settings?.hasOpenAiApiKey;
  const hasAnthropic = settings?.hasAnthropicApiKey;
  useEffect(() => {
    if (hasOpenAi) void fetchModels("openai").then(setOpenAiModels);
  }, [hasOpenAi, fetchModels]);
  useEffect(() => {
    if (hasAnthropic) void fetchModels("anthropic").then(setAnthropicModels);
  }, [hasAnthropic, fetchModels]);

  // Wrap updates so a failure surfaces its detail instead of failing silently.
  const save = async (patch: AppSettingsUpdate) => {
    setError(null);
    try {
      await updateSettings(patch);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      logError("Couldn’t save settings", message);
    }
  };

  const buyCredits = async (packageId: string) => {
    setError(null);
    setBuying(packageId);
    const checkoutWindow = window.open("about:blank", "_blank");
    if (checkoutWindow) checkoutWindow.opener = null;
    try {
      const order = await createBillingOrder(packageId);
      setPendingOrder({ id: order.id, label: order.package.label, credits: order.package.credits });
      if (checkoutWindow) {
        checkoutWindow.location.href = order.approvalUrl;
      } else {
        window.open(order.approvalUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      checkoutWindow?.close();
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      logError("Couldn’t start PayPal checkout", message);
    } finally {
      setBuying(null);
    }
  };

  const captureCredits = async () => {
    if (!pendingOrder) return;
    setError(null);
    try {
      await captureBillingOrder(pendingOrder.id);
      setPendingOrder(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      logError("Couldn’t complete PayPal checkout", message);
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
        <span>AI usage source</span>
        <select className={styles.input} value={settings?.aiUsageSource ?? "auto"} onChange={(e) => void save({ aiUsageSource: e.target.value as "auto" | "platform" })}>
          <option value="auto">Auto — own key first</option>
          <option value="platform" disabled={!platformCreditsEnabled}>
            Platform credits
          </option>
        </select>
      </label>

      {activeBilling ? (
        <section className={styles.billingCard}>
          <div className={styles.billingHeader}>
            <div>
              <strong>Platform credits</strong>
              <span>Use these when you do not want to add your own provider key.</span>
            </div>
            <div className={styles.creditTotal}>
              <strong>{activeBilling.credits.total}</strong>
              <span>credits</span>
            </div>
          </div>
          <div className={styles.creditBreakdown}>
            <span>Paid {activeBilling.credits.paid}</span>
            <span>Bonus {activeBilling.credits.bonus}</span>
          </div>
          <div className={styles.packageGrid}>
            {activeBilling.packages.map((pack) => (
              <button key={pack.id} className={styles.packageCard} type="button" disabled={Boolean(buying)} onClick={() => void buyCredits(pack.id)}>
                <strong>{pack.label}</strong>
                <span>{pack.credits} credits</span>
                <em>{(pack.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: pack.currency })}</em>
                <small>{buying === pack.id ? "Opening PayPal…" : "Buy with PayPal"}</small>
              </button>
            ))}
          </div>
          {pendingOrder ? (
            <div className={styles.pendingOrder}>
              <span>Approved {pendingOrder.label} in PayPal?</span>
              <button className={styles.primary} type="button" onClick={() => void captureCredits()}>
                Complete purchase
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

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
          <ModelRow label="OpenAI code model" value={settings.openAiCodeModel} options={openAiModels.length ? openAiModels : MODEL_CHOICES.openai} onChange={(v) => void save({ openAiCodeModel: v })} />
          <ModelRow label="OpenAI repair model" value={settings.openAiRepairModel} options={openAiModels.length ? openAiModels : MODEL_CHOICES.openai} onChange={(v) => void save({ openAiRepairModel: v })} />
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
          <ModelRow label="Claude code model" value={settings.anthropicCodeModel} options={anthropicModels.length ? anthropicModels : MODEL_CHOICES.claude} onChange={(v) => void save({ anthropicCodeModel: v })} />
          <ModelRow label="Claude repair model" value={settings.anthropicRepairModel} options={anthropicModels.length ? anthropicModels : MODEL_CHOICES.claude} onChange={(v) => void save({ anthropicRepairModel: v })} />
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
