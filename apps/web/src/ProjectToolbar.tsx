// ProjectToolbar — the editor/runtime toolbar. Surface toggle + a prominent
// Start preview button, with the lower-frequency actions (Build, Share, Export)
// tucked into a single overflow menu. Sharing surfaces the link in a dialog that
// can be reopened any time from the menu.

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "./stores/projectStore";
import {
  CloseIcon,
  DownloadIcon,
  EditorIcon,
  InfoIcon,
  KebabIcon,
  RefreshIcon,
  RestartIcon,
  RuntimeIcon,
  ShareIcon
} from "./ui/icons";
import styles from "./App.module.css";

export function ProjectToolbar() {
  const previewSurface = useProjectStore((s) => s.previewSurface);
  const setPreviewSurface = useProjectStore((s) => s.setPreviewSurface);
  const preview = useProjectStore((s) => s.preview);
  const isPreviewStarting = useProjectStore((s) => s.isPreviewStarting);
  const startPreview = useProjectStore((s) => s.startPreview);
  const refreshPreview = useProjectStore((s) => s.refreshPreview);
  const share = useProjectStore((s) => s.share);
  const shareProject = useProjectStore((s) => s.shareProject);
  const exportSourceArchive = useProjectStore((s) => s.exportSourceArchive);
  const exportBuildArchive = useProjectStore((s) => s.exportBuildArchive);
  const logs = useProjectStore((s) => s.logs);

  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const errorCount = logs.filter((entry) => entry.level === "error").length;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const runMenuAction = (fn: () => Promise<void> | void) => {
    setMenuOpen(false);
    void fn();
  };

  // Share: reopen the dialog if a link already exists; otherwise create one first.
  const handleShare = async () => {
    setMenuOpen(false);
    if (share) {
      setShareOpen(true);
      return;
    }
    setSharePending(true);
    try {
      await shareProject();
      setShareOpen(true);
    } finally {
      setSharePending(false);
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.surfaceToggle}>
        <button className={surfaceBtnClass(previewSurface === "editor")} onClick={() => setPreviewSurface("editor")}>
          <EditorIcon size={14} />
          Editor
        </button>
        <button className={surfaceBtnClass(previewSurface === "runtime")} onClick={() => setPreviewSurface("runtime")}>
          <RuntimeIcon size={14} />
          Runtime
        </button>
      </div>

      <button
        className={errorCount > 0 ? `${styles.iconButton} ${styles.iconButtonAlert}` : styles.iconButton}
        onClick={() => setLogOpen(true)}
        aria-label="Activity log"
        title={errorCount > 0 ? `${errorCount} error${errorCount > 1 ? "s" : ""} — open log` : "Activity log"}
      >
        <InfoIcon />
        {errorCount > 0 ? <span className={styles.logBadge}>{errorCount}</span> : null}
      </button>

      <span className={styles.spacer} />

      {/* Preview controls only matter on the runtime surface (the preview auto-
          starts when you switch to it). Restart re-runs the dev server; Refresh
          just reloads the iframe. */}
      {previewSurface === "runtime" ? (
        isPreviewStarting ? (
          <span className={styles.startingHint}>Starting preview…</span>
        ) : preview ? (
          <>
            <button className={styles.iconButton} onClick={() => void startPreview()} aria-label="Restart preview" title="Restart preview server">
              <RestartIcon />
            </button>
            <button className={styles.iconButton} onClick={refreshPreview} aria-label="Refresh preview" title="Reload the preview">
              <RefreshIcon />
            </button>
          </>
        ) : (
          <button className={styles.iconButton} onClick={() => void startPreview()} aria-label="Start preview" title="Start preview">
            <RestartIcon />
          </button>
        )
      ) : null}

      <div className={styles.toolMenu} ref={menuRef}>
        <button
          className={styles.iconButton}
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="More actions"
          title="More actions"
        >
          <KebabIcon />
        </button>
        {menuOpen ? (
          <div className={styles.menuPopover} role="menu">
            <button className={styles.menuItem} disabled={sharePending} onClick={() => void handleShare()}>
              <ShareIcon />
              <span>{share ? "Show share link" : sharePending ? "Sharing…" : "Share"}</span>
            </button>
            <div className={styles.menuDivider} />
            <button className={styles.menuItem} onClick={() => runMenuAction(exportSourceArchive)}>
              <DownloadIcon />
              <span>Export source</span>
            </button>
            <button className={styles.menuItem} onClick={() => runMenuAction(exportBuildArchive)}>
              <DownloadIcon />
              <span>Export build</span>
            </button>
          </div>
        ) : null}
      </div>

      {shareOpen && share ? <ShareDialog url={share.url} onClose={() => setShareOpen(false)} /> : null}
      {logOpen ? <LogModal onClose={() => setLogOpen(false)} /> : null}
    </div>
  );
}

function LogModal({ onClose }: { onClose: () => void }) {
  const logs = useProjectStore((s) => s.logs);
  const clearLogs = useProjectStore((s) => s.clearLogs);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.overlayBackdrop} onClick={onClose}>
      <div className={styles.logCard} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.logHeader}>
          <span className={styles.logTitle}>Activity log</span>
          <span className={styles.spacer} />
          <button className={styles.ghost} disabled={logs.length === 0} onClick={clearLogs}>
            Clear
          </button>
          <button className={styles.iconButton} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {logs.length === 0 ? (
          <p className={styles.logEmpty}>No errors or messages yet.</p>
        ) : (
          <div className={styles.logList}>
            {logs.map((entry) => (
              <details key={entry.id} className={entry.level === "error" ? styles.logEntryError : styles.logEntry} open={entry.level === "error"}>
                <summary>
                  <span className={styles.logTime}>{entry.time}</span>
                  {entry.title}
                </summary>
                {entry.detail ? <pre>{entry.detail}</pre> : null}
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShareDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the input is selectable as a fallback.
    }
  };

  return (
    <div className={styles.overlayBackdrop} onClick={onClose}>
      <div className={styles.shareCard} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.shareTitle}>Share link ready</div>
        <p className={styles.shareDesc}>Anyone with this link can view the scene.</p>
        <div className={styles.shareUrlRow}>
          <input className={styles.shareUrl} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
          <button className={styles.primary} onClick={() => void copy()}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <div className={styles.shareActions}>
          <a className={styles.openLink} href={url} target="_blank" rel="noreferrer">
            Open in new tab ↗
          </a>
          <button className={styles.ghost} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function surfaceBtnClass(active: boolean): string {
  return active ? `${styles.surfaceBtn} ${styles.surfaceBtnActive}` : styles.surfaceBtn;
}
