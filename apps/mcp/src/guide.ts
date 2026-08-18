import {
  ANIMATABLE_PROPERTIES,
  CAMERA_TYPES,
  EASINGS,
  ENVIRONMENT_PRESETS,
  GEOMETRY_KINDS,
  TEXTURE_PATTERNS,
  type Scene3D
} from "@ai-threejs-studio/scene3d";

export const EXAMPLE_SCENE: Scene3D = {
  metadata: { name: "MCP starter scene", version: 1 },
  background: "#101522",
  environment: { preset: "studio", intensity: 0.8, background: false },
  camera: { position: [4, 3, 6], target: [0, 0.5, 0], fov: 45 },
  nodes: [
    {
      id: "subject",
      name: "Subject",
      type: "mesh",
      geometry: { kind: "roundedBox", args: [2, 1.2, 1.4, 0.15, 4] },
      material: { type: "physical", color: "#7c9cff", roughness: 0.25, metalness: 0.1, clearcoat: 0.5 },
      transform: { position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      castShadow: true,
      receiveShadow: true
    },
    {
      id: "key-light",
      name: "Key light",
      type: "light",
      light: "directional",
      intensity: 2.5,
      color: "#ffffff",
      transform: { position: [4, 6, 3] },
      castShadow: true
    },
    {
      id: "fill-light",
      name: "Fill light",
      type: "light",
      light: "hemisphere",
      intensity: 0.8,
      color: "#b8d8ff",
      groundColor: "#17121f"
    }
  ]
};

export const SCENE_AUTHORING_GUIDE = {
  format: "Scene3D JSON v1",
  workflow: [
    "Call studio_get_scene before editing and retain projectUpdatedAt.",
    "Edit the complete Scene3D document, preserving unrelated nodes and stable ids.",
    "Call studio_validate_scene and resolve all blocking errors.",
    "Call studio_replace_scene with the exact projectUpdatedAt from studio_get_scene.",
    "Call studio_build_project, then studio_start_preview when a viewable result is needed."
  ],
  rules: [
    "metadata.version must be 1 and nodes must contain at least one visible mesh or model.",
    "Use unique, stable ids for nodes, cameras, and animation tracks.",
    "Transforms use [x, y, z]; rotations are radians; Y is up.",
    "A group owns child nodes through children; lights and models are regular nodes.",
    "Model assetUrl values must refer to local project assets; remote model URLs are rejected.",
    "Prefer procedural material textures when possible. External image URLs can create CSP or availability problems.",
    "Keep camera near/far ranges and light intensity proportional to scene scale.",
    "studio_replace_scene replaces the complete scene and creates a rollback snapshot first."
  ],
  nodeTypes: ["mesh", "group", "model", "light"],
  lightTypes: ["ambient", "hemisphere", "directional", "point", "spot"],
  materialTypes: ["standard", "physical", "basic"],
  geometryKinds: GEOMETRY_KINDS,
  texturePatterns: TEXTURE_PATTERNS,
  environmentPresets: ENVIRONMENT_PRESETS,
  cameraTypes: CAMERA_TYPES,
  animationEasings: EASINGS,
  animatableProperties: ANIMATABLE_PROPERTIES,
  geometryNotes: {
    lathe: "points is an array of [radiusFromYAxis, height] with at least two points.",
    extrude: "shape is a closed XY cross-section with at least three [x, y] points; depth extrudes along Z.",
    tube: "path has at least two [x, y, z] points; radius controls thickness."
  },
  example: EXAMPLE_SCENE
};
