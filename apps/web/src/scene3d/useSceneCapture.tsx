// useSceneCapture — orchestrates offscreen capture of the scene for export:
//   • renderImage(): a PNG still through the active camera at the current playhead.
//   • exportVideo(): a WebM clip of the animation, driven 0→duration on a controlled
//     clock (exact, not wall-clock) and recorded via MediaRecorder.
//
// Both share one CaptureStage (a clean offscreen canvas). The hook returns `stage`
// (JSX to mount) and `status` (progress text for an overlay), plus the triggers.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { animationDuration, findNode, normalizeTransform, sampleTrack, type Animation, type Scene3D } from "@ai-threejs-studio/scene3d";
import { CaptureStage } from "./CaptureStage";

export interface CaptureResolution {
  label: string;
  width: number;
  height: number;
}

export const CAPTURE_RESOLUTIONS: CaptureResolution[] = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 }
];

interface PngJob {
  kind: "png";
  width: number;
  height: number;
  time: number;
}
interface VideoJob {
  kind: "video";
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}
interface GlbJob {
  kind: "glb";
  width: number;
  height: number;
}
type Job = (PngJob | VideoJob | GlbJob) & { settle: (error?: Error) => void };

// Frames take a moment to settle (async HDRI/textures); warm up before capturing.
const PNG_WARMUP_MS = 700;
const VIDEO_WARMUP_MS = 500;
// Let async geometry/model assets construct before reading the graph for GLB.
const GLB_WARMUP_MS = 600;

export function useSceneCapture(scene: Scene3D | null, playhead: number, fileBase: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Stop an in-flight capture if the editor unmounts mid-export (switching to the
  // runtime surface or another project) — otherwise the rAF loop and recorder keep
  // running against a detached canvas and emit a truncated file.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
    };
  }, []);

  const finish = useCallback((current: Job, error?: Error) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setJob(null);
    setStatus(null);
    current.settle(error);
  }, []);

  // GLB export reads the constructed scene graph (no rendering needed) and runs
  // the glTF binary exporter. Skips the capture camera so the file carries only
  // the scene's own nodes/lights. Keyframe animation is baked into a sampled
  // AnimationClip (glTF stores quaternion rotations, so euler tracks are sampled
  // to quaternions); camera/fov tracks don't map to glTF and are dropped.
  const onScene = useCallback(
    (threeScene: THREE.Scene) => {
      if (!job || job.kind !== "glb") return;
      window.setTimeout(() => {
        setStatus("Exporting model…");
        try {
          const clip = scene ? bakeAnimationClip(scene) : null;
          new GLTFExporter().parse(
            threeScene,
            (gltf) => {
              triggerBlob(new Blob([gltf as ArrayBuffer], { type: "model/gltf-binary" }), `${fileBase}.glb`);
              finish(job);
            },
            (error) => finish(job, new Error(error?.message ?? "glTF export failed.")),
            { binary: true, onlyVisible: true, animations: clip ? [clip] : [] }
          );
        } catch (error) {
          finish(job, asError(error));
        }
      }, GLB_WARMUP_MS);
    },
    [job, fileBase, finish, scene]
  );

  const onReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!job || job.kind === "glb") return;

      if (job.kind === "png") {
        setStatus("Rendering image…");
        window.setTimeout(() => {
          try {
            triggerDownload(canvas.toDataURL("image/png"), `${fileBase}.png`);
            finish(job);
          } catch (error) {
            finish(job, asError(error));
          }
        }, PNG_WARMUP_MS);
        return;
      }

      // Video: record the canvas stream while a controlled clock advances 0→duration.
      const mime = pickVideoMime();
      if (!mime || typeof canvas.captureStream !== "function") {
        finish(job, new Error("This browser can't record canvas video (WebM)."));
        return;
      }
      const stream = canvas.captureStream(job.fps);
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        recorderRef.current = null;
        try {
          triggerBlob(new Blob(chunks, { type: mime }), `${fileBase}.webm`);
          finish(job);
        } catch (error) {
          finish(job, asError(error));
        }
      };

      const durationMs = job.durationSec * 1000;
      setStatus("Recording animation… 0%");
      window.setTimeout(() => {
        recorder.start();
        const startedAt = performance.now();
        const tick = () => {
          const elapsed = performance.now() - startedAt;
          const t = Math.min(elapsed / 1000, job.durationSec);
          setVideoTime(t);
          setStatus(`Recording animation… ${Math.round((elapsed / durationMs) * 100)}%`);
          if (elapsed >= durationMs) {
            recorder.stop();
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }, VIDEO_WARMUP_MS);
    },
    [job, fileBase, finish]
  );

  const renderImage = useCallback(
    (res: CaptureResolution) =>
      new Promise<void>((resolve, reject) => {
        if (!scene) {
          reject(new Error("No scene loaded."));
          return;
        }
        setJob({ kind: "png", width: res.width, height: res.height, time: playhead, settle: (e) => (e ? reject(e) : resolve()) });
      }),
    [playhead, scene]
  );

  const exportVideo = useCallback(
    (res: CaptureResolution, fps: number) =>
      new Promise<void>((resolve, reject) => {
        if (!scene) {
          reject(new Error("No scene loaded."));
          return;
        }
        const durationSec = animationDuration(scene.animation);
        if (durationSec <= 0) {
          reject(new Error("This scene has no animation to export."));
          return;
        }
        setVideoTime(0);
        setJob({ kind: "video", width: res.width, height: res.height, fps, durationSec, settle: (e) => (e ? reject(e) : resolve()) });
      }),
    [scene]
  );

  const exportModel = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!scene) {
          reject(new Error("No scene loaded."));
          return;
        }
        // GLB needs the graph, not pixels — a tiny canvas keeps GPU cost minimal.
        setJob({ kind: "glb", width: 64, height: 64, settle: (e) => (e ? reject(e) : resolve()) });
      }),
    [scene]
  );

  const stage: ReactNode =
    job && scene ? (
      <CaptureStage
        scene={scene}
        width={job.width}
        height={job.height}
        animationTime={job.kind === "png" ? job.time : videoTime}
        withCamera={job.kind !== "glb"}
        onReady={onReady}
        onScene={job.kind === "glb" ? onScene : undefined}
      />
    ) : null;

  return { renderImage, exportVideo, exportModel, stage, status, busy: job !== null };
}

