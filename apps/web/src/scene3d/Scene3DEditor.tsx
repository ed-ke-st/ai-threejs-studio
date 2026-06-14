// Scene3DEditor — the real product editor surface, on the shared renderer.
// It loads the Scene3D JSON from the API, renders it through the same SceneView
// interpreter the preview/share/export use, edits it with the structured
// Inspector, and saves back (which also refreshes the running preview, since the
// project's Vite server reads the same scene.config.json). It can also ask the
// Scene3D agent to (re)generate the scene from a prompt.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, TransformControls } from "@react-three/drei";
import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from "three";
import { SceneView } from "@ai-threejs-studio/scene3d/react";
import { DEFAULT_CAMERA, animationDuration, autoFixScene, findNode, flattenNodes, getActiveCamera, getCameras, lintScene, moveAnimationKeyframe, normalizeTransform, removeAnimationKeyframe, removeAnimationTrack, sampleTrack, updateNode, upsertAnimationKeyframe, type AnimatableProperty, type Animation, type Camera, type LintIssue, type Scene3D, type SceneNode, type Transform } from "@ai-threejs-studio/scene3d";
import { CameraInspector, Inspector, MultiInspector } from "./Inspector";
import { ComposerControls } from "./ComposerControls";
import { AddObjectMenu } from "./AddObjectMenu";
import { CameraMenu } from "./CameraMenu";
import { SceneSettingsMenu } from "./SceneSettingsMenu";
import { ExportMenu } from "./ExportMenu";
import { useSceneCapture } from "./useSceneCapture";
import { Timeline } from "./Timeline";
import { createNodeFromSpec, type AddSpec } from "./sceneFactory";
import { composePrompt } from "./promptComposer";
import { GroupIcon, MoveIcon, RedoIcon, RotateIcon, ScaleIcon, TrashIcon, UndoIcon, UngroupIcon } from "../ui/icons";
import { authHeaders } from "../auth/supabaseClient";
import { useProjectStore } from "../stores/projectStore";
import styles from "./Scene3DEditor.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";
type MobilePanel = "compose" | "outliner" | "inspector";
type ReferenceImage = { dataUrl: string; name: string };
type TurnStatus = "success" | "error" | "partial" | "cancelled";
interface SceneVariation {
  id: string;
  label: string;
  scene: Scene3D;
  issues?: string[];
  attempts?: number;
  ok?: boolean;
}
interface VariationSet {
  id: string;
  prompt: string;
  baseScene: Scene3D;
  candidates: SceneVariation[];
  previewId: string | null;
}
interface ComposerTurn {
  id: string;
  createdAt: string;
  mode: "new" | "refine";
  prompt: string;
  hasReferenceImage: boolean;
  selectedLabel?: string;
  status: TurnStatus;
  message?: string;
  beforeScene: Scene3D;
  afterScene?: Scene3D;
}

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
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
  const [mode, setMode] = useState<"new" | "refine">("new");
  const [variationsEnabled, setVariationsEnabled] = useState(false);
  const [variationSet, setVariationSet] = useState<VariationSet | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [agentError, setAgentError] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<string | null>(null);
  const [turnLog, setTurnLog] = useState<ComposerTurn[]>(() => loadTurnLog(projectId));
  const [turnLogOpen, setTurnLogOpen] = useState(() => loadTurnLog(projectId).length > 0);
  // Progress-pill extras: which model is running (from the stream's meta event)
  // and a ticking elapsed-seconds counter, so long runs visibly make progress.
  const [genModel, setGenModel] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  // Lets the Cancel button abort the in-flight run; the server notices the
  // closed connection and stops the model call.
  const generateAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!generating) return;
    const startedAt = Date.now();
    setElapsedSec(0);
    const timer = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [generating]);
  const usage = useProjectStore((s) => s.usage);
  const loadUsage = useProjectStore((s) => s.loadUsage);
  const logError = useProjectStore((s) => s.logError);
  const [liveBuild, setLiveBuild] = useState(true);
  // "Look through" frames the editor viewport through the active camera (what the
  // runtime sees) instead of the free-orbit editing camera.
  const [lookThrough, setLookThrough] = useState(false);
  const orbitRef = useRef<{ object: { position: { x: number; y: number; z: number } }; target: { x: number; y: number; z: number } } | null>(null);
  // Animation timeline: playhead + transport. The playhead is fed to SceneView as a
  // controlled animationTime while previewing (playing or scrubbed off zero), so the
  // viewport mirrors the timeline; at rest the object shows its static pose for editing.
  const [timelineOpen, setTimelineOpen] = useState(loadTimelineOpen);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  // True while the transform gizmo is being dragged — suspends the animation driver
  // so the node follows the gizmo instead of snapping back to its keyframed pose.
  const [gizmoDragging, setGizmoDragging] = useState(false);
  // True while the user orbits to reframe an animated camera mid-preview — same
  // driver suspension as the gizmo; the new framing is auto-keyed on release.
  const [cameraAdjusting, setCameraAdjusting] = useState(false);
  const cameraAdjustingRef = useRef(false);
  // Refs so the (stable) gizmo-commit handler can read live transport state for auto-key.
  const playheadRef = useRef(0);
  const playingRef = useRef(false);
  // The live THREE scene root, captured from inside the Canvas, so keying can read
  // the exact pose currently shown (static or animated) for the selected node.
  const sceneRootRef = useRef<Object3D | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("compose");
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>(() => loadGizmoPrefs().mode);
  const [gizmoSpace, setGizmoSpace] = useState<"world" | "local">(() => loadGizmoPrefs().space);
  const [gizmoSnap, setGizmoSnap] = useState(() => loadGizmoPrefs().snap);
  const [gizmoMoreOpen, setGizmoMoreOpen] = useState(false); // mobile: reveal World/Local + Snap
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => loadInspectorCollapsed());
  // Left aside (prompt + layers): collapsible to reclaim canvas, and width-resizable
  // by dragging its right edge. Both persisted editor-wide. Desktop only — on mobile
  // the panel is a full-width switched tab.
  const [leftCollapsed, setLeftCollapsed] = useState(() => loadLeftCollapsed());
  const [leftWidth, setLeftWidth] = useState<number | null>(() => loadLeftWidth());
  const leftResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  // The floating scene-tools dock (World / Camera / Capture) collapses to a single
  // button in both layouts.
  const [dockCollapsed, setDockCollapsed] = useState(() => loadDockCollapsed());
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

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Drive the playhead while playing (rAF, off the React render path until it
  // setStates each frame). Loops or stops at the end based on the animation.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const animation = sceneRef.current?.animation;
      const duration = animationDuration(animation);
      setPlayhead((prev) => {
        if (duration <= 0) return prev;
        const next = prev + dt;
        if (next < duration) return next;
        if (animation?.loop === false) {
          setPlaying(false);
          return duration;
        }
        return next % duration;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

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
    setVariationSet(null);
    setVariationsEnabled(false);
    const turns = loadTurnLog(projectId);
    setTurnLog(turns);
    setTurnLogOpen(turns.length > 0);
    // History is kept in the per-project module store (getEditorHistory), so it
    // survives an editor remount (e.g. switching to the runtime preview and back).
    historyRef.current = getEditorHistory(projectId);
    burstRef.current = false;
    syncHistoryFlags();
    void load();
  }, [projectId, load, syncHistoryFlags]);

  useEffect(() => {
    saveTurnLog(projectId, turnLog);
  }, [projectId, turnLog]);

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

  const appendTurn = useCallback((turn: Omit<ComposerTurn, "id">) => {
    setTurnLog((current) => {
      const next = [{ id: createTurnId(), ...turn }, ...current].slice(0, MAX_TURN_LOG);
      return next;
    });
    setTurnLogOpen(true);
  }, []);

  const revertTurn = useCallback(
    (turn: ComposerTurn) => {
      const current = sceneRef.current;
      if (current) recordHistory(current, true);
      setScene(turn.beforeScene);
      setSelectedIds([]);
      void save(turn.beforeScene);
      syncHistoryFlags();
    },
    [recordHistory, save, syncHistoryFlags]
  );

  const clearTurnLog = useCallback(() => {
    setTurnLog([]);
  }, []);

  const previewVariation = useCallback(
    (id: string) => {
      if (!variationSet) return;
      const candidate = variationSet.candidates.find((item) => item.id === id);
      if (!candidate) return;
      setScene(candidate.scene);
      setSelectedIds([]);
      setVariationSet({ ...variationSet, previewId: id });
      setSaveState("idle");
    },
    [variationSet]
  );

  const discardVariations = useCallback(() => {
    if (variationSet?.previewId) {
      setScene(variationSet.baseScene);
      setSelectedIds([]);
      setSaveState("saved");
    }
    setVariationSet(null);
  }, [variationSet]);

  const useVariation = useCallback(
    (id: string) => {
      if (!variationSet) return;
      const candidate = variationSet.candidates.find((item) => item.id === id);
      if (!candidate) return;
      recordHistory(variationSet.baseScene, true);
      setScene(candidate.scene);
      setSelectedIds([]);
      setVariationSet(null);
      void save(candidate.scene);
      appendTurn({
        createdAt: new Date().toISOString(),
        mode: "new",
        prompt: `${variationSet.prompt} (${candidate.label})`,
        hasReferenceImage: Boolean(referenceImage),
        status: "success",
        message: `Applied ${candidate.label} from ${variationSet.candidates.length} generated options.`,
        beforeScene: variationSet.baseScene,
        afterScene: candidate.scene
      });
    },
    [appendTurn, recordHistory, referenceImage, save, variationSet]
  );

  // Commit an Inspector edit. While previewing the timeline the Inspector shows
  // the pose sampled at the playhead (see `inspectorNode`), so a transform edit
  // there is auto-keyed on channels that already have tracks — mirroring the
  // gizmo's behavior. Non-transform edits (material, visibility, …) leave the
  // base transform and the tracks untouched.
  const handleNodeChange = useCallback(
    (nextNode: SceneNode) => {
      const previewing = playingRef.current || playheadRef.current > 1e-3;
      const time = Math.round(playheadRef.current * 1000) / 1000;
      applyEdit((prev) => {
        const prevNode = findNode(prev.nodes, nextNode.id);
        if (!previewing || !prev.animation || !prevNode) {
          return { ...prev, nodes: updateNode(prev.nodes, nextNode.id, () => nextNode) };
        }
        const sampled = sampleNodeTransform(prevNode, prev.animation, time);
        const edited = normalizeTransform(nextNode.transform);
        if (transformsEqual(edited, sampled)) {
          // The transform is just the sampled pose echoed back — keep the base.
          return { ...prev, nodes: updateNode(prev.nodes, nextNode.id, (node) => ({ ...nextNode, transform: node.transform })) };
        }
        let animation = prev.animation;
        const channels: [AnimatableProperty, number][] = [
          ["position.x", edited.position[0]], ["position.y", edited.position[1]], ["position.z", edited.position[2]],
          ["rotation.x", edited.rotation[0]], ["rotation.y", edited.rotation[1]], ["rotation.z", edited.rotation[2]],
          ["scale.x", edited.scale[0]], ["scale.y", edited.scale[1]], ["scale.z", edited.scale[2]], ["scale", edited.scale[0]]
        ];
        for (const [property, value] of channels) {
          if (animation.tracks.some((t) => t.targetId === nextNode.id && t.property === property)) {
            animation = upsertAnimationKeyframe(animation, nextNode.id, property, time, value);
          }
        }
        return { ...prev, nodes: updateNode(prev.nodes, nextNode.id, () => nextNode), animation };
      });
    },
    [applyEdit]
  );

  // Converts a picked image to a (downscaled) data URI stored directly in the
  // scene, so the texture travels with the scene JSON — it renders in the editor,
  // runtime preview, share link, and exported bundle with no serving needed.
  const uploadImage = useCallback((file: File) => fileToTextureDataUrl(file), []);

  const pickReferenceImage = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAgentError("Reference image must be an image file.");
      return;
    }
    try {
      const dataUrl = await fileToTextureDataUrl(file, 768);
      setReferenceImage({ dataUrl, name: file.name || "reference image" });
      setAgentError(null);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "Reference image could not be loaded.");
    }
  }, []);

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

  // (module helpers RootCapture + readChannel are defined at the bottom of the file)

  // Commit a transform from the viewport gizmo (one undo step per drag). When
  // previewing the timeline (playing or scrubbed off zero), channels that already
  // have a track are auto-keyed at the playhead instead of moving the static pose —
  // so posing the gizmo at different times builds the animation (Blender-style).
  const commitGizmo = useCallback(
    (position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => {
      if (!primaryId) return;
      const previewing = playingRef.current || playheadRef.current > 1e-3;
      const time = Math.round(playheadRef.current * 1000) / 1000;
      applyEdit((prev) => {
        const next: Scene3D = { ...prev, nodes: updateNode(prev.nodes, primaryId, (node) => ({ ...node, transform: { position, rotation, scale } })) };
        if (!previewing || !prev.animation) return next;
        const channels: [AnimatableProperty, number][] = [
          ["position.x", position[0]], ["position.y", position[1]], ["position.z", position[2]],
          ["rotation.x", rotation[0]], ["rotation.y", rotation[1]], ["rotation.z", rotation[2]],
          ["scale.x", scale[0]], ["scale.y", scale[1]], ["scale.z", scale[2]], ["scale", scale[0]]
        ];
        let animation = prev.animation;
        for (const [property, value] of channels) {
          if (animation.tracks.some((t) => t.targetId === primaryId && t.property === property)) {
            animation = upsertAnimationKeyframe(animation, primaryId, property, time, value);
          }
        }
        return { ...next, animation };
      });
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

  // `override` lets "Continue" re-run as a refine with the original prompt.
  const generate = useCallback(
    async (override?: { prompt?: string; mode?: "new" | "refine" }) => {
      const activeMode = override?.mode ?? mode;
      const typedPrompt = (override?.prompt ?? prompt).trim();
      if (!typedPrompt && !referenceImage) return;
      const rawPrompt = typedPrompt || "Build an editable 3D scene based on the attached reference image.";
      // In refine mode the style/mood guidance would fight the "smallest edit"
      // instruction, so only attach it when building a new scene.
      const composed = activeMode === "refine" ? rawPrompt : composePrompt(rawPrompt, styleId, modifierIds);
      const variationCount = activeMode === "new" && variationsEnabled && !override ? 3 : 1;
      const generatingVariations = variationCount > 1;
      // Live build-up streams nodes in as the AI writes them — best for NEW scenes.
      const streaming = liveBuild && activeMode === "new" && !generatingVariations;
      const beforeScene = sceneRef.current ?? scene;
      if (!beforeScene) return;
      const turnBase = {
        createdAt: new Date().toISOString(),
        mode: activeMode,
        prompt: rawPrompt,
        hasReferenceImage: Boolean(referenceImage),
        selectedLabel: activeMode === "refine" ? turnSelectedLabel(beforeScene, primaryId) : undefined,
        beforeScene
      };
      setGenerating(true);
      setVariationSet(null);
      setAgentError(null);
      setResumePrompt(null);
      setGenModel(null);
      setStage(generatingVariations ? "Designing 3 options" : activeMode === "refine" ? "Refining the scene" : "Designing the scene");
      const abort = new AbortController();
      generateAbortRef.current = abort;
      setSaveState(generatingVariations ? "idle" : "saving");
      if (!generatingVariations) recordHistory(beforeScene, true); // standalone undo entry for the generate
      if (streaming) {
        // Start from an empty canvas (keep current camera/background) so objects pop in.
        setScene((current) => ({ metadata: { name: "Building…", version: 1 }, background: current?.background, camera: current?.camera, nodes: [] }));
      }

      // On failure: if a streaming run already produced objects, keep + save them
      // and offer to continue, rather than discarding the partial work.
      const failed = (detail: string, status: Extract<TurnStatus, "error" | "cancelled"> = "error") => {
        logError(activeMode === "refine" ? "Refine failed" : "Generation failed", detail);
        const partial = streaming ? sceneRef.current : null;
        if (partial && partial.nodes.length > 0) {
          setAgentError(`${detail} — kept the ${partial.nodes.length} object(s) made so far; continue to add the rest, or keep editing.`);
          setResumePrompt(rawPrompt);
          appendTurn({ ...turnBase, status: status === "cancelled" ? "cancelled" : "partial", message: detail, afterScene: partial });
          void save(partial);
        } else {
          setAgentError(detail);
          setSaveState("error");
          appendTurn({ ...turnBase, status, message: detail });
        }
      };

      try {
        const response = await fetch(`/api/projects/${projectId}/scene3d/agent-run`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(await authHeaders()) },
          signal: abort.signal,
          body: JSON.stringify({
            prompt: composed,
            mode: activeMode,
            selectedObjectId: activeMode === "refine" ? primaryId ?? undefined : undefined,
            stream: streaming,
            referenceImage: referenceImage?.dataUrl,
            variationCount
          })
        });

        // Non-OK (e.g. 429 quota, 400 no key) returns a JSON {error}, not a stream.
        if (!response.ok) {
          const message = await response
            .json()
            .then((body: { error?: string }) => body?.error)
            .catch(() => null);
          failed(message || `Generation failed (${response.status}).`);
          return;
        }

        // Read the newline-delimited stream: progress | partial-node | result | error.
        let result: { scene?: Scene3D; variations?: SceneVariation[] } | null = null;
        let streamError: string | null = null;
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
                const event = JSON.parse(line) as { type: string; stage?: string; node?: SceneNode; result?: { scene?: Scene3D; variations?: SceneVariation[] }; message?: string; model?: string };
                if (event.type === "progress" && event.stage) setStage(event.stage);
                else if (event.type === "meta" && event.model) setGenModel(event.model);
                else if (event.type === "partial-node" && event.node && streaming) {
                  const node = event.node;
                  setScene((current) => (current ? { ...current, nodes: [...current.nodes, node] } : current));
                } else if (event.type === "result" && event.result) result = event.result;
                else if (event.type === "error" && event.message) streamError = event.message;
              } catch {
                // ignore partial/non-JSON lines
              }
            }
          }
        }

        if (result?.variations?.length) {
          setScene(beforeScene);
          setSaveState("saved");
          setVariationSet({
            id: createTurnId(),
            prompt: rawPrompt,
            baseScene: beforeScene,
            candidates: result.variations,
            previewId: null
          });
        } else if (result?.scene) {
          setScene(result.scene); // settle to the validated final scene
          setSaveState("saved");
          appendTurn({ ...turnBase, status: "success", afterScene: result.scene });
        } else {
          failed(streamError || "Generation failed (no scene was returned).");
        }
      } catch (e) {
        // A user cancel surfaces as an AbortError — keep any partial work but
        // don't dress it up as a failure.
        if (abort.signal.aborted) failed("Generation cancelled.", "cancelled");
        else failed(e instanceof Error ? e.message : "Generation failed.");
      } finally {
        generateAbortRef.current = null;
        setGenerating(false);
        setStage("");
        void loadUsage(); // reflect the consumed (or refunded) generation
      }
    },
    [projectId, prompt, referenceImage, mode, variationsEnabled, liveBuild, primaryId, styleId, modifierIds, scene, recordHistory, appendTurn, loadUsage, logError, save]
  );

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

  const groupSelection = useCallback(() => {
    const prev = sceneRef.current;
    if (!prev || selectedIds.length < 2) return;
    const grouped = groupSelectedNodes(prev.nodes, new Set(selectedIds), collectIds(prev.nodes));
    if (!grouped) return;
    const next = { ...prev, nodes: grouped.nodes };
    recordHistory(prev, true);
    setScene(next);
    queueSave(next);
    setSelectedIds([grouped.groupId]);
    setCollapsedIds((current) => {
      const nextCollapsed = new Set(current);
      nextCollapsed.delete(grouped.groupId);
      return nextCollapsed;
    });
  }, [selectedIds, recordHistory, queueSave]);

  const ungroupSelection = useCallback(() => {
    const prev = sceneRef.current;
    if (!prev || selectedIds.length === 0) return;
    const ungrouped = ungroupSelectedNodes(prev.nodes, new Set(selectedIds));
    if (!ungrouped) return;
    const next = { ...prev, nodes: ungrouped.nodes };
    recordHistory(prev, true);
    setScene(next);
    queueSave(next);
    setSelectedIds(ungrouped.childIds);
  }, [selectedIds, recordHistory, queueSave]);

  // Keyboard shortcuts: ⌘/Ctrl+Z undo, +Shift+Z redo, ⌘/Ctrl+A select all,
  // ⌘/Ctrl+D duplicate, ⌘/Ctrl+G group, +Shift+G ungroup, Delete/Backspace
  // remove, Esc clear selection. Only text-entry fields (the prompt box)
  // suppress these — slider/color/select inputs in the Inspector do not, so
  // shortcuts work right after an edit.
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
      } else if (mod && key === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
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
  }, [undo, redo, duplicateSelected, groupSelection, ungroupSelection, deleteSelected]);

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

  // Persist whether the timeline panel is open (editor-wide, like the inspector).
  useEffect(() => {
    saveTimelineOpen(timelineOpen);
  }, [timelineOpen]);

  // Persist the left-aside collapse/width + scene-tools dock collapse (editor-wide).
  useEffect(() => {
    saveLeftCollapsed(leftCollapsed);
  }, [leftCollapsed]);
  useEffect(() => {
    saveLeftWidth(leftWidth);
  }, [leftWidth]);
  useEffect(() => {
    saveDockCollapsed(dockCollapsed);
  }, [dockCollapsed]);

  // Drag the left aside's right edge to resize it (clamped); persisted on release.
  const startLeftResize = (event: React.PointerEvent) => {
    event.preventDefault();
    leftResizeRef.current = { startX: event.clientX, startWidth: leftWidth ?? DEFAULT_LEFT_WIDTH };
    const onMove = (e: PointerEvent) => {
      const ctx = leftResizeRef.current;
      if (!ctx) return;
      setLeftWidth(Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, ctx.startWidth + (e.clientX - ctx.startX))));
    };
    const onUp = () => {
      leftResizeRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

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

  // Commit a camera-inspector edit. While previewing, channels that already have
  // tracks are auto-keyed at the playhead (the slider drives the keyframe); the
  // camera's stored values are written through either way.
  const handleCameraChange = useCallback(
    (next: Camera) => {
      const previewing = playingRef.current || playheadRef.current > 1e-3;
      const time = Math.round(playheadRef.current * 1000) / 1000;
      applyEdit((prev) => {
        const withCamera: Scene3D = { ...prev, cameras: getCameras(prev).map((c) => (c.id === next.id ? next : c)) };
        if (!previewing || !prev.animation) return withCamera;
        let animation = prev.animation;
        const channels: [AnimatableProperty, number | undefined][] = [
          ["position.x", next.position?.[0]], ["position.y", next.position?.[1]], ["position.z", next.position?.[2]],
          ["target.x", next.target?.[0]], ["target.y", next.target?.[1]], ["target.z", next.target?.[2]],
          ["fov", next.fov], ["zoom", next.zoom]
        ];
        for (const [property, value] of channels) {
          if (value === undefined) continue;
          if (animation.tracks.some((t) => t.targetId === next.id && t.property === property)) {
            animation = upsertAnimationKeyframe(animation, next.id, property, time, value);
          }
        }
        return { ...withCamera, animation };
      });
    },
    [applyEdit]
  );

  // Offscreen capture of the active-camera view → PNG still / WebM animation.
  // Called before the `if (!scene)` guard (rules of hooks); the hook tolerates a
  // null scene and just renders no capture stage until one is loaded.
  const captureBase = (scene?.metadata.name || "scene").trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "scene";
  const capture = useSceneCapture(scene, playhead, captureBase);

  if (!scene) {
    return <div className={styles.loading}>Loading scene…</div>;
  }

  const cameras = getCameras(scene);
  const activeCamera = getActiveCamera(scene);
  const runCapture = (action: Promise<void>) => {
    void action.catch((error) => logError("Export failed", error instanceof Error ? error.message : String(error)));
  };
  const canGroupSelection = selectedIds.length >= 2 && canGroupNodes(scene.nodes, new Set(selectedIds));
  const canUngroupSelection = selectedNodes.some((node) => node.type === "group");

  // Scene-level look (background / fog / environment / post-processing). One
  // shallow patch through applyEdit so it records history + autosaves like any
  // other edit; the change flows to preview/share/export via SceneView.
  const patchScene = (patch: Partial<Scene3D>) => applyEdit((prev) => ({ ...prev, ...patch }));

  // Camera CRUD — all routed through applyEdit so they record history + autosave.
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const selectCamera = (id: string) => applyEdit((prev) => ({ ...prev, activeCameraId: id }));
  const patchCamera = (id: string, patch: Partial<Camera>) =>
    applyEdit((prev) => ({ ...prev, cameras: getCameras(prev).map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const renameCamera = (id: string, name: string) => patchCamera(id, { name });
  const addCamera = () => {
    const controls = orbitRef.current;
    const position = controls ? ([round(controls.object.position.x), round(controls.object.position.y), round(controls.object.position.z)] as [number, number, number]) : activeCamera.position;
    const target = controls ? ([round(controls.target.x), round(controls.target.y), round(controls.target.z)] as [number, number, number]) : activeCamera.target;
    applyEdit((prev) => {
      const existing = getCameras(prev);
      let n = existing.length + 1;
      let id = `camera-${n}`;
      while (existing.some((c) => c.id === id)) id = `camera-${++n}`;
      const camera: Camera = { id, name: `Camera ${existing.length + 1}`, type: "perspective", position, target, fov: 45 };
      return { ...prev, cameras: [...existing, camera], activeCameraId: id };
    });
  };
  const deleteCamera = (id: string) =>
    applyEdit((prev) => {
      const remaining = getCameras(prev).filter((c) => c.id !== id);
      if (remaining.length === 0) return prev;
      // Drop the camera's animation tracks along with it.
      let animation = prev.animation;
      if (animation) {
        const tracks = animation.tracks.filter((t) => t.targetId !== id);
        animation = tracks.length > 0 ? { ...animation, tracks } : undefined;
      }
      return { ...prev, cameras: remaining, activeCameraId: prev.activeCameraId === id ? remaining[0].id : prev.activeCameraId, animation };
    });
  const frameCameraFromView = (id: string) => {
    const controls = orbitRef.current;
    if (!controls) return;
    patchCamera(id, {
      position: [round(controls.object.position.x), round(controls.object.position.y), round(controls.object.position.z)],
      target: [round(controls.target.x), round(controls.target.y), round(controls.target.z)]
    });
  };

  // --- Animation timeline ---
  const duration = animationDuration(scene.animation);
  // Feed SceneView a controlled time only while previewing; at rest the node shows
  // its static pose so the gizmo/inspector edit the base transform normally.
  const previewActive = playing || playhead > 1e-3;
  const seek = (time: number) => {
    setPlaying(false);
    setPlayhead(Math.max(0, time));
  };
  const togglePlay = () => {
    if (!playing && playhead >= duration) setPlayhead(0); // replay from start
    setPlaying((v) => !v);
  };
  const toggleLoop = () =>
    applyEdit((prev) => (prev.animation ? { ...prev, animation: { ...prev.animation, loop: prev.animation.loop === false } } : prev));
  const setDuration = (value: number) =>
    applyEdit((prev) => (prev.animation ? { ...prev, animation: { ...prev.animation, duration: value } } : { ...prev, animation: { duration: value, loop: true, tracks: [] } }));
  const deleteTrack = (trackId: string) =>
    applyEdit((prev) => (prev.animation ? { ...prev, animation: removeAnimationTrack(prev.animation, trackId) } : prev));
  const deleteKeyframe = (trackId: string, time: number) =>
    applyEdit((prev) => (prev.animation ? { ...prev, animation: removeAnimationKeyframe(prev.animation, trackId, time) } : prev));
  const moveKeyframe = (trackId: string, fromTime: number, toTime: number) =>
    applyEdit((prev) => (prev.animation ? { ...prev, animation: moveAnimationKeyframe(prev.animation, trackId, fromTime, toTime) } : prev));
  // Insert keyframes for the given channels at the playhead, reading the live pose.
  const keyChannels = (channels: AnimatableProperty[]) => {
    const node = selectedNode;
    if (!node) return;
    const time = round(playhead);
    const obj = sceneRootRef.current?.getObjectByName(node.id) ?? null;
    const fallback = normalizeTransform(node.transform);
    applyEdit((prev) => {
      let animation = prev.animation;
      for (const channel of channels) {
        animation = upsertAnimationKeyframe(animation, node.id, channel, time, readChannel(obj, channel, fallback));
      }
      return { ...prev, animation };
    });
    setTimelineOpen(true);
  };
  const nodeName = (id: string) => findNode(scene.nodes, id)?.name ?? cameras.find((c) => c.id === id)?.name ?? id;

  // Key the active camera's pose (position + look-at target) at the playhead.
  // When looking through the camera the live orbit framing IS the camera, so key
  // that; otherwise key the camera's stored values.
  const keyCameraPose = () => {
    const cam = activeCamera;
    const controls = orbitRef.current;
    const live = lookThrough && controls ? controls : null;
    const pos: [number, number, number] = live
      ? [round(live.object.position.x), round(live.object.position.y), round(live.object.position.z)]
      : cam.position ?? DEFAULT_CAMERA.position;
    const tgt: [number, number, number] = live
      ? [round(live.target.x), round(live.target.y), round(live.target.z)]
      : cam.target ?? DEFAULT_CAMERA.target;
    const time = round(playhead);
    applyEdit((prev) => {
      let animation = prev.animation;
      const channels: [AnimatableProperty, number][] = [
        ["position.x", pos[0]], ["position.y", pos[1]], ["position.z", pos[2]],
        ["target.x", tgt[0]], ["target.y", tgt[1]], ["target.z", tgt[2]]
      ];
      for (const [property, value] of channels) {
        animation = upsertAnimationKeyframe(animation, cam.id, property, time, value);
      }
      return { ...prev, animation };
    });
    setTimelineOpen(true);
  };

  // Auto-key the live orbit framing at the playhead, but only on channels that
  // already have tracks — called when an orbit gesture ends while reframing an
  // animated camera mid-preview (the camera analogue of the gizmo's auto-key).
  const keyCameraPoseFromView = () => {
    const controls = orbitRef.current;
    if (!controls) return;
    const cam = activeCamera;
    const time = round(playheadRef.current);
    const channels: [AnimatableProperty, number][] = [
      ["position.x", round(controls.object.position.x)], ["position.y", round(controls.object.position.y)], ["position.z", round(controls.object.position.z)],
      ["target.x", round(controls.target.x)], ["target.y", round(controls.target.y)], ["target.z", round(controls.target.z)]
    ];
    applyEdit((prev) => {
      if (!prev.animation) return prev;
      let animation = prev.animation;
      for (const [property, value] of channels) {
        if (animation.tracks.some((t) => t.targetId === cam.id && t.property === property)) {
          animation = upsertAnimationKeyframe(animation, cam.id, property, time, value);
        }
      }
      return { ...prev, animation };
    });
  };

  // Key the active camera's lens (fov for perspective, zoom for orthographic).
  const keyCameraLens = () => {
    const cam = activeCamera;
    const time = round(playhead);
    const [property, value]: [AnimatableProperty, number] =
      cam.type === "orthographic" ? ["zoom", cam.zoom ?? 50] : ["fov", cam.fov ?? DEFAULT_CAMERA.fov];
    applyEdit((prev) => ({ ...prev, animation: upsertAnimationKeyframe(prev.animation, cam.id, property, time, value) }));
    setTimelineOpen(true);
  };

  const activeCameraAnimated = (scene.animation?.tracks ?? []).some((t) => t.targetId === activeCamera.id);

  // Camera analogue of inspectorNode: while previewing, the camera inspector
  // shows the playhead-sampled pose/lens so its sliders match the viewport.
  const inspectorCamera =
    previewActive && scene.animation ? sampleCameraPose(activeCamera, scene.animation, playhead) : activeCamera;

  // While previewing, the Inspector shows (and edits) the pose sampled at the
  // playhead instead of the base transform, so its values match the viewport and
  // edits auto-key tracked channels (see handleNodeChange).
  const inspectorNode =
    previewActive && selectedNode && scene.animation
      ? { ...selectedNode, transform: sampleNodeTransform(selectedNode, scene.animation, playhead) }
      : selectedNode;

  return (
    <div className={styles.shell}>


      <div className={styles.body}>
        {/* Collapsed left aside (desktop): a thin reveal rail to bring it back. */}
        {isWide && leftCollapsed ? (
          <button className={styles.leftReveal} onClick={() => setLeftCollapsed(false)} title="Show prompt & layers" aria-label="Show prompt and layers panel">
            ▸
          </button>
        ) : null}
        <aside
          className={mobileAsideClass(`${styles.panel} ${styles.panelLeft}${isWide && leftCollapsed ? ` ${styles.panelLeftCollapsed}` : ""}`, mobilePanel !== "inspector")}
          style={isWide && !leftCollapsed && leftWidth ? { width: leftWidth, minWidth: leftWidth } : undefined}
        >
          {/* Desktop: collapse button + drag-to-resize handle on the right edge. */}
          {isWide ? (
            <>
              <button className={styles.leftCollapseBtn} onClick={() => setLeftCollapsed(true)} title="Hide panel" aria-label="Hide prompt and layers panel">
                ◂
              </button>
              <div className={styles.leftResizeHandle} onPointerDown={startLeftResize} role="separator" aria-label="Resize panel" title="Drag to resize" />
            </>
          ) : null}
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
                  <div className={styles.modeButtons}>
                    <button className={modeBtnClass(mode === "new")} onClick={() => setMode("new")} title="Build a brand-new scene from the prompt">
                      New
                    </button>
                    <button className={modeBtnClass(mode === "refine")} onClick={() => setMode("refine")} title="Edit the current scene with a small change">
                      Refine
                    </button>
                  </div>
                  <div className={styles.modeOptions}>
                    {mode === "new" ? (
                      <label className={styles.liveToggle} title="Watch objects appear as the AI writes them">
                        <input type="checkbox" checked={liveBuild} onChange={(event) => setLiveBuild(event.target.checked)} disabled={generating || variationsEnabled} />
                        Live build
                      </label>
                    ) : null}
                    {mode === "new" ? (
                      <label className={styles.variationToggle} title="Generate three candidate scenes; uses 3 generation runs">
                        <input type="checkbox" checked={variationsEnabled} onChange={(event) => setVariationsEnabled(event.target.checked)} disabled={generating} />
                        <span>×3 options</span>
                        <small>uses 3</small>
                      </label>
                    ) : null}
                  </div>
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
                <div
                  className={referenceImage ? `${styles.referenceDrop} ${styles.referenceDropActive}` : styles.referenceDrop}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void pickReferenceImage(event.dataTransfer.files[0]);
                  }}
                >
                  {referenceImage ? (
                    <>
                      <img className={styles.referenceThumb} src={referenceImage.dataUrl} alt="" />
                      <div className={styles.referenceMeta}>
                        <span>Reference image</span>
                        <strong>{referenceImage.name}</strong>
                      </div>
                      <button type="button" className={styles.ghostButton} onClick={() => setReferenceImage(null)} disabled={generating}>
                        Clear
                      </button>
                    </>
                  ) : (
                    <label className={styles.referencePicker}>
                      <input
                        className={styles.fileInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={generating}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          void pickReferenceImage(file);
                        }}
                      />
                      <span>Reference image</span>
                      <strong>Add image</strong>
                    </label>
                  )}
                </div>
                <button className={styles.button} onClick={() => void generate()} disabled={generating || (!prompt.trim() && !referenceImage)}>
                  {generating
                    ? mode === "refine"
                      ? "Refining…"
                      : variationsEnabled
                        ? "Generating options…"
                        : "Generating…"
                    : mode === "refine"
                      ? "Refine"
                      : variationsEnabled
                        ? "Generate 3 options"
                        : "Generate"}
                </button>
                {generating ? (
                  <button className={styles.button} onClick={() => generateAbortRef.current?.abort()} title="Stop this generation (keeps any objects already built)">
                    Cancel
                  </button>
                ) : null}

                <span className={styles.spacer} />
                {usage && usage.agentRun.limit != null ? (
                  <span className={styles.usageHint}>
                    {Math.max(0, usage.agentRun.limit - usage.agentRun.used)}/{usage.agentRun.limit} generations left today
                  </span>
                ) : null}
                {generating && stage ? (
                  <span className={styles.progressPill}>
                    <span className={styles.pulseDot} />
                    {stage}…{genModel ? ` · ${genModel}` : ""} · {formatElapsed(elapsedSec)}
                  </span>
                ) : (
                  <span className={saveBadgeClass(saveState)}>{saveLabel(saveState)}</span>
                )}
              </div>

              {agentError ? (
                <div className={styles.agentError}>
                  <span>{agentError}</span>
                  {resumePrompt ? (
                    <button className={styles.button} onClick={() => void generate({ mode: "refine", prompt: resumePrompt })} disabled={generating}>
                      Continue generating
                    </button>
                  ) : null}
                </div>
              ) : null}

              {variationSet ? (
                <div className={styles.variationPanel}>
                  <div className={styles.variationHeader}>
                    <div>
                      <strong>Generated options</strong>
                      <span>{variationSet.previewId ? "Previewing one candidate. Use it to save." : "Preview or use one candidate."}</span>
                    </div>
                    <button type="button" className={styles.ghostButton} onClick={discardVariations} disabled={generating}>
                      Discard
                    </button>
                  </div>
                  <div className={styles.variationList}>
                    {variationSet.candidates.map((candidate) => {
                      const active = variationSet.previewId === candidate.id;
                      return (
                        <article key={candidate.id} className={active ? `${styles.variationCard} ${styles.variationCardActive}` : styles.variationCard}>
                          <div className={styles.variationCardTop}>
                            <strong>{candidate.label}</strong>
                            <span>{candidate.scene.nodes.length} root nodes</span>
                          </div>
                          <p>{candidate.scene.metadata.name || variationSet.prompt}</p>
                          <div className={styles.variationObjects}>{variationObjectSummary(candidate.scene)}</div>
                          <div className={styles.variationActions}>
                            <button type="button" className={styles.ghostButton} onClick={() => previewVariation(candidate.id)} disabled={generating}>
                              {active ? "Previewing" : "Preview"}
                            </button>
                            <button type="button" className={styles.button} onClick={() => useVariation(candidate.id)} disabled={generating}>
                              Use
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}

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

              {turnLog.length > 0 ? (
                <div className={styles.turnLog}>
                  <div className={styles.turnLogHeader}>
                    <button type="button" className={styles.turnLogToggle} onClick={() => setTurnLogOpen((v) => !v)}>
                      History <span>{turnLog.length}</span>
                    </button>
                    <button type="button" className={styles.ghostButton} onClick={clearTurnLog} disabled={generating}>
                      Clear
                    </button>
                  </div>
                  {turnLogOpen ? (
                    <div className={styles.turnList}>
                      {turnLog.map((turn) => (
                        <article key={turn.id} className={styles.turnItem}>
                          <div className={styles.turnMeta}>
                            <span className={turnStatusClass(turn.status)}>{turnStatusLabel(turn.status)}</span>
                            <span>{turn.mode}</span>
                            <span>{formatTurnTime(turn.createdAt)}</span>
                            {turn.hasReferenceImage ? <span>image</span> : null}
                          </div>
                          <p>{turn.prompt}</p>
                          <div className={styles.turnActions}>
                            {turn.selectedLabel ? <span className={styles.refineHint}>{turn.selectedLabel}</span> : <span />}
                            <button type="button" className={styles.ghostButton} onClick={() => revertTurn(turn)} disabled={generating}>
                              Revert
                            </button>
                          </div>
                          {turn.message ? <div className={styles.turnMessage}>{turn.message}</div> : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
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
            {selectedIds.length > 1 || canUngroupSelection ? (
              <div className={styles.gizmoGroup}>
                {selectedIds.length > 1 ? (
                  <button
                    className={`${styles.gizmoBtn} ${styles.gizmoIconBtn}`}
                    onClick={groupSelection}
                    disabled={!canGroupSelection}
                    title={canGroupSelection ? "Group selected (⌘/Ctrl+G)" : "Group requires direct sibling nodes"}
                    aria-label="Group selected"
                  >
                    <GroupIcon />
                  </button>
                ) : null}
                {canUngroupSelection ? (
                  <button
                    className={`${styles.gizmoBtn} ${styles.gizmoIconBtn}`}
                    onClick={ungroupSelection}
                    title="Ungroup selected (⌘/Ctrl+Shift+G)"
                    aria-label="Ungroup selected"
                  >
                    <UngroupIcon />
                  </button>
                ) : null}
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

          <div className={styles.sceneToolsDock} aria-label="Scene tools">
            <button
              className={styles.dockToggle}
              onClick={() => setDockCollapsed((v) => !v)}
              title={dockCollapsed ? "Show scene tools" : "Hide scene tools"}
              aria-label={dockCollapsed ? "Show scene tools" : "Hide scene tools"}
              aria-expanded={!dockCollapsed}
            >
              {dockCollapsed ? "☰" : "✕"}
            </button>
            {!dockCollapsed ? (
              <>
                <SceneSettingsMenu
                  background={scene.background}
                  fog={scene.fog}
                  environment={scene.environment}
                  postprocessing={scene.postprocessing}
                  onPatch={patchScene}
                />
                <CameraMenu
                  cameras={cameras}
                  activeCameraId={activeCamera.id}
                  lookThrough={lookThrough}
                  onSelect={selectCamera}
                  onAdd={addCamera}
                  onDelete={deleteCamera}
                  onRename={renameCamera}
                  onPatch={patchCamera}
                  onFrameFromView={frameCameraFromView}
                  onSetLookThrough={setLookThrough}
                  onKeyPose={keyCameraPose}
                  onKeyLens={keyCameraLens}
                  playhead={playhead}
                />
                <ExportMenu
                  hasAnimation={(scene.animation?.tracks.length ?? 0) > 0}
                  busy={capture.busy}
                  onRenderImage={(res) => runCapture(capture.renderImage(res))}
                  onExportVideo={(res, fps) => runCapture(capture.exportVideo(res, fps))}
                  onExportModel={() => runCapture(capture.exportModel())}
                />
              </>
            ) : null}
          </div>

          <Canvas shadows camera={{ position: activeCamera.position ?? [3.4, 2.6, 4.4], fov: activeCamera.fov ?? 45 }} onPointerMissed={() => setSelectedIds([])}>
            <SceneView
              scene={scene}
              selectedIds={selectedIds}
              onSelect={(id) => selectNode(id, { additive: additiveRef.current }, visibleNodes)}
              renderActiveCamera={lookThrough}
              animationTime={playhead}
              suppressAnimation={!previewActive || gizmoDragging || cameraAdjusting}
            />
            <RootCapture target={sceneRootRef} />
            <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={20} blur={2.4} far={8} />
            {/* Orbiting through an animated camera mid-preview pauses playback,
                suspends the driver (so the user can reframe instead of fighting
                it), and auto-keys the new framing at the playhead on release. */}
            <OrbitControls
              ref={orbitRef as never}
              makeDefault
              target={activeCamera.target ?? [0, 1, 0]}
              onStart={() => {
                if (!(lookThrough && activeCameraAnimated && (playingRef.current || playheadRef.current > 1e-3))) return;
                setPlaying(false);
                cameraAdjustingRef.current = true;
                setCameraAdjusting(true);
              }}
              onEnd={() => {
                if (!cameraAdjustingRef.current) return;
                cameraAdjustingRef.current = false;
                setCameraAdjusting(false);
                keyCameraPoseFromView();
              }}
            />
            <Gizmo
              selectedId={selectedIds.length === 1 ? primaryId : null}
              mode={gizmoMode}
              space={gizmoSpace}
              snap={gizmoSnap}
              sceneObj={scene}
              onCommit={commitGizmo}
              onDraggingChange={setGizmoDragging}
            />
          </Canvas>

          {/* Offscreen capture surface + progress overlay for PNG/WebM export. */}
          {capture.stage}
          {capture.status ? (
            <div className={styles.captureOverlay} role="status" aria-live="polite">
              <span className={styles.pulseDot} />
              {capture.status}
            </div>
          ) : null}

          <Timeline
            open={timelineOpen}
            animation={scene.animation}
            duration={duration}
            playhead={playhead}
            playing={playing}
            selectedNode={selectedNode}
            nodeName={nodeName}
            onToggleOpen={() => setTimelineOpen((v) => !v)}
            onPlayPause={togglePlay}
            onSeek={seek}
            onSetDuration={setDuration}
            onToggleLoop={toggleLoop}
            onKey={keyChannels}
            onDeleteTrack={deleteTrack}
            onDeleteKeyframe={deleteKeyframe}
            onMoveKeyframe={moveKeyframe}
            onSelectNode={(id) => {
              // Camera tracks: make that camera active, look through it, and clear
              // the node selection so the camera inspector takes over the pane.
              if (cameras.some((c) => c.id === id)) {
                selectCamera(id);
                setLookThrough(true);
                setSelectedIds([]);
              } else setSelectedIds([id]);
            }}
          />
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
              ) : selectedNodes.length === 0 && lookThrough ? (
                <CameraInspector
                  camera={inspectorCamera}
                  onChange={handleCameraChange}
                  collapsed={paneCollapsed}
                  onToggleCollapse={isWide ? () => setInspectorCollapsed((v) => !v) : undefined}
                />
              ) : (
                <Inspector
                  node={inspectorNode}
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

// Captures the live THREE scene root (from inside the Canvas) into a ref so the
// timeline can read the pose currently shown for any node when keying.
function RootCapture({ target }: { target: React.RefObject<Object3D | null> }) {
  const root = useThree((state) => state.scene);
  useEffect(() => {
    target.current = root;
  }, [root, target]);
  return null;
}

// Reads a single animatable channel's value off the live Object3D (what the
// viewport currently shows), falling back to the node's static transform.
function readChannel(obj: Object3D | null, channel: AnimatableProperty, fallback: Transform): number {
  switch (channel) {
    case "position.x": return obj ? obj.position.x : fallback.position[0];
    case "position.y": return obj ? obj.position.y : fallback.position[1];
    case "position.z": return obj ? obj.position.z : fallback.position[2];
    case "rotation.x": return obj ? obj.rotation.x : fallback.rotation[0];
    case "rotation.y": return obj ? obj.rotation.y : fallback.rotation[1];
    case "rotation.z": return obj ? obj.rotation.z : fallback.rotation[2];
    case "scale.x": return obj ? obj.scale.x : fallback.scale[0];
    case "scale.y": return obj ? obj.scale.y : fallback.scale[1];
    case "scale.z": return obj ? obj.scale.z : fallback.scale[2];
    case "scale": return obj ? obj.scale.x : fallback.scale[0];
    default: return 0; // opacity / camera target — not keyed via the v1 buttons
  }
}

// Pose of `node` at `time`: its animation tracks applied over the base transform,
// in track order — matching SceneView playback exactly (a later uniform "scale"
// track overrides earlier per-axis ones, and vice versa).
function sampleNodeTransform(node: SceneNode, animation: Animation, time: number): Transform {
  const base = normalizeTransform(node.transform);
  const position = [...base.position] as [number, number, number];
  const rotation = [...base.rotation] as [number, number, number];
  const scale = [...base.scale] as [number, number, number];
  const vectors: Record<string, [number, number, number]> = { position, rotation, scale };
  const axes: Record<string, number> = { x: 0, y: 1, z: 2 };
  for (const track of animation.tracks) {
    if (track.targetId !== node.id) continue;
    const value = sampleTrack(track, time);
    if (value === undefined) continue;
    const [prop, axis] = track.property.split(".");
    if (axis !== undefined && vectors[prop] && axes[axis] !== undefined) vectors[prop][axes[axis]] = value;
    else if (track.property === "scale") scale.fill(value);
  }
  return { position, rotation, scale };
}

// Camera analogue of sampleNodeTransform: the camera's pose/lens with its
// animation tracks applied at `time` (track order, matching SceneView playback).
function sampleCameraPose(camera: Camera, animation: Animation, time: number): Camera {
  const tracks = animation.tracks.filter((t) => t.targetId === camera.id);
  if (tracks.length === 0) return camera;
  const position = [...(camera.position ?? DEFAULT_CAMERA.position)] as [number, number, number];
  const target = [...(camera.target ?? DEFAULT_CAMERA.target)] as [number, number, number];
  let fov = camera.fov;
  let zoom = camera.zoom;
  const axes: Record<string, number> = { x: 0, y: 1, z: 2 };
  for (const track of tracks) {
    const value = sampleTrack(track, time);
    if (value === undefined) continue;
    const [prop, axis] = track.property.split(".");
    if (prop === "position" && axis !== undefined) position[axes[axis]] = value;
    else if (prop === "target" && axis !== undefined) target[axes[axis]] = value;
    else if (track.property === "fov") fov = value;
    else if (track.property === "zoom") zoom = value;
  }
  return { ...camera, position, target, fov, zoom };
}

// "1:42" — elapsed time shown in the generation progress pill.
function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatTurnTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function turnStatusLabel(status: TurnStatus): string {
  if (status === "success") return "done";
  if (status === "partial") return "partial";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

function turnStatusClass(status: TurnStatus): string {
  if (status === "success") return styles.turnStatusSuccess;
  if (status === "partial") return styles.turnStatusPartial;
  if (status === "cancelled") return styles.turnStatusCancelled;
  return styles.turnStatusError;
}

function turnSelectedLabel(scene: Scene3D, id: string | null): string | undefined {
  if (!id) return undefined;
  const node = findNode(scene.nodes, id);
  return node ? node.name ?? node.id : id;
}

function variationObjectSummary(scene: Scene3D): string {
  const names = flattenNodes(scene.nodes)
    .filter((node) => node.type !== "group")
    .slice(0, 4)
    .map((node) => node.name ?? node.id);
  if (names.length === 0) return "No editable objects returned.";
  const extra = Math.max(0, flattenNodes(scene.nodes).filter((node) => node.type !== "group").length - names.length);
  return extra > 0 ? `${names.join(", ")} +${extra} more` : names.join(", ");
}

function transformsEqual(a: Transform, b: Transform): boolean {
  const fa = [...a.position, ...a.rotation, ...a.scale];
  const fb = [...b.position, ...b.rotation, ...b.scale];
  return fa.every((v, i) => Math.abs(v - fb[i]) < 1e-6);
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
  onCommit,
  onDraggingChange
}: {
  selectedId: string | null;
  mode: GizmoMode;
  space: "world" | "local";
  snap: boolean;
  sceneObj: unknown;
  onCommit: (position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void;
  onDraggingChange?: (dragging: boolean) => void;
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
      // Tell the editor a drag started/ended so it can suspend the animation
      // driver mid-drag (otherwise the driver overrides the transform each frame
      // and the object can't be moved while previewing an animated channel).
      onDraggingChange?.(event.value);
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
  }, [onCommit, onDraggingChange, target]);

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

// Editor-wide "timeline panel open" preference (the collapsed state is a slim
// transport bar, so closed is still useful — but the choice should stick).
const TIMELINE_OPEN_KEY = "s3d:timelineOpen";

function loadTimelineOpen(): boolean {
  try {
    return localStorage.getItem(TIMELINE_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveTimelineOpen(value: boolean): void {
  try {
    localStorage.setItem(TIMELINE_OPEN_KEY, value ? "1" : "0");
  } catch {
    // localStorage unavailable — preference just won't persist.
  }
}

// Left-aside sizing bounds (desktop). Width persists across sessions.
const DEFAULT_LEFT_WIDTH = 280;
const MIN_LEFT_WIDTH = 230;
const MAX_LEFT_WIDTH = 460;

const LEFT_COLLAPSED_KEY = "s3d:leftCollapsed";
const LEFT_WIDTH_KEY = "s3d:leftWidth";
const DOCK_COLLAPSED_KEY = "s3d:dockCollapsed";

function loadLeftCollapsed(): boolean {
  try {
    return localStorage.getItem(LEFT_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
function saveLeftCollapsed(value: boolean): void {
  try {
    localStorage.setItem(LEFT_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    /* localStorage unavailable */
  }
}
function loadLeftWidth(): number | null {
  try {
    const raw = Number(localStorage.getItem(LEFT_WIDTH_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, raw)) : null;
  } catch {
    return null;
  }
}
function saveLeftWidth(value: number | null): void {
  try {
    if (value === null) localStorage.removeItem(LEFT_WIDTH_KEY);
    else localStorage.setItem(LEFT_WIDTH_KEY, String(Math.round(value)));
  } catch {
    /* localStorage unavailable */
  }
}
function loadDockCollapsed(): boolean {
  try {
    return localStorage.getItem(DOCK_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
function saveDockCollapsed(value: boolean): void {
  try {
    localStorage.setItem(DOCK_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    /* localStorage unavailable */
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

const MAX_TURN_LOG = 12;
const TURN_LOG_KEY = (projectId: string) => `s3d:turnLog:${projectId}`;

function createTurnId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadTurnLog(projectId: string): ComposerTurn[] {
  try {
    const raw = localStorage.getItem(TURN_LOG_KEY(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ComposerTurn[];
    return Array.isArray(parsed) ? parsed.filter(isComposerTurn).slice(0, MAX_TURN_LOG) : [];
  } catch {
    return [];
  }
}

function saveTurnLog(projectId: string, turns: ComposerTurn[]): void {
  for (let count = Math.min(turns.length, MAX_TURN_LOG); count >= 0; count -= 1) {
    try {
      localStorage.setItem(TURN_LOG_KEY(projectId), JSON.stringify(turns.slice(0, count)));
      return;
    } catch {
      // If image textures make snapshots too large, retry with fewer turns.
    }
  }
}

function isComposerTurn(value: unknown): value is ComposerTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Partial<ComposerTurn>;
  return (
    typeof turn.id === "string" &&
    typeof turn.createdAt === "string" &&
    (turn.mode === "new" || turn.mode === "refine") &&
    typeof turn.prompt === "string" &&
    typeof turn.hasReferenceImage === "boolean" &&
    (turn.status === "success" || turn.status === "error" || turn.status === "partial" || turn.status === "cancelled") &&
    typeof turn.beforeScene === "object" &&
    turn.beforeScene !== null
  );
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

interface GroupResult {
  nodes: SceneNode[];
  groupId: string;
}

interface UngroupResult {
  nodes: SceneNode[];
  childIds: string[];
}

function canGroupNodes(nodes: SceneNode[], ids: Set<string>): boolean {
  if (ids.size < 2) return false;
  return Boolean(findSiblingSelection(nodes, ids));
}

function groupSelectedNodes(nodes: SceneNode[], ids: Set<string>, existing: Set<string>): GroupResult | null {
  const siblingSelection = findSiblingSelection(nodes, ids);
  if (!siblingSelection) return null;
  const groupId = nextSceneId("group", existing);
  const groupName = nextGroupName(existing);
  return groupInList(nodes, ids, groupId, groupName);
}

function ungroupSelectedNodes(nodes: SceneNode[], ids: Set<string>): UngroupResult | null {
  const childIds: string[] = [];
  const next = ungroupInList(nodes, ids, childIds);
  return childIds.length > 0 ? { nodes: next, childIds } : null;
}

function findSiblingSelection(nodes: SceneNode[], ids: Set<string>): SceneNode[] | null {
  const selectedHere = nodes.filter((node) => ids.has(node.id));
  if (selectedHere.length === ids.size) return selectedHere;
  if (selectedHere.length > 0) return null;
  for (const node of nodes) {
    if (node.type !== "group") continue;
    const match = findSiblingSelection(node.children, ids);
    if (match) return match;
  }
  return null;
}

function groupInList(nodes: SceneNode[], ids: Set<string>, groupId: string, groupName: string): GroupResult | null {
  const selectedHere = nodes.filter((node) => ids.has(node.id));
  if (selectedHere.length === ids.size) {
    const groupTransform = selectionCenterTransform(selectedHere);
    const inverseGroup = transformMatrix(groupTransform).invert();
    const groupNode: SceneNode = {
      id: groupId,
      type: "group",
      name: groupName,
      transform: groupTransform,
      children: selectedHere.map((node) => applyRelativeMatrix(node, inverseGroup))
    };
    let inserted = false;
    const nextNodes = nodes.flatMap((node) => {
      if (!ids.has(node.id)) return [node];
      if (inserted) return [];
      inserted = true;
      return [groupNode];
    });
    return { nodes: nextNodes, groupId };
  }

  for (const node of nodes) {
    if (node.type !== "group") continue;
    const grouped = groupInList(node.children, ids, groupId, groupName);
    if (!grouped) continue;
    return {
      nodes: nodes.map((candidate) => (candidate.id === node.id ? { ...node, children: grouped.nodes } : candidate)),
      groupId
    };
  }
  return null;
}

function ungroupInList(nodes: SceneNode[], ids: Set<string>, childIds: string[]): SceneNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "group" && ids.has(node.id)) {
      const groupMatrix = transformMatrix(normalizeTransform(node.transform));
      return node.children.map((child) => {
        childIds.push(child.id);
        return applyRelativeMatrix(child, groupMatrix);
      });
    }
    return node.type === "group" ? [{ ...node, children: ungroupInList(node.children, ids, childIds) }] : [node];
  });
}

function selectionCenterTransform(nodes: SceneNode[]): Transform {
  const positions = nodes.map((node) => normalizeTransform(node.transform).position);
  const count = Math.max(1, positions.length);
  return {
    position: [
      roundTransform(positions.reduce((sum, position) => sum + position[0], 0) / count),
      roundTransform(positions.reduce((sum, position) => sum + position[1], 0) / count),
      roundTransform(positions.reduce((sum, position) => sum + position[2], 0) / count)
    ],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
}

function applyRelativeMatrix(node: SceneNode, relative: Matrix4): SceneNode {
  const transform = matrixTransform(relative.clone().multiply(transformMatrix(normalizeTransform(node.transform))));
  return { ...node, transform };
}

function transformMatrix(transform: Transform): Matrix4 {
  const position = new Vector3(transform.position[0], transform.position[1], transform.position[2]);
  const quaternion = new Quaternion().setFromEuler(new Euler(transform.rotation[0], transform.rotation[1], transform.rotation[2], "XYZ"));
  const scale = new Vector3(transform.scale[0], transform.scale[1], transform.scale[2]);
  return new Matrix4().compose(position, quaternion, scale);
}

function matrixTransform(matrix: Matrix4): Transform {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: [roundTransform(position.x), roundTransform(position.y), roundTransform(position.z)],
    rotation: [roundTransform(rotation.x), roundTransform(rotation.y), roundTransform(rotation.z)],
    scale: [roundTransform(scale.x), roundTransform(scale.y), roundTransform(scale.z)]
  };
}

function roundTransform(value: number): number {
  return Math.abs(value) < 1e-9 ? 0 : Math.round(value * 1_000_000) / 1_000_000;
}

function collectIds(nodes: SceneNode[]): Set<string> {
  return new Set(flattenNodes(nodes).map((n) => n.id));
}

function nextSceneId(prefix: string, existing: Set<string>): string {
  let i = existing.size + 1;
  let candidate = `${prefix}-${i}`;
  while (existing.has(candidate)) candidate = `${prefix}-${++i}`;
  existing.add(candidate);
  return candidate;
}

function nextGroupName(existing: Set<string>): string {
  let i = existing.size + 1;
  return `Group ${i}`;
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
