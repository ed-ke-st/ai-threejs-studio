// Node-only codegen. Materialises the scene-related source files for a generated
// project straight from THIS package's canonical renderer, so the project a user
// previews / shares / downloads renders through the exact same interpreter the
// editor uses — no second implementation to drift.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Scene3D } from "./schema";

export interface GeneratedFile {
  path: string;
  content: string;
}

function readPackageSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

// Marker the API uses to recognise a Scene3D-backed project.
export const SCENE3D_MARKER = "@ai-threejs-studio:scene3d";

const SCENE_WRAPPER = `// ${SCENE3D_MARKER}
import sceneConfig from "./scene.config.json";
import { SceneView } from "./SceneView";
import type { Scene3D } from "./schema";

// The scene is data. This wrapper just hands the JSON to the shared interpreter.
export const scene = sceneConfig as unknown as Scene3D;

export function Scene() {
  // The runtime view is framed by the scene's active camera (SceneView owns it).
  return <SceneView scene={scene} renderActiveCamera />;
}
`;

const APP_SOURCE = `import { Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Scene, scene } from "./scene/Scene";
import { getActiveCamera } from "./scene/schema";
import "./styles.css";

export function App() {
  // SceneView renders the active camera; OrbitControls just needs its target.
  const camera = getActiveCamera(scene);
  return (
    <main className="app">
      <SceneErrorBoundary>
        <Canvas shadows>
          <Scene />
          <OrbitControls makeDefault target={camera.target ?? [0, 1, 0]} />
        </Canvas>
      </SceneErrorBoundary>
    </main>
  );
}

interface SceneErrorBoundaryState {
  errorMessage: string | null;
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): SceneErrorBoundaryState {
    return { errorMessage: error instanceof Error ? error.message : "The scene preview crashed." };
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <section className="scene-error">
          <strong>Scene preview failed</strong>
          <p>{this.state.errorMessage}</p>
        </section>
      );
    }
    return this.props.children;
  }
}
`;

// Returns the source files that turn a Scene3D document into a runnable scene.
// The base project files (package.json, index.html, vite/ts config, main.tsx,
// styles.css) are supplied by the project template.
export function createScene3DSceneFiles(scene: Scene3D): GeneratedFile[] {
  return [
    { path: "src/scene/schema.ts", content: readPackageSource("./schema.ts") },
    { path: "src/scene/SceneView.tsx", content: readPackageSource("./SceneView.tsx") },
    { path: "src/scene/Scene.tsx", content: SCENE_WRAPPER },
    { path: "src/App.tsx", content: APP_SOURCE },
    { path: "src/scene/scene.config.json", content: `${JSON.stringify(scene, null, 2)}\n` }
  ];
}

// A sensible, non-blank starter scene so a fresh project renders something that
// passes visual validation before the agent edits it.
export function defaultScene3D(): Scene3D {
  return {
    metadata: { name: "New scene", version: 1 },
    background: "#0d1320",
    camera: { position: [3.2, 2.4, 4], target: [0, 0.8, 0], fov: 45 },
    nodes: [
      {
        id: "ground",
        type: "mesh",
        name: "Ground",
        geometry: { kind: "box", args: [30, 0.2, 30] },
        transform: { position: [0, -0.1, 0] },
        material: { color: "#161d2b", roughness: 0.95, metalness: 0 },
        receiveShadow: true,
        castShadow: false
      },
      {
        id: "hero",
        type: "mesh",
        name: "Hero",
        geometry: { kind: "icosahedron", args: [0.9, 0] },
        transform: { position: [0, 0.9, 0] },
        material: { color: "#5cc8ff", roughness: 0.25, metalness: 0.2, emissive: "#0a2942", emissiveIntensity: 0.6 }
      },
      { id: "key", type: "light", name: "Key light", light: "directional", color: "#fff3e0", intensity: 2.4, transform: { position: [5, 7, 4] } },
      { id: "fill", type: "light", name: "Fill", light: "ambient", color: "#5878a6", intensity: 0.5 }
    ]
  };
}
