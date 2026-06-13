// CameraMenu — a "Cameras" button in the viewport toolbar that opens a popover to
// pick the view (free-orbit "Default view" or look through a scene camera),
// add/delete/rename cameras, set their type/lens/clipping, capture the current
// viewport framing into a camera, and key the camera's pose or lens at the
// timeline playhead. Selecting a camera both makes it active (the runtime/export
// view) and looks through it; "Default view" returns to the free editor orbit.
//
// Reuses the AddObjectMenu popover styling + portal/anchor pattern so it isn't
// clipped by the horizontally-scrolling gizmo bar.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CAMERA_TYPES, type Camera, type CameraType } from "@ai-threejs-studio/scene3d";
import styles from "./AddObjectMenu.module.css";
import { CameraIcon, CameraOffIcon } from "../ui/icons";


export interface CameraMenuProps {
  cameras: Camera[];
  activeCameraId: string;
  lookThrough: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPatch: (id: string, patch: Partial<Camera>) => void;
  onFrameFromView: (id: string) => void;
  onSetLookThrough: (value: boolean) => void;
  /** Key the active camera's position + target at the playhead. */
  onKeyPose: () => void;
  /** Key the active camera's fov (perspective) or zoom (orthographic) at the playhead. */
  onKeyLens: () => void;
  playhead: number;
}

export function CameraMenu({
  cameras,
  activeCameraId,
  lookThrough,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onPatch,
  onFrameFromView,
  onSetLookThrough,
  onKeyPose,
  onKeyLens,
  playhead
}: CameraMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const active = cameras.find((c) => c.id === activeCameraId) ?? cameras[0];

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

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        className={styles.addBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Cameras"
        aria-label="Cameras"
      >
        
        {lookThrough ? <CameraIcon size={14} /> : <CameraOffIcon size={14} />}
        <span className={styles.addLabel}>{lookThrough ? active?.name ?? "Camera" : "Default view"}</span>
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              className={styles.popover}
              style={{ position: "fixed", top: coords.top, left: coords.left, right: "auto", width: 240 }}
              role="menu"
            >
              <div className={styles.section}>View</div>
              <button
                className={styles.item}
                onClick={() => onSetLookThrough(false)}
                style={{ fontWeight: !lookThrough ? 700 : 400 }}
              >
                {!lookThrough ? "● " : "○ "}Default view (free orbit)
              </button>

              <div className={styles.section}>Cameras</div>
              {cameras.map((cam) => (
                <button
                  key={cam.id}
                  className={styles.item}
                  onClick={() => {
                    onSelect(cam.id);
                    onSetLookThrough(true);
                  }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: lookThrough && cam.id === activeCameraId ? 700 : 400 }}
                  title={cam.id === activeCameraId ? "Active camera (runtime/export view) — click to look through" : "Click to make active and look through"}
                >
                  <span>{cam.id === activeCameraId ? "● " : "○ "}{cam.name ?? cam.id}</span>
                  {cameras.length > 1 ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete ${cam.name ?? cam.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(cam.id);
                      }}
                      style={{ opacity: 0.6, padding: "0 4px" }}
                    >
                      ✕
                    </span>
                  ) : null}
                </button>
              ))}
              <button className={styles.item} onClick={onAdd}>
                + Add camera (from current view)
              </button>

              {active ? (
                <>
                  <div className={styles.divider} />
                  <div className={styles.section}>Active: {active.name ?? active.id}</div>

                  <label style={rowStyle}>
                    <span style={labelStyle}>Name</span>
                    <input
                      className={styles.item}
                      style={inputStyle}
                      value={active.name ?? ""}
                      onChange={(e) => onRename(active.id, e.target.value)}
                    />
                  </label>

                  <label style={rowStyle}>
                    <span style={labelStyle}>Type</span>
                    <select
                      style={inputStyle}
                      value={active.type ?? "perspective"}
                      onChange={(e) => onPatch(active.id, { type: e.target.value as CameraType })}
                    >
                      {CAMERA_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t === "perspective" ? "Perspective" : "Orthographic"}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(active.type ?? "perspective") === "perspective" ? (
                    <label style={rowStyle}>
                      <span style={labelStyle}>FOV {Math.round(active.fov ?? 45)}°</span>
                      <input
                        type="range"
                        min={20}
                        max={90}
                        step={1}
                        value={active.fov ?? 45}
                        onChange={(e) => onPatch(active.id, { fov: Number(e.target.value) })}
                        style={{ flex: 1 }}
                      />
                    </label>
                  ) : (
                    <label style={rowStyle}>
                      <span style={labelStyle}>Zoom {Math.round(active.zoom ?? 50)}</span>
                      <input
                        type="range"
                        min={10}
                        max={200}
                        step={1}
                        value={active.zoom ?? 50}
                        onChange={(e) => onPatch(active.id, { zoom: Number(e.target.value) })}
                        style={{ flex: 1 }}
                      />
                    </label>
                  )}

                  <label style={rowStyle}>
                    <span style={labelStyle}>Near</span>
                    <input
                      type="number"
                      min={0.01}
                      step={0.1}
                      value={active.near ?? 0.1}
                      onChange={(e) => onPatch(active.id, { near: Math.max(0.01, Number(e.target.value) || 0.01) })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={rowStyle}>
                    <span style={labelStyle}>Far</span>
                    <input
                      type="number"
                      min={1}
                      step={10}
                      value={active.far ?? 1000}
                      onChange={(e) => onPatch(active.id, { far: Math.max(1, Number(e.target.value) || 1000) })}
                      style={inputStyle}
                    />
                  </label>

                  <button className={styles.item} onClick={() => onFrameFromView(active.id)}>
                    Set position from current view
                  </button>

                  <div className={styles.divider} />
                  <div className={styles.section}>Animate @ {playhead.toFixed(2)}s</div>
                  <button className={styles.item} onClick={onKeyPose}>
                    + Key position &amp; target
                  </button>
                  <button className={styles.item} onClick={onKeyLens}>
                    + Key {(active.type ?? "perspective") === "perspective" ? "FOV" : "zoom"}
                  </button>
                </>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "4px 10px" };
const labelStyle: React.CSSProperties = { fontSize: 11, color: "#9fb2c8", minWidth: 64 };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
