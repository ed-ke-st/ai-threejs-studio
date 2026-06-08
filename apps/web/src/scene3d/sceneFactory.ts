// Factories for manually-added scene objects (the "Add" menu). Each produces a
// SceneNode with a unique id/name, a sensible default transform, and default
// material/light props — the editor then inserts and selects it.

import type { Geometry, GeometryKind, LightKind, SceneNode, Transform } from "@ai-threejs-studio/scene3d";

export type AddSpec =
  | { category: "mesh"; kind: GeometryKind }
  | { category: "light"; kind: LightKind }
  | { category: "group" };

export const LIGHT_KINDS: LightKind[] = ["ambient", "hemisphere", "directional", "point", "spot"];

const GEOMETRY_LABELS: Record<GeometryKind, string> = {
  box: "Box",
  sphere: "Sphere",
  cylinder: "Cylinder",
  cone: "Cone",
  plane: "Plane",
  torus: "Torus",
  torusKnot: "Torus Knot",
  capsule: "Capsule",
  icosahedron: "Icosahedron"
};

export function geometryLabel(kind: GeometryKind): string {
  return GEOMETRY_LABELS[kind];
}

export function lightLabel(kind: LightKind): string {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} Light`;
}

const transform = (position: [number, number, number]): Transform => ({ position, rotation: [0, 0, 0], scale: [1, 1, 1] });

// Returns a free id/name: "box", then "box-2"/"Box 2", etc.
function unique(base: string, label: string, existing: Set<string>): { id: string; name: string } {
  if (!existing.has(base)) return { id: base, name: label };
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return { id: `${base}-${i}`, name: `${label} ${i}` };
}

export function createNodeFromSpec(spec: AddSpec, existing: Set<string>): SceneNode {
  if (spec.category === "group") {
    const { id, name } = unique("group", "Group", existing);
    return { id, name, type: "group", transform: transform([0, 0, 0]), children: [] };
  }

  if (spec.category === "light") {
    const { id, name } = unique(`${spec.kind}-light`, lightLabel(spec.kind), existing);
    const ambientish = spec.kind === "ambient" || spec.kind === "hemisphere";
    const intensity = ambientish ? 0.6 : spec.kind === "directional" ? 2 : 8;
    return { id, name, type: "light", transform: transform(ambientish ? [0, 0, 0] : [3, 4, 2]), light: spec.kind, color: "#ffffff", intensity };
  }

  const { id, name } = unique(spec.kind, geometryLabel(spec.kind), existing);
  return {
    id,
    name,
    type: "mesh",
    transform: transform([0, 0.75, 0]),
    geometry: { kind: spec.kind } as Geometry,
    material: { color: "#cbd5e1", roughness: 0.6, metalness: 0.1 }
  };
}
