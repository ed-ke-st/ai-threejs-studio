// SceneView — the single interpreter that renders a Scene3D JSON document.
//
// This is the heart of the new architecture: there is exactly ONE renderer, and
// it is a pure function of the scene JSON. The same component powers the live
// editor preview, the shared static viewer, and (via the same JSON) on-demand
// code export. Nothing here is bespoke per scene — richness comes from the data.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Center, Clone, Edges, Environment, Html, useGLTF } from "@react-three/drei";
import type {
  AnimatableProperty,
  Animation,
  Geometry,
  LightNode,
  Material,
  MeshNode,
  ModelNode,
  Scene3D,
  SceneNode,
  TextureSpec
} from "./schema";
import { animationDuration, normalizeTransform, sampleTrack } from "./schema";

interface SceneViewProps {
  scene: Scene3D;
  selectedId?: string | null;
  /** Multi-selection. When provided, every listed node is highlighted; takes precedence over selectedId. */
  selectedIds?: string[];
  onSelect?: (id: string) => void;
  /** Controlled playback time (seconds). When set, animation is driven to exactly this
   *  time each frame (editor scrubbing/playhead). When omitted, animation autoplays/loops. */
  animationTime?: number;
}

export function SceneView({ scene, selectedId, selectedIds, onSelect, animationTime }: SceneViewProps) {
  const ids = selectedIds ?? (selectedId ? [selectedId] : []);
  return (
    <>
      {scene.background ? <color attach="background" args={[scene.background]} /> : null}
      {scene.fog ? <fog attach="fog" args={[scene.fog.color, scene.fog.near, scene.fog.far]} /> : null}
      {scene.environment?.preset ? (
        <Environment preset={scene.environment.preset as never} environmentIntensity={scene.environment.intensity ?? 1} />
      ) : null}
      {scene.animation && scene.animation.tracks.length > 0 ? (
        <AnimationDriver animation={scene.animation} time={animationTime} />
      ) : null}
      {scene.nodes.map((node) => (
        <NodeView key={node.id} node={node} selectedIds={ids} onSelect={onSelect} />
      ))}
    </>
  );
}

// Drives keyframe animation imperatively. Each frame it advances (or reads the
// controlled) time, samples every track, and mutates the matching node's Object3D
// directly — found by name (NodeView sets name={node.id}). Mutating refs instead
// of React state keeps playback off the render path. Camera-target tracks are a
// no-op here (no object by that name); the camera UI phase handles those.
function AnimationDriver({ animation, time }: { animation: Animation; time?: number }) {
  const root = useThree((state) => state.scene);
  const clock = useRef(0);
  const duration = useMemo(() => animationDuration(animation), [animation]);

  useFrame((_, delta) => {
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
    case "box":
    default:
      return <boxGeometry args={withDefaults(geometry.args, [1, 1, 1])} />;
  }
}

function renderMaterial(material: Material | undefined, map: THREE.Texture | null) {
  const m = material ?? {};
  const transparent = typeof m.opacity === "number" && m.opacity < 1;
  const usePhysical = m.type === "physical" || typeof m.transmission === "number";
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
