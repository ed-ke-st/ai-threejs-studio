// Geometry-aware scene linter + deterministic auto-fixes. Computes approximate
// world-space axis-aligned bounding boxes from the Scene3D JSON (no renderer, no
// GPU) and flags spatial problems the model commonly produces — floating, sunk,
// overlapping, badly-scaled objects — that the pixel-based visual validator can't
// see. It also auto-grounds objects to the floor and frames the camera to fit the
// subject, both with no model call.
//
// Bounds ignore rotation (a first-order approximation): for grounding/overlap on
// mostly-upright scene objects this is close enough, and it stays cheap.

import { normalizeTransform } from "./schema";
import type { Geometry, Scene3D, SceneNode, Vec3 } from "./schema";

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export interface LintIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeIds: string[];
}

export interface LintOptions {
  /** When true, floating objects are allowed (prompt asked for hovering/levitating). */
  allowFloating?: boolean;
  /** Floor height; scene convention is y = 0. */
  floorY?: number;
}

export interface AutoFixOptions extends LintOptions {
  /** Ground sunk/floating objects onto the floor. */
  ground?: boolean;
  /** Only un-sink objects below the floor; never touch floating ones (safe for refine). */
  sunkOnly?: boolean;
  /** Re-aim the camera to fit the subject (keeps the existing view direction). */
  reframeCamera?: boolean;
}

export interface AutoFixResult {
  scene: Scene3D;
  applied: string[];
}

interface NodeBox {
  node: SceneNode;
  box: Aabb;
  floorLike: boolean;
}

// --- bounds ---------------------------------------------------------------

function geometryHalfExtents(geometry: Geometry): Vec3 {
  const a = geometry.args;
  switch (geometry.kind) {
    case "sphere": {
      const r = (a?.[0] as number) ?? 0.8;
      return [r, r, r];
    }
    case "cylinder": {
      const r = Math.max((a?.[0] as number) ?? 0.6, (a?.[1] as number) ?? 0.6);
      const h = (a?.[2] as number) ?? 1.2;
      return [r, h / 2, r];
    }
    case "cone": {
      const r = (a?.[0] as number) ?? 0.7;
      const h = (a?.[1] as number) ?? 1.4;
      return [r, h / 2, r];
    }
    case "plane": {
      const w = (a?.[0] as number) ?? 2;
      const h = (a?.[1] as number) ?? 2;
      return [w / 2, h / 2, 0.01];
    }
    case "torus": {
      const r = (a?.[0] as number) ?? 0.6;
      const tube = (a?.[1] as number) ?? 0.22;
      return [r + tube, r + tube, tube];
    }
    case "torusKnot": {
      const r = (a?.[0] as number) ?? 0.6;
      const tube = (a?.[1] as number) ?? 0.2;
      return [r + tube * 2, r + tube * 2, r + tube * 2];
    }
    case "capsule": {
      const r = (a?.[0] as number) ?? 0.4;
      const len = (a?.[1] as number) ?? 0.9;
      return [r, len / 2 + r, r];
    }
    case "icosahedron": {
      const r = (a?.[0] as number) ?? 0.9;
      return [r, r, r];
    }
    case "box":
    default: {
      const w = (a?.[0] as number) ?? 1;
      const h = (a?.[1] as number) ?? 1;
      const d = (a?.[2] as number) ?? 1;
      return [w / 2, h / 2, d / 2];
    }
  }
}

function union(a: Aabb, b: Aabb): Aabb {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
  };
}

// World AABB of a node, given the accumulated parent origin + scale (rotation
// ignored). Returns null for nodes with no geometry (lights, empty groups, models).
function boundsOf(node: SceneNode, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number): Aabb | null {
  const t = normalizeTransform(node.transform);
  const wx = ox + sx * t.position[0];
  const wy = oy + sy * t.position[1];
  const wz = oz + sz * t.position[2];
  const nsx = sx * t.scale[0];
  const nsy = sy * t.scale[1];
  const nsz = sz * t.scale[2];

  if (node.type === "mesh") {
    const h = geometryHalfExtents(node.geometry);
    return {
      min: [wx - h[0] * nsx, wy - h[1] * nsy, wz - h[2] * nsz],
      max: [wx + h[0] * nsx, wy + h[1] * nsy, wz + h[2] * nsz]
    };
  }
  if (node.type === "group") {
    let box: Aabb | null = null;
    for (const child of node.children) {
      const childBox = boundsOf(child, wx, wy, wz, nsx, nsy, nsz);
      if (childBox) box = box ? union(box, childBox) : childBox;
    }
    return box;
  }
  return null;
}

