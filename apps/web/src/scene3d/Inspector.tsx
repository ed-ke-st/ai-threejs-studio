import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ComponentType } from "react";
import { createPortal } from "react-dom";
import { Euler, Vector3 } from "three";
import type { Camera, LightNode, MeshNode, SceneNode, Transform, Vec3 } from "@ai-threejs-studio/scene3d";
import { DEFAULT_CAMERA, DEFAULT_LATHE_PROFILE, GEOMETRY_KINDS, TEXTURE_PATTERNS, normalizeTransform, type GeometryKind } from "@ai-threejs-studio/scene3d";
import { CameraIcon, ChevronDownIcon, LightIcon, MaterialIcon, SetupIcon, TextureIcon, TransformIcon, type IconProps } from "../ui/icons";
import styles from "./Inspector.module.css";

interface InspectorProps {
  node: SceneNode | null;
  onChange: (next: SceneNode) => void;
  onUploadImage?: (file: File) => Promise<string>;
  /** Desktop: render as a narrow icon rail; clicking an icon flies a section out to the left. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type InspectorTabId = "setup" | "transform" | "material" | "texture" | "light";

interface RailSection {
  id: string;
  label: string;
  icon: ComponentType<IconProps>;
  render: () => ReactNode;
}

// Shared collapsed presentation: a narrow icon rail where each section flies out
// to the left on click (portaled + position: fixed so it escapes the pane's
// overflow clipping, top-aligned to the clicked icon). Used by both the single-node
// Inspector and the multi-select bulk panel.
function CollapsedRail({ title, sections, onToggleCollapse }: { title: string; sections: RailSection[]; onToggleCollapse?: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const place = useCallback(() => {
    const rail = railRef.current;
    const anchor = anchorRef.current;
    if (!rail || !anchor) return;
    const railRect = rail.getBoundingClientRect();
    const iconRect = anchor.getBoundingClientRect();
    const margin = 8;
    const top = Math.max(margin, Math.min(iconRect.top, window.innerHeight - 240 - margin));
    setPos({ top, right: window.innerWidth - railRect.left + 6, maxHeight: window.innerHeight - top - margin });
  }, []);

  useEffect(() => {
    if (!openId) return;
    place();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (railRef.current?.contains(target) || flyoutRef.current?.contains(target)) return;
      setOpenId(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [openId, place]);

  const active = sections.find((section) => section.id === openId) ?? null;

  return (
    <div className={styles.rail} ref={railRef}>
      <button className={styles.railExpand} onClick={onToggleCollapse} title="Expand inspector" aria-label="Expand inspector">
        <ChevronDownIcon className={styles.expandIcon} />
      </button>
      {sections.length > 0 ? (
        <div className={styles.railIcons}>
          {sections.map((section) => (
            <button
              key={section.id}
              className={openId === section.id ? `${styles.railIcon} ${styles.railIconActive}` : styles.railIcon}
              onClick={(event) => {
                anchorRef.current = event.currentTarget;
                setOpenId((current) => (current === section.id ? null : section.id));
              }}
              data-label={section.label}
              title={section.label}
              aria-label={section.label}
              aria-expanded={openId === section.id}
            >
              <section.icon />
            </button>
          ))}
        </div>
      ) : null}
      {active && pos
        ? createPortal(
            <div
              ref={flyoutRef}
              className={styles.flyout}
              role="dialog"
              aria-label={`${active.label} settings`}
              style={{ position: "fixed", top: pos.top, right: pos.right, maxHeight: pos.maxHeight }}
            >
              <div className={styles.flyoutHeader}>
                <span className={styles.flyoutTitle}>{title}</span>
                <span className={styles.flyoutSub}>{active.label}</span>
              </div>
              <div className={styles.flyoutBody}>{active.render()}</div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function Inspector({ node, onChange, onUploadImage, collapsed = false, onToggleCollapse }: InspectorProps) {
  const tabs = useMemo(() => tabsForNode(node), [node]);
  const [activeTab, setActiveTab] = useState<InspectorTabId>(tabs[0]?.id ?? "setup");
  const compact = useCompactInspector();

  useEffect(() => {
    setActiveTab((current) => (tabs.some((tab) => tab.id === current) ? current : tabs[0]?.id ?? "setup"));
  }, [tabs]);

  // Renders a single tab's content — shared by the full pane and the collapsed flyout.
  const renderTab = (tab: InspectorTabId): ReactNode => {
    if (!node) return null;
    const transform = normalizeTransform(node.transform);
    const setTransform = (key: "position" | "rotation" | "scale", axis: number, value: number) => {
      const next = [...transform[key]] as Vec3;
      next[axis] = value;
      onChange({ ...node, transform: { ...transform, [key]: next } });
    };

    switch (tab) {
      case "setup":
        return (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <strong>Basics</strong>
              <span>Identity and visibility</span>
            </div>
            <FieldGroup title="Object state" defaultOpen>
              <CheckboxRow label="Visible" checked={node.visible !== false} onChange={(checked) => onChange({ ...node, visible: checked })} />
              {node.type === "mesh" ? <MeshSetupControls node={node} onChange={onChange} /> : null}
              {node.type === "light" ? <LightSetupControls node={node} /> : null}
            </FieldGroup>
          </section>
        );
      case "transform":
        return (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <strong>Transform</strong>
              <span>Position, rotation, and scale</span>
            </div>
            <FieldGroup title="Position" defaultOpen key={`position-${compact ? "compact" : "full"}`}>
              <VectorField label="Position" value={transform.position} onChange={(axis, value) => setTransform("position", axis, value)} min={-15} max={15} step={0.1} />
            </FieldGroup>
            <FieldGroup title="Rotation" defaultOpen={!compact} key={`rotation-${compact ? "compact" : "full"}`}>
              <VectorField label="Rotation" value={transform.rotation} onChange={(axis, value) => setTransform("rotation", axis, value)} min={-Math.PI} max={Math.PI} step={0.02} />
            </FieldGroup>
            <FieldGroup title="Scale" defaultOpen={!compact} key={`scale-${compact ? "compact" : "full"}`}>
              <VectorField label="Scale" value={transform.scale} onChange={(axis, value) => setTransform("scale", axis, value)} min={0.1} max={5} step={0.05} />
            </FieldGroup>
          </section>
        );
      case "material":
        return node.type === "mesh" ? <MeshMaterialControls compact={compact} node={node} onChange={onChange} /> : null;
      case "texture":
        return node.type === "mesh" ? <TexturePanel compact={compact} node={node} onChange={onChange} onUploadImage={onUploadImage} /> : null;
      case "light":
        return node.type === "light" ? <LightPanel node={node} onChange={onChange} /> : null;
      default:
        return null;
    }
  };

  // Collapsed: a narrow icon rail; each section flies out on click.
  if (collapsed) {
    const sections: RailSection[] = node
      ? tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, render: () => renderTab(tab.id) }))
      : [];
    return <CollapsedRail title={node?.name ?? node?.id ?? "Inspector"} sections={sections} onToggleCollapse={onToggleCollapse} />;
  }

  if (!node) {
    return (
      <div className={styles.root}>
        {onToggleCollapse ? (
          <div className={styles.hintHeader}>
            <button className={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse inspector" aria-label="Collapse inspector">
              <ChevronDownIcon className={styles.collapseIcon} />
            </button>
          </div>
        ) : null}
        <p className={styles.hint}>Select an object in the scene or outliner to edit it.</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div className={styles.summaryMeta}>
            <span className={styles.kindBadge}>{node.type}</span>
            {node.type === "mesh" ? <span className={styles.summaryPill}>{node.geometry.kind}</span> : null}
            {node.type === "light" ? <span className={styles.summaryPill}>{node.light}</span> : null}
          </div>
          {onToggleCollapse ? (
            <button className={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse inspector" aria-label="Collapse inspector">
              <ChevronDownIcon className={styles.collapseIcon} />
            </button>
          ) : null}
        </div>
        <div className={styles.title}>{node.name ?? node.id}</div>
        <div className={styles.subtitle}>{node.id}</div>
      </header>

      <div className={styles.tabList} role="tablist" aria-label="Inspector sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            aria-label={tab.label}
          >
            <tab.icon className={styles.tabIcon} />
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.scrollArea}>{renderTab(activeTab)}</div>
    </div>
  );
}

interface CameraInspectorProps {
  /** The camera to edit — pass playhead-sampled values while previewing so the
   *  sliders match the viewport (the editor auto-keys edits then). */
  camera: Camera;
  onChange: (next: Camera) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Slider editing for the active camera — position, look-at target, and lens —
// shown when no node is selected and the viewport looks through a camera. The
// same controls (and ranges) as node transforms, so camera keyframes can be
// fine-tuned numerically instead of only by orbiting.
export function CameraInspector({ camera, onChange, collapsed = false, onToggleCollapse }: CameraInspectorProps) {
  const position = camera.position ?? DEFAULT_CAMERA.position;
  const target = camera.target ?? DEFAULT_CAMERA.target;
  const type = camera.type ?? "perspective";

  // Always emit fully-populated position/target so edits key cleanly.
  const emit = (patch: Partial<Camera>) => onChange({ ...camera, position: [...position], target: [...target], ...patch });
  const setVec = (key: "position" | "target", axis: number, value: number) => {
    const next = [...(key === "position" ? position : target)] as Vec3;
    next[axis] = value;
    emit({ [key]: next });
  };

  const renderBody = () => (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <strong>Camera</strong>
        <span>Position, look-at target, and lens</span>
      </div>
      <FieldGroup title="Position" defaultOpen>
        <VectorField label="Position" value={position} onChange={(axis, value) => setVec("position", axis, value)} min={-25} max={25} step={0.1} />
      </FieldGroup>
      <FieldGroup title="Target" defaultOpen>
        <VectorField label="Target" value={target} onChange={(axis, value) => setVec("target", axis, value)} min={-25} max={25} step={0.1} />
      </FieldGroup>
      <FieldGroup title="Lens" defaultOpen>
        {type === "perspective" ? (
          <NumberRow label="FOV" value={camera.fov ?? DEFAULT_CAMERA.fov} min={10} max={120} step={1} onChange={(value) => emit({ fov: value })} />
        ) : (
          <NumberRow label="Zoom" value={camera.zoom ?? 50} min={10} max={200} step={1} onChange={(value) => emit({ zoom: value })} />
        )}
      </FieldGroup>
    </section>
  );

  if (collapsed) {
    const sections: RailSection[] = [{ id: "camera", label: "Camera", icon: CameraIcon, render: renderBody }];
    return <CollapsedRail title={camera.name ?? camera.id} sections={sections} onToggleCollapse={onToggleCollapse} />;
  }

  return (
    <div className={styles.root}>
      <header className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div className={styles.summaryMeta}>
            <span className={styles.kindBadge}>camera</span>
            <span className={styles.summaryPill}>{type}</span>
          </div>
          {onToggleCollapse ? (
            <button className={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse inspector" aria-label="Collapse inspector">
              <ChevronDownIcon className={styles.collapseIcon} />
            </button>
          ) : null}
        </div>
        <div className={styles.title}>{camera.name ?? camera.id}</div>
        <div className={styles.subtitle}>{camera.id}</div>
      </header>

      <div className={styles.scrollArea}>{renderBody()}</div>
    </div>
  );
}

interface MultiInspectorProps {
  nodes: SceneNode[];
  onApply: (updater: (node: SceneNode) => SceneNode) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type Pivot = "each" | "center";

export function MultiInspector({ nodes, onApply, collapsed = false, onToggleCollapse }: MultiInspectorProps) {
  const compact = useCompactInspector();
  const [offset, setOffset] = useState<Vec3>([0, 0, 0]);
  const [rotation, setRotation] = useState<Vec3>([0, 0, 0]);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [pivot, setPivot] = useState<Pivot>("each");
  const baseline = useRef<Map<string, Transform>>(new Map());

  const selectionKey = nodes.map((node) => node.id).join(",");
  useEffect(() => {
    baseline.current = new Map(nodes.map((node) => [node.id, normalizeTransform(node.transform)]));
    setOffset([0, 0, 0]);
    setRotation([0, 0, 0]);
    setScaleFactor(1);
  }, [selectionKey, nodes]);

  const center = (): Vec3 => {
    const bases = Array.from(baseline.current.values());
    const count = bases.length || 1;
    return [
      bases.reduce((sum, base) => sum + base.position[0], 0) / count,
      bases.reduce((sum, base) => sum + base.position[1], 0) / count,
      bases.reduce((sum, base) => sum + base.position[2], 0) / count
    ];
  };

  const apply = (nextOffset: Vec3, nextRotation: Vec3, nextScale: number, nextPivot: Pivot) => {
    const pivotCenter = nextPivot === "center" ? center() : null;
    const euler = new Euler(nextRotation[0], nextRotation[1], nextRotation[2], "XYZ");
    onApply((node) => {
      const base = baseline.current.get(node.id);
      if (!base) return node;
      let position: Vec3;
      if (pivotCenter) {
        const vector = new Vector3(
          base.position[0] - pivotCenter[0],
          base.position[1] - pivotCenter[1],
          base.position[2] - pivotCenter[2]
        );
        vector.multiplyScalar(nextScale).applyEuler(euler);
        position = [
          pivotCenter[0] + vector.x + nextOffset[0],
          pivotCenter[1] + vector.y + nextOffset[1],
          pivotCenter[2] + vector.z + nextOffset[2]
        ];
      } else {
        position = [
          base.position[0] + nextOffset[0],
          base.position[1] + nextOffset[1],
          base.position[2] + nextOffset[2]
        ];
      }
      const transform: Transform = {
        position,
        rotation: [
          base.rotation[0] + nextRotation[0],
          base.rotation[1] + nextRotation[1],
          base.rotation[2] + nextRotation[2]
        ],
        scale: [base.scale[0] * nextScale, base.scale[1] * nextScale, base.scale[2] * nextScale]
      };
      return { ...node, transform };
    });
  };

  const setOffsetAxis = (axis: number, value: number) => {
    const next = [...offset] as Vec3;
    next[axis] = value;
    setOffset(next);
    apply(next, rotation, scaleFactor, pivot);
  };

  const setRotationAxis = (axis: number, value: number) => {
    const next = [...rotation] as Vec3;
    next[axis] = value;
    setRotation(next);
    apply(offset, next, scaleFactor, pivot);
  };

  const setScale = (value: number) => {
    setScaleFactor(value);
    apply(offset, rotation, value, pivot);
  };

  const changePivot = (next: Pivot) => {
    setPivot(next);
    apply(offset, rotation, scaleFactor, next);
  };

  const reset = () => {
    setOffset([0, 0, 0]);
    setRotation([0, 0, 0]);
    setScaleFactor(1);
    apply([0, 0, 0], [0, 0, 0], 1, pivot);
  };

  const renderBulk = (): ReactNode => (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <strong>Transform</strong>
        <span>Apply one coordinated change across the selection</span>
      </div>
      <FieldGroup title="Pivot" defaultOpen>
        <div className={styles.pivotToggle}>
          <button className={pivotClass(pivot === "each")} onClick={() => changePivot("each")} type="button">
            Each center
          </button>
          <button className={pivotClass(pivot === "center")} onClick={() => changePivot("center")} type="button">
            Selection center
          </button>
        </div>
      </FieldGroup>

      <FieldGroup title="Bulk values" defaultOpen={!compact} key={`bulk-${compact ? "compact" : "full"}`}>
        <VectorField label="Move by" value={offset} onChange={setOffsetAxis} min={-10} max={10} step={0.1} />
        <VectorField label="Rotate by" value={rotation} onChange={setRotationAxis} min={-Math.PI} max={Math.PI} step={0.02} />
        <NumberRow label="Scale ×" value={scaleFactor} min={0.2} max={3} step={0.05} onChange={setScale} />
      </FieldGroup>

      <button className={styles.resetBtn} onClick={reset} type="button">
        Reset transform
      </button>
    </section>
  );

  if (collapsed) {
    return (
      <CollapsedRail
        title={`${nodes.length} objects`}
        sections={[{ id: "bulk", label: "Bulk transform", icon: TransformIcon, render: renderBulk }]}
        onToggleCollapse={onToggleCollapse}
      />
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div className={styles.summaryMeta}>
            <span className={styles.kindBadge}>multi</span>
            <span className={styles.summaryPill}>{nodes.length} selected</span>
          </div>
          {onToggleCollapse ? (
            <button className={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse inspector" aria-label="Collapse inspector">
              <ChevronDownIcon className={styles.collapseIcon} />
            </button>
          ) : null}
        </div>
        <div className={styles.title}>Bulk transform</div>
        <div className={styles.subtitle}>Move, rotate, and scale the selection together.</div>
      </header>

      <div className={styles.scrollArea}>{renderBulk()}</div>

      <div className={styles.footer}>
        {nodes.slice(0, 6).map((node) => node.name ?? node.id).join(", ")}
        {nodes.length > 6 ? `, +${nodes.length - 6} more` : ""}
      </div>
    </div>
  );
}

function pivotClass(active: boolean): string {
  return active ? `${styles.pivotBtn} ${styles.pivotBtnActive}` : styles.pivotBtn;
}

function tabsForNode(node: SceneNode | null): Array<{ id: InspectorTabId; label: string; icon: ComponentType<IconProps> }> {
  if (!node) {
    return [{ id: "setup", label: "Setup", icon: SetupIcon }];
  }

  if (node.type === "mesh") {
    return [
      { id: "setup", label: "Setup", icon: SetupIcon },
      { id: "transform", label: "Transform", icon: TransformIcon },
      { id: "material", label: "Material", icon: MaterialIcon },
      { id: "texture", label: "Texture", icon: TextureIcon }
    ];
  }

  return [
    { id: "setup", label: "Setup", icon: SetupIcon },
    { id: "transform", label: "Transform", icon: TransformIcon },
    { id: "light", label: "Light", icon: LightIcon }
  ];
}

function useCompactInspector(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return compact;
}

function FieldGroup({
  title,
  defaultOpen,
  children
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={styles.group} open={defaultOpen}>
      <summary className={styles.groupSummary}>
        <span>{title}</span>
        <span className={styles.groupChevron}>⌄</span>
      </summary>
      <div className={styles.groupBody}>{children}</div>
    </details>
  );
}

function MeshSetupControls({ node, onChange }: { node: MeshNode; onChange: (next: SceneNode) => void }) {
  const material = node.material ?? {};

  return (
    <>
      <label className={styles.row}>
        <span className={styles.label}>Geometry</span>
        <select
          value={node.geometry.kind}
          onChange={(event) => {
            const kind = event.target.value as GeometryKind;
            // Lathe needs a profile; seed a default one so the switch renders.
            const geometry = kind === "lathe" ? { kind, points: DEFAULT_LATHE_PROFILE } : ({ kind } as MeshNode["geometry"]);
            onChange({ ...node, geometry });
          }}
          className={styles.select}
        >
          {GEOMETRY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.row}>
        <span className={styles.label}>Material type</span>
        <select
          value={material.type ?? "standard"}
          onChange={(event) => onChange({ ...node, material: { ...material, type: event.target.value as MaterialType } })}
          className={styles.select}
        >
          {MATERIAL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

type MaterialType = NonNullable<NonNullable<MeshNode["material"]>["type"]>;
const MATERIAL_TYPES: MaterialType[] = ["standard", "physical", "basic"];

interface MaterialPreset {
  id: string;
  label: string;
  swatch: string;
  material: Partial<NonNullable<MeshNode["material"]>>;
}

const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: "gold",
    label: "Gold",
    swatch: "linear-gradient(135deg, #fff1a8, #f2b84b 48%, #8d5a12)",
    material: { type: "standard", color: "#f4c65a", metalness: 1, roughness: 0.22, emissive: "#000000", emissiveIntensity: 0, opacity: 1, transmission: 0 }
  },
  {
    id: "chrome",
    label: "Chrome",
    swatch: "linear-gradient(135deg, #ffffff, #98a8b8 48%, #1f2937)",
    material: { type: "standard", color: "#d9e5f0", metalness: 1, roughness: 0.06, emissive: "#000000", emissiveIntensity: 0, opacity: 1, transmission: 0 }
  },
  {
    id: "glass",
    label: "Glass",
    swatch: "linear-gradient(135deg, rgba(236,253,255,0.95), rgba(103,232,249,0.35), rgba(15,23,42,0.25))",
    material: { type: "physical", color: "#d7fbff", metalness: 0, roughness: 0.03, opacity: 0.42, transmission: 0.86, ior: 1.45, thickness: 0.8, emissive: "#000000", emissiveIntensity: 0 }
  },
  {
    id: "plastic",
    label: "Plastic",
    swatch: "linear-gradient(135deg, #93c5fd, #2563eb 58%, #172554)",
    material: { type: "standard", color: "#2563eb", metalness: 0, roughness: 0.34, emissive: "#000000", emissiveIntensity: 0, opacity: 1, transmission: 0 }
  },
  {
    id: "neon",
    label: "Neon",
    swatch: "radial-gradient(circle at 35% 35%, #ffffff, #5eead4 28%, #0891b2 70%, #0f172a)",
    material: { type: "standard", color: "#0f172a", metalness: 0.05, roughness: 0.25, emissive: "#38f8ff", emissiveIntensity: 3.2, opacity: 1, transmission: 0 }
  },
  {
    id: "matte",
    label: "Matte",
    swatch: "linear-gradient(135deg, #f8fafc, #cbd5e1 58%, #64748b)",
    material: { type: "standard", color: "#d9dee7", metalness: 0, roughness: 0.88, emissive: "#000000", emissiveIntensity: 0, opacity: 1, transmission: 0 }
  }
];

function MeshMaterialControls({
  compact,
  node,
  onChange
}: {
  compact: boolean;
  node: MeshNode;
  onChange: (next: SceneNode) => void;
}) {
  const material = node.material ?? {};
  const setMaterial = (patch: Partial<NonNullable<MeshNode["material"]>>) => onChange({ ...node, material: { ...material, ...patch } });

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <strong>Material</strong>
        <span>Surface color, shading, and finish</span>
      </div>
      <FieldGroup title="Surface" defaultOpen>
        <div className={styles.presetGrid} aria-label="Material presets">
          {MATERIAL_PRESETS.map((preset) => (
            <button key={preset.id} className={styles.presetChip} onClick={() => setMaterial(preset.material)} type="button" title={`Apply ${preset.label} material`}>
              <span className={styles.presetSwatch} style={{ background: preset.swatch }} aria-hidden="true" />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
        <ColorRow label="Color" value={material.color ?? "#cbd5e1"} onChange={(value) => setMaterial({ color: value })} />
        <ColorRow label="Emissive" value={material.emissive ?? "#000000"} onChange={(value) => setMaterial({ emissive: value })} />
        <NumberRow
          label="Emissive intensity"
          value={material.emissiveIntensity ?? 1}
          min={0}
          max={6}
          step={0.1}
          onChange={(value) => setMaterial({ emissiveIntensity: value })}
        />
        <NumberRow label="Roughness" value={material.roughness ?? 0.5} min={0} max={1} step={0.05} onChange={(value) => setMaterial({ roughness: value })} />
        <NumberRow label="Metalness" value={material.metalness ?? 0.1} min={0} max={1} step={0.05} onChange={(value) => setMaterial({ metalness: value })} />
        <NumberRow label="Opacity" value={material.opacity ?? 1} min={0} max={1} step={0.05} onChange={(value) => setMaterial({ opacity: value })} />
      </FieldGroup>

      <FieldGroup title="Advanced" defaultOpen={!compact} key={`material-advanced-${compact ? "compact" : "full"}`}>
        <NumberRow
          label="Transmission"
          value={material.transmission ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => setMaterial({ transmission: value, type: value > 0 ? "physical" : node.material?.type })}
        />
        {(material.type === "physical" || (material.transmission ?? 0) > 0) ? (
          <>
            <NumberRow label="IOR" value={material.ior ?? 1.5} min={1} max={2.5} step={0.01} onChange={(value) => setMaterial({ ior: value })} />
            <NumberRow label="Thickness" value={material.thickness ?? 0.5} min={0} max={5} step={0.1} onChange={(value) => setMaterial({ thickness: value })} />
          </>
        ) : null}
        <CheckboxRow label="Wireframe" checked={material.wireframe ?? false} onChange={(value) => setMaterial({ wireframe: value })} />
        <CheckboxRow label="Flat shading" checked={material.flatShading ?? false} onChange={(value) => setMaterial({ flatShading: value })} />
      </FieldGroup>
    </section>
  );
}

type TextureSource = "none" | "pattern" | "image";

function TexturePanel({
  compact,
  node,
  onChange,
  onUploadImage
}: {
  compact: boolean;
  node: MeshNode;
  onChange: (next: SceneNode) => void;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const material = node.material ?? {};
  const setMaterial = (patch: Partial<MeshNode["material"]>) => onChange({ ...node, material: { ...material, ...patch } });

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <strong>Texture</strong>
        <span>Pattern fills or uploaded imagery</span>
      </div>
      <TextureControls compact={compact} material={material} setMaterial={setMaterial} onUploadImage={onUploadImage} />
    </section>
  );
}

function TextureControls({
  compact,
  material,
  setMaterial,
  onUploadImage
}: {
  compact: boolean;
  material: NonNullable<MeshNode["material"]>;
  setMaterial: (patch: Partial<NonNullable<MeshNode["material"]>>) => void;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const texture = material.texture;
  // Presence check, not truthiness: an empty imageUrl ("") still means "image"
  // mode (the field/upload UI stays up while you paste or upload a URL).
  const source: TextureSource = texture?.imageUrl != null ? "image" : texture?.pattern ? "pattern" : "none";
  const [uploading, setUploading] = useState(false);

  const setSource = (value: TextureSource) => {
    if (value === "none") {
      setMaterial({ texture: undefined });
    } else if (value === "pattern") {
      setMaterial({
        texture: {
          pattern: texture?.pattern ?? "checker",
          color1: texture?.color1 ?? "#ffffff",
          color2: texture?.color2 ?? "#222a38",
          repeat: texture?.repeat ?? 4
        }
      });
    } else {
      setMaterial({ texture: { imageUrl: texture?.imageUrl ?? "", repeat: texture?.repeat ?? 1 } });
    }
  };

  const patch = (next: Partial<NonNullable<typeof texture>>) => {
    if (texture) setMaterial({ texture: { ...texture, ...next } });
  };

  const handleFile = async (file: File) => {
    if (!onUploadImage) return;
    setUploading(true);
    try {
      patch({ imageUrl: await onUploadImage(file) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <FieldGroup title="Texture source" defaultOpen>
        <label className={styles.row}>
          <span className={styles.label}>Source</span>
          <select value={source} onChange={(event) => setSource(event.target.value as TextureSource)} className={styles.select}>
            <option value="none">none</option>
            <option value="pattern">pattern</option>
            <option value="image">image</option>
          </select>
        </label>
      </FieldGroup>

      {source === "pattern" && texture ? (
        <FieldGroup title="Pattern settings" defaultOpen={!compact} key={`texture-pattern-${compact ? "compact" : "full"}`}>
          <label className={styles.row}>
            <span className={styles.label}>Pattern</span>
            <select
              value={texture.pattern ?? "checker"}
              onChange={(event) => patch({ pattern: event.target.value as NonNullable<typeof texture>["pattern"] })}
              className={styles.select}
            >
              {TEXTURE_PATTERNS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {pattern}
                </option>
              ))}
            </select>
          </label>
          <ColorRow label="Foreground" value={texture.color1 ?? "#ffffff"} onChange={(value) => patch({ color1: value })} />
          <ColorRow label="Background" value={texture.color2 ?? "#222a38"} onChange={(value) => patch({ color2: value })} />
          <NumberRow label="Repeat" value={texture.repeat ?? 4} min={1} max={20} step={1} onChange={(value) => patch({ repeat: value })} />
        </FieldGroup>
      ) : null}

      {source === "image" && texture ? (
        <FieldGroup title="Image texture" defaultOpen key={`texture-image-${compact ? "compact" : "full"}`}>
          <div className={styles.field}>
            <span className={styles.label}>Image URL</span>
            <input
              className={styles.textInput}
              type="text"
              placeholder="https://… or upload below"
              value={texture.imageUrl ?? ""}
              onChange={(event) => patch({ imageUrl: event.target.value })}
            />
          </div>
          {onUploadImage ? (
            <label className={styles.uploadBtn}>
              {uploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          ) : null}
          <NumberRow label="Repeat" value={texture.repeat ?? 1} min={1} max={20} step={1} onChange={(value) => patch({ repeat: value })} />
        </FieldGroup>
      ) : null}
    </>
  );
}

function LightSetupControls({ node }: { node: LightNode }) {
  return (
    <div className={styles.controlHint}>
      <span className={styles.label}>Light type</span>
      <span className={styles.inlineValue}>{node.light}</span>
    </div>
  );
}

function LightPanel({ node, onChange }: { node: LightNode; onChange: (next: SceneNode) => void }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <strong>Light</strong>
        <span>Color and intensity</span>
      </div>
      <FieldGroup title="Emission" defaultOpen>
        <ColorRow label="Color" value={node.color ?? "#ffffff"} onChange={(value) => onChange({ ...node, color: value })} />
        <NumberRow label="Intensity" value={node.intensity ?? 1} min={0} max={60} step={0.5} onChange={(value) => onChange({ ...node, intensity: value })} />
      </FieldGroup>
    </section>
  );
}

function VectorField({
  label: fieldLabel,
  value,
  onChange,
  min,
  max,
  step
}: {
  label: string;
  value: Vec3;
  onChange: (axis: number, value: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className={styles.vectorBlock}>
      <div className={styles.blockLabel}>{fieldLabel}</div>
      <div className={styles.vector}>
        {(["X", "Y", "Z"] as const).map((axisName, axis) => (
          <div key={axisName} className={styles.axisRow}>
            <span className={styles.axisName}>{axisName}</span>
            <input
              type="range"
              className={styles.range}
              min={min}
              max={max}
              step={step}
              value={clamp(value[axis], min, max)}
              onChange={(event) => onChange(axis, Number(event.target.value))}
            />
            <span className={styles.axisValue}>{round(value[axis])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NumberRow({
  label: fieldLabel,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.numberRow}>
      <div className={styles.numberHeader}>
        <span className={styles.label}>{fieldLabel}</span>
        <span className={styles.numberValue}>{round(value)}</span>
      </div>
      <input
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function CheckboxRow({
  label: fieldLabel,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={styles.row}>
      <span className={styles.label}>{fieldLabel}</span>
      <input className={styles.checkboxInput} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ColorRow({
  label: fieldLabel,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.row}>
      <span className={styles.label}>{fieldLabel}</span>
      <span className={styles.colorControl}>
        <input type="color" className={styles.colorInput} value={value} onChange={(event) => onChange(event.target.value)} />
        <span className={styles.inlineValue}>{value}</span>
      </span>
    </label>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
