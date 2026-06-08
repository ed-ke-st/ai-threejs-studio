// Curated few-shot examples. These are hand-crafted, schema-valid Scene3D
// documents that demonstrate the quality bar we want: grouped multi-part objects
// with descriptive names, realistic proportions, objects resting on surfaces,
// functional lighting, materials with intent, and a framed composition. They are
// injected into the generation prompt so the model learns by example, not just
// by rules. Keep them excellent and diverse; the agent should match their craft,
// not copy them literally.

import type { Scene3D } from "@ai-threejs-studio/scene3d";

// 1. Interior / furniture — the grouping + proportions showcase.
const cozyReadingCorner: Scene3D = {
  metadata: { name: "Cozy reading corner", version: 1 },
  background: "#14100c",
  fog: { color: "#14100c", near: 9, far: 26 },
  camera: { position: [3.6, 2.3, 4.2], target: [0, 0.8, 0], fov: 45 },
  nodes: [
    {
      id: "floor",
      type: "mesh",
      name: "Wood Floor",
      geometry: { kind: "box", args: [9, 0.2, 9] },
      transform: { position: [0, -0.1, 0] },
      material: { color: "#3b2c20", roughness: 0.8, metalness: 0 },
      receiveShadow: true,
      castShadow: false
    },
    {
      id: "armchair",
      type: "group",
      name: "Armchair",
      transform: { position: [-0.5, 0, 0], rotation: [0, 0.5, 0] },
      children: [
        { id: "chair-seat", type: "mesh", name: "Seat", geometry: { kind: "box", args: [1, 0.25, 1] }, transform: { position: [0, 0.45, 0] }, material: { color: "#7c4a3a", roughness: 0.7, metalness: 0 } },
        { id: "chair-back", type: "mesh", name: "Backrest", geometry: { kind: "box", args: [1, 0.9, 0.18] }, transform: { position: [0, 0.9, -0.41] }, material: { color: "#7c4a3a", roughness: 0.7, metalness: 0 } },
        { id: "chair-arm-l", type: "mesh", name: "Left armrest", geometry: { kind: "box", args: [0.18, 0.4, 1] }, transform: { position: [-0.41, 0.6, 0] }, material: { color: "#6d4133", roughness: 0.7, metalness: 0 } },
        { id: "chair-arm-r", type: "mesh", name: "Right armrest", geometry: { kind: "box", args: [0.18, 0.4, 1] }, transform: { position: [0.41, 0.6, 0] }, material: { color: "#6d4133", roughness: 0.7, metalness: 0 } },
        { id: "chair-leg-fl", type: "mesh", name: "Front-left leg", geometry: { kind: "cylinder", args: [0.05, 0.05, 0.35, 12] }, transform: { position: [-0.4, 0.175, 0.4] }, material: { color: "#2b2018", roughness: 0.6, metalness: 0.1 } },
        { id: "chair-leg-fr", type: "mesh", name: "Front-right leg", geometry: { kind: "cylinder", args: [0.05, 0.05, 0.35, 12] }, transform: { position: [0.4, 0.175, 0.4] }, material: { color: "#2b2018", roughness: 0.6, metalness: 0.1 } },
        { id: "chair-leg-bl", type: "mesh", name: "Back-left leg", geometry: { kind: "cylinder", args: [0.05, 0.05, 0.35, 12] }, transform: { position: [-0.4, 0.175, -0.4] }, material: { color: "#2b2018", roughness: 0.6, metalness: 0.1 } },
        { id: "chair-leg-br", type: "mesh", name: "Back-right leg", geometry: { kind: "cylinder", args: [0.05, 0.05, 0.35, 12] }, transform: { position: [0.4, 0.175, -0.4] }, material: { color: "#2b2018", roughness: 0.6, metalness: 0.1 } }
      ]
    },
    {
      id: "floor-lamp",
      type: "group",
      name: "Floor Lamp",
      transform: { position: [1.4, 0, -0.3] },
      children: [
        { id: "lamp-base", type: "mesh", name: "Base", geometry: { kind: "cylinder", args: [0.22, 0.26, 0.06, 24] }, transform: { position: [0, 0.03, 0] }, material: { color: "#1c1c1c", roughness: 0.4, metalness: 0.6 } },
        { id: "lamp-pole", type: "mesh", name: "Pole", geometry: { kind: "cylinder", args: [0.035, 0.035, 1.6, 16] }, transform: { position: [0, 0.83, 0] }, material: { color: "#2a2a2a", roughness: 0.4, metalness: 0.6 } },
        { id: "lamp-shade", type: "mesh", name: "Shade", geometry: { kind: "cone", args: [0.3, 0.42, 24] }, transform: { position: [0, 1.7, 0] }, material: { color: "#e8c98a", roughness: 0.6, metalness: 0, emissive: "#3a2c12", emissiveIntensity: 0.5 } },
        { id: "lamp-bulb", type: "mesh", name: "Bulb", geometry: { kind: "sphere", args: [0.09, 16, 16] }, transform: { position: [0, 1.55, 0] }, material: { color: "#fff2cc", roughness: 1, metalness: 0, emissive: "#ffd27f", emissiveIntensity: 2.4 } },
        { id: "lamp-light", type: "light", name: "Lamp glow", light: "point", color: "#ffd27f", intensity: 6, distance: 6, transform: { position: [0, 1.55, 0] } }
      ]
    },
    {
      id: "side-table",
      type: "group",
      name: "Side Table",
      transform: { position: [0.5, 0, 0.2] },
      children: [
        { id: "table-top", type: "mesh", name: "Tabletop", geometry: { kind: "cylinder", args: [0.32, 0.32, 0.06, 24] }, transform: { position: [0, 0.5, 0] }, material: { color: "#5a3d2b", roughness: 0.6, metalness: 0 } },
        { id: "table-leg", type: "mesh", name: "Center leg", geometry: { kind: "cylinder", args: [0.05, 0.07, 0.5, 16] }, transform: { position: [0, 0.25, 0] }, material: { color: "#3a281c", roughness: 0.6, metalness: 0.05 } }
      ]
    },
    { id: "ambient", type: "light", name: "Warm ambient", light: "ambient", color: "#6a5236", intensity: 0.5 },
    { id: "key", type: "light", name: "Key light", light: "directional", color: "#ffdca8", intensity: 1.4, transform: { position: [3, 5, 2] } }
  ]
};

