// Dependency-free validation + normalisation for Scene3D documents. This is what
// the agent runs on raw model output: it coerces loose/partial JSON into a valid
// Scene3D, collecting human-readable issues that feed the repair step. It never
// throws — a best-effort scene always comes back so preview/repair can proceed.

import {
  ANIMATABLE_PROPERTIES,
  CAMERA_TYPES,
  EASINGS,
  ENVIRONMENT_PRESETS,
  GEOMETRY_KINDS,
  TEXTURE_PATTERNS,
  normalizeTransform,
  type AnimatableProperty,
  type Animation,
  type AnimationTrack,
  type Camera,
  type CameraType,
  type Easing,
  type EnvironmentPreset,
  type EnvironmentSettings,
  type Geometry,
  type GeometryKind,
  type Keyframe,
  type LightKind,
  type Material,
  type PostProcessing,
  type Scene3D,
  type SceneNode,
  type TextureSpec,
  type Vec3
} from "./schema";

const LIGHT_KINDS: LightKind[] = ["ambient", "hemisphere", "directional", "point", "spot"];
const MATERIAL_TYPES = ["standard", "physical", "basic"];

export interface Scene3DValidationResult {
  scene: Scene3D;
  issues: string[];
  /** Errors that should block acceptance / trigger repair (vs. soft warnings). */
  errorCount: number;
}

