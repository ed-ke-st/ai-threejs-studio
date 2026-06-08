// Scene3D — the single, structured source of truth for a scene.
//
// This is the representation the AI agent emits/edits AND the user edits in the
// Scene Editor. It is rich enough to express most "create stuff" scenes
// (hierarchy, primitives + imported models, PBR materials, lights, environment),
// while staying fully structured so every property is editable and round-trips
// losslessly. Code is never the source of truth — it is generated from this JSON
// only at export/download time.

export type Vec3 = [number, number, number];
export type Color = string; // hex string, e.g. "#88ccff"

export interface Transform {
  position: Vec3;
  rotation: Vec3; // radians
  scale: Vec3;
}

export type Geometry =
  | { kind: "box"; args?: [number, number, number] }
  | { kind: "sphere"; args?: [number, number?, number?] } // radius, widthSeg, heightSeg
  | { kind: "cylinder"; args?: [number, number, number, number?] } // top, bottom, height, radialSeg
  | { kind: "cone"; args?: [number, number, number?] } // radius, height, radialSeg
  | { kind: "plane"; args?: [number, number] }
  | { kind: "torus"; args?: [number, number, number?, number?] } // radius, tube, radialSeg, tubularSeg
  | { kind: "torusKnot"; args?: [number, number, number?, number?] }
  | { kind: "capsule"; args?: [number, number, number?, number?] } // radius, length, capSeg, radialSeg
  | { kind: "icosahedron"; args?: [number, number?] }; // radius, detail

export type GeometryKind = Geometry["kind"];

export const GEOMETRY_KINDS: GeometryKind[] = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "plane",
  "torus",
  "torusKnot",
  "capsule",
  "icosahedron"
];

export interface Material {
  type?: "standard" | "physical" | "basic";
  color?: Color;
  roughness?: number;
  metalness?: number;
  emissive?: Color;
  emissiveIntensity?: number;
  opacity?: number; // < 1 => transparent
  transmission?: number; // physical glass (requires type "physical")
  ior?: number;
  thickness?: number;
  wireframe?: boolean;
  flatShading?: boolean;
  texture?: TextureSpec;
}

// Procedural surface texture, generated on a canvas at render time (no asset
// files needed). Applied as the material's color map.
export type TexturePattern = "checker" | "grid" | "dots" | "noise";

export const TEXTURE_PATTERNS: TexturePattern[] = ["checker", "grid", "dots", "noise"];

export interface TextureSpec {
  pattern?: TexturePattern; // procedural pattern (canvas-generated)
  imageUrl?: string; // image map — an uploaded asset URL or external image URL
  color1?: Color; // pattern foreground
  color2?: Color; // pattern background
  repeat?: number; // tiling density across the surface
}

export type LightKind = "ambient" | "hemisphere" | "directional" | "point" | "spot";

export interface BaseNode {
  id: string;
  name?: string;
  visible?: boolean;
  transform?: Partial<Transform>;
}

export interface MeshNode extends BaseNode {
  type: "mesh";
  geometry: Geometry;
  material?: Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface GroupNode extends BaseNode {
  type: "group";
  children: SceneNode[];
}

export interface ModelNode extends BaseNode {
  type: "model";
  assetUrl?: string; // local project asset; missing => placeholder
}

export interface LightNode extends BaseNode {
  type: "light";
  light: LightKind;
  color?: Color;
  intensity?: number;
  distance?: number;
  angle?: number; // spot
  penumbra?: number; // spot
  groundColor?: Color; // hemisphere
  castShadow?: boolean;
}

export type SceneNode = MeshNode | GroupNode | ModelNode | LightNode;
export type SceneNodeType = SceneNode["type"];

export interface Scene3D {
  metadata: { name?: string; version: 1 };
  background?: Color;
  fog?: { color: Color; near: number; far: number };
  environment?: { preset?: string; intensity?: number };
  camera?: { position?: Vec3; target?: Vec3; fov?: number };
  nodes: SceneNode[]; // root nodes; hierarchy via group children
}

// ---------------------------------------------------------------------------
// Normalisation: fill defaults so the renderer/editor can rely on shape. This is
// the dependency-free analogue of the agent-side Zod validator + repair step.
// ---------------------------------------------------------------------------

export const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

export function normalizeTransform(transform?: Partial<Transform>): Transform {
  return {
    position: vec3(transform?.position, DEFAULT_TRANSFORM.position),
    rotation: vec3(transform?.rotation, DEFAULT_TRANSFORM.rotation),
    scale: vec3(transform?.scale, DEFAULT_TRANSFORM.scale)
  };
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number")) {
    return [value[0], value[1], value[2]] as Vec3;
  }
  return [...fallback];
}

export function flattenNodes(nodes: SceneNode[]): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (list: SceneNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.type === "group") {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export function findNode(nodes: SceneNode[], id: string): SceneNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.type === "group") {
      const found = findNode(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// Immutably replace a node by id (used by the editor on every edit).
export function updateNode(nodes: SceneNode[], id: string, updater: (node: SceneNode) => SceneNode): SceneNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return updater(node);
    }
    if (node.type === "group") {
      return { ...node, children: updateNode(node.children, id, updater) };
    }
    return node;
  });
}