function extent(box: Aabb, axis: number): number {
  return box.max[axis] - box.min[axis];
}

function isFloorLike(node: SceneNode, box: Aabb): boolean {
  if (/floor|ground|terrain/i.test(`${node.id} ${node.name ?? ""}`)) return true;
  const cy = (box.min[1] + box.max[1]) / 2;
  return extent(box, 0) > 4 && extent(box, 2) > 4 && extent(box, 1) < 0.6 && Math.abs(cy) < 0.6;
}

/** Top-level nodes with computable bounds, tagged with whether they read as floor. */
function topLevelBoxes(scene: Scene3D): NodeBox[] {
  const result: NodeBox[] = [];
  for (const node of scene.nodes) {
    const box = boundsOf(node, 0, 0, 0, 1, 1, 1);
    if (box) result.push({ node, box, floorLike: isFloorLike(node, box) });
  }
  return result;
}

function overlaps2D(a: Aabb, b: Aabb): boolean {
  return a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[2] < b.max[2] && a.max[2] > b.min[2];
}

// --- linting --------------------------------------------------------------

export function lintScene(scene: Scene3D, options: LintOptions = {}): LintIssue[] {
  const floorY = options.floorY ?? 0;
  const boxes = topLevelBoxes(scene);
  const objects = boxes.filter((b) => !b.floorLike);
  const issues: LintIssue[] = [];

  for (const { node, box } of objects) {
    const minY = box.min[1];
    const label = node.name ?? node.id;

    if (minY < floorY - 0.05) {
      issues.push({ code: "sunk", severity: "error", message: `"${label}" sinks ${(floorY - minY).toFixed(2)} below the floor.`, nodeIds: [node.id] });
    } else if (minY > floorY + 0.1) {
      const supported = objects.some((other) => other.node.id !== node.id && overlaps2D(box, other.box) && other.box.max[1] >= minY - 0.2 && other.box.max[1] <= box.max[1]);
      if (!supported && !options.allowFloating) {
        issues.push({ code: "floating", severity: "error", message: `"${label}" floats ${(minY - floorY).toFixed(2)} above the floor with nothing under it.`, nodeIds: [node.id] });
      }
    }
  }

  // Pairwise overlaps (deep interpenetration only).
  for (let i = 0; i < objects.length; i += 1) {
    for (let j = i + 1; j < objects.length; j += 1) {
      const a = objects[i];
      const b = objects[j];
      const depth = [0, 1, 2].map((axis) => Math.min(a.box.max[axis], b.box.max[axis]) - Math.max(a.box.min[axis], b.box.min[axis]));
      if (depth.some((d) => d <= 0)) continue; // not intersecting
      const minDepth = Math.min(...depth);
      const smaller = Math.min(volume(a.box), volume(b.box));
      const overlapVol = depth[0] * depth[1] * depth[2];
      if (minDepth > 0.25 || overlapVol > smaller * 0.35) {
        const deep = minDepth > 0.5 || overlapVol > smaller * 0.6;
        issues.push({
          code: "overlap",
          severity: deep ? "error" : "warning",
          message: `"${a.node.name ?? a.node.id}" and "${b.node.name ?? b.node.id}" intersect (by ~${minDepth.toFixed(2)}). Space them apart.`,
          nodeIds: [a.node.id, b.node.id]
        });
      }
    }
  }

  // Wildly off-scale objects relative to the median.
  const sizes = objects.map((o) => Math.max(extent(o.box, 0), extent(o.box, 1), extent(o.box, 2)));
  const median = sizes.slice().sort((x, y) => x - y)[Math.floor(sizes.length / 2)] ?? 1;
  objects.forEach((o, idx) => {
    const size = sizes[idx];
    if (median > 0 && size > median * 6) {
      issues.push({ code: "oversized", severity: "warning", message: `"${o.node.name ?? o.node.id}" is much larger than everything else — check its scale.`, nodeIds: [o.node.id] });
    } else if (size < 0.04) {
      issues.push({ code: "tiny", severity: "warning", message: `"${o.node.name ?? o.node.id}" is almost invisibly small.`, nodeIds: [o.node.id] });
    }
  });

  return issues;
}