export function validateScene3D(input: unknown): Scene3DValidationResult {
  const issues: string[] = [];
  const error = (message: string) => {
    issues.push(`[error] ${message}`);
  };
  const warn = (message: string) => {
    issues.push(`[warn] ${message}`);
  };

  const root = isRecord(input) ? input : {};
  if (!isRecord(input)) {
    error("Scene root must be an object.");
  }

  const seenIds = new Set<string>();
  let capturedCamera: Scene3D["camera"];
  const ensureId = (raw: unknown, fallback: string): string => {
    let id = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
    if (seenIds.has(id)) {
      warn(`Duplicate node id "${id}" was made unique.`);
      let suffix = 2;
      while (seenIds.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    seenIds.add(id);
    return id;
  };

  const normalizeNode = (raw: unknown, path: string): SceneNode | null => {
    if (!isRecord(raw)) {
      error(`Node at ${path} is not an object.`);
      return null;
    }

    const type = raw.type;
    const id = ensureId(raw.id, path);
    const base = {
      id,
      name: typeof raw.name === "string" ? raw.name : undefined,
      visible: raw.visible === false ? false : true,
      transform: isRecord(raw.transform) ? normalizeTransform(raw.transform as Partial<{ position: Vec3; rotation: Vec3; scale: Vec3 }>) : undefined
    };

    // Models often emit camera/environment as nodes; lift them to the top level
    // instead of turning them into a stray box.
    if (type === "camera") {
      const t = isRecord(raw.transform) ? (raw.transform as Record<string, unknown>) : raw;
      capturedCamera = capturedCamera ?? { position: asVec3(t.position), target: asVec3(raw.target ?? raw.lookAt), fov: asNumber(raw.fov) };
      return null;
    }
    if (type === "environment") {
      return null;
    }

    switch (type) {
      case "group": {
        const childrenRaw = Array.isArray(raw.children) ? raw.children : [];
        if (!Array.isArray(raw.children)) {
          warn(`Group "${id}" had no children array; defaulted to empty.`);
        }
        const children = childrenRaw
          .map((child, index) => normalizeNode(child, `${id}.children[${index}]`))
          .filter((node): node is SceneNode => node !== null);
        return { ...base, type: "group", children };
      }
      case "light": {
        // Accept the kind from `light` (string), `kind`, or a nested object
        // (`light: { kind, intensity, ... }`) — common model output shapes.
        const nested = isRecord(raw.light) ? (raw.light as Record<string, unknown>) : undefined;
        const kindRaw = typeof raw.light === "string" ? raw.light : nested?.kind ?? nested?.type ?? raw.kind;
        const light = LIGHT_KINDS.includes(kindRaw as LightKind) ? (kindRaw as LightKind) : "point";
        if (!LIGHT_KINDS.includes(kindRaw as LightKind)) {
          warn(`Light "${id}" had invalid light kind "${String(kindRaw)}"; defaulted to point.`);
        }
        const src = nested ?? raw;
        return {
          ...base,
          type: "light",
          light,
          color: asColor(raw.color ?? src.color),
          intensity: asNumber(raw.intensity ?? src.intensity),
          distance: asNumber(raw.distance ?? src.distance),
          angle: asNumber(raw.angle ?? src.angle),
          penumbra: asNumber(raw.penumbra ?? src.penumbra),
          groundColor: asColor(raw.groundColor ?? src.groundColor),
          castShadow: typeof raw.castShadow === "boolean" ? raw.castShadow : undefined
        };
      }
      case "model": {
        const assetUrl = typeof raw.assetUrl === "string" ? raw.assetUrl : undefined;
        if (assetUrl && /^https?:\/\//i.test(assetUrl)) {
          error(`Model "${id}" references a remote URL; only local project assets are allowed.`);
        }
        return { ...base, type: "model", assetUrl };
      }
      case "mesh":
      default: {
        if (type !== "mesh") {
          warn(`Node "${id}" had unknown type "${String(type)}"; treated as mesh.`);
        }
        const geometry = normalizeGeometry(raw.geometry, id, warn);
        return {
          ...base,
          type: "mesh",
          geometry,
          material: normalizeMaterial(raw.material),
          castShadow: typeof raw.castShadow === "boolean" ? raw.castShadow : undefined,
          receiveShadow: typeof raw.receiveShadow === "boolean" ? raw.receiveShadow : undefined
        };
      }
    }
  };

  const rawNodes = Array.isArray(root.nodes) ? root.nodes : [];
  if (!Array.isArray(root.nodes)) {
    error("Scene.nodes must be an array.");
  }
  const nodes = rawNodes
    .map((node, index) => normalizeNode(node, `nodes[${index}]`))
    .filter((node): node is SceneNode => node !== null);

  const renderable = countRenderable(nodes);
  if (renderable === 0) {
    error("Scene has no visible mesh or model, so it would render blank.");
  }
  const hasLight = nodes.some((node) => node.type === "light");
  if (!hasLight) {
    warn("Scene defines no lights; relying on defaults only.");
  }

  const cameras = normalizeCameras(root.cameras, warn);
  const activeCameraId = typeof root.activeCameraId === "string" && cameras.some((c) => c.id === root.activeCameraId)
    ? root.activeCameraId
    : cameras.length > 0
      ? cameras[0].id
      : undefined;

  const scene: Scene3D = {
    metadata: { name: isRecord(root.metadata) && typeof root.metadata.name === "string" ? root.metadata.name : undefined, version: 1 },
    background: asColor(root.background),
    fog: normalizeFog(root.fog),
    environment: normalizeEnvironment(root.environment),
    postprocessing: normalizePostProcessing(root.postprocessing),
    camera: normalizeCamera(root.camera) ?? capturedCamera,
    cameras: cameras.length > 0 ? cameras : undefined,
    activeCameraId,
    animation: normalizeAnimation(root.animation, warn),
    nodes
  };

  const errorCount = issues.filter((issue) => issue.startsWith("[error]")).length;
  return { scene, issues, errorCount };
}

function normalizeGeometry(raw: unknown, id: string, warn: (m: string) => void): Geometry {
  if (!isRecord(raw)) {
    warn(`Mesh "${id}" had no geometry; defaulted to box.`);
    return { kind: "box" };
  }
  const kind = GEOMETRY_KINDS.includes(raw.kind as GeometryKind) ? (raw.kind as GeometryKind) : "box";
  if (!GEOMETRY_KINDS.includes(raw.kind as GeometryKind)) {
    warn(`Mesh "${id}" had unknown geometry "${String(raw.kind)}"; defaulted to box.`);
  }
  const args = Array.isArray(raw.args) ? raw.args.filter((value): value is number => typeof value === "number") : undefined;
  // The per-kind args arity is enforced loosely; the renderer fills defaults.
  return { kind, args: args && args.length > 0 ? args : undefined } as Geometry;
}

function normalizeMaterial(raw: unknown): Material | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const material: Material = {
    type: MATERIAL_TYPES.includes(raw.type as string) ? (raw.type as Material["type"]) : undefined,
    color: asColor(raw.color),
    roughness: clamp01(asNumber(raw.roughness)),
    metalness: clamp01(asNumber(raw.metalness)),
    emissive: asColor(raw.emissive),
    emissiveIntensity: asNumber(raw.emissiveIntensity),
    opacity: clamp01(asNumber(raw.opacity)),
    transmission: clamp01(asNumber(raw.transmission)),
    ior: asNumber(raw.ior),
    thickness: asNumber(raw.thickness),
    wireframe: typeof raw.wireframe === "boolean" ? raw.wireframe : undefined,
    flatShading: typeof raw.flatShading === "boolean" ? raw.flatShading : undefined,
    texture: normalizeTexture(raw.texture)
  };
  // Glass needs a physical material.
  if (typeof material.transmission === "number" && material.transmission > 0 && !material.type) {
    material.type = "physical";
  }
  return material;
}

function normalizeTexture(raw: unknown): TextureSpec | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const pattern = TEXTURE_PATTERNS.includes(raw.pattern as NonNullable<TextureSpec["pattern"]>)
    ? (raw.pattern as TextureSpec["pattern"])
    : undefined;
  const imageUrl = typeof raw.imageUrl === "string" && raw.imageUrl.trim().length > 0 ? raw.imageUrl.trim() : undefined;
  // A texture must have at least one source.
  if (!pattern && !imageUrl) {
    return undefined;
  }
  return {
    pattern,
    imageUrl,
    color1: asColor(raw.color1),
    color2: asColor(raw.color2),
    repeat: asNumber(raw.repeat)
  };
}