// 2. Hero / product — the materials, lighting rig, and atmosphere showcase.
const heroCrystal: Scene3D = {
  metadata: { name: "Glowing crystal on a pedestal", version: 1 },
  background: "#0b0f17",
  fog: { color: "#0b0f17", near: 6, far: 22 },
  camera: { position: [3.4, 2.6, 4.4], target: [0, 1.1, 0], fov: 42 },
  nodes: [
    { id: "ground", type: "mesh", name: "Ground", geometry: { kind: "box", args: [30, 0.2, 30] }, transform: { position: [0, -0.1, 0] }, material: { color: "#10151f", roughness: 0.95, metalness: 0 }, receiveShadow: true, castShadow: false },
    {
      id: "pedestal",
      type: "group",
      name: "Pedestal",
      children: [
        { id: "ped-base", type: "mesh", name: "Base", geometry: { kind: "cylinder", args: [0.95, 1.1, 0.35, 48] }, transform: { position: [0, 0.175, 0] }, material: { color: "#3a3f46", roughness: 0.85, metalness: 0.05 } },
        { id: "ped-column", type: "mesh", name: "Column", geometry: { kind: "cylinder", args: [0.55, 0.7, 0.9, 48] }, transform: { position: [0, 0.75, 0] }, material: { color: "#4a5059", roughness: 0.8, metalness: 0.05 } },
        { id: "ped-cap", type: "mesh", name: "Top slab", geometry: { kind: "box", args: [1.4, 0.16, 1.4] }, transform: { position: [0, 1.28, 0] }, material: { color: "#535a64", roughness: 0.7, metalness: 0.08 } }
      ]
    },
    {
      id: "crystal",
      type: "mesh",
      name: "Crystal",
      geometry: { kind: "icosahedron", args: [0.42, 0] },
      transform: { position: [0, 2.15, 0], rotation: [0.4, 0.6, 0.1], scale: [1, 1.7, 1] },
      material: { type: "physical", color: "#9fe8ff", roughness: 0.05, metalness: 0, transmission: 0.9, ior: 1.7, thickness: 0.6, emissive: "#3bc9ff", emissiveIntensity: 1.6 }
    },
    { id: "glow", type: "light", name: "Crystal glow", light: "point", color: "#48d6ff", intensity: 14, distance: 9, transform: { position: [0, 2.15, 0] } },
    { id: "key", type: "light", name: "Key light", light: "spot", color: "#fff1dc", intensity: 40, distance: 20, angle: 0.5, penumbra: 0.5, transform: { position: [4, 6, 3] } },
    { id: "fill", type: "light", name: "Ambient fill", light: "ambient", color: "#3a4a66", intensity: 0.5 }
  ]
};