function volume(box: Aabb): number {
  return Math.max(0, extent(box, 0)) * Math.max(0, extent(box, 1)) * Math.max(0, extent(box, 2));
}

// --- auto-fix -------------------------------------------------------------

export function autoFixScene(scene: Scene3D, options: AutoFixOptions = {}): AutoFixResult {
  const applied: string[] = [];
  let next = scene;

  if (options.ground) {
    const { scene: grounded, count } = groundObjects(next, options);
    next = grounded;
    if (count > 0) applied.push(`grounded ${count} object${count === 1 ? "" : "s"}`);
  }

  if (options.reframeCamera) {
    const reframed = reframeCamera(next);
    if (reframed) {
      next = reframed;
      applied.push("reframed camera");
    }
  }

  return { scene: next, applied };
}

function groundObjects(scene: Scene3D, options: AutoFixOptions): { scene: Scene3D; count: number } {
  const floorY = options.floorY ?? 0;
  const boxes = topLevelBoxes(scene);
  const objects = boxes.filter((b) => !b.floorLike);

  // id -> y delta to rest on the floor. Sunk objects (below the floor) are always
  // raised — that's never intentional. Floating objects are only dropped in full
  // mode (not sunkOnly), since hovering can be deliberate.
  const deltas = new Map<string, number>();
  for (const { node, box } of objects) {
    const minY = box.min[1];
    if (minY < floorY - 0.05) {
      deltas.set(node.id, floorY - minY);
    } else if (!options.sunkOnly && minY > floorY + 0.1 && !options.allowFloating) {
      const supported = objects.some((other) => other.node.id !== node.id && overlaps2D(box, other.box) && other.box.max[1] >= minY - 0.2 && other.box.max[1] <= box.max[1]);
      if (!supported) deltas.set(node.id, floorY - minY);
    }
  }
  if (deltas.size === 0) return { scene, count: 0 };

  const nodes = scene.nodes.map((node) => {
    const delta = deltas.get(node.id);
    if (delta === undefined) return node;
    const t = normalizeTransform(node.transform);
    return { ...node, transform: { ...t, position: [t.position[0], t.position[1] + delta, t.position[2]] as Vec3 } };
  });
  return { scene: { ...scene, nodes }, count: deltas.size };
}

function reframeCamera(scene: Scene3D): Scene3D | null {
  const boxes = topLevelBoxes(scene);
  const subject = boxes.filter((b) => !b.floorLike);
  const used = (subject.length > 0 ? subject : boxes).map((b) => b.box);
  if (used.length === 0) return null;

  let bounds = used[0];
  for (let i = 1; i < used.length; i += 1) bounds = union(bounds, used[i]);

  const center: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
  const radius = 0.5 * Math.hypot(extent(bounds, 0), extent(bounds, 1), extent(bounds, 2)) || 1;

  const cam = scene.camera ?? {};
  const fov = cam.fov ?? 45;

  // Keep the existing view direction (or a pleasant 3/4 default).
  let dir: Vec3 = [1, 0.7, 1];
  if (cam.position && cam.target) {
    const d: Vec3 = [cam.position[0] - cam.target[0], cam.position[1] - cam.target[1], cam.position[2] - cam.target[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len > 0.01) dir = [d[0] / len, d[1] / len, d[2] / len];
  }
  const dirLen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  dir = [dir[0] / dirLen, dir[1] / dirLen, dir[2] / dirLen];

  const distance = (radius / Math.sin(((fov * Math.PI) / 180) / 2)) * 1.25;
  const position: Vec3 = [center[0] + dir[0] * distance, center[1] + dir[1] * distance, center[2] + dir[2] * distance];

  return { ...scene, camera: { ...cam, position, target: center, fov } };
}
