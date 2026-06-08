// Scene3DEditor — the real product editor surface, on the shared renderer.
// It loads the Scene3D JSON from the API, renders it through the same SceneView
// interpreter the preview/share/export use, edits it with the structured
// Inspector, and saves back (which also refreshes the running preview, since the
// project's Vite server reads the same scene.config.json). It can also ask the
// Scene3D agent to (re)generate the scene from a prompt.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, TransformControls } from "@react-three/drei";
import type { Object3D } from "three";
import { SceneView } from "@ai-threejs-studio/scene3d/react";
import { autoFixScene, findNode, flattenNodes, lintScene, normalizeTransform, updateNode, type LintIssue, type Scene3D, type SceneNode } from "@ai-threejs-studio/scene3d";
import { Inspector, MultiInspector } from "./Inspector";
import { ComposerControls } from "./ComposerControls";
import { AddObjectMenu } from "./AddObjectMenu";
import { createNodeFromSpec, type AddSpec } from "./sceneFactory";
import { composePrompt } from "./promptComposer";
import { MoveIcon, RedoIcon, RotateIcon, ScaleIcon, TrashIcon, UndoIcon } from "../ui/icons";
import { authHeaders } from "../auth/supabaseClient";
import styles from "./Scene3DEditor.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";
type MobilePanel = "compose" | "outliner" | "inspector";

interface Scene3DEditorProps {
  projectId: string;
}