// 3. Nature / low-poly — outdoor composition, stylized flat-shaded materials,
// repeated grouped objects (trees), hemisphere + sun lighting.
const lowPolyForest: Scene3D = {
  metadata: { name: "Low-poly forest clearing", version: 1 },
  background: "#bfe3e0",
  fog: { color: "#bfe3e0", near: 12, far: 40 },
  camera: { position: [6, 4.5, 7], target: [0, 1, 0], fov: 45 },
  nodes: [
    { id: "terrain", type: "mesh", name: "Terrain", geometry: { kind: "cylinder", args: [7, 7.4, 1.2, 8] }, transform: { position: [0, -0.6, 0] }, material: { color: "#6aa84f", roughness: 1, metalness: 0, flatShading: true }, receiveShadow: true },
    { id: "pond", type: "mesh", name: "Pond", geometry: { kind: "cylinder", args: [1.6, 1.6, 0.12, 16] }, transform: { position: [2, 0.06, 1.5] }, material: { type: "physical", color: "#3d9be0", roughness: 0.1, metalness: 0, transmission: 0.5, flatShading: true } },
    {
      id: "pine-tree",
      type: "group",
      name: "Pine Tree",
      transform: { position: [-1.5, 0, 0] },
      children: [
        { id: "pine-trunk", type: "mesh", name: "Trunk", geometry: { kind: "cylinder", args: [0.18, 0.24, 1, 6] }, transform: { position: [0, 0.5, 0] }, material: { color: "#6b4a2b", roughness: 1, flatShading: true } },
        { id: "pine-foliage", type: "mesh", name: "Foliage", geometry: { kind: "cone", args: [0.9, 1.8, 7] }, transform: { position: [0, 1.8, 0] }, material: { color: "#2f8f4e", roughness: 1, flatShading: true } }
      ]
    },
    {
      id: "round-tree",
      type: "group",
      name: "Round Tree",
      transform: { position: [1, 0, -1.8], scale: [1.2, 1.2, 1.2] },
      children: [
        { id: "round-trunk", type: "mesh", name: "Trunk", geometry: { kind: "cylinder", args: [0.16, 0.2, 0.8, 6] }, transform: { position: [0, 0.4, 0] }, material: { color: "#6b4a2b", roughness: 1, flatShading: true } },
        { id: "round-canopy", type: "mesh", name: "Canopy", geometry: { kind: "icosahedron", args: [0.85, 0] }, transform: { position: [0, 1.3, 0] }, material: { color: "#3fae5e", roughness: 1, flatShading: true } }
      ]
    },
    { id: "boulder", type: "mesh", name: "Boulder", geometry: { kind: "icosahedron", args: [0.5, 0] }, transform: { position: [-2.2, 0.3, 1.6], rotation: [0.3, 0.5, 0] }, material: { color: "#8a8f96", roughness: 1, metalness: 0.05, flatShading: true } },
    { id: "sky", type: "light", name: "Sky light", light: "hemisphere", color: "#cfeaff", groundColor: "#4a6b3a", intensity: 0.9 },
    { id: "sun", type: "light", name: "Sun", light: "directional", color: "#fff4d6", intensity: 2.2, transform: { position: [6, 9, 4] } }
  ]
};

