import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "./stores/projectStore";
import { Scene3DEditor } from "./scene3d/Scene3DEditor";
import { ProjectMenu } from "./ProjectMenu";
import { ProjectToolbar } from "./ProjectToolbar";
import { CloseIcon, SettingsIcon } from "./ui/icons";
import { authEnabled, supabase } from "./auth/supabaseClient";
import { MODEL_CHOICES, type AdminBillingOrder, type AppSettingsUpdate } from "@ai-threejs-studio/shared";
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
  const admin = useProjectStore((s) => s.admin);

  const checkHealth = useProjectStore((s) => s.checkHealth);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadSettings = useProjectStore((s) => s.loadSettings);
  const loadUsage = useProjectStore((s) => s.loadUsage);
  const loadBilling = useProjectStore((s) => s.loadBilling);
  const loadAdmin = useProjectStore((s) => s.loadAdmin);
  const createProject = useProjectStore((s) => s.createProject);
  const startPreview = useProjectStore((s) => s.startPreview);

  const [panel, setPanel] = useState<"app" | "settings" | "admin">("app");
  const showSettings = panel === "settings";
  const showAdmin = panel === "admin";

  useEffect(() => {
    void checkHealth();
    void loadProjects();
    void loadSettings();
    void loadUsage();
    void loadBilling();
    void loadAdmin();
  }, [checkHealth, loadProjects, loadSettings, loadUsage, loadBilling, loadAdmin]);

  // Auto-start the preview when the Runtime surface is opened with no running
  // preview. The ref guards against retry storms if a start fails (it resets when
  // you leave runtime, so re-entering tries again).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (previewSurface !== "runtime" || panel !== "app") {
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
  }, [previewSurface, panel, preview, isPreviewStarting, startPreview]);

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
          {selectedProject && panel === "app" ? <ProjectToolbar /> : null}
          {admin ? (
            <button className={panel === "admin" ? `${styles.ghost} ${styles.ghostActive}` : styles.ghost} onClick={() => setPanel((current) => (current === "admin" ? "app" : "admin"))}>
              Admin
            </button>
          ) : null}
          <button className={showSettings ? `${styles.ghost} ${styles.ghostActive}` : styles.ghost} onClick={() => setPanel((current) => (current === "settings" ? "app" : "settings"))}>
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
        {showAdmin ? (
          <AdminPanel />
        ) : showSettings ? (
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

function AdminPanel() {
  const admin = useProjectStore((s) => s.admin);
  const orders = useProjectStore((s) => s.adminOrders);
  const creditLookup = useProjectStore((s) => s.adminCreditLookup);
  const loadAdminOrders = useProjectStore((s) => s.loadAdminOrders);
  const loadAdminCredits = useProjectStore((s) => s.loadAdminCredits);
  const clearAdminCreditLookup = useProjectStore((s) => s.clearAdminCreditLookup);
  const logError = useProjectStore((s) => s.logError);
  const [statusFilter, setStatusFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [creditUserId, setCreditUserId] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    setLoadingOrders(true);
    void loadAdminOrders({ limit: 50 })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        logError("Couldn’t load admin orders", message);
      })
      .finally(() => setLoadingOrders(false));
  }, [admin, loadAdminOrders, logError]);

  const refreshOrders = async () => {
    setError(null);
    setLoadingOrders(true);
    try {
      await loadAdminOrders({ limit: 50, status: statusFilter.trim() || undefined, userId: userFilter.trim() || undefined });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      logError("Couldn’t load admin orders", message);
    } finally {
      setLoadingOrders(false);
    }
  };

  const lookupCredits = async () => {
    const id = creditUserId.trim();
    if (!id) return;
    setError(null);
    setLoadingCredits(true);
    try {
      await loadAdminCredits(id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      logError("Couldn’t load user credits", message);
    } finally {
      setLoadingCredits(false);
    }
  };

  if (!admin) {
    return (
      <div className={styles.adminPanel}>
        <h2 className={styles.settingsTitle}>Admin</h2>
        <p className={styles.adminMuted}>Admin access is not available for this account.</p>
      </div>
    );
  }

  return (
    <div className={styles.adminPanel}>
      <div className={styles.adminHeader}>
        <div>
          <h2 className={styles.settingsTitle}>Admin</h2>
          <p className={styles.adminMuted}>Signed in as {admin.displayName ?? admin.id}</p>
        </div>
        <button className={styles.ghost} type="button" onClick={() => void refreshOrders()} disabled={loadingOrders}>
          {loadingOrders ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <details className={styles.settingsError} open>
          <summary>Admin request failed — show details</summary>
          <pre>{error}</pre>
        </details>
      ) : null}

      <section className={styles.adminCard}>
        <div className={styles.adminSectionHeader}>
          <div>
            <strong>Billing orders</strong>
            <span>Read-only PayPal order overview.</span>
          </div>
          <span>{orders.length} shown</span>
        </div>
        <div className={styles.adminFilters}>
          <input className={styles.input} placeholder="Status, e.g. COMPLETED" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          <input className={styles.input} placeholder="User UUID" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} />
          <button className={styles.primary} type="button" onClick={() => void refreshOrders()} disabled={loadingOrders}>
            Apply
          </button>
        </div>
        <div className={styles.adminTableWrap}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Package</th>
                <th>Credits</th>
                <th>Amount</th>
                <th>User</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? orders.map((order) => <AdminOrderRow key={order.id} order={order} onInspectUser={(id) => setCreditUserId(id)} />) : (
                <tr>
                  <td colSpan={6}>No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.adminCard}>
        <div className={styles.adminSectionHeader}>
          <div>
            <strong>User credits</strong>
            <span>Lookup a user balance and recent credit ledger.</span>
          </div>
          {creditLookup ? <button className={styles.ghost} type="button" onClick={clearAdminCreditLookup}>Clear</button> : null}
        </div>
        <div className={styles.adminFilters}>
          <input className={styles.input} placeholder="User UUID" value={creditUserId} onChange={(e) => setCreditUserId(e.target.value)} />
          <button className={styles.primary} type="button" onClick={() => void lookupCredits()} disabled={loadingCredits || !creditUserId.trim()}>
            {loadingCredits ? "Loading…" : "Lookup"}
          </button>
        </div>
        {creditLookup ? (
          <>
            <div className={styles.adminBalanceGrid}>
              <span><strong>{creditLookup.balance.total}</strong>Total</span>
              <span><strong>{creditLookup.balance.paid}</strong>Paid</span>
              <span><strong>{creditLookup.balance.bonus}</strong>Bonus</span>
            </div>
            <div className={styles.adminLedger}>
              {creditLookup.ledger.length ? creditLookup.ledger.map((entry) => (
                <div key={entry.id} className={styles.adminLedgerRow}>
                  <strong>{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</strong>
                  <span>{entry.creditType} · {entry.reason}</span>
                  <small>{entry.referenceId ?? "no reference"} · {formatDate(entry.createdAt)}</small>
                </div>
              )) : <p className={styles.adminMuted}>No ledger entries.</p>}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function AdminOrderRow({ order, onInspectUser }: { order: AdminBillingOrder; onInspectUser: (userId: string) => void }) {
  return (
    <tr>
      <td><span className={styles.adminStatus}>{order.status}</span></td>
      <td>{order.packageId}</td>
      <td>{order.credits}</td>
      <td>{(order.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: order.currency })}</td>
      <td>
        <button className={styles.adminLinkButton} type="button" onClick={() => onInspectUser(order.userId)} title={order.userId}>
          {shortId(order.userId)}
        </button>
      </td>
      <td>{formatDate(order.createdAt)}</td>
    </tr>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function healthBadgeClass(health: "checking" | "connected" | "offline"): string {
  if (health === "connected") return `${styles.healthBadge} ${styles.healthBadgeConnected}`;
  if (health === "offline") return `${styles.healthBadge} ${styles.healthBadgeOffline}`;
  return styles.healthBadge;
}