// Bakes the scene's keyframe animation into a single THREE AnimationClip for GLB
// export. Each animated node's TRS is sampled at a fixed rate over the duration
// (so per-keyframe easing is approximated by dense samples, and euler rotation
// tracks become quaternion keyframes — glTF only stores quaternions). Camera
// tracks are skipped (no glTF camera-animation equivalent here).
const BAKE_FPS = 30;

function bakeAnimationClip(scene: Scene3D): THREE.AnimationClip | null {
  const anim = scene.animation;
  if (!anim || anim.tracks.length === 0) return null;
  const duration = animationDuration(anim);
  if (duration <= 0) return null;

  const steps = Math.max(2, Math.round(duration * BAKE_FPS));
  const times: number[] = [];
  for (let i = 0; i <= steps; i++) times.push(Math.min((i / steps) * duration, duration));

  // Animated targets that resolve to real nodes (skip camera ids).
  const nodeIds = new Set<string>();
  for (const track of anim.tracks) if (findNode(scene.nodes, track.targetId)) nodeIds.add(track.targetId);
  if (nodeIds.size === 0) return null;

  const tracks: THREE.KeyframeTrack[] = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  for (const id of nodeIds) {
    const node = findNode(scene.nodes, id);
    if (!node) continue;
    const base = normalizeTransform(node.transform);
    const animates = (prefix: string) =>
      anim.tracks.some((t) => t.targetId === id && (t.property === prefix || t.property.startsWith(`${prefix}.`)));
    const pos = animates("position");
    const rot = animates("rotation");
    const scale = animates("scale");
    if (!pos && !rot && !scale) continue;

    const posValues: number[] = [];
    const rotValues: number[] = [];
    const scaleValues: number[] = [];
    for (const t of times) {
      if (pos) {
        posValues.push(
          sampleCh(anim, id, "position.x", t, base.position[0]),
          sampleCh(anim, id, "position.y", t, base.position[1]),
          sampleCh(anim, id, "position.z", t, base.position[2])
        );
      }
      if (rot) {
        euler.set(
          sampleCh(anim, id, "rotation.x", t, base.rotation[0]),
          sampleCh(anim, id, "rotation.y", t, base.rotation[1]),
          sampleCh(anim, id, "rotation.z", t, base.rotation[2])
        );
        quat.setFromEuler(euler);
        rotValues.push(quat.x, quat.y, quat.z, quat.w);
      }
      if (scale) {
        // Uniform "scale" track first, then per-axis overrides (matches playback).
        const uniform = sampleChOpt(anim, id, "scale", t);
        const sx = sampleCh(anim, id, "scale.x", t, uniform ?? base.scale[0]);
        const sy = sampleCh(anim, id, "scale.y", t, uniform ?? base.scale[1]);
        const sz = sampleCh(anim, id, "scale.z", t, uniform ?? base.scale[2]);
        scaleValues.push(sx, sy, sz);
      }
    }
    if (pos) tracks.push(new THREE.VectorKeyframeTrack(`${id}.position`, times, posValues));
    if (rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${id}.quaternion`, times, rotValues));
    if (scale) tracks.push(new THREE.VectorKeyframeTrack(`${id}.scale`, times, scaleValues));
  }

  return tracks.length > 0 ? new THREE.AnimationClip(scene.metadata.name || "animation", duration, tracks) : null;
}

function sampleCh(anim: Animation, id: string, property: string, time: number, fallback: number): number {
  const value = sampleChOpt(anim, id, property, time);
  return value === undefined ? fallback : value;
}

function sampleChOpt(anim: Animation, id: string, property: string, time: number): number | undefined {
  const track = anim.tracks.find((t) => t.targetId === id && t.property === property);
  return track ? sampleTrack(track, time) : undefined;
}

function pickVideoMime(): string | null {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

function triggerBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