// 4. Vehicle — a grouped multi-part object with correctly-oriented wheels,
// emissive headlights, and a studio lighting rig.
const stylizedCar: Scene3D = {
  metadata: { name: "Stylized sports car", version: 1 },
  background: "#1a1f2b",
  camera: { position: [4.5, 2, 5], target: [0, 0.5, 0], fov: 40 },
  nodes: [
    { id: "road", type: "mesh", name: "Road", geometry: { kind: "box", args: [30, 0.2, 30] }, transform: { position: [0, -0.1, 0] }, material: { color: "#23262e", roughness: 0.7, metalness: 0.1 }, receiveShadow: true },
    {
      id: "car",
      type: "group",
      name: "Sports Car",
      transform: { position: [0, 0.35, 0] },
      children: [
        { id: "car-body", type: "mesh", name: "Body", geometry: { kind: "box", args: [2.2, 0.5, 1] }, transform: { position: [0, 0.25, 0] }, material: { color: "#d4232b", roughness: 0.25, metalness: 0.5 } },
        { id: "car-cabin", type: "mesh", name: "Cabin", geometry: { kind: "box", args: [1.1, 0.45, 0.9] }, transform: { position: [-0.05, 0.65, 0] }, material: { color: "#10141c", roughness: 0.1, metalness: 0.3 } },
        { id: "wheel-fl", type: "mesh", name: "Front-left wheel", geometry: { kind: "cylinder", args: [0.32, 0.32, 0.2, 20] }, transform: { position: [0.7, 0, 0.5], rotation: [1.5708, 0, 0] }, material: { color: "#0c0c0c", roughness: 0.8 } },
        { id: "wheel-fr", type: "mesh", name: "Front-right wheel", geometry: { kind: "cylinder", args: [0.32, 0.32, 0.2, 20] }, transform: { position: [0.7, 0, -0.5], rotation: [1.5708, 0, 0] }, material: { color: "#0c0c0c", roughness: 0.8 } },
        { id: "wheel-bl", type: "mesh", name: "Back-left wheel", geometry: { kind: "cylinder", args: [0.32, 0.32, 0.2, 20] }, transform: { position: [-0.7, 0, 0.5], rotation: [1.5708, 0, 0] }, material: { color: "#0c0c0c", roughness: 0.8 } },
        { id: "wheel-br", type: "mesh", name: "Back-right wheel", geometry: { kind: "cylinder", args: [0.32, 0.32, 0.2, 20] }, transform: { position: [-0.7, 0, -0.5], rotation: [1.5708, 0, 0] }, material: { color: "#0c0c0c", roughness: 0.8 } },
        { id: "headlight-l", type: "mesh", name: "Left headlight", geometry: { kind: "sphere", args: [0.1, 12, 12] }, transform: { position: [1.1, 0.25, 0.32] }, material: { color: "#fffbe0", roughness: 0.3, emissive: "#fff2b0", emissiveIntensity: 2 } },
        { id: "headlight-r", type: "mesh", name: "Right headlight", geometry: { kind: "sphere", args: [0.1, 12, 12] }, transform: { position: [1.1, 0.25, -0.32] }, material: { color: "#fffbe0", roughness: 0.3, emissive: "#fff2b0", emissiveIntensity: 2 } }
      ]
    },
    { id: "ambient", type: "light", name: "Ambient", light: "ambient", color: "#5a6b8a", intensity: 0.5 },
    { id: "key", type: "light", name: "Key light", light: "directional", color: "#ffffff", intensity: 2.4, transform: { position: [5, 7, 3] } },
    { id: "rim", type: "light", name: "Rim light", light: "spot", color: "#88aaff", intensity: 20, angle: 0.6, penumbra: 0.5, transform: { position: [-4, 4, -3] } }
  ]
};

// 5. Building / architecture — massing from boxes, a pyramidal roof, windows and
// a door as inset boxes, plus a companion tree; outdoor sky + sun lighting.
const cottage: Scene3D = {
  metadata: { name: "Cozy cottage", version: 1 },
  background: "#acc8e0",
  fog: { color: "#acc8e0", near: 18, far: 55 },
  camera: { position: [6, 4, 7], target: [0, 1.4, 0], fov: 45 },
  nodes: [
    { id: "grass", type: "mesh", name: "Grass", geometry: { kind: "box", args: [24, 0.2, 24] }, transform: { position: [0, -0.1, 0] }, material: { color: "#5f8f4e", roughness: 1 }, receiveShadow: true },
    {
      id: "cottage",
      type: "group",
      name: "Cottage",
      children: [
        { id: "walls", type: "mesh", name: "Walls", geometry: { kind: "box", args: [3.4, 2.2, 2.8] }, transform: { position: [0, 1.1, 0] }, material: { color: "#e8d8b8", roughness: 0.9 } },
        { id: "roof", type: "mesh", name: "Roof", geometry: { kind: "cone", args: [2.7, 1.6, 4] }, transform: { position: [0, 3, 0], rotation: [0, 0.785, 0] }, material: { color: "#7a3b2e", roughness: 0.9, flatShading: true } },
        { id: "door", type: "mesh", name: "Door", geometry: { kind: "box", args: [0.7, 1.3, 0.1] }, transform: { position: [0, 0.65, 1.41] }, material: { color: "#5a3a22", roughness: 0.8 } },
        { id: "window-l", type: "mesh", name: "Left window", geometry: { kind: "box", args: [0.7, 0.7, 0.1] }, transform: { position: [-1, 1.3, 1.41] }, material: { color: "#bfe6ff", roughness: 0.1, metalness: 0.1, emissive: "#243a1a", emissiveIntensity: 0.3 } },
        { id: "window-r", type: "mesh", name: "Right window", geometry: { kind: "box", args: [0.7, 0.7, 0.1] }, transform: { position: [1, 1.3, 1.41] }, material: { color: "#bfe6ff", roughness: 0.1, metalness: 0.1, emissive: "#243a1a", emissiveIntensity: 0.3 } },
        { id: "chimney", type: "mesh", name: "Chimney", geometry: { kind: "box", args: [0.5, 1.2, 0.5] }, transform: { position: [1, 3, 0] }, material: { color: "#9a5a44", roughness: 0.9 } }
      ]
    },
    {
      id: "yard-tree",
      type: "group",
      name: "Yard Tree",
      transform: { position: [-3, 0, -1] },
      children: [
        { id: "yt-trunk", type: "mesh", name: "Trunk", geometry: { kind: "cylinder", args: [0.2, 0.26, 1.2, 6] }, transform: { position: [0, 0.6, 0] }, material: { color: "#6b4a2b", roughness: 1, flatShading: true } },
        { id: "yt-leaves", type: "mesh", name: "Leaves", geometry: { kind: "icosahedron", args: [1, 0] }, transform: { position: [0, 1.8, 0] }, material: { color: "#3fae5e", roughness: 1, flatShading: true } }
      ]
    },
    { id: "sky", type: "light", name: "Sky", light: "hemisphere", color: "#d6ecff", groundColor: "#4a6b3a", intensity: 0.9 },
    { id: "sun", type: "light", name: "Sun", light: "directional", color: "#fff1cf", intensity: 2.4, transform: { position: [6, 9, 5] } }
  ]
};

