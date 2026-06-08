// Browser- and Node-safe entry: schema types/helpers + validation. Importable by
// both the web app and the API. The React renderer lives at "./react" and the
// project codegen (Node-only, uses fs) lives at "./codegen" so neither leaks
// into a browser bundle from here.
export * from "./schema";
export * from "./validate";
export * from "./sceneLint";

export const SCENE3D_MARKER = "@ai-threejs-studio:scene3d";
export const SCENE_CONFIG_PATH = "src/scene/scene.config.json";
