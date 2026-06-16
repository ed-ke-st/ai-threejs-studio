// SceneView — the single interpreter that renders a Scene3D JSON document.
//
// This is the heart of the new architecture: there is exactly ONE renderer, and
// it is a pure function of the scene JSON. The same component powers the live
// editor preview, the shared static viewer, and (via the same JSON) on-demand
// code export. Nothing here is bespoke per scene — richness comes from the data.

import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Center, Clone, Edges, Environment, Html, OrthographicCamera, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { Bloom, DepthOfField, EffectComposer, SSAO, Vignette } from "@react-three/postprocessing";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type {
  AnimatableProperty,
  Animation,
  Camera,
  Geometry,
  LightNode,
  Material,
  MeshNode,
  ModelNode,
  PostProcessing,
  Scene3D,
  SceneNode,
  TextureSpec
} from "./schema";
import { DEFAULT_CAMERA, DEFAULT_EXTRUDE_SHAPE, DEFAULT_LATHE_PROFILE, DEFAULT_TUBE_PATH, animationDuration, getActiveCamera, normalizeTransform, sampleTrack } from "./schema";

interface SceneViewProps {
  scene: Scene3D;
  selectedId?: string | null;
  /** Multi-selection. When provided, every listed node is highlighted; takes precedence over selectedId. */
  selectedIds?: string[];
  onSelect?: (id: string) => void;
  /** Controlled playback time (seconds). When set, animation is driven to exactly this
   *  time each frame (editor scrubbing/playhead). When omitted, animation autoplays/loops. */
  animationTime?: number;
  /** Render the scene's active camera as the default camera (runtime/share/export, and
   *  the editor's "look through" mode). When false the consumer's Canvas camera is used. */
  renderActiveCamera?: boolean;
  /** Pause the animation driver (editor only) — e.g. while the transform gizmo is
   *  dragging, so the user can move a node whose channel is otherwise animation-driven. */
  suppressAnimation?: boolean;
}

export function SceneView({ scene, selectedId, selectedIds, onSelect, animationTime, renderActiveCamera, suppressAnimation }: SceneViewProps) {
  const ids = selectedIds ?? (selectedId ? [selectedId] : []);
  return (
    <>
      {renderActiveCamera ? <ActiveCamera camera={getActiveCamera(scene)} /> : null}
      {scene.background ? <color attach="background" args={[scene.background]} /> : null}
      {scene.fog ? <fog attach="fog" args={[scene.fog.color, scene.fog.near, scene.fog.far]} /> : null}
      {scene.environment?.preset ? (
        <Environment
          preset={scene.environment.preset as never}
          environmentIntensity={scene.environment.intensity ?? 1}
          background={scene.environment.background ? true : undefined}
          backgroundBlurriness={scene.environment.background ? scene.environment.blur ?? 0 : undefined}
        />
      ) : null}
      {scene.animation && scene.animation.tracks.length > 0 && !suppressAnimation ? (
        <AnimationDriver animation={scene.animation} time={animationTime} camera={renderActiveCamera ? getActiveCamera(scene) : undefined} />
      ) : null}
      {scene.nodes.map((node) => (
        <NodeView key={node.id} node={node} selectedIds={ids} onSelect={onSelect} />
      ))}
      <PostFx postprocessing={scene.postprocessing} />
    </>
  );
}

// Screen-space post-processing. Mounted only when at least one effect is
// configured (an empty EffectComposer still costs an extra render pass). Bloom
// uses MipmapBlur for a soft, modern look; thresholds are tuned for the emissive-
// heavy scenes the generator favours.
function PostFx({ postprocessing }: { postprocessing?: PostProcessing }) {
  if (!postprocessing) return null;
  const { bloom, vignette, ssao, dof } = postprocessing;
  if (!bloom && !vignette && !ssao && !dof) return null;
  // EffectComposer types its children as JSX.Element[] (not ReactNode), so build a
  // filtered array of only the active effects rather than inlining conditionals —
  // null/false/fragment children break its ref wiring and its types.
  const effects: ReactElement[] = [];
  // SSAO reads the normal pass; keep it first so later effects composite over it.
  if (ssao) effects.push(<SSAO key="ssao" intensity={20} radius={0.1} luminanceInfluence={0.5} />);
  if (bloom) {
    effects.push(
      <Bloom key="bloom" mipmapBlur intensity={bloom.intensity ?? 1} luminanceThreshold={bloom.luminanceThreshold ?? 0.6} radius={bloom.radius ?? 0.7} />
    );
  }
  if (dof) {
    effects.push(<DepthOfField key="dof" focusDistance={dof.focusDistance ?? 0.02} focalLength={dof.focalLength ?? 0.05} bokehScale={dof.bokehScale ?? 2} />);
  }
  if (vignette) effects.push(<Vignette key="vignette" darkness={vignette.darkness ?? 0.5} eskil={false} />);

  return <EffectComposer enableNormalPass={Boolean(ssao)}>{effects}</EffectComposer>;
}