// 6. Character — a humanoid built from stacked, symmetric primitives (body, head,
// eyes, arms, legs), emissive accents, and a hero-style rig.
const friendlyRobot: Scene3D = {
  metadata: { name: "Friendly robot", version: 1 },
  background: "#0e1622",
  camera: { position: [3, 2.2, 4], target: [0, 1.1, 0], fov: 42 },
  nodes: [
    { id: "floor", type: "mesh", name: "Floor", geometry: { kind: "box", args: [20, 0.2, 20] }, transform: { position: [0, -0.1, 0] }, material: { color: "#1a2230", roughness: 0.8, metalness: 0.1 }, receiveShadow: true },
    {
      id: "robot",
      type: "group",
      name: "Robot",
      children: [
        { id: "r-body", type: "mesh", name: "Body", geometry: { kind: "box", args: [0.9, 1, 0.6] }, transform: { position: [0, 1.1, 0] }, material: { color: "#c0c8d0", roughness: 0.35, metalness: 0.7 } },
        { id: "r-head", type: "mesh", name: "Head", geometry: { kind: "box", args: [0.7, 0.6, 0.6] }, transform: { position: [0, 1.95, 0] }, material: { color: "#d8dee6", roughness: 0.3, metalness: 0.7 } },
        { id: "r-eye-l", type: "mesh", name: "Left eye", geometry: { kind: "sphere", args: [0.1, 16, 16] }, transform: { position: [-0.18, 2, 0.31] }, material: { color: "#00e5ff", roughness: 0.3, emissive: "#00b8d4", emissiveIntensity: 2.2 } },
        { id: "r-eye-r", type: "mesh", name: "Right eye", geometry: { kind: "sphere", args: [0.1, 16, 16] }, transform: { position: [0.18, 2, 0.31] }, material: { color: "#00e5ff", roughness: 0.3, emissive: "#00b8d4", emissiveIntensity: 2.2 } },
        { id: "r-arm-l", type: "mesh", name: "Left arm", geometry: { kind: "capsule", args: [0.1, 0.7, 6, 12] }, transform: { position: [-0.6, 1.1, 0] }, material: { color: "#9aa4ae", roughness: 0.4, metalness: 0.6 } },
        { id: "r-arm-r", type: "mesh", name: "Right arm", geometry: { kind: "capsule", args: [0.1, 0.7, 6, 12] }, transform: { position: [0.6, 1.1, 0] }, material: { color: "#9aa4ae", roughness: 0.4, metalness: 0.6 } },
        { id: "r-leg-l", type: "mesh", name: "Left leg", geometry: { kind: "cylinder", args: [0.13, 0.13, 0.6, 16] }, transform: { position: [-0.25, 0.3, 0] }, material: { color: "#7a838d", roughness: 0.5, metalness: 0.5 } },
        { id: "r-leg-r", type: "mesh", name: "Right leg", geometry: { kind: "cylinder", args: [0.13, 0.13, 0.6, 16] }, transform: { position: [0.25, 0.3, 0] }, material: { color: "#7a838d", roughness: 0.5, metalness: 0.5 } },
        { id: "r-antenna", type: "mesh", name: "Antenna tip", geometry: { kind: "sphere", args: [0.07, 12, 12] }, transform: { position: [0, 2.4, 0] }, material: { color: "#ff5252", roughness: 0.4, emissive: "#ff1744", emissiveIntensity: 2 } }
      ]
    },
    { id: "eye-glow", type: "light", name: "Eye glow", light: "point", color: "#00b8d4", intensity: 3, distance: 5, transform: { position: [0, 2, 0.5] } },
    { id: "ambient", type: "light", name: "Ambient", light: "ambient", color: "#3a4a66", intensity: 0.5 },
    { id: "key", type: "light", name: "Key", light: "directional", color: "#ffffff", intensity: 2, transform: { position: [4, 6, 4] } }
  ]
};

