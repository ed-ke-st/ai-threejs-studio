// AddObjectMenu — an "Add object" button that opens a popover of primitives,
// lights, and a group; picking one asks the editor to insert it. Mirrors the
// three.js editor's Add menu.
//
// The popover is rendered through a portal with position: fixed, anchored to the
// trigger, so it isn't clipped when the button lives inside an `overflow` ancestor
// (e.g. the horizontally-scrolling gizmo bar).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GEOMETRY_KINDS } from "@ai-threejs-studio/scene3d";
import { LIGHT_KINDS, geometryLabel, lightLabel, type AddSpec } from "./sceneFactory";
import styles from "./AddObjectMenu.module.css";
import { ObjectIcon } from "../ui/icons";

export function AddObjectMenu({ onAdd }: { onAdd: (spec: AddSpec) => void }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Anchor the fixed popover just below the trigger, clamped into the viewport.
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
    // `scroll` with capture catches scrolling in any ancestor (incl. the gizmo bar).
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

  const pick = (spec: AddSpec) => {
    onAdd(spec);
    setOpen(false);
  };

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        className={styles.addBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add object"
        aria-label="Add object"
      >
       <ObjectIcon size={14} /> <span className={styles.add}>+</span>
      </button>
      {open && coords
        ? createPortal(
            <div ref={popoverRef} className={styles.popover} style={{ position: "fixed", top: coords.top, left: coords.left, right: "auto" }} role="menu">
              <div className={styles.section}>Mesh</div>
              {GEOMETRY_KINDS.map((kind) => (
                <button key={kind} className={styles.item} onClick={() => pick({ category: "mesh", kind })}>
                  {geometryLabel(kind)}
                </button>
              ))}
              <div className={styles.section}>Light</div>
              {LIGHT_KINDS.map((kind) => (
                <button key={kind} className={styles.item} onClick={() => pick({ category: "light", kind })}>
                  {lightLabel(kind)}
                </button>
              ))}
              <div className={styles.divider} />
              <button className={styles.item} onClick={() => pick({ category: "group" })}>
                Group
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