// Renders the active camera as the R3F default camera. The consumer's OrbitControls
// (makeDefault) then attaches to it and uses the camera's `target` for the look-at.
// Named with the camera id so future camera-target animation can locate it.
function ActiveCamera({ camera }: { camera: Camera }) {
  const position = camera.position ?? DEFAULT_CAMERA.position;
  const near = camera.near ?? 0.1;
  const far = camera.far ?? 1000;
  if (camera.type === "orthographic") {
    return <OrthographicCamera makeDefault name={camera.id} position={position} zoom={camera.zoom ?? 50} near={near} far={far} />;
  }
  return <PerspectiveCamera makeDefault name={camera.id} position={position} fov={camera.fov ?? DEFAULT_CAMERA.fov} near={near} far={far} />;
}

// Drives keyframe animation imperatively. Each frame it advances (or reads the
// controlled) time, samples every track, and mutates the matching node's Object3D
// directly — found by name (NodeView sets name={node.id}). Mutating refs instead
// of React state keeps playback off the render path.
//
// When `camera` is set (renderActiveCamera mode) and it has tracks, the driver also
// rigs the default camera: position tracks land via the name lookup (ActiveCamera
// is named with the camera id), then the camera is aimed at its — possibly
// target-track-animated — look-at point, and fov/zoom lens tracks are applied.
// Consumers must keep OrbitControls out of the way while this runs (the editor
// disables them during preview; codegen's runtime disables them permanently when
// the active camera is animated).
function AnimationDriver({ animation, time, camera }: { animation: Animation; time?: number; camera?: Camera }) {
  const root = useThree((state) => state.scene);
  const clock = useRef(0);
  const duration = useMemo(() => animationDuration(animation), [animation]);
  const lookAt = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    let t: number;
    if (typeof time === "number") {
      t = time;
    } else if (duration > 0) {
      clock.current += delta;
      t = animation.loop === false ? Math.min(clock.current, duration) : clock.current % duration;
    } else {
      t = 0;
    }
    for (const track of animation.tracks) {
      const obj = root.getObjectByName(track.targetId);
      if (!obj) continue;
      const value = sampleTrack(track, t);
      if (value === undefined) continue;
      applyAnimatedProperty(obj, track.property, value);
    }

    if (!camera || state.camera.name !== camera.id) return;
    const cameraTracks = animation.tracks.filter((track) => track.targetId === camera.id);
    if (cameraTracks.length === 0) return;
    const cam = state.camera;
    const base = camera.target ?? DEFAULT_CAMERA.target;
    lookAt.current.set(base[0], base[1], base[2]);
    let lensChanged = false;
    for (const track of cameraTracks) {
      const value = sampleTrack(track, t);
      if (value === undefined) continue;
      switch (track.property) {
        case "target.x": lookAt.current.x = value; break;
        case "target.y": lookAt.current.y = value; break;
        case "target.z": lookAt.current.z = value; break;
        case "fov":
          if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
            (cam as THREE.PerspectiveCamera).fov = value;
            lensChanged = true;
          }
          break;
        case "zoom":
          cam.zoom = value;
          lensChanged = true;
          break;
      }
    }
    cam.lookAt(lookAt.current);
    if (lensChanged) cam.updateProjectionMatrix();
  });

  return null;
}