// 7. Food — small tabletop scale, layered cylinders on a plate, emissive candle
// flames with a matching glow, and warm intimate lighting.
const birthdayCake: Scene3D = {
  metadata: { name: "Birthday cake", version: 1 },
  background: "#2a2030",
  camera: { position: [1.6, 1.3, 1.8], target: [0, 0.35, 0], fov: 40 },
  nodes: [
    { id: "table", type: "mesh", name: "Table", geometry: { kind: "box", args: [6, 0.2, 6] }, transform: { position: [0, -0.1, 0] }, material: { color: "#5a3d2b", roughness: 0.7 }, receiveShadow: true },
    { id: "plate", type: "mesh", name: "Plate", geometry: { kind: "cylinder", args: [0.55, 0.55, 0.04, 40] }, transform: { position: [0, 0.02, 0] }, material: { color: "#e8e8ee", roughness: 0.3, metalness: 0.1 } },
    {
      id: "cake",
      type: "group",
      name: "Birthday Cake",
      children: [
        { id: "layer-bottom", type: "mesh", name: "Bottom sponge", geometry: { kind: "cylinder", args: [0.42, 0.42, 0.18, 40] }, transform: { position: [0, 0.13, 0] }, material: { color: "#caa15a", roughness: 0.8 } },
        { id: "filling", type: "mesh", name: "Cream filling", geometry: { kind: "cylinder", args: [0.43, 0.43, 0.04, 40] }, transform: { position: [0, 0.24, 0] }, material: { color: "#fff4e0", roughness: 0.6 } },
        { id: "layer-top", type: "mesh", name: "Top sponge", geometry: { kind: "cylinder", args: [0.42, 0.42, 0.18, 40] }, transform: { position: [0, 0.35, 0] }, material: { color: "#caa15a", roughness: 0.8 } },
        { id: "frosting", type: "mesh", name: "Pink frosting", geometry: { kind: "cylinder", args: [0.43, 0.43, 0.05, 40] }, transform: { position: [0, 0.46, 0] }, material: { color: "#f7a8c4", roughness: 0.5 } },
        { id: "candle-1", type: "mesh", name: "Candle 1", geometry: { kind: "cylinder", args: [0.018, 0.018, 0.18, 8] }, transform: { position: [-0.15, 0.58, 0.05] }, material: { color: "#e74c3c", roughness: 0.5 } },
        { id: "flame-1", type: "mesh", name: "Flame 1", geometry: { kind: "sphere", args: [0.03, 8, 8] }, transform: { position: [-0.15, 0.7, 0.05], scale: [1, 1.6, 1] }, material: { color: "#ffd27f", roughness: 0.4, emissive: "#ff8a00", emissiveIntensity: 3 } },
        { id: "candle-2", type: "mesh", name: "Candle 2", geometry: { kind: "cylinder", args: [0.018, 0.018, 0.18, 8] }, transform: { position: [0.15, 0.58, 0.05] }, material: { color: "#3498db", roughness: 0.5 } },
        { id: "flame-2", type: "mesh", name: "Flame 2", geometry: { kind: "sphere", args: [0.03, 8, 8] }, transform: { position: [0.15, 0.7, 0.05], scale: [1, 1.6, 1] }, material: { color: "#ffd27f", roughness: 0.4, emissive: "#ff8a00", emissiveIntensity: 3 } },
        { id: "candle-3", type: "mesh", name: "Candle 3", geometry: { kind: "cylinder", args: [0.018, 0.018, 0.18, 8] }, transform: { position: [0, 0.58, -0.15] }, material: { color: "#2ecc71", roughness: 0.5 } },
        { id: "flame-3", type: "mesh", name: "Flame 3", geometry: { kind: "sphere", args: [0.03, 8, 8] }, transform: { position: [0, 0.7, -0.15], scale: [1, 1.6, 1] }, material: { color: "#ffd27f", roughness: 0.4, emissive: "#ff8a00", emissiveIntensity: 3 } }
      ]
    },
    { id: "candle-glow", type: "light", name: "Candle glow", light: "point", color: "#ff9a3c", intensity: 2.5, distance: 3, transform: { position: [0, 0.75, 0] } },
    { id: "ambient", type: "light", name: "Ambient", light: "ambient", color: "#4a3a52", intensity: 0.5 },
    { id: "key", type: "light", name: "Soft key", light: "directional", color: "#fff2e0", intensity: 1.4, transform: { position: [2, 4, 3] } }
  ]
};

