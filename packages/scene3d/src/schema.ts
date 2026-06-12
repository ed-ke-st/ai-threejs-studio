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

// ---------------------------------------------------------------------------
// Cameras: a scene can hold several named cameras and mark one active. The active
// camera drives the runtime/share/export view; the editor can also look through it.
// ---------------------------------------------------------------------------

export type CameraType = "perspective" | "orthographic";
export const CAMERA_TYPES: CameraType[] = ["perspective", "orthographic"];

export interface Camera {
  id: string;
  name?: string;
  type?: CameraType; // default perspective
  position?: Vec3;
  target?: Vec3;
  fov?: number; // perspective (degrees)
  zoom?: number; // orthographic
  near?: number;
  far?: number;
}

// ---------------------------------------------------------------------------
// Keyframe animation: tracks of (time, value) keyframes targeting a node or
// camera property. The renderer interpolates them on a shared timeline clock.
// ---------------------------------------------------------------------------

export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut";
export const EASINGS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut"];

export type AnimatableProperty =
  | "position.x" | "position.y" | "position.z"
  | "rotation.x" | "rotation.y" | "rotation.z"
  | "scale.x" | "scale.y" | "scale.z" | "scale"
  | "target.x" | "target.y" | "target.z" // camera look-at
  | "opacity";

export const ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  "position.x", "position.y", "position.z",
  "rotation.x", "rotation.y", "rotation.z",
  "scale.x", "scale.y", "scale.z", "scale",
  "target.x", "target.y", "target.z",
  "opacity"
];

export interface Keyframe {
  time: number; // seconds
  value: number;
  easing?: Easing; // easing INTO this keyframe (default linear)
}

export interface AnimationTrack {
  id: string;
  targetId: string; // a node id or camera id
  property: AnimatableProperty;
  keyframes: Keyframe[]; // kept sorted by time
}

export interface Animation {
  duration: number; // seconds
  loop?: boolean; // default true
  tracks: AnimationTrack[];
}

export interface Scene3D {
  metadata: { name?: string; version: 1 };
  background?: Color;
  fog?: { color: Color; near: number; far: number };
  environment?: { preset?: string; intensity?: number };
  // Legacy single camera (kept for back-compat); superseded by `cameras`.
  camera?: { position?: Vec3; target?: Vec3; fov?: number };
  cameras?: Camera[];
  activeCameraId?: string;
  animation?: Animation;
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

// ---------------------------------------------------------------------------
// Cameras: resolve a usable camera list (synthesising one from the legacy single
// `camera` field) and pick the active one. Keeps editor/runtime/codegen aligned.
// ---------------------------------------------------------------------------

export const DEFAULT_CAMERA: Required<Pick<Camera, "position" | "target" | "fov">> = {
  position: [3.4, 2.6, 4.4],
  target: [0, 1, 0],
  fov: 45
};

export function getCameras(scene: Scene3D): Camera[] {
  if (scene.cameras && scene.cameras.length > 0) return scene.cameras;
  // Synthesise a single camera from the legacy field (or defaults) so the rest of
  // the pipeline can always assume a non-empty camera list.
  const legacy = scene.camera ?? {};
  return [
    {
      id: "camera-1",
      name: "Camera 1",
      type: "perspective",
      position: legacy.position ?? DEFAULT_CAMERA.position,
      target: legacy.target ?? DEFAULT_CAMERA.target,
      fov: legacy.fov ?? DEFAULT_CAMERA.fov
    }
  ];
}

export function getActiveCamera(scene: Scene3D): Camera {
  const cameras = getCameras(scene);
  return cameras.find((c) => c.id === scene.activeCameraId) ?? cameras[0];
}

// ---------------------------------------------------------------------------
// Keyframe sampling: interpolate a track's value at a given time. Keyframes are
// absolute values; the property they target is fully driven over the timeline.
// ---------------------------------------------------------------------------

function easeT(t: number, easing: Easing): number {
  switch (easing) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return t * (2 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default:
      return t; // linear
  }
}

/** Value of a track at `time` (clamped to its first/last keyframe). undefined if empty. */
export function sampleTrack(track: AnimationTrack, time: number): number | undefined {
  const kfs = track.keyframes;
  if (kfs.length === 0) return undefined;
  if (kfs.length === 1) return kfs[0].value;
  if (time <= kfs[0].time) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (time >= last.time) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time;
      const t = span <= 0 ? 0 : (time - a.time) / span;
      return a.value + (b.value - a.value) * easeT(t, b.easing ?? "linear");
    }
  }
  return last.value;
}

// --- Track editing (pure; used by the editor timeline + future agent edits) ---

/** Insert or replace a keyframe at `time` on the (targetId, property) track,
 *  creating the track/animation as needed. Keeps keyframes sorted and grows
 *  duration to cover the latest key. */
export function upsertAnimationKeyframe(
  animation: Animation | undefined,
  targetId: string,
  property: AnimatableProperty,
  time: number,
  value: number,
  easing?: Easing
): Animation {
  const tracks = animation ? animation.tracks.map((t) => ({ ...t, keyframes: [...t.keyframes] })) : [];
  const keyframe: Keyframe = { time, value, easing };
  const index = tracks.findIndex((t) => t.targetId === targetId && t.property === property);
  if (index === -1) {
    tracks.push({ id: `${targetId}.${property}`, targetId, property, keyframes: [keyframe] });
  } else {
    const kfs = tracks[index].keyframes.filter((k) => Math.abs(k.time - time) > 1e-4);
    kfs.push(keyframe);
    kfs.sort((a, b) => a.time - b.time);
    tracks[index].keyframes = kfs;
  }
  const latest = tracks.reduce((max, t) => Math.max(max, t.keyframes[t.keyframes.length - 1]?.time ?? 0), 0);
  return { duration: Math.max(animation?.duration ?? 0, latest), loop: animation?.loop ?? true, tracks };
}

/** Remove a whole track. Returns undefined when no tracks remain. */
export function removeAnimationTrack(animation: Animation, trackId: string): Animation | undefined {
  const tracks = animation.tracks.filter((t) => t.id !== trackId);
  return tracks.length > 0 ? { ...animation, tracks } : undefined;
}

/** Remove the keyframe at `time` from a track; drops the track (and animation)
 *  when it empties. Returns undefined when nothing animatable remains. */
export function removeAnimationKeyframe(animation: Animation, trackId: string, time: number): Animation | undefined {
  const tracks = animation.tracks
    .map((t) => (t.id === trackId ? { ...t, keyframes: t.keyframes.filter((k) => Math.abs(k.time - time) > 1e-4) } : t))
    .filter((t) => t.keyframes.length > 0);
  return tracks.length > 0 ? { ...animation, tracks } : undefined;
}

/** Total timeline length: explicit duration or the latest keyframe time. */
export function animationDuration(animation?: Animation): number {
  if (!animation) return 0;
  if (animation.duration > 0) return animation.duration;
  let max = 0;
  for (const track of animation.tracks) {
    const last = track.keyframes[track.keyframes.length - 1];
    if (last && last.time > max) max = last.time;
  }
  return max;
}