function applyAnimatedProperty(obj: THREE.Object3D, property: AnimatableProperty, value: number): void {
  switch (property) {
    case "position.x": obj.position.x = value; break;
    case "position.y": obj.position.y = value; break;
    case "position.z": obj.position.z = value; break;
    case "rotation.x": obj.rotation.x = value; break;
    case "rotation.y": obj.rotation.y = value; break;
    case "rotation.z": obj.rotation.z = value; break;
    case "scale.x": obj.scale.x = value; break;
    case "scale.y": obj.scale.y = value; break;
    case "scale.z": obj.scale.z = value; break;
    case "scale": obj.scale.setScalar(value); break;
    case "opacity":
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!material) continue;
          material.transparent = true;
          material.opacity = value;
        }
      });
      break;
    default:
      // target.* — camera-only; handled by the camera phase, not by node objects.
      break;
  }
}

interface NodeViewProps {
  node: SceneNode;
  selectedIds: string[];
  onSelect?: (id: string) => void;
}

function NodeView({ node, selectedIds, onSelect }: NodeViewProps) {
  if (node.visible === false) {
    return null;
  }

  const transform = normalizeTransform(node.transform);
  const common = {
    position: transform.position,
    rotation: transform.rotation,
    scale: transform.scale,
    name: node.id
  };
  const selected = selectedIds.includes(node.id);

  switch (node.type) {
    case "group":
      return (
        <group {...common}>
          {node.children.map((child) => (
            <NodeView key={child.id} node={child} selectedIds={selectedIds} onSelect={onSelect} />
          ))}
        </group>
      );
    case "light":
      return (
        <group {...common}>
          <LightView node={node} />
        </group>
      );
    case "model":
      return (
        <SelectableGroup common={common} selected={selected} onSelect={() => onSelect?.(node.id)}>
          <ModelView node={node} />
        </SelectableGroup>
      );
    case "mesh":
    default:
      return (
        <SelectableGroup common={common} selected={selected} onSelect={() => onSelect?.(node.id)}>
          <MeshView node={node} selected={selected} />
        </SelectableGroup>
      );
  }
}

interface SelectableGroupProps {
  common: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number]; name: string };
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}

function SelectableGroup({ common, onSelect, children }: SelectableGroupProps) {
  return (
    <group
      {...common}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {children}
    </group>
  );
}

function MeshView({ node, selected }: { node: MeshNode; selected: boolean }) {
  return (
    <mesh castShadow={node.castShadow ?? true} receiveShadow={node.receiveShadow ?? true}>
      {renderGeometry(node.geometry)}
      <MaterialView material={node.material} />
      {selected ? <Edges scale={1.04} threshold={15} color="#ffd23f" /> : null}
    </mesh>
  );
}

// Renders the material element, with an optional texture from material.texture —
// an uploaded/URL image map when imageUrl is set, otherwise a procedural pattern.
// Split into a component so it can use hooks for texture loading.
function MaterialView({ material }: { material?: Material }) {
  const spec = material?.texture;
  // Both hooks always run (rules of hooks); each no-ops when its input is absent.
  const procedural = useProceduralTexture(spec?.imageUrl ? undefined : spec);
  const image = useImageTexture(spec?.imageUrl, spec?.repeat ?? 4);
  return renderMaterial(material, spec?.imageUrl ? image : procedural);
}

// Loads an image URL into a repeating texture (imperatively, so no Suspense
// boundary is required). Repeat updates without reloading the image.
function useImageTexture(url: string | undefined, repeat: number): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 4;
        setTexture(loaded);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (texture) {
      texture.repeat.set(repeat, repeat);
      texture.needsUpdate = true;
    }
  }, [texture, repeat]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

