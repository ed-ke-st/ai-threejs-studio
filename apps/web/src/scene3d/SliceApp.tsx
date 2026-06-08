// Vertical-slice demo: one rich JSON scene -> one interpreter renderer -> fully
// editable, live. Outliner + canvas + inspector all operate on the SAME Scene3D
// document held in React state. Editing the inspector mutates the JSON; the
// canvas (and the live JSON view) update immediately. This is the model the real
// editor, preview, share viewer, and code export would all share.

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { SceneView } from "@ai-threejs-studio/scene3d/react";
import { findNode, flattenNodes, updateNode, type Scene3D, type SceneNode } from "@ai-threejs-studio/scene3d";
import { Inspector } from "./Inspector";
import { sampleScene } from "./sampleScene";
import styles from "./SliceApp.module.css";

export function SliceApp() {
  const [scene, setScene] = useState<Scene3D>(sampleScene);
  const [selectedId, setSelectedId] = useState<string | null>("crystal");
  const [showJson, setShowJson] = useState(false);

  const selectedNode = useMemo(() => (selectedId ? findNode(scene.nodes, selectedId) : null), [scene, selectedId]);
  const outline = useMemo(() => flattenNodes(scene.nodes), [scene]);

  const handleNodeChange = (next: SceneNode) => {
    setScene((current) => ({ ...current, nodes: updateNode(current.nodes, next.id, () => next) }));
  };

  const cam = scene.camera ?? {};

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <strong className={styles.title}>Scene3D vertical slice</strong>
        <span className={styles.sceneName}>{scene.metadata.name}</span>
        <span className={styles.spacer} />
        <button className={styles.button} onClick={() => setShowJson((v) => !v)}>
          {showJson ? "Hide" : "Show"} source JSON
        </button>
        <button
          className={styles.button}
          onClick={() => {
            setScene(sampleScene);
            setSelectedId("crystal");
          }}
        >
          Reset
        </button>
      </header>

      <div className={styles.body}>
        <aside className={`${styles.panel} ${styles.panelLeft}`}>
          <div className={styles.panelTitle}>Outliner</div>
          {outline.map((node) => (
            <button
              key={node.id}
              onClick={() => setSelectedId(node.id)}
              className={node.id === selectedId ? `${styles.outlineRow} ${styles.outlineRowSelected}` : styles.outlineRow}
            >
              <span className={styles.glyph}>{glyph(node)}</span>
              {node.name ?? node.id}
            </button>
          ))}
        </aside>

        <main className={styles.canvasMain}>
          <Canvas
            shadows
            camera={{ position: cam.position ?? [3.4, 2.6, 4.4], fov: cam.fov ?? 42 }}
            onPointerMissed={() => setSelectedId(null)}
          >
            <SceneView scene={scene} selectedId={selectedId} onSelect={setSelectedId} />
            <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={20} blur={2.4} far={8} />
            <OrbitControls makeDefault target={cam.target ?? [0, 1.1, 0]} />
          </Canvas>

          {showJson ? <pre className={styles.jsonOverlay}>{JSON.stringify(scene, null, 2)}</pre> : null}
        </main>

        <aside className={`${styles.panel} ${styles.panelRight}`}>
          <div className={styles.panelTitle}>Inspector</div>
          <Inspector node={selectedNode} onChange={handleNodeChange} />
        </aside>
      </div>
    </div>
  );
}

function glyph(node: SceneNode): string {
  switch (node.type) {
    case "group":
      return "▣";
    case "light":
      return "✦";
    case "model":
      return "◆";
    default:
      return "●";
  }
}