export function Scene3DEditor({ projectId }: Scene3DEditorProps) {
  const [scene, setScene] = useState<Scene3D | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // The primary (last-clicked) node drives the single-node Inspector and the
  // refine target. Multi-selection adds the rest for bulk transform edits.
  const primaryId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => loadCollapsed(projectId));
  const [allowFloating, setAllowFloating] = useState(() => loadAllowFloating(projectId));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"new" | "refine">("new");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [liveBuild, setLiveBuild] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("compose");
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>(() => loadGizmoPrefs().mode);
  const [gizmoSpace, setGizmoSpace] = useState<"world" | "local">(() => loadGizmoPrefs().space);
  const [gizmoSnap, setGizmoSnap] = useState(() => loadGizmoPrefs().snap);
  const [gizmoMoreOpen, setGizmoMoreOpen] = useState(false); // mobile: reveal World/Local + Snap
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => loadInspectorCollapsed());
  const isWide = useMinWidth(1181); // desktop — where the collapsible inspector rail makes sense
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether cmd/ctrl is held, so a click in the 3D canvas (where React
  // Three Fiber only hands us the node id) can add to the selection too.
  const additiveRef = useRef(false);
  // Undo/redo over scene snapshots. sceneRef mirrors `scene` (StrictMode double-
  // invokes state updaters, so history is recorded outside the updater). A burst
  // of rapid edits (e.g. dragging a slider) coalesces into one undo step. The
  // stacks live in a module store keyed by project id so they survive the editor
  // unmounting when you switch to the runtime preview and back.
  const sceneRef = useRef<Scene3D | null>(null);
  const historyRef = useRef(getEditorHistory(projectId));
  const burstRef = useRef(false);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyRef.current.undo.length > 0);
    setCanRedo(historyRef.current.redo.length > 0);
  }, []);

  // Push the pre-edit scene onto the undo stack. Continuous edits within 500ms
  // collapse into a single entry; `discrete` forces a standalone entry (generate).
  const recordHistory = useCallback(
    (prev: Scene3D, discrete = false) => {
      if (discrete || !burstRef.current) {
        historyRef.current.undo.push(prev);
        if (historyRef.current.undo.length > 50) historyRef.current.undo.shift();
        historyRef.current.redo.length = 0;
        syncHistoryFlags();
      }
      burstRef.current = !discrete;
      if (burstTimer.current) clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => {
        burstRef.current = false;
      }, 500);
    },
    [syncHistoryFlags]
  );

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/scene3d`, { headers: await authHeaders() });
    if (!response.ok) {
      setSaveState("error");
      return;
    }
    const data = (await response.json()) as { scene: Scene3D };
    setScene(data.scene);
    setSelectedIds((current) => {
      if (current.length > 0) return current;
      const first = flattenNodes(data.scene.nodes).find((n) => n.type === "mesh");
      return first ? [first.id] : [];
    });
  }, [projectId]);

  useEffect(() => {
    setScene(null);
    setSelectedIds([]);
    // History is kept in the per-project module store (getEditorHistory), so it
    // survives an editor remount (e.g. switching to the runtime preview and back).
    historyRef.current = getEditorHistory(projectId);
    burstRef.current = false;
    syncHistoryFlags();
    void load();
  }, [projectId, load, syncHistoryFlags]);

  // Keep the additive-modifier flag in sync for canvas selection.
  useEffect(() => {
    const sync = (event: KeyboardEvent) => {
      additiveRef.current = event.metaKey || event.ctrlKey;
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
    };
  }, []);

  const save = useCallback(
    async (next: Scene3D) => {
      setSaveState("saving");
      try {
        const response = await fetch(`/api/projects/${projectId}/scene3d`, {
          method: "PUT",
          headers: { "content-type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ scene: next })
        });
        setSaveState(response.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    },
    [projectId]
  );

  // Debounced autosave on every edit.
  const queueSave = useCallback(
    (next: Scene3D) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(next), 600);
    },
    [save]
  );

  // Single funnel for every edit: record history (coalesced), commit, autosave.
  const applyEdit = useCallback(
    (producer: (prev: Scene3D) => Scene3D) => {
      const prev = sceneRef.current;
      if (!prev) return;
      const next = producer(prev);
      recordHistory(prev);
      setScene(next);
      queueSave(next);
    },
    [queueSave, recordHistory]
  );

  const handleNodeChange = useCallback(
    (nextNode: SceneNode) => {
      applyEdit((prev) => ({ ...prev, nodes: updateNode(prev.nodes, nextNode.id, () => nextNode) }));
    },
    [applyEdit]
  );

  // Converts a picked image to a (downscaled) data URI stored directly in the
  // scene, so the texture travels with the scene JSON — it renders in the editor,
  // runtime preview, share link, and exported bundle with no serving needed.
  const uploadImage = useCallback((file: File) => fileToTextureDataUrl(file), []);

  // Insert a manually-added object (Add menu). If a group is selected, add it as
  // a child of that group (and expand it); otherwise add at the scene root.
  const addObject = useCallback(
    (spec: AddSpec) => {
      const prev = sceneRef.current;
      if (!prev) return;
      const node = createNodeFromSpec(spec, collectIds(prev.nodes));
      recordHistory(prev, true);

      const parent = primaryId ? findNode(prev.nodes, primaryId) : null;
      let nextNodes: SceneNode[];
      if (parent && parent.type === "group") {
        nextNodes = updateNode(prev.nodes, parent.id, (g) => (g.type === "group" ? { ...g, children: [...g.children, node] } : g));
        setCollapsedIds((current) => {
          if (!current.has(parent.id)) return current;
          const next = new Set(current);
          next.delete(parent.id);
          return next;
        });
      } else {
        nextNodes = [...prev.nodes, node];
      }

      const next = { ...prev, nodes: nextNodes };
      setScene(next);
      queueSave(next);
      setSelectedIds([node.id]);
    },
    [recordHistory, queueSave, primaryId]
  );

  // Commit a transform from the viewport gizmo (one undo step per drag).
  const commitGizmo = useCallback(
    (position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => {
      if (!primaryId) return;
      applyEdit((prev) => ({
        ...prev,
        nodes: updateNode(prev.nodes, primaryId, (node) => ({ ...node, transform: { position, rotation, scale } }))
      }));
    },
    [applyEdit, primaryId]
  );

  // Apply one transform function to every selected node at once (bulk move /
  // rotate / scale from the multi-select Inspector).
  const handleBulkChange = useCallback(
    (ids: string[], updater: (node: SceneNode) => SceneNode) => {
      applyEdit((prev) => {
        let nodes = prev.nodes;
        for (const id of ids) nodes = updateNode(nodes, id, updater);
        return { ...prev, nodes };
      });
    },
    [applyEdit]
  );

  const undo = useCallback(() => {
    const prev = historyRef.current.undo.pop();
    if (prev === undefined) return;
    if (sceneRef.current) historyRef.current.redo.push(sceneRef.current);
    burstRef.current = false;
    setScene(prev);
    void save(prev);
    syncHistoryFlags();
  }, [save, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = historyRef.current.redo.pop();
    if (next === undefined) return;
    if (sceneRef.current) historyRef.current.undo.push(sceneRef.current);
    burstRef.current = false;
    setScene(next);
    void save(next);
    syncHistoryFlags();
  }, [save, syncHistoryFlags]);

  // Outliner/canvas selection with modifier keys: cmd/ctrl toggles a node in the
  // set, shift selects the contiguous range from the primary, plain click resets.
  const selectNode = useCallback(
    (id: string, modifiers: { additive?: boolean; range?: boolean }, order: SceneNode[]) => {
      setSelectedIds((current) => {
        if (modifiers.range && current.length > 0) {
          const ids = order.map((n) => n.id);
          const anchor = ids.indexOf(current[current.length - 1]);
          const target = ids.indexOf(id);
          if (anchor >= 0 && target >= 0) {
            const [lo, hi] = anchor < target ? [anchor, target] : [target, anchor];
            return ids.slice(lo, hi + 1);
          }
          return [id];
        }
        if (modifiers.additive) {
          return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
        }
        return [id];
      });
    },
    []
  );

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    // In refine mode the style/mood guidance would fight the "smallest edit"
    // instruction, so only attach it when building a new scene.
    const composed = mode === "refine" ? prompt.trim() : composePrompt(prompt, styleId, modifierIds);
    // Live build-up streams nodes in as the AI writes them — best for NEW scenes.
    const streaming = liveBuild && mode === "new";
    setGenerating(true);
    setStage(mode === "refine" ? "Refining the scene" : "Designing the scene");
    setSaveState("saving");
    if (scene) recordHistory(scene, true); // standalone undo entry for the generate
    if (streaming) {
      // Start from an empty canvas (keep current camera/background) so objects pop in.
      setScene((current) => ({ metadata: { name: "Building…", version: 1 }, background: current?.background, camera: current?.camera, nodes: [] }));
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/scene3d/agent-run`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          prompt: composed,
          mode,
          selectedObjectId: mode === "refine" ? primaryId ?? undefined : undefined,
          stream: streaming
        })
      });

      // Read the newline-delimited stream: progress | partial-node | result | error.
      let result: { scene: Scene3D } | null = null;
      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (; ;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            try {
              const event = JSON.parse(line) as { type: string; stage?: string; node?: SceneNode; result?: { scene: Scene3D } };
              if (event.type === "progress" && event.stage) setStage(event.stage);
              else if (event.type === "partial-node" && event.node && streaming) {
                const node = event.node;
                setScene((current) => (current ? { ...current, nodes: [...current.nodes, node] } : current));
              } else if (event.type === "result" && event.result) result = event.result;
            } catch {
              // ignore partial/non-JSON lines
            }
          }
        }
      }

      if (result) {
        setScene(result.scene); // settle to the validated final scene
        setSaveState("saved");
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    } finally {
      setGenerating(false);
      setStage("");
    }
  }, [projectId, prompt, mode, liveBuild, primaryId, styleId, modifierIds, scene, recordHistory]);

  const deleteSelected = useCallback(() => {
    const prev = sceneRef.current;
    if (!prev || selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    const next = { ...prev, nodes: removeNodesFromTree(prev.nodes, ids) };
    recordHistory(prev, true);
    setScene(next);
    queueSave(next);
    setSelectedIds([]);
  }, [selectedIds, recordHistory, queueSave]);

  const duplicateSelected = useCallback(() => {
    const prev = sceneRef.current;
    if (!prev || selectedIds.length === 0) return;
    const existing = collectIds(prev.nodes);
    const clones: SceneNode[] = [];
    for (const id of selectedIds) {
      const node = findNode(prev.nodes, id);
      if (node) clones.push(cloneWithNewIds(node, existing, true));
    }
    if (clones.length === 0) return;
    const next = { ...prev, nodes: [...prev.nodes, ...clones] };
    recordHistory(prev, true);
    setScene(next);
    queueSave(next);
    setSelectedIds(clones.map((c) => c.id));
  }, [selectedIds, recordHistory, queueSave]);

  // Keyboard shortcuts: ⌘/Ctrl+Z undo, +Shift+Z redo, ⌘/Ctrl+A select all,
  // ⌘/Ctrl+D duplicate, Delete/Backspace remove, Esc clear selection. Only
  // text-entry fields (the prompt box) suppress these — slider/color/select
  // inputs in the Inspector do not, so shortcuts work right after an edit.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEntry(event.target as HTMLElement | null)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && key === "a") {
        event.preventDefault();
        setSelectedIds(flattenNodes(sceneRef.current?.nodes ?? []).map((n) => n.id));
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        setSelectedIds([]);
      } else if (!mod && key === "w") {
        setGizmoMode("translate");
      } else if (!mod && key === "e") {
        setGizmoMode("rotate");
      } else if (!mod && key === "r") {
        setGizmoMode("scale");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicateSelected, deleteSelected]);

  const toggleModifier = useCallback((id: string) => {
    setModifierIds((current) => (current.includes(id) ? current.filter((m) => m !== id) : [...current, id]));
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Persist which groups are collapsed, per project, across reloads.
  useEffect(() => {
    saveCollapsed(projectId, collapsedIds);
  }, [projectId, collapsedIds]);

  // Persist the per-project "allow floating" lint preference.
  useEffect(() => {
    saveAllowFloating(projectId, allowFloating);
  }, [projectId, allowFloating]);

  // Persist gizmo preferences (editor-wide, across projects and reloads).
  useEffect(() => {
    saveGizmoPrefs({ mode: gizmoMode, space: gizmoSpace, snap: gizmoSnap });
  }, [gizmoMode, gizmoSpace, gizmoSnap]);

  // Persist the inspector collapsed preference (editor-wide).
  useEffect(() => {
    saveInspectorCollapsed(inspectorCollapsed);
  }, [inspectorCollapsed]);

  const selectedNode = useMemo(() => (scene && primaryId ? findNode(scene.nodes, primaryId) : null), [scene, primaryId]);
  // The visible outliner rows: a depth-tagged walk that stops descending into
  // collapsed groups, so children of a collapsed group are hidden.
  const visibleRows = useMemo(() => {
    const rows: { node: SceneNode; depth: number }[] = [];
    const walk = (nodes: SceneNode[], depth: number) => {
      for (const node of nodes) {
        rows.push({ node, depth });
        if (node.type === "group" && !collapsedIds.has(node.id)) walk(node.children, depth + 1);
      }
    };
    if (scene) walk(scene.nodes, 0);
    return rows;
  }, [scene, collapsedIds]);
  // Plain node list of what's visible, for shift-click range selection.
  const visibleNodes = useMemo(() => visibleRows.map((r) => r.node), [visibleRows]);
  const selectedNodes = useMemo(
    () => (scene ? selectedIds.map((id) => findNode(scene.nodes, id)).filter((n): n is SceneNode => n !== null) : []),
    [scene, selectedIds]
  );
  // Collapse the inspector to an icon rail on desktop (applies to single, multi,
  // and empty selection — each renders its own rail + flyout).
  const paneCollapsed = inspectorCollapsed && isWide;

  // Live spatial linting — the same checks the agent runs, surfaced as warnings.
  const lintIssues = useMemo(() => (scene ? lintScene(scene, { allowFloating }) : []), [scene, allowFloating]);
  const issuesByNode = useMemo(() => {
    const map = new Map<string, LintIssue[]>();
    for (const issue of lintIssues) {
      for (const id of issue.nodeIds) {
        const list = map.get(id) ?? [];
        list.push(issue);
        map.set(id, list);
      }
    }
    return map;
  }, [lintIssues]);

  // One-click deterministic fix for the groundable issues (floating/sunk).
  const fixGrounding = useCallback(() => {
    const prev = sceneRef.current;
    if (!prev) return;
    const { scene: fixed, applied } = autoFixScene(prev, { ground: true, allowFloating });
    if (applied.length === 0) return;
    recordHistory(prev, true);
    setScene(fixed);
    queueSave(fixed);
  }, [recordHistory, queueSave, allowFloating]);

  useEffect(() => {
    if (selectedIds.length > 0) setMobilePanel("inspector");
  }, [selectedIds]);

  if (!scene) {
    return <div className={styles.loading}>Loading scene…</div>;
  }

  const cam = scene.camera ?? {};

  return (
    <div className={styles.shell}>


      <div className={styles.body}>
        <aside className={mobileAsideClass(`${styles.panel} ${styles.panelLeft}`, mobilePanel !== "inspector")}>
          <div className={mobileSectionClass(styles.composer, mobilePanel === "compose")}>
            <div className={styles.mobilePanelHeader}>
              <div className={styles.mobilePanelHandle} />
              <div className={styles.mobilePanelTitleRow}>
                <strong>Prompt</strong>
                <span>{mode === "refine" ? "Targeted change" : "New scene generation"}</span>
              </div>
            </div>
            <div className={styles.mobilePanelBody}>
              <div className={styles.topbar}>
                <div className={styles.modeToggle}>
                  <button className={modeBtnClass(mode === "new")} onClick={() => setMode("new")} title="Build a brand-new scene from the prompt">
                    New
                  </button>
                  <button className={modeBtnClass(mode === "refine")} onClick={() => setMode("refine")} title="Edit the current scene with a small change">
                    Refine
                  </button>
                  {mode === "new" ? (
                    <label className={styles.liveToggle} title="Watch objects appear as the AI writes them">
                      <input type="checkbox" checked={liveBuild} onChange={(event) => setLiveBuild(event.target.checked)} />
                      Live build
                    </label>
                  ) : null}
                </div>
                <textarea
                  className={styles.promptInput}
                  placeholder={mode === "refine" ? "Describe a change to the current scene…" : "Describe a scene for the AI to build…"}
                  rows={8}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void generate();
                  }}
                  disabled={generating}
                />
                <button className={styles.button} onClick={() => void generate()} disabled={generating || !prompt.trim()}>
                  {generating ? (mode === "refine" ? "Refining…" : "Generating…") : mode === "refine" ? "Refine" : "Generate"}
                </button>

                <span className={styles.spacer} />
                {generating && stage ? (
                  <span className={styles.progressPill}>
                    <span className={styles.pulseDot} />
                    {stage}…
                  </span>
                ) : (
                  <span className={saveBadgeClass(saveState)}>{saveLabel(saveState)}</span>
                )}
              </div>

              {mode === "new" ? (
                <ComposerControls
                  styleId={styleId}
                  onStyle={setStyleId}
                  modifierIds={modifierIds}
                  onToggleModifier={toggleModifier}
                  onPickExample={setPrompt}
                />
              ) : null}

              {mode === "refine" ? (
                <div className={styles.chipRow}>
                  <span className={styles.chipLabel}>Editing</span>
                  {selectedNode ? (
                    <>
                      <span className={styles.targetChip}>{selectedNode.name ?? selectedNode.id}</span>
                      <span className={styles.refineHint}>— “this” / “it” targets it</span>
                    </>
                  ) : (
                    <span className={styles.refineHint}>whole scene — select an object to target it</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <div className={mobileSectionClass(`${styles.outliner} ${styles.panel}`, mobilePanel === "outliner")}>
            <div className={styles.mobilePanelHeader}>
              <div className={styles.mobilePanelHandle} />
              <div className={styles.mobilePanelTitleRow}>
                <strong>Layers</strong>
                <span>{visibleRows.length} visible nodes</span>
              </div>
            </div>
            <div className={styles.mobilePanelBody}>
              <div className={styles.outlinerHeader}>
                <span className={styles.panelTitle}>
                  Outliner{selectedIds.length > 1 ? ` · ${selectedIds.length} selected` : ""}
                </span>
                <span className={styles.outlinerActions}>
                  {allowFloating || lintIssues.some((i) => i.code === "floating") ? (
                    <button
                      className={allowFloating ? `${styles.floatToggle} ${styles.floatToggleActive}` : styles.floatToggle}
                      onClick={() => setAllowFloating((v) => !v)}
                      title="Allow floating objects — don't warn when objects hover above the floor (e.g. a floating island)."
                    >
                      float
                    </button>
                  ) : null}
                  {lintIssues.length > 0 ? (
                    <button
                      className={styles.warnChip}
                      onClick={fixGrounding}
                      title={`${lintIssues.map((i) => `• ${i.message}`).join("\n")}\n\nClick to ground floating/sunk objects.`}
                    >
                      ⚠ {lintIssues.length}
                    </button>
                  ) : null}
                </span>
              </div>
              {visibleRows.map(({ node, depth }) => {
                const isSelected = selectedIds.includes(node.id);
                const isPrimary = node.id === primaryId;
                const isGroup = node.type === "group";
                const collapsed = collapsedIds.has(node.id);
                return (
                  <button
                    key={node.id}
                    onClick={(event) =>
                      selectNode(node.id, { additive: event.metaKey || event.ctrlKey, range: event.shiftKey }, visibleNodes)
                    }
                    className={outlineRowClass(isPrimary, isSelected) + " " + nodeClass(node)}
                    style={{ paddingLeft: 8 + depth * 14 }}
                    title={node.name ?? node.id}
                  >
                    {isGroup ? (
                      <span
                        className={styles.collapseToggle}
                        role="button"
                        aria-label={collapsed ? "Expand group" : "Collapse group"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCollapse(node.id);
                        }}
                      >
                        {collapsed ? "▸" : "▾"}
                      </span>
                    ) : (
                      <span className={styles.collapseSpacer} />
                    )}
                    <span className={styles.glyph}>{glyph(node)}</span>
                    {node.name ?? node.id}
                    {warnBadge(issuesByNode.get(node.id))}
                  </button>
                );
              })}
              <div className={styles.outlineHint}>⌘/Ctrl-click to add · Shift-click for range</div>
            </div>

          </div>

        </aside>

        <main className={styles.canvasMain}>
          {selectedIds.length > 0 ? (
            <div className={styles.selBadge}>
              {selectedIds.length === 1 ? selectedNode?.name ?? selectedNode?.id ?? "1 selected" : `${selectedIds.length} selected`}
            </div>
          ) : null}
          <div className={styles.gizmoBar}>
            <div className={styles.gizmoGroup}>
              <button
                className={`${styles.gizmoBtn} ${styles.gizmoIconBtn}`}
                onClick={undo}
                disabled={!canUndo}
                title="Undo (⌘/Ctrl+Z)"
                aria-label="Undo (Command or Control Z)"
              >
                <UndoIcon />
              </button>
              <button
                className={`${styles.gizmoBtn} ${styles.gizmoIconBtn}`}
                onClick={redo}
                disabled={!canRedo}
                title="Redo (⌘/Ctrl+Shift+Z)"
                aria-label="Redo (Command or Control Shift Z)"
              >
                <RedoIcon />
              </button>

            </div>
            {selectedIds.length === 1 ? (
              <div className={styles.gizmoGroup}>
                {(["translate", "rotate", "scale"] as const).map((m) => (
                  <button
                    key={m}
                    className={`${gizmoBtnClass(gizmoMode === m)} ${styles.gizmoIconBtn}`}
                    onClick={() => setGizmoMode(m)}
                    title={`${gizmoLabel(m)} (${gizmoKey(m)})`}
                    aria-label={`${gizmoLabel(m)} (${gizmoKey(m)})`}
                  >
                    {gizmoModeIcon(m)}
                  </button>
                ))}
                {/* World/Local + Snap — inline on desktop; tucked behind ⋯ on mobile. */}
                <button
                  className={`${gizmoBtnClass(gizmoMoreOpen)} ${styles.gizmoIconBtn} ${styles.gizmoMoreBtn}`}
                  onClick={() => setGizmoMoreOpen((v) => !v)}
                  title="More transform options"
                  aria-label="More transform options"
                  aria-expanded={gizmoMoreOpen}
                >
                  ⋯
                </button>
                <span className={gizmoMoreOpen ? `${styles.gizmoExtras} ${styles.gizmoExtrasOpen}` : styles.gizmoExtras}>
                  <span className={styles.gizmoDivider} />
                  <button
                    className={gizmoBtnClass(false)}
                    onClick={() => setGizmoSpace((s) => (s === "world" ? "local" : "world"))}
                    title="Toggle transform space"
                  >
                    {gizmoSpace === "world" ? "World" : "Local"}
                  </button>
                  <button className={gizmoBtnClass(gizmoSnap)} onClick={() => setGizmoSnap((s) => !s)} title="Snap to grid / 15° / 0.1">
                    Snap
                  </button>
                </span>
              </div>
            ) : null}
            {selectedIds.length > 0 ? (
              <div className={`${styles.gizmoGroup} ${styles.gizmoGroupDanger}`}>
                <button
                  className={`${styles.gizmoBtn} ${styles.gizmoIconBtn} ${styles.gizmoDangerBtn}`}
                  onClick={deleteSelected}
                  title="Delete selected (Delete / Backspace)"
                  aria-label="Delete selected"
                >
                  <TrashIcon />
                </button>
              </div>
            ) : null}
                                                      <AddObjectMenu onAdd={addObject} />

          </div>

          <Canvas shadows camera={{ position: cam.position ?? [3.4, 2.6, 4.4], fov: cam.fov ?? 45 }} onPointerMissed={() => setSelectedIds([])}>
            <SceneView
              scene={scene}
              selectedIds={selectedIds}
              onSelect={(id) => selectNode(id, { additive: additiveRef.current }, visibleNodes)}
            />
            <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={20} blur={2.4} far={8} />
            <OrbitControls makeDefault target={cam.target ?? [0, 1, 0]} />
            <Gizmo
              selectedId={selectedIds.length === 1 ? primaryId : null}
              mode={gizmoMode}
              space={gizmoSpace}
              snap={gizmoSnap}
              sceneObj={scene}
              onCommit={commitGizmo}
            />
          </Canvas>
        </main>

        <aside
          className={mobileAsideClass(`${styles.panel} ${styles.panelRight}${paneCollapsed ? ` ${styles.panelRightCollapsed}` : ""}`, mobilePanel === "inspector")}
        >
          <div className={mobileSectionClass(styles.inspectorPane, mobilePanel === "inspector")}>
            <div className={styles.mobilePanelHeader}>
              <div className={styles.mobilePanelHandle} />
              <div className={styles.mobilePanelTitleRow}>
                <strong>Inspector</strong>
                <span>{selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select a node to edit"}</span>
              </div>
            </div>
            <div className={styles.mobilePanelBody}>
              {selectedNodes.length > 1 ? (
                <MultiInspector
                  nodes={selectedNodes}
                  onApply={(updater) => handleBulkChange(selectedIds, updater)}
                  collapsed={paneCollapsed}
                  onToggleCollapse={isWide ? () => setInspectorCollapsed((v) => !v) : undefined}
                />
              ) : (
                <Inspector
                  node={selectedNode}
                  onChange={handleNodeChange}
                  onUploadImage={uploadImage}
                  collapsed={paneCollapsed}
                  onToggleCollapse={isWide ? () => setInspectorCollapsed((v) => !v) : undefined}
                />
              )}
            </div>
          </div>
        </aside>

        {/* Mobile panel switcher — pinned to the bottom of the scrolling body so
            it stays reachable no matter how far you scroll into a panel. */}
        <div className={styles.mobileDock} role="tablist" aria-label="Editor panels">
          <button
            type="button"
            className={mobileTabClass(mobilePanel === "compose")}
            onClick={() => setMobilePanel("compose")}
            aria-selected={mobilePanel === "compose"}
          >
            <span>Prompt</span>
          </button>
          <button
            type="button"
            className={mobileTabClass(mobilePanel === "outliner")}
            onClick={() => setMobilePanel("outliner")}
            aria-selected={mobilePanel === "outliner"}
          >
            <span>Layers</span>
            <span className={styles.mobileCount}>{visibleRows.length}</span>
          </button>
          <button
            type="button"
            className={mobileTabClass(mobilePanel === "inspector")}
            onClick={() => setMobilePanel("inspector")}
            aria-selected={mobilePanel === "inspector"}
          >
            <span>Inspector</span>
            {selectedIds.length > 0 ? <span className={styles.mobileCount}>{selectedIds.length}</span> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

type GizmoMode = "translate" | "rotate" | "scale";

// Viewport transform gizmo — attaches drei's TransformControls to the selected
// node's Object3D (found by name = node id) and commits the result to the scene
// JSON when the drag ends. `sceneObj` is passed only so the effect re-finds the
// object after the scene re-renders it as a fresh instance. drei auto-disables
// the default OrbitControls while dragging.
function Gizmo({
  selectedId,
  mode,
  space,
  snap,
  sceneObj,
  onCommit
}: {
  selectedId: string | null;
  mode: GizmoMode;
  space: "world" | "local";
  snap: boolean;
  sceneObj: unknown;
  onCommit: (position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void;
}) {
  const scene = useThree((state) => state.scene);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null);
  const [target, setTarget] = useState<Object3D | null>(null);

  // Re-find the object whenever the selection or the scene (re)renders.
  useEffect(() => {
    setTarget(selectedId ? scene.getObjectByName(selectedId) ?? null : null);
  }, [selectedId, scene, sceneObj]);

  // Commit only when a drag ends (avoids re-rendering the object mid-drag).
  useEffect(() => {
    const node = controls.current;
    if (!node) return;
    const onDragging = (event: { value: boolean }) => {
      if (event.value) return;
      const obj = node.object as Object3D | undefined;
      if (!obj) return;
      onCommit(
        [obj.position.x, obj.position.y, obj.position.z],
        [obj.rotation.x, obj.rotation.y, obj.rotation.z],
        [obj.scale.x, obj.scale.y, obj.scale.z]
      );
    };
    node.addEventListener("dragging-changed", onDragging);
    return () => node.removeEventListener("dragging-changed", onDragging);
  }, [onCommit, target]);

  if (!target) return null;
  return (
    <TransformControls
      ref={controls}
      object={target}
      mode={mode}
      space={space}
      translationSnap={snap ? 0.25 : null}
      rotationSnap={snap ? Math.PI / 12 : null}
      scaleSnap={snap ? 0.1 : null}
    />
  );
}

function gizmoLabel(mode: GizmoMode): string {
  return mode === "translate" ? "Move" : mode === "rotate" ? "Rotate" : "Scale";
}

function gizmoKey(mode: GizmoMode): string {
  return mode === "translate" ? "W" : mode === "rotate" ? "E" : "R";
}

function gizmoModeIcon(mode: GizmoMode): ReactNode {
  if (mode === "translate") return <MoveIcon />;
  if (mode === "rotate") return <RotateIcon />;
  return <ScaleIcon />;
}

function gizmoBtnClass(active: boolean): string {
  return active ? `${styles.gizmoBtn} ${styles.gizmoBtnActive}` : styles.gizmoBtn;
}

function mobileSectionClass(base: string, active: boolean): string {
  return active ? `${base} ${styles.mobileSection} ${styles.mobileSectionActive}` : `${base} ${styles.mobileSection}`;
}

function mobileTabClass(active: boolean): string {
  return active ? `${styles.mobileTab} ${styles.mobileTabActive}` : styles.mobileTab;
}

function mobileAsideClass(base: string, active: boolean): string {
  return active ? `${base} ${styles.mobileAside} ${styles.mobileAsideActive}` : `${base} ${styles.mobileAside}`;
}

// Reads a File as a data URI.
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decode failed"));
    image.src = src;
  });
}

// Produces a data URI for the image: downscaled to <= maxSize and re-encoded as
// JPEG when the image is opaque (much smaller) or PNG when it has transparency.
// Keeps the embedded texture small so the scene JSON stays light to save/load.
async function fileToTextureDataUrl(file: File, maxSize = 512): Promise<string> {
  const original = await readDataUrl(file);
  const image = await loadImage(original);
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(image, 0, 0, width, height);

  return imageHasAlpha(ctx, width, height) ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
}

// True if any pixel is non-opaque (so we must keep PNG to preserve transparency).
function imageHasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return true; // tainted canvas (cross-origin) — assume alpha, keep PNG
  }
}

// Editor-wide gizmo preferences (mode/space/snap), persisted across reloads.
interface GizmoPrefs {
  mode: GizmoMode;
  space: "world" | "local";
  snap: boolean;
}
const GIZMO_PREFS_KEY = "s3d:gizmo";

function loadGizmoPrefs(): GizmoPrefs {
  const fallback: GizmoPrefs = { mode: "translate", space: "world", snap: false };
  try {
    const raw = localStorage.getItem(GIZMO_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GizmoPrefs>;
    return {
      mode: parsed.mode === "rotate" || parsed.mode === "scale" ? parsed.mode : "translate",
      space: parsed.space === "local" ? "local" : "world",
      snap: parsed.snap === true
    };
  } catch {
    return fallback;
  }
}

function saveGizmoPrefs(prefs: GizmoPrefs): void {
  try {
    localStorage.setItem(GIZMO_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable — preferences just won't persist.
  }
}

// Editor-wide "inspector collapsed to a rail" preference.
const INSPECTOR_COLLAPSED_KEY = "s3d:inspectorCollapsed";

function loadInspectorCollapsed(): boolean {
  try {
    return localStorage.getItem(INSPECTOR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveInspectorCollapsed(value: boolean): void {
  try {
    localStorage.setItem(INSPECTOR_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // localStorage unavailable — preference just won't persist.
  }
}

// Tracks whether the viewport is at least `px` wide (for desktop-only behaviors).
function useMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(`(min-width: ${px}px)`).matches);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setMatches(query.matches);
    query.addEventListener("change", onChange);
    onChange();
    return () => query.removeEventListener("change", onChange);
  }, [px]);
  return matches;
}

// Undo/redo history for the current project, held outside the component so it
// survives the editor unmounting (e.g. switching to the runtime preview and back).
// Only the current project's history is retained — switching projects starts fresh.
interface EditorHistory {
  projectId: string;
  undo: Scene3D[];
  redo: Scene3D[];
}
let editorHistoryStore: EditorHistory | null = null;
function getEditorHistory(projectId: string): EditorHistory {
  if (!editorHistoryStore || editorHistoryStore.projectId !== projectId) {
    editorHistoryStore = { projectId, undo: [], redo: [] };
  }
  return editorHistoryStore;
}

// Per-project persistence of collapsed outliner groups (survives reloads).
const COLLAPSE_KEY = (projectId: string) => `s3d:collapsed:${projectId}`;

function loadCollapsed(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY(projectId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsed(projectId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSE_KEY(projectId), JSON.stringify([...ids]));
  } catch {
    // localStorage unavailable (private mode / quota) — collapse just won't persist.
  }
}

// Per-project "allow floating" lint preference.
const ALLOW_FLOATING_KEY = (projectId: string) => `s3d:allowFloating:${projectId}`;

function loadAllowFloating(projectId: string): boolean {
  try {
    return localStorage.getItem(ALLOW_FLOATING_KEY(projectId)) === "1";
  } catch {
    return false;
  }
}

function saveAllowFloating(projectId: string, value: boolean): void {
  try {
    localStorage.setItem(ALLOW_FLOATING_KEY(projectId), value ? "1" : "0");
  } catch {
    // localStorage unavailable — preference just won't persist.
  }
}

// Only true text-entry fields should swallow editor shortcuts. Range/color/
// checkbox inputs and selects (the Inspector) must NOT, or shortcuts would stop
// working until the canvas is clicked.
function isTextEntry(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return ["text", "search", "url", "email", "tel", "password", "number", ""].includes(type);
  }
  return false;
}

// Recursively drop any node whose id is in `ids` (used by Delete).
function removeNodesFromTree(nodes: SceneNode[], ids: Set<string>): SceneNode[] {
  return nodes
    .filter((node) => !ids.has(node.id))
    .map((node) => (node.type === "group" ? { ...node, children: removeNodesFromTree(node.children, ids) } : node));
}

function collectIds(nodes: SceneNode[]): Set<string> {
  return new Set(flattenNodes(nodes).map((n) => n.id));
}

function uniqueId(base: string, existing: Set<string>): string {
  let candidate = `${base}-copy`;
  let i = 2;
  while (existing.has(candidate)) candidate = `${base}-copy-${i++}`;
  return candidate;
}

function reassignIds(node: SceneNode, existing: Set<string>): void {
  node.id = uniqueId(node.id, existing);
  existing.add(node.id);
  if (node.type === "group") node.children.forEach((child) => reassignIds(child, existing));
}

// Deep-clone a node with fresh unique ids (so duplicates are independent). The
// top-level copy is nudged so it doesn't sit exactly on the original.
function cloneWithNewIds(node: SceneNode, existing: Set<string>, nudge: boolean): SceneNode {
  const clone = structuredClone(node) as SceneNode;
  reassignIds(clone, existing);
  if (nudge) {
    const t = normalizeTransform(clone.transform);
    clone.transform = { ...t, position: [t.position[0] + 0.4, t.position[1], t.position[2] + 0.4] };
  }
  return clone;
}

// A ⚠ badge on an outliner row when the node has spatial lint issues; red for
// errors (floating/sunk/deep overlap), amber for warnings (scale).
function warnBadge(issues: LintIssue[] | undefined): React.ReactNode {
  if (!issues || issues.length === 0) return null;
  const hasError = issues.some((issue) => issue.severity === "error");
  return (
    <span className={`${styles.warnBadge} ${hasError ? styles.warnError : styles.warnWarn}`} title={issues.map((issue) => issue.message).join("\n")}>
      ⚠
    </span>
  );
}

function glyph(node: SceneNode): string {
  switch (node.type) {
    case "group":
      return "▣";
    case "light":
      return "✦";
    case "model":
      return "◆";
    default:
      return "●";
  }
}

// Groups read as headers; indentation is handled per-row by computed paddingLeft.
function nodeClass(node: SceneNode): string {
  return node.type === "group" ? styles.groupNode : "";
}

function saveLabel(state: SaveState): string {
  return state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Save failed" : "";
}

function modeBtnClass(active: boolean): string {
  return active ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn;
}

function outlineRowClass(isPrimary: boolean, isSelected: boolean): string {
  if (isPrimary) return `${styles.outlineRow} ${styles.outlineRowPrimary}`;
  if (isSelected) return `${styles.outlineRow} ${styles.outlineRowSelected}`;
  return styles.outlineRow;
}

function saveBadgeClass(state: SaveState): string {
  if (state === "error") return `${styles.saveBadge} ${styles.saveBadgeError}`;
  if (state === "saved") return `${styles.saveBadge} ${styles.saveBadgeSaved}`;
  return styles.saveBadge;
}