function normalizeFog(raw: unknown): Scene3D["fog"] {
  if (!isRecord(raw)) return undefined;
  const color = asColor(raw.color);
  const near = asNumber(raw.near);
  const far = asNumber(raw.far);
  if (!color || typeof near !== "number" || typeof far !== "number") return undefined;
  return { color, near, far };
}

function normalizeEnvironment(raw: unknown): EnvironmentSettings | undefined {
  if (!isRecord(raw)) return undefined;
  const preset = ENVIRONMENT_PRESETS.includes(raw.preset as EnvironmentPreset) ? (raw.preset as EnvironmentPreset) : undefined;
  const env: EnvironmentSettings = {
    preset,
    intensity: asNumber(raw.intensity),
    background: typeof raw.background === "boolean" ? raw.background : undefined,
    blur: clamp01(asNumber(raw.blur))
  };
  // Nothing usable without a preset.
  return env.preset ? env : undefined;
}

function normalizePostProcessing(raw: unknown): PostProcessing | undefined {
  if (!isRecord(raw)) return undefined;
  const result: PostProcessing = {};
  if (isRecord(raw.bloom)) {
    result.bloom = {
      intensity: asNumber(raw.bloom.intensity),
      luminanceThreshold: clamp01(asNumber(raw.bloom.luminanceThreshold)),
      radius: clamp01(asNumber(raw.bloom.radius))
    };
  }
  if (isRecord(raw.vignette)) {
    result.vignette = { darkness: clamp01(asNumber(raw.vignette.darkness)) };
  }
  if (raw.ssao === true) result.ssao = true;
  if (isRecord(raw.dof)) {
    result.dof = {
      focusDistance: asNumber(raw.dof.focusDistance),
      focalLength: asNumber(raw.dof.focalLength),
      bokehScale: asNumber(raw.dof.bokehScale)
    };
  }
  // Drop an all-empty object so `postprocessing` stays undefined unless used.
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeCamera(raw: unknown): Scene3D["camera"] {
  if (!isRecord(raw)) return undefined;
  return {
    position: asVec3(raw.position),
    target: asVec3(raw.target),
    fov: asNumber(raw.fov)
  };
}

function normalizeCameras(raw: unknown, warn: (m: string) => void): Camera[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const cameras: Camera[] = [];
  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      warn(`Camera at cameras[${index}] is not an object; skipped.`);
      return;
    }
    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `camera-${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    const type: CameraType = CAMERA_TYPES.includes(entry.type as CameraType) ? (entry.type as CameraType) : "perspective";
    cameras.push({
      id,
      name: typeof entry.name === "string" ? entry.name : `Camera ${index + 1}`,
      type,
      position: asVec3(entry.position),
      target: asVec3(entry.target),
      fov: asNumber(entry.fov),
      zoom: asNumber(entry.zoom),
      near: asNumber(entry.near),
      far: asNumber(entry.far)
    });
  });
  return cameras;
}

function normalizeAnimation(raw: unknown, warn: (m: string) => void): Animation | undefined {
  if (!isRecord(raw)) return undefined;
  const rawTracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  const seen = new Set<string>();
  const tracks: AnimationTrack[] = [];
  rawTracks.forEach((entry, index) => {
    if (!isRecord(entry)) {
      warn(`Animation track at tracks[${index}] is not an object; skipped.`);
      return;
    }
    const targetId = typeof entry.targetId === "string" && entry.targetId.trim() ? entry.targetId.trim() : undefined;
    if (!targetId) {
      warn(`Animation track at tracks[${index}] has no targetId; skipped.`);
      return;
    }
    const property = ANIMATABLE_PROPERTIES.includes(entry.property as AnimatableProperty)
      ? (entry.property as AnimatableProperty)
      : undefined;
    if (!property) {
      warn(`Animation track at tracks[${index}] has invalid property "${String(entry.property)}"; skipped.`);
      return;
    }
    const keyframes = normalizeKeyframes(entry.keyframes);
    if (keyframes.length === 0) {
      warn(`Animation track at tracks[${index}] has no keyframes; skipped.`);
      return;
    }
    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `track-${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    tracks.push({ id, targetId, property, keyframes });
  });
  if (tracks.length === 0) return undefined;
  const latest = tracks.reduce((max, t) => Math.max(max, t.keyframes[t.keyframes.length - 1].time), 0);
  const duration = asNumber(raw.duration);
  return {
    duration: typeof duration === "number" && duration > 0 ? duration : latest,
    loop: raw.loop === false ? false : true,
    tracks
  };
}

function normalizeKeyframes(raw: unknown): Keyframe[] {
  if (!Array.isArray(raw)) return [];
  const keyframes: Keyframe[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const time = asNumber(entry.time);
    const value = asNumber(entry.value);
    if (typeof time !== "number" || typeof value !== "number") continue;
    const easing: Easing | undefined = EASINGS.includes(entry.easing as Easing) ? (entry.easing as Easing) : undefined;
    keyframes.push({ time: Math.max(0, time), value, easing });
  }
  // The renderer assumes keyframes are time-sorted.
  return keyframes.sort((a, b) => a.time - b.time);
}

function countRenderable(nodes: SceneNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.visible === false) continue;
    if (node.type === "mesh" || node.type === "model") count += 1;
    if (node.type === "group") count += countRenderable(node.children);
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp01(value: number | undefined): number | undefined {
  if (typeof value !== "number") return undefined;
  return Math.min(1, Math.max(0, value));
}

function asColor(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asVec3(value: unknown): Vec3 | undefined {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number")) {
    return [value[0], value[1], value[2]] as Vec3;
  }
  return undefined;
}

export function formatScene3DIssues(issues: string[]): string {
  if (issues.length === 0) return "No issues.";
  return issues.join("\n");
}