// Builds (and disposes) a canvas-backed repeating texture for the given spec.
function useProceduralTexture(spec?: TextureSpec): THREE.Texture | null {
  const pattern = spec?.pattern;
  const color1 = spec?.color1 ?? "#ffffff";
  const color2 = spec?.color2 ?? "#222a38";
  const repeat = spec?.repeat ?? 4;

  const texture = useMemo(() => {
    if (!pattern) return null;
    return makePatternTexture(pattern, color1, color2, repeat);
  }, [pattern, color1, color2, repeat]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function makePatternTexture(pattern: NonNullable<TextureSpec["pattern"]>, c1: string, c2: string, repeat: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = c2;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = c1;

  if (pattern === "checker") {
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  } else if (pattern === "grid") {
    ctx.lineWidth = size * 0.08;
    ctx.strokeStyle = c1;
    ctx.strokeRect(0, 0, size, size);
  } else if (pattern === "dots") {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (pattern === "noise") {
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function LightView({ node }: { node: LightNode }) {
  const intensity = node.intensity ?? 1;
  const color = node.color ?? "#ffffff";

  switch (node.light) {
    case "ambient":
      return <ambientLight color={color} intensity={intensity} />;
    case "hemisphere":
      return <hemisphereLight color={color} groundColor={node.groundColor ?? "#222222"} intensity={intensity} />;
    case "directional":
      return <directionalLight color={color} intensity={intensity} castShadow={node.castShadow ?? true} />;
    case "spot":
      return (
        <spotLight
          color={color}
          intensity={intensity}
          distance={node.distance ?? 0}
          angle={node.angle ?? 0.5}
          penumbra={node.penumbra ?? 0.4}
          castShadow={node.castShadow ?? true}
        />
      );
    case "point":
    default:
      return <pointLight color={color} intensity={intensity} distance={node.distance ?? 0} castShadow={node.castShadow ?? true} />;
  }
}

function ModelView({ node }: { node: ModelNode }) {
  if (!node.assetUrl) {
    return (
      <Html center>
        <span style={{ padding: "4px 8px", background: "#1f2733", color: "#9fb2c8", borderRadius: 6, fontSize: 12 }}>
          {node.name ?? "Model"} — link a GLB asset
        </span>
      </Html>
    );
  }
  return <LinkedModel url={node.assetUrl} />;
}

function LinkedModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return (
    <Center>
      <Clone object={scene} />
    </Center>
  );
}

function renderGeometry(geometry: Geometry) {
  switch (geometry.kind) {
    case "sphere":
      return <sphereGeometry args={withDefaults(geometry.args, [0.8, 48, 48])} />;
    case "cylinder":
      return <cylinderGeometry args={withDefaults(geometry.args, [0.6, 0.6, 1.2, 48])} />;
    case "cone":
      return <coneGeometry args={withDefaults(geometry.args, [0.7, 1.4, 48])} />;
    case "plane":
      return <planeGeometry args={withDefaults(geometry.args, [2, 2])} />;
    case "torus":
      return <torusGeometry args={withDefaults(geometry.args, [0.6, 0.22, 32, 96])} />;
    case "torusKnot":
      return <torusKnotGeometry args={withDefaults(geometry.args, [0.6, 0.2, 160, 32])} />;
    case "capsule":
      return <capsuleGeometry args={withDefaults(geometry.args, [0.4, 0.9, 8, 24])} />;
    case "icosahedron":
      return <icosahedronGeometry args={withDefaults(geometry.args, [0.9, 0])} />;
    case "roundedBox":
      return <RoundedBoxGeom args={geometry.args} />;
    case "lathe":
      return <LatheGeom points={geometry.points} segments={geometry.segments} />;
    case "extrude":
      return <ExtrudeGeom shape={geometry.shape} depth={geometry.depth} bevel={geometry.bevel} />;
    case "tube":
      return <TubeGeom path={geometry.path} radius={geometry.radius} segments={geometry.segments} />;
    case "box":
    default:
      return <boxGeometry args={withDefaults(geometry.args, [1, 1, 1])} />;
  }
}

// Extrude — a closed 2D shape pushed along Z with an optional bevel, centred on Z.
function ExtrudeGeom({ shape, depth, bevel }: { shape: Array<[number, number]>; depth?: number; bevel?: number }) {
  const geom = useMemo(() => {
    const pts = shape && shape.length >= 3 ? shape : DEFAULT_EXTRUDE_SHAPE;
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const d = depth ?? 0.4;
    const b = Math.max(0, bevel ?? 0.03);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: d,
      bevelEnabled: b > 0,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 2,
      steps: 1
    });
    g.translate(0, 0, -d / 2); // centre on the depth axis like the other primitives
    return g;
  }, [shape, depth, bevel]);
  return <primitive object={geom} attach="geometry" />;
}

// Tube — a circular cross-section swept along a smooth 3D curve.
function TubeGeom({ path, radius, segments }: { path: Array<[number, number, number]>; radius?: number; segments?: number }) {
  const geom = useMemo(() => {
    const pts = path && path.length >= 2 ? path : DEFAULT_TUBE_PATH;
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return new THREE.TubeGeometry(curve, Math.max(8, (segments ?? 0) || pts.length * 12), radius ?? 0.08, 12, false);
  }, [path, radius, segments]);
  return <primitive object={geom} attach="geometry" />;
}

// Rounded/beveled box — not a core three geometry, so build it imperatively and
// memoise so it's only rebuilt when its args change (and disposed on replace).
function RoundedBoxGeom({ args }: { args?: ReadonlyArray<number | undefined> }) {
  const [w, h, d, radius, smoothness] = withDefaults(args, [1, 1, 1, 0.12, 4]);
  const geom = useMemo(() => new RoundedBoxGeometry(w, h, d, Math.max(1, Math.round(smoothness)), radius), [w, h, d, radius, smoothness]);
  return <primitive object={geom} attach="geometry" />;
}

// Lathe — a 2D profile (points are [radiusFromAxis, height]) revolved around Y.
// Falls back to a default vase profile if no valid profile is provided, so a
// half-edited geometry (e.g. switched on in the inspector) never crashes.
function LatheGeom({ points, segments }: { points: Array<[number, number]>; segments?: number }) {
  const profile = useMemo(() => {
    const src = points && points.length >= 2 ? points : DEFAULT_LATHE_PROFILE;
    return src.map(([x, y]) => new THREE.Vector2(x, y));
  }, [points]);
  return <latheGeometry args={[profile, segments ?? 64]} />;
}

function renderMaterial(material: Material | undefined, map: THREE.Texture | null) {
  const m = material ?? {};
  const transparent = typeof m.opacity === "number" && m.opacity < 1;
  const usePhysical = m.type === "physical" || typeof m.transmission === "number" || typeof m.clearcoat === "number" || typeof m.sheen === "number";
  const textureMap = map ?? undefined;

  const shared = {
    color: m.color ?? "#cbd5e1",
    roughness: m.roughness ?? 0.5,
    metalness: m.metalness ?? 0.1,
    emissive: m.emissive ?? "#000000",
    emissiveIntensity: m.emissiveIntensity ?? 1,
    transparent,
    opacity: m.opacity ?? 1,
    wireframe: m.wireframe ?? false,
    flatShading: m.flatShading ?? false,
    map: textureMap
  };

  if (m.type === "basic") {
    return <meshBasicMaterial color={shared.color} map={textureMap} wireframe={shared.wireframe} transparent={transparent} opacity={shared.opacity} />;
  }

  if (usePhysical) {
    return (
      <meshPhysicalMaterial
        {...shared}
        transmission={m.transmission ?? 0}
        ior={m.ior ?? 1.5}
        thickness={m.thickness ?? 0.5}
        clearcoat={m.clearcoat ?? 0}
        clearcoatRoughness={m.clearcoatRoughness ?? 0}
        sheen={m.sheen ?? 0}
        sheenColor={m.sheenColor ?? "#ffffff"}
      />
    );
  }

  return <meshStandardMaterial {...shared} />;
}

// Merge author-supplied args over geometry defaults. Returns a loosely-typed
// tuple so it satisfies every R3F geometry's specific args tuple; the fallback
// fixes the arity per geometry at the call site.
function withDefaults(
  args: ReadonlyArray<number | undefined> | undefined,
  fallback: number[]
): number[] & [] {
  const merged = fallback.map((value, index) => (typeof args?.[index] === "number" ? (args[index] as number) : value));
  // The intersection with `[]` lets the result satisfy any geometry's specific
  // args tuple regardless of arity; the fallback fixes the real length.
  return merged as unknown as number[] & [];
}

// Drei caches GLTFs; nothing to preload statically for the prototype.
export { useGLTF };
export const SceneViewFragment = Fragment;
