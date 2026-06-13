import type { ProjectTemplateId } from "@ai-threejs-studio/shared";

export interface TemplateFile {
  path: string;
  content: string;
}

export interface ThreeTemplate {
  id: ProjectTemplateId;
  name: string;
  description: string;
  files: TemplateFile[];
}

export const METADATA_BACKED_SCENE_MARKER = "@ai-threejs-studio:metadata-backed-scene";

export function createConfigDrivenSceneSource(options?: { placeholderLabel?: string }): string {
  const placeholderLabel = options?.placeholderLabel ?? "Upload a GLB asset to this project";

  return `// ${METADATA_BACKED_SCENE_MARKER}
import { Center, Clone, Html, useGLTF } from "@react-three/drei";
import sceneConfig from "./scene.config.json";

type Vec3 = [number, number, number];

interface SceneObject {
  id: string;
  type: "mesh" | "group" | "light" | "model";
  label: string;
  editable: boolean;
  visible: boolean;
  transform: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
  };
  material: {
    color: string;
    roughness: number;
    metalness: number;
  };
  intensity?: number;
  lightKind?: "ambient" | "point" | "directional" | "spot";
  geometry?: "box" | "plane" | "sphere" | "cylinder" | "frame" | "wall" | "floor" | "capsule";
  assetId?: string;
  assetUrl?: string;
}

const sceneObjects = sceneConfig.objects as unknown as SceneObject[];

export function Scene() {
  const visibleObjects = sceneObjects.filter((object) => object.visible);

  if (visibleObjects.length === 0) {
    return null;
  }

  return (
    <group>
      {visibleObjects.map((object) => (
        <SceneObjectNode key={object.id} object={object} />
      ))}
    </group>
  );
}

function SceneObjectNode({ object }: { object: SceneObject }) {
  if (object.type === "model") {
    return <ModelObject object={object} />;
  }

  if (object.type === "light") {
    return <LightObject object={object} />;
  }

  if (object.type === "group") {
    return <GroupObject object={object} />;
  }

  return <MeshObject object={object} />;
}

function MeshObject({ object }: { object: SceneObject }) {
  return (
    <mesh
      castShadow
      receiveShadow
      position={object.transform.position as Vec3}
      rotation={object.transform.rotation as Vec3}
      scale={object.transform.scale as Vec3}
      name={object.id}
    >
      {renderGeometry(object)}
      <meshStandardMaterial
        color={object.material.color}
        roughness={object.material.roughness}
        metalness={object.material.metalness}
      />
    </mesh>
  );
}

function GroupObject({ object }: { object: SceneObject }) {
  return (
    <group
      position={object.transform.position as Vec3}
      rotation={object.transform.rotation as Vec3}
      scale={object.transform.scale as Vec3}
      name={object.id}
    >
      <mesh castShadow receiveShadow>
        {renderGeometry(object)}
        <meshStandardMaterial
          color={object.material.color}
          roughness={object.material.roughness}
          metalness={object.material.metalness}
        />
      </mesh>
    </group>
  );
}

function LightObject({ object }: { object: SceneObject }) {
  const intensity = typeof object.intensity === "number" ? object.intensity : 1.9;

  if (object.lightKind === "ambient") {
    return (
      <group name={object.id}>
        <ambientLight color={object.material.color} intensity={intensity} />
      </group>
    );
  }

  return (
    <group
      position={object.transform.position as Vec3}
      rotation={object.transform.rotation as Vec3}
      scale={object.transform.scale as Vec3}
      name={object.id}
    >
      <mesh castShadow>
        <sphereGeometry args={[0.22, 20, 20]} />
        <meshStandardMaterial color={object.material.color} emissive={object.material.color} emissiveIntensity={0.85} />
      </mesh>
      {object.lightKind === "directional" ? (
        <directionalLight color={object.material.color} intensity={intensity} />
      ) : object.lightKind === "spot" ? (
        <spotLight color={object.material.color} intensity={intensity} angle={0.45} penumbra={0.4} distance={18} />
      ) : (
        <pointLight color={object.material.color} distance={12} intensity={intensity} />
      )}
    </group>
  );
}

function renderGeometry(object: SceneObject) {
  switch (object.geometry) {
    case "plane":
      return <planeGeometry args={[1.8, 1.2]} />;
    case "sphere":
      return <sphereGeometry args={[0.8, 24, 24]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.8, 0.8, 1.2, 32]} />;
    case "frame":
      return <boxGeometry args={[1.6, 1.1, 0.12]} />;
    case "wall":
      return <boxGeometry args={[1.8, 1.4, 0.12]} />;
    case "floor":
      return <boxGeometry args={[1.8, 0.08, 1.8]} />;
    case "capsule":
      return <capsuleGeometry args={[0.45, 0.8, 6, 12]} />;
    default:
      return <boxGeometry args={[1.4, 1.4, 1.4]} />;
  }
}

function ModelObject({ object }: { object: any }) {
  if (!object.assetUrl) {
    return (
      <group
        position={object.transform.position as Vec3}
        rotation={object.transform.rotation as Vec3}
        scale={object.transform.scale as Vec3}
        name={object.id}
      >
        <Html center>
          <span className="asset-label">${placeholderLabel}</span>
        </Html>
      </group>
    );
  }

  return <LinkedModelObject object={object} />;
}

function LinkedModelObject({ object }: { object: any }) {
  const { scene } = useGLTF(object.assetUrl as string);

  return (
    <group
      position={object.transform.position as Vec3}
      rotation={object.transform.rotation as Vec3}
      scale={object.transform.scale as Vec3}
      name={object.id}
    >
      <Center>
        <Clone object={scene} />
      </Center>
    </group>
  );
}
`;
}

