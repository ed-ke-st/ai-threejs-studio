// React renderer entry (browser). Keeps the R3F/three imports out of the
// schema/validation path so the API can import "@ai-threejs-studio/scene3d"
// without pulling in a renderer.
export { SceneView } from "./SceneView";
