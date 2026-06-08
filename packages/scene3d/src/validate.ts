// Dependency-free validation + normalisation for Scene3D documents. This is what
// the agent runs on raw model output: it coerces loose/partial JSON into a valid
// Scene3D, collecting human-readable issues that feed the repair step. It never
// throws — a best-effort scene always comes back so preview/repair can proceed.

import {
  GEOMETRY_KINDS,
  TEXTURE_PATTERNS,
  normalizeTransform,
  type Geometry,
  type GeometryKind,
  type LightKind,
  type Material,
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

  const scene: Scene3D = {
    metadata: { name: isRecord(root.metadata) && typeof root.metadata.name === "string" ? root.metadata.name : undefined, version: 1 },
    background: asColor(root.background),
    fog: normalizeFog(root.fog),
    environment: isRecord(root.environment)
      ? { preset: typeof root.environment.preset === "string" ? root.environment.preset : undefined, intensity: asNumber(root.environment.intensity) }
      : undefined,
    camera: normalizeCamera(root.camera) ?? capturedCamera,
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

function normalizeCamera(raw: unknown): Scene3D["camera"] {
  if (!isRecord(raw)) return undefined;
  return {
    position: asVec3(raw.position),
    target: asVec3(raw.target),
    fov: asNumber(raw.fov)
  };
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
