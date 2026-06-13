// CaptureStage — an offscreen R3F canvas that renders ONLY the canonical scene
// (SceneView through the active camera, no gizmo/grid/contact-shadows/selection
// chrome) at an exact pixel size. It's the clean render surface behind both the
// PNG still export and the WebM animation export (and, later, GLB).
//
// It mounts fixed and off-screen with preserveDrawingBuffer enabled so the colour
// buffer survives until we read it (toDataURL / captureStream). `onReady` fires
// once the GL context exists; the caller then warms up a few frames (for async
// HDRI/textures) before capturing.

import { Canvas } from "@react-three/fiber";
import { SceneView } from "@ai-threejs-studio/scene3d/react";
import { DEFAULT_CAMERA, getActiveCamera, type Scene3D } from "@ai-threejs-studio/scene3d";

export interface CaptureStageProps {
  scene: Scene3D;
  width: number;
  height: number;
  /** Freeze the animation at this time (PNG). Omit + set autoplay for video. */
  animationTime?: number;
  /** Let the animation play/loop on its own clock (video recording). */
  autoplay?: boolean;
  /** Fires with the backing <canvas> once the GL context is created. */
  onReady: (canvas: HTMLCanvasElement) => void;
}

export function CaptureStage({ scene, width, height, animationTime, autoplay, onReady }: CaptureStageProps) {
  const active = getActiveCamera(scene);
  return (
    <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, width, height, pointerEvents: "none", opacity: 0 }}>
      <Canvas
        shadows
        // preserveDrawingBuffer keeps the colour buffer readable after render;
        // always-on frameloop so async assets settle and video actually animates.
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        frameloop="always"
        dpr={1}
        style={{ width, height }}
        camera={{ position: active.position ?? DEFAULT_CAMERA.position, fov: active.fov ?? DEFAULT_CAMERA.fov }}
        onCreated={({ gl }) => onReady(gl.domElement)}
      >
        <SceneView scene={scene} renderActiveCamera animationTime={autoplay ? undefined : animationTime} />
      </Canvas>
    </div>
  );
}