// 8. Sci-fi — metallic hull, symmetric fins, emissive thruster + porthole, and a
// dark space backdrop. Teaches mechanical symmetry and emissive accents.
const retroRocket: Scene3D = {
  metadata: { name: "Retro rocket", version: 1 },
  background: "#070b1a",
  camera: { position: [4, 2.5, 5], target: [0, 1.5, 0], fov: 42 },
  nodes: [
    { id: "pad", type: "mesh", name: "Launch pad", geometry: { kind: "cylinder", args: [2, 2.2, 0.3, 32] }, transform: { position: [0, 0.15, 0] }, material: { color: "#2a2e3a", roughness: 0.8, metalness: 0.2 }, receiveShadow: true },
    {
      id: "rocket",
      type: "group",
      name: "Rocket",
      children: [
        { id: "hull", type: "mesh", name: "Hull", geometry: { kind: "cylinder", args: [0.45, 0.5, 2.4, 24] }, transform: { position: [0, 1.5, 0] }, material: { color: "#dfe4ea", roughness: 0.35, metalness: 0.6 } },
        { id: "nose", type: "mesh", name: "Nose cone", geometry: { kind: "cone", args: [0.45, 0.9, 24] }, transform: { position: [0, 3.15, 0] }, material: { color: "#e74c3c", roughness: 0.4, metalness: 0.4 } },
        { id: "porthole", type: "mesh", name: "Porthole", geometry: { kind: "sphere", args: [0.18, 20, 20] }, transform: { position: [0, 2.2, 0.46] }, material: { color: "#7fd6ff", roughness: 0.1, metalness: 0.2, emissive: "#3aa0d0", emissiveIntensity: 0.8 } },
        { id: "fin-front", type: "mesh", name: "Front fin", geometry: { kind: "box", args: [0.08, 0.7, 0.5] }, transform: { position: [0.5, 0.6, 0] }, material: { color: "#e74c3c", roughness: 0.4, metalness: 0.4 } },
        { id: "fin-back", type: "mesh", name: "Back fin", geometry: { kind: "box", args: [0.08, 0.7, 0.5] }, transform: { position: [-0.5, 0.6, 0] }, material: { color: "#e74c3c", roughness: 0.4, metalness: 0.4 } },
        { id: "fin-left", type: "mesh", name: "Left fin", geometry: { kind: "box", args: [0.5, 0.7, 0.08] }, transform: { position: [0, 0.6, 0.5] }, material: { color: "#e74c3c", roughness: 0.4, metalness: 0.4 } },
        { id: "fin-right", type: "mesh", name: "Right fin", geometry: { kind: "box", args: [0.5, 0.7, 0.08] }, transform: { position: [0, 0.6, -0.5] }, material: { color: "#e74c3c", roughness: 0.4, metalness: 0.4 } },
        { id: "nozzle", type: "mesh", name: "Nozzle", geometry: { kind: "cylinder", args: [0.4, 0.25, 0.4, 20] }, transform: { position: [0, 0.1, 0] }, material: { color: "#444851", roughness: 0.5, metalness: 0.7 } },
        { id: "exhaust", type: "mesh", name: "Exhaust flame", geometry: { kind: "cone", args: [0.35, 0.9, 16] }, transform: { position: [0, -0.45, 0], rotation: [3.14159, 0, 0] }, material: { color: "#ffce54", roughness: 0.4, emissive: "#ff6a00", emissiveIntensity: 3.5 } }
      ]
    },
    { id: "engine-glow", type: "light", name: "Engine glow", light: "point", color: "#ff7a18", intensity: 6, distance: 6, transform: { position: [0, -0.3, 0] } },
    { id: "ambient", type: "light", name: "Ambient", light: "ambient", color: "#2a3a5a", intensity: 0.5 },
    { id: "key", type: "light", name: "Key", light: "directional", color: "#cfe0ff", intensity: 1.8, transform: { position: [4, 6, 4] } }
  ]
};

