// SceneSettingsMenu — a "World" button in the viewport toolbar that opens a
// popover for scene-level look: background colour, fog, image-based lighting
// (environment preset), and post-processing (bloom/vignette/SSAO/DoF). These are
// fields on the Scene3D document with no other UI; editing them here writes
// straight back through onPatch, so the change flows to the editor preview, share
// link, and exported source via the single SceneView interpreter.
//
// Reuses the AddObjectMenu popover styling + portal/anchor pattern (shared with
// CameraMenu) so it isn't clipped by the horizontally-scrolling gizmo bar.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ENVIRONMENT_PRESETS, type EnvironmentPreset, type PostProcessing, type Scene3D } from "@ai-threejs-studio/scene3d";
import styles from "./AddObjectMenu.module.css";
import { SettingsIcon, WorldIcon } from "../ui/icons";

export interface SceneSettingsMenuProps {
  background?: string;
  fog?: Scene3D["fog"];
  environment?: Scene3D["environment"];
  postprocessing?: PostProcessing;
  onPatch: (patch: Partial<Scene3D>) => void;
}

const DEFAULT_FOG = { color: "#0b0f17", near: 8, far: 30 };

export function SceneSettingsMenu({ background, fog, environment, postprocessing, onPatch }: SceneSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 16);
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

  const env = environment ?? {};
  const post = postprocessing ?? {};
  const bloom = post.bloom;

  // Merge a partial into a sub-object, dropping the whole sub-object when it
  // empties so the scene JSON stays clean (no `postprocessing:{}` litter).
  const patchPost = (next: PostProcessing) => {
    const merged: PostProcessing = { ...post, ...next };
    for (const key of Object.keys(merged) as (keyof PostProcessing)[]) {
      if (merged[key] === undefined) delete merged[key];
    }
    onPatch({ postprocessing: Object.keys(merged).length > 0 ? merged : undefined });
  };

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        className={styles.addBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="World & render settings"
        aria-label="World & render settings"
      >
        <WorldIcon size={14} />
        <span className={styles.addLabel}>World</span>
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              className={styles.popover}
              style={{ position: "fixed", top: coords.top, left: coords.left, right: "auto", width: 248 }}
              role="menu"
            >
              <div className={styles.section}>Background</div>
              <label style={rowStyle}>
                <span style={labelStyle}>Colour</span>
                <input
                  type="color"
                  value={background ?? "#0b0f17"}
                  onChange={(e) => onPatch({ background: e.target.value })}
                  style={colorStyle}
                />
              </label>

              <div className={styles.divider} />
              <div className={styles.section}>Fog</div>
              <label style={rowStyle}>
                <span style={labelStyle}>Enabled</span>
                <input
                  type="checkbox"
                  checked={Boolean(fog)}
                  onChange={(e) => onPatch({ fog: e.target.checked ? fog ?? { ...DEFAULT_FOG } : undefined })}
                />
              </label>
              {fog ? (
                <>
                  <label style={rowStyle}>
                    <span style={labelStyle}>Colour</span>
                    <input type="color" value={fog.color} onChange={(e) => onPatch({ fog: { ...fog, color: e.target.value } })} style={colorStyle} />
                  </label>
                  <label style={rowStyle}>
                    <span style={labelStyle}>Near {fog.near.toFixed(0)}</span>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={fog.near}
                      onChange={(e) => onPatch({ fog: { ...fog, near: Number(e.target.value) } })}
                      style={{ flex: 1 }}
                    />
                  </label>
                  <label style={rowStyle}>
                    <span style={labelStyle}>Far {fog.far.toFixed(0)}</span>
                    <input
                      type="range"
                      min={1}
                      max={120}
                      step={1}
                      value={fog.far}
                      onChange={(e) => onPatch({ fog: { ...fog, far: Number(e.target.value) } })}
                      style={{ flex: 1 }}
                    />
                  </label>
                </>
              ) : null}

              <div className={styles.divider} />
              <div className={styles.section}>Environment (reflections)</div>
              <label style={rowStyle}>
                <span style={labelStyle}>Preset</span>
                <select
                  style={inputStyle}
                  value={env.preset ?? ""}
                  onChange={(e) =>
                    onPatch({ environment: e.target.value ? { ...env, preset: e.target.value as EnvironmentPreset } : undefined })
                  }
                >
                  <option value="">None</option>
                  {ENVIRONMENT_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              {env.preset ? (
                <>
                  <label style={rowStyle}>
                    <span style={labelStyle}>Intensity {(env.intensity ?? 1).toFixed(1)}</span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.1}
                      value={env.intensity ?? 1}
                      onChange={(e) => onPatch({ environment: { ...env, intensity: Number(e.target.value) } })}
                      style={{ flex: 1 }}
                    />
                  </label>
                  <label style={rowStyle}>
                    <span style={labelStyle}>As backdrop</span>
                    <input
                      type="checkbox"
                      checked={Boolean(env.background)}
                      onChange={(e) => onPatch({ environment: { ...env, background: e.target.checked || undefined } })}
                    />
                  </label>
                  {env.background ? (
                    <label style={rowStyle}>
                      <span style={labelStyle}>Blur {(env.blur ?? 0).toFixed(2)}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={env.blur ?? 0}
                        onChange={(e) => onPatch({ environment: { ...env, blur: Number(e.target.value) } })}
                        style={{ flex: 1 }}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}

              <div className={styles.divider} />
              <div className={styles.section}>Post-processing</div>
              <label style={rowStyle}>
                <span style={labelStyle}>Bloom</span>
                <input
                  type="checkbox"
                  checked={Boolean(bloom)}
                  onChange={(e) => patchPost({ bloom: e.target.checked ? { intensity: 1, luminanceThreshold: 0.6, radius: 0.7 } : undefined })}
                />
              </label>
              {bloom ? (
                <>
                  <label style={rowStyle}>
                    <span style={labelStyle}>Intensity {(bloom.intensity ?? 1).toFixed(1)}</span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.1}
                      value={bloom.intensity ?? 1}
                      onChange={(e) => patchPost({ bloom: { ...bloom, intensity: Number(e.target.value) } })}
                      style={{ flex: 1 }}
                    />
                  </label>
                  <label style={rowStyle}>
                    <span style={labelStyle}>Threshold {(bloom.luminanceThreshold ?? 0.6).toFixed(2)}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={bloom.luminanceThreshold ?? 0.6}
                      onChange={(e) => patchPost({ bloom: { ...bloom, luminanceThreshold: Number(e.target.value) } })}
                      style={{ flex: 1 }}
                    />
                  </label>
                </>
              ) : null}
              <label style={rowStyle}>
                <span style={labelStyle}>Vignette</span>
                <input
                  type="checkbox"
                  checked={Boolean(post.vignette)}
                  onChange={(e) => patchPost({ vignette: e.target.checked ? { darkness: 0.5 } : undefined })}
                />
              </label>
              <label style={rowStyle}>
                <span style={labelStyle}>Ambient occlusion</span>
                <input type="checkbox" checked={Boolean(post.ssao)} onChange={(e) => patchPost({ ssao: e.target.checked || undefined })} />
              </label>
              <label style={rowStyle}>
                <span style={labelStyle}>Depth of field</span>
                <input
                  type="checkbox"
                  checked={Boolean(post.dof)}
                  onChange={(e) => patchPost({ dof: e.target.checked ? { focusDistance: 0.02, focalLength: 0.05, bokehScale: 2 } : undefined })}
                />
              </label>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "4px 10px" };
const labelStyle: React.CSSProperties = { fontSize: 11, color: "#9fb2c8", minWidth: 88 };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
const colorStyle: React.CSSProperties = { width: 40, height: 24, padding: 0, border: "none", background: "none" };
