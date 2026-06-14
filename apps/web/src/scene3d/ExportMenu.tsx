// ExportMenu — a "Capture" button in the viewport toolbar that exports the scene
// as seen through the ACTIVE camera: a PNG still (at the current playhead) or a
// WebM clip of the animation. The actual capture runs offscreen via
// useSceneCapture; this is just the resolution/fps picker + triggers.
//
// Reuses the AddObjectMenu popover styling + portal/anchor pattern (shared with
// CameraMenu/SceneSettingsMenu).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AddObjectMenu.module.css";
import { DownloadIcon } from "../ui/icons";
import { CAPTURE_RESOLUTIONS, type CaptureResolution } from "./useSceneCapture";

const FPS_CHOICES = [24, 30, 60];

export interface ExportMenuProps {
  hasAnimation: boolean;
  busy: boolean;
  onRenderImage: (res: CaptureResolution) => void;
  onExportVideo: (res: CaptureResolution, fps: number) => void;
  onExportModel: () => void;
}

export function ExportMenu({ hasAnimation, busy, onRenderImage, onExportVideo, onExportModel }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [resIndex, setResIndex] = useState(1); // default 1080p
  const [fps, setFps] = useState(30);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setCoords({ top: rect.bottom + 4, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const res = CAPTURE_RESOLUTIONS[resIndex];

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        className={styles.addBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Capture image / video"
        aria-label="Capture image or video"
      >
        <DownloadIcon size={14} />
        <span className={styles.addLabel}>Capture</span>
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              className={styles.popover}
              style={{ position: "fixed", top: coords.top, left: coords.left, right: "auto", width: 228 }}
              role="menu"
            >
              <div className={styles.section}>Resolution</div>
              <label style={rowStyle}>
                <span style={labelStyle}>Size</span>
                <select style={inputStyle} value={resIndex} onChange={(e) => setResIndex(Number(e.target.value))}>
                  {CAPTURE_RESOLUTIONS.map((r, i) => (
                    <option key={r.label} value={i}>
                      {r.label} ({r.width}×{r.height})
                    </option>
                  ))}
                </select>
              </label>

              <button className={styles.item} disabled={busy} onClick={() => onRenderImage(res)}>
                {busy ? "Working…" : "↓ Render image (PNG)"}
              </button>

              <div className={styles.divider} />
              <div className={styles.section}>Animation</div>
              <label style={rowStyle}>
                <span style={labelStyle}>Frame rate</span>
                <select style={inputStyle} value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={!hasAnimation}>
                  {FPS_CHOICES.map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={styles.item}
                disabled={busy || !hasAnimation}
                title={hasAnimation ? undefined : "Add keyframe animation first"}
                onClick={() => onExportVideo(res, fps)}
              >
                {busy ? "Working…" : "↓ Export animation (WebM)"}
              </button>
              {!hasAnimation ? <div style={hintStyle}>No animation in this scene yet.</div> : null}

              <div className={styles.divider} />
              <div className={styles.section}>3D model</div>
              <button className={styles.item} disabled={busy} onClick={onExportModel}>
                {busy ? "Working…" : "↓ Export model (GLB)"}
              </button>
              <div style={hintStyle}>Geometry, materials, lights{hasAnimation ? " & baked animation" : ""}.</div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "4px 10px" };
const labelStyle: React.CSSProperties = { fontSize: 11, color: "#9fb2c8", minWidth: 72 };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
const hintStyle: React.CSSProperties = { fontSize: 10, color: "#6b7a8d", padding: "2px 10px 6px" };