const baseFiles: TemplateFile[] = [
  {
    path: "package.json",
    content: `{
  "name": "generated-three-project",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false"
  },
  "dependencies": {
    "@react-three/drei": "^10.1.2",
    "@react-three/fiber": "^9.1.2",
    "@react-three/postprocessing": "^3.0.4",
    "@vitejs/plugin-react": "^4.5.0",
    "postprocessing": "^6.39.1",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "three": "^0.177.0",
    "zustand": "^5.0.5"
  },
  "devDependencies": {
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "@types/three": "^0.177.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5"
  }
}
`
  },
  {
    path: "index.html",
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2310151f'/%3E%3Cpath d='M18 44 30 20l8 16 8-12' stroke='%2338bdf8' stroke-width='6' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E" />
    <title>__PROJECT_NAME__</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  },
  {
    path: "tsconfig.json",
    content: `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
`
  },
  {
    path: "vite.config.ts",
    content: `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()]
});
`
  },
  {
    path: "src/main.tsx",
    content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`
  },
  {
    path: "src/App.tsx",
    content: `import { Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Scene } from "./scene/Scene";

export function App() {
  return (
    <main className="app">
      <SceneErrorBoundary>
        <Canvas camera={{ position: [3, 2.5, 4], fov: 45 }} shadows>
          <color attach="background" args={["#10151f"]} />
          <ambientLight intensity={0.45} />
          <directionalLight position={[4, 6, 3]} intensity={2.2} castShadow />
          <Scene />
          <OrbitControls makeDefault />
        </Canvas>
      </SceneErrorBoundary>
    </main>
  );
}

interface SceneErrorBoundaryProps {
  children: ReactNode;
}

interface SceneErrorBoundaryState {
  errorMessage: string | null;
}

class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = {
    errorMessage: null
  };

  static getDerivedStateFromError(error: unknown): SceneErrorBoundaryState {
    return {
      errorMessage: error instanceof Error ? error.message : "The scene preview crashed."
    };
  }


  render() {
    if (this.state.errorMessage) {
      return (
        <section className="scene-error">
          <strong>Scene preview failed</strong>
          <p>{this.state.errorMessage}</p>
          <p>Replace the missing texture, model, or asset reference in <code>src/scene/Scene.tsx</code>.</p>
        </section>
      );
    }

    return this.props.children;
  }
}
`
  },
  {
    path: "src/scene/components/.gitkeep",
    content: ""
  },
  {
    path: "src/scene/materials/.gitkeep",
    content: ""
  },
  {
    path: "src/scene/scene.config.json",
    content: `{
  "objects": [
    {
      "id": "main-cube",
      "type": "mesh",
      "label": "Main Cube",
      "editable": true,
      "visible": true,
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "material": {
        "color": "#38bdf8",
        "roughness": 0.42,
        "metalness": 0.08
      }
    }
  ]
}
`
  },
  {
    path: "src/styles.css",
    content: `:root {
  color: #eef2ff;
  background: #10151f;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.app {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

.scene-error {
  display: grid;
  place-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 24px;
  background: #10151f;
  color: #eef2ff;
  text-align: center;
}

.scene-error strong {
  font-size: 18px;
}

.scene-error p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.5;
}

.scene-error code {
  color: #f8fafc;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

.asset-label {
  color: #f8fafc;
  font-size: 13px;
  white-space: nowrap;
}
`
  }
];

function sceneFile(content: string): TemplateFile {
  return {
    path: "src/scene/Scene.tsx",
    content
  };
}

export const templates: ThreeTemplate[] = [
  {
    id: "blank-r3f-scene",
    name: "Blank R3F Scene",
    description: "A minimal React Three Fiber scene with a clean component structure.",
    files: [
      ...baseFiles,
      sceneFile(createConfigDrivenSceneSource())
    ]
  },
  {
    id: "glb-viewer",
    name: "GLB Viewer",
    description: "A starter viewer for loading, centering, and inspecting GLB assets.",
    files: [
      ...baseFiles,
      {
        path: "src/scene/scene.config.json",
        content: `{
  "objects": [
    {
      "id": "uploaded-model",
      "type": "model",
      "label": "Uploaded Model",
      "editable": true,
      "visible": true,
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "material": {
        "color": "#f8fafc",
        "roughness": 0.35,
        "metalness": 0.15
      }
    }
  ]
}
`
      },
      sceneFile(createConfigDrivenSceneSource({ placeholderLabel: "Drop a GLB asset into this scene" }))
    ]
  },
  {
    id: "product-configurator",
    name: "Product Configurator",
    description: "A starter for material, color, and variant configuration workflows.",
    files: [
      ...baseFiles,
      sceneFile(`export function Scene() {
  return (
    <group>
      <mesh position={[0, -0.75, 0]} receiveShadow>
        <cylinderGeometry args={[1.25, 1.25, 0.24, 64]} />
        <meshStandardMaterial color="#d6d3d1" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[1.55, 0.9, 1.1]} />
        <meshStandardMaterial color="#2563eb" roughness={0.28} metalness={0.35} />
      </mesh>
    </group>
  );
}
`)
    ]
  },
  {
    id: "room-scene",
    name: "Room Scene",
    description: "A starter interior scene with walls, floor, lighting, and art placement.",
    files: [
      ...baseFiles,
      sceneFile(`export function Scene() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[7, 7]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1, -2.7]} receiveShadow>
        <boxGeometry args={[7, 4, 0.12]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.68} />
      </mesh>
      <mesh position={[0, 1, -2.62]} castShadow>
        <boxGeometry args={[1.4, 1, 0.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} />
      </mesh>
    </group>
  );
}
`)
    ]
  },
  {
    id: "interactive-planner",
    name: "Interactive Planner",
    description: "A starter for selectable objects, layout editing, and scene metadata.",
    files: [
      ...baseFiles,
      sceneFile(createConfigDrivenSceneSource())
    ]
  }
];

export function getTemplate(templateId: ProjectTemplateId): ThreeTemplate {
  const template = templates.find((item) => item.id === templateId);

  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  return template;
}
