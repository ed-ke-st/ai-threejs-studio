// CameraMenu — a "Cameras" button in the viewport toolbar that opens a popover to
// switch between the scene's cameras, add/delete/rename them, set their type/fov,
// capture the current viewport framing into a camera, and toggle "look through"
// (preview the editor through the active camera, exactly as the runtime sees it).
//
// Reuses the AddObjectMenu popover styling + portal/anchor pattern so it isn't
// clipped by the horizontally-scrolling gizmo bar.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CAMERA_TYPES, type Camera, type CameraType } from "@ai-threejs-studio/scene3d";
import styles from "./AddObjectMenu.module.css";

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
  onToggleLookThrough: () => void;
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
  onToggleLookThrough
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
        style={{ width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 600 }}
      >
        {lookThrough ? "🎥" : "📷"} {active?.name ?? "Camera"}
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              className={styles.popover}
              style={{ position: "fixed", top: coords.top, left: coords.left, right: "auto", width: 240 }}
              role="menu"
            >
              <div className={styles.section}>Cameras</div>
              {cameras.map((cam) => (
                <button
                  key={cam.id}
                  className={styles.item}
                  onClick={() => onSelect(cam.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: cam.id === activeCameraId ? 700 : 400 }}
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

                  <button className={styles.item} onClick={() => onFrameFromView(active.id)}>
                    Set position from current view
                  </button>
                  <button className={styles.item} onClick={onToggleLookThrough} style={{ fontWeight: lookThrough ? 700 : 400 }}>
                    {lookThrough ? "✓ Looking through camera" : "Look through camera"}
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
