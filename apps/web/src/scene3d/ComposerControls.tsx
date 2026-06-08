// ComposerControls — the compact "Style / Mood / Examples" controls for the New
// scene composer. Each is a small icon button that opens a stylized popover
// (single-select for Style, multi-select for Mood, fill-prompt for Examples),
// replacing the long inline chip rows.

import { useEffect, useRef, useState } from "react";
import { EXAMPLE_PROMPTS, MODIFIERS, STYLE_PRESETS } from "./promptComposer";
import { ExamplesIcon, MoodIcon, StyleIcon } from "../ui/icons";
import styles from "./ComposerControls.module.css";

type MenuId = "style" | "mood" | "examples";

interface ComposerControlsProps {
  styleId: string | null;
  onStyle: (id: string | null) => void;
  modifierIds: string[];
  onToggleModifier: (id: string) => void;
  onPickExample: (prompt: string) => void;
}

export function ComposerControls({ styleId, onStyle, modifierIds, onToggleModifier, onPickExample }: ComposerControlsProps) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while a menu is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: MenuId) => setOpen((current) => (current === id ? null : id));
  const selectedStyle = STYLE_PRESETS.find((preset) => preset.id === styleId) ?? null;

  return (
    <div className={styles.row} ref={ref}>
      {/* Icon-only triggers — the title text lives in each popover header. */}
      <button
        className={triggerClass(open === "examples")}
        onClick={() => toggle("examples")}
        aria-haspopup="menu"
        aria-expanded={open === "examples"}
        aria-label="Examples"
        title="Examples"
      >
        <ExamplesIcon />
      </button>

      <button
        className={triggerClass(open === "style" || Boolean(selectedStyle))}
        onClick={() => toggle("style")}
        aria-haspopup="menu"
        aria-expanded={open === "style"}
        aria-label={selectedStyle ? `Style: ${selectedStyle.label}` : "Style"}
        title={selectedStyle ? `Style: ${selectedStyle.label}` : "Style"}
      >
        <StyleIcon />
      </button>

      <button
        className={triggerClass(open === "mood" || modifierIds.length > 0)}
        onClick={() => toggle("mood")}
        aria-haspopup="menu"
        aria-expanded={open === "mood"}
        aria-label="Mood"
        title="Mood"
      >
        <MoodIcon />
        {modifierIds.length > 0 ? <span className={styles.countBadge}>{modifierIds.length}</span> : null}
      </button>

      {/* One popover at a time, spanning the row so it fits the narrow sidebar. */}
      {open === "examples" ? (
        <div className={styles.popover} role="menu">
          <div className={styles.popoverHeader}>Examples</div>
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              className={styles.exampleOption}
              onClick={() => {
                onPickExample(example);
                setOpen(null);
              }}
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {open === "style" ? (
        <div className={styles.popover} role="menu">
          <div className={styles.popoverHeader}>Style</div>
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={optionClass(styleId === preset.id)}
              title={preset.guidance}
              onClick={() => {
                onStyle(styleId === preset.id ? null : preset.id);
                setOpen(null);
              }}
            >
              <span className={styles.check}>{styleId === preset.id ? "✓" : ""}</span>
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      {open === "mood" ? (
        <div className={styles.popover} role="menu">
          <div className={styles.popoverHeader}>Mood</div>
          {MODIFIERS.map((modifier) => {
            const on = modifierIds.includes(modifier.id);
            return (
              <button key={modifier.id} className={optionClass(on)} title={modifier.guidance} onClick={() => onToggleModifier(modifier.id)}>
                <span className={styles.check}>{on ? "✓" : ""}</span>
                {modifier.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function triggerClass(active: boolean): string {
  return active ? `${styles.trigger} ${styles.triggerActive}` : styles.trigger;
}

function optionClass(active: boolean): string {
  return active ? `${styles.option} ${styles.optionActive}` : styles.option;
}
