import type { Scene3D } from "@ai-threejs-studio/scene3d";

// A hand-authored example of exactly the JSON the agent would emit for
// "a glowing crystal floating above a stone pedestal with dramatic lighting".
// It exercises the richness the old flat metadata schema could not express:
// hierarchy (group), emissive + glass (physical transmission) materials, a
// coloured glow point light, shadows, fog and a graded background.
export const sampleScene: Scene3D = {
  metadata: { name: "Glowing crystal on a stone pedestal", version: 1 },
  background: "#0b0f17",
  fog: { color: "#0b0f17", near: 6, far: 22 },
  camera: { position: [3.4, 2.6, 4.4], target: [0, 1.1, 0], fov: 42 },
  nodes: [
    {
      id: "ground",
      type: "mesh",
      name: "Ground",
      geometry: { kind: "box", args: [40, 0.2, 40] },
      transform: { position: [0, -0.1, 0] },
      material: { color: "#10151f", roughness: 0.95, metalness: 0 },
      receiveShadow: true,
      castShadow: false
    },
    {
      id: "pedestal",
      type: "group",
      name: "Pedestal",
      children: [
        {
          id: "pedestal-base",
          type: "mesh",
          name: "Base",
          geometry: { kind: "cylinder", args: [0.95, 1.1, 0.35, 48] },
          transform: { position: [0, 0.175, 0] },
          material: { color: "#3a3f46", roughness: 0.85, metalness: 0.05 }
        },
        {
          id: "pedestal-column",
          type: "mesh",
          name: "Column",
          geometry: { kind: "cylinder", args: [0.55, 0.7, 0.9, 48] },
          transform: { position: [0, 0.75, 0] },
          material: { color: "#4a5059", roughness: 0.8, metalness: 0.05 }
        },
        {
          id: "pedestal-top",
          type: "mesh",
          name: "Top slab",
          geometry: { kind: "box", args: [1.4, 0.16, 1.4] },
          transform: { position: [0, 1.28, 0] },
          material: { color: "#535a64", roughness: 0.7, metalness: 0.08 }
        }
      ]
    },
    {
      id: "crystal",
      type: "mesh",
      name: "Crystal",
      geometry: { kind: "icosahedron", args: [0.42, 0] },
      transform: { position: [0, 2.15, 0], rotation: [0.4, 0.6, 0.1], scale: [1, 1.7, 1] },
      material: {
        type: "physical",
        color: "#9fe8ff",
        roughness: 0.05,
        metalness: 0,
        transmission: 0.9,
        ior: 1.7,
        thickness: 0.6,
        emissive: "#3bc9ff",
        emissiveIntensity: 1.6
      }
    },
    {
      id: "glow",
      type: "light",
      name: "Crystal glow",
      light: "point",
      color: "#48d6ff",
      intensity: 14,
      distance: 9,
      transform: { position: [0, 2.15, 0] }
    },
    {
      id: "key",
      type: "light",
      name: "Key light",
      light: "spot",
      color: "#fff1dc",
      intensity: 40,
      distance: 20,
      angle: 0.5,
      penumbra: 0.5,
      transform: { position: [4, 6, 3] }
    },
    {
      id: "fill",
      type: "light",
      name: "Ambient fill",
      light: "ambient",
      color: "#3a4a66",
      intensity: 0.5
    }
  ]
};
