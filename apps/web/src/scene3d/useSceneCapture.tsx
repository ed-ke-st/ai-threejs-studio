// useSceneCapture — orchestrates offscreen capture of the scene for export:
//   • renderImage(): a PNG still through the active camera at the current playhead.
//   • exportVideo(): a WebM clip of the animation, driven 0→duration on a controlled
//     clock (exact, not wall-clock) and recorded via MediaRecorder.
//
// Both share one CaptureStage (a clean offscreen canvas). The hook returns `stage`
// (JSX to mount) and `status` (progress text for an overlay), plus the triggers.

import { useCallback, useRef, useState, type ReactNode } from "react";
import { animationDuration, type Scene3D } from "@ai-threejs-studio/scene3d";
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
type Job = (PngJob | VideoJob) & { settle: (error?: Error) => void };

// Frames take a moment to settle (async HDRI/textures); warm up before capturing.
const PNG_WARMUP_MS = 700;
const VIDEO_WARMUP_MS = 500;

export function useSceneCapture(scene: Scene3D | null, playhead: number, fileBase: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const finish = useCallback((current: Job, error?: Error) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setJob(null);
    setStatus(null);
    current.settle(error);
  }, []);

  const onReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!job) return;

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
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
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

  const stage: ReactNode =
    job && scene ? (
      <CaptureStage
        scene={scene}
        width={job.width}
        height={job.height}
        animationTime={job.kind === "png" ? job.time : videoTime}
        onReady={onReady}
      />
    ) : null;

  return { renderImage, exportVideo, stage, status, busy: job !== null };
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