interface FewShotExample {
  note: string;
  tags: string[];
  scene: Scene3D;
}

const EXAMPLES: FewShotExample[] = [
  { note: "Interior with grouped, named, well-proportioned furniture resting on the floor, plus a functional lamp (emissive bulb + matching point light).", tags: ["interior", "room", "furniture", "chair", "table", "desk", "lamp", "cozy", "indoor", "living", "office"], scene: cozyReadingCorner },
  { note: "Hero composition with a grouped pedestal, a glass+emissive focal object, a three-light rig, fog, and a framed camera.", tags: ["product", "hero", "crystal", "gem", "glass", "pedestal", "display", "glow", "showcase", "trophy"], scene: heroCrystal },
  { note: "Outdoor low-poly nature scene: stylized flat-shaded terrain, water, repeated grouped trees, a boulder, and hemisphere + sun lighting.", tags: ["nature", "forest", "tree", "trees", "outdoor", "low-poly", "lowpoly", "landscape", "island", "plant", "garden", "park", "terrain", "mountain"], scene: lowPolyForest },
  { note: "Vehicle as a grouped multi-part object: body, cabin, four correctly-oriented wheels, emissive headlights, and a studio lighting rig.", tags: ["car", "vehicle", "sports", "truck", "automobile", "wheel", "racing", "bus", "van"], scene: stylizedCar },
  { note: "Building/architecture: massing from boxes, a pyramidal roof, inset door and windows, a chimney, a companion tree, and outdoor sky + sun lighting.", tags: ["building", "house", "cottage", "cabin", "home", "architecture", "tower", "castle", "church", "shop", "hut", "structure", "village"], scene: cottage },
  { note: "Character built from stacked, symmetric primitives (body, head, eyes, arms, legs) with emissive accents and a hero rig.", tags: ["robot", "character", "figure", "person", "humanoid", "mascot", "creature", "android", "bot", "golem", "monster", "hero"], scene: friendlyRobot },
  { note: "Food at small tabletop scale: layered cylinders on a plate, emissive candle flames with a matching glow light, and warm intimate lighting.", tags: ["cake", "dessert", "food", "pastry", "birthday", "sweet", "plate", "pie", "treat", "bakery", "meal", "snack"], scene: birthdayCake },
  { note: "Sci-fi craft: metallic hull, symmetric fins, emissive thruster and porthole, and a dark space backdrop — mechanical symmetry plus emissive accents.", tags: ["rocket", "spaceship", "spacecraft", "sci-fi", "scifi", "space", "ship", "missile", "shuttle", "launch", "futuristic", "satellite"], scene: retroRocket }
];

const FEWSHOT_INTRO =
  "Study these reference examples of excellent Scene3D documents. Match their craft — grouped & named multi-part objects, realistic proportions, objects resting on surfaces, intentional materials, and a clear lit composition — but do NOT copy them literally; build what the user asked for.";

// Pick the few-shot examples most relevant to the prompt (by tag overlap), so the
// library can grow without sending every example on every request. Always returns
// at least `max` (the first ones double as a craft baseline when nothing matches).
export function selectFewShotBlock(prompt: string, max = 2): string {
  const lower = prompt.toLowerCase();
  const ranked = EXAMPLES.map((example, index) => ({
    example,
    index,
    score: example.tags.reduce((sum, tag) => (lower.includes(tag) ? sum + 1 : sum), 0)
  }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .map((entry) => entry.example);

  return [FEWSHOT_INTRO, ...ranked.map((example, index) => `Example ${index + 1} (${example.note}):\n${JSON.stringify(example.scene)}`)].join("\n\n");
}

// The full example library as one block — used by providers that cache a large
// static system prefix (Claude), where sending every example once and reading it
// from cache is cheaper than relevance-selecting per request.
export function allFewShotBlock(): string {
  return [FEWSHOT_INTRO, ...EXAMPLES.map((example, index) => `Example ${index + 1} (${example.note}):\n${JSON.stringify(example.scene)}`)].join("\n\n");
}

export const FEWSHOT_EXAMPLE_SCENES = EXAMPLES.map((example) => example.scene);
