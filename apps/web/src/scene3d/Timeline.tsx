// Timeline — the keyframe-animation panel docked at the bottom of the viewport.
// Transport (play/pause, loop, prev/next key, duration, scrubber) drives the
// editor playhead, which is fed to SceneView as a controlled animationTime so the
// viewport reflects the timeline. Per-selected-node "key" buttons capture the live
// pose into tracks. Tracks are grouped per object and per channel (Position/
// Rotation/Scale), both collapsible — a collapsed group shows a read-only
// aggregate lane of its key times. Keyframe diamonds: click to select + seek,
// ⌥/Alt-click to delete, drag to retime (committed on release via onMoveKeyframe).

import { useRef, useState } from "react";
import type { AnimatableProperty, Animation, AnimationTrack, SceneNode } from "@ai-threejs-studio/scene3d";
import styles from "./Timeline.module.css";
import { AnimationIcon } from "../ui/icons";

const PROPERTY_LABEL: Record<string, string> = {
  "position.x": "Position X", "position.y": "Position Y", "position.z": "Position Z",
  "rotation.x": "Rotation X", "rotation.y": "Rotation Y", "rotation.z": "Rotation Z",
  "scale.x": "Scale X", "scale.y": "Scale Y", "scale.z": "Scale Z", scale: "Scale",
  opacity: "Opacity", "target.x": "Target X", "target.y": "Target Y", "target.z": "Target Z",
  fov: "FOV", zoom: "Zoom"
};

/** Channels that share a prefix collapse into one named group per object. */
const VECTOR_GROUP: Record<string, string> = { position: "Position", rotation: "Rotation", scale: "Scale", target: "Target" };

export interface TimelineProps {
  open: boolean;
  animation?: Animation;
  duration: number;
  playhead: number;
  playing: boolean;
  selectedNode: SceneNode | null;
  /** Pull the panel's right edge in by this many px so it clears the inspector's
   *  collapsed rail (which floats over the right edge of the full-width canvas). */
  rightInset?: number;
  nodeName: (id: string) => string;
  onToggleOpen: () => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSetDuration: (duration: number) => void;
  onToggleLoop: () => void;
  onKey: (channels: AnimatableProperty[]) => void;
  onDeleteTrack: (trackId: string) => void;
  onDeleteKeyframe: (trackId: string, time: number) => void;
  onMoveKeyframe: (trackId: string, fromTime: number, toTime: number) => void;
  onSelectNode: (nodeId: string) => void;
}

// Panel height chosen by dragging the top edge, persisted editor-wide. Null
// until the user resizes for the first time — the panel then auto-sizes to its
// content as before.
const HEIGHT_KEY = "s3d:timelineHeight";
const MIN_HEIGHT = 140;

function loadHeight(): number | null {
  try {
    const value = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(value) && value >= MIN_HEIGHT ? value : null;
  } catch {
    return null;
  }
}

function saveHeight(value: number): void {
  try {
    localStorage.setItem(HEIGHT_KEY, String(Math.round(value)));
  } catch {
    // localStorage unavailable — height just won't persist.
  }
}

function clampHeight(value: number): number {
  return Math.min(Math.max(value, MIN_HEIGHT), Math.round(window.innerHeight * 0.7));
}

// Collapse state of timeline groups, persisted editor-wide (same pattern as the
// inspector-collapsed preference in Scene3DEditor).
const COLLAPSED_KEY = "s3d:timelineCollapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveCollapsed(value: Record<string, boolean>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable — collapse state just won't persist.
  }
}

/** In-flight keyframe drag: identifies the key by its original time and carries
 *  the current drag position. `moved` flips once the pointer travels far enough
 *  to distinguish a drag from a click. */
interface KeyDrag {
  trackId: string;
  fromTime: number;
  time: number;
  moved: boolean;
}

interface DragGeom {
  rect: DOMRect;
  startX: number;
}

/** The selected keyframe, identified by track + time (times are stable between edits). */
interface KeyRef {
  trackId: string;
  time: number;
}

interface ChannelGroup {
  id: string;
  label: string;
  tracks: AnimationTrack[];
}

interface ObjectGroup {
  targetId: string;
  channelGroups: ChannelGroup[];
}

function buildGroups(tracks: AnimationTrack[]): ObjectGroup[] {
  const objects: ObjectGroup[] = [];
  const byObject = new Map<string, ObjectGroup>();
  for (const track of tracks) {
    let obj = byObject.get(track.targetId);
    if (!obj) {
      obj = { targetId: track.targetId, channelGroups: [] };
      byObject.set(track.targetId, obj);
      objects.push(obj);
    }
    const prefix = track.property.split(".")[0];
    const grouped = VECTOR_GROUP[prefix];
    const id = `${track.targetId}/${grouped ? prefix : track.property}`;
    let group = obj.channelGroups.find((g) => g.id === id);
    if (!group) {
      group = { id, label: grouped ?? PROPERTY_LABEL[track.property] ?? track.property, tracks: [] };
      obj.channelGroups.push(group);
    }
    group.tracks.push(track);
  }
  return objects;
}

/** Lane label for a channel inside its group: the axis suffix, or "Uniform" for
 *  the scalar `scale` track sitting alongside per-axis scale tracks. */
function channelLabel(property: string): string {
  const dot = property.indexOf(".");
  if (dot === -1) return property === "scale" ? "Uniform" : (PROPERTY_LABEL[property] ?? property);
  return property.slice(dot + 1).toUpperCase();
}

/** Sorted, deduped union of every keyframe time across `tracks`. */
function keyTimes(tracks: AnimationTrack[]): number[] {
  const seen = new Set<number>();
  for (const track of tracks) for (const kf of track.keyframes) seen.add(Math.round(kf.time * 1e4) / 1e4);
  return Array.from(seen).sort((a, b) => a - b);
}

export function Timeline(props: TimelineProps) {
  const { open, animation, duration, playhead, playing, selectedNode } = props;
  const [drag, setDrag] = useState<KeyDrag | null>(null);
  // Geometry captured at pointerdown so moves don't re-measure the DOM.
  const dragGeom = useRef<DragGeom | null>(null);
  const [selectedKey, setSelectedKey] = useState<KeyRef | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [height, setHeight] = useState<number | null>(loadHeight);
  // Resize-drag geometry captured at pointerdown (panel measured then, so the
  // first drag starts from the auto-sized height).
  const resize = useRef<{ startY: number; startHeight: number } | null>(null);

  const span = duration > 0 ? duration : 1;
  const loop = animation?.loop !== false;
  const tracks = animation?.tracks ?? [];
  const allTimes = keyTimes(tracks);
  const prevTime = [...allTimes].reverse().find((t) => t < playhead - 1e-3);
  const nextTime = allTimes.find((t) => t > playhead + 1e-3);

  // Collapsed: a slim full-width transport bar (the inspector-rail analogue) —
  // play/scrub stay usable while the track lanes are tucked away.
  if (!open) {
    return (
      <div className={styles.miniBar} style={props.rightInset ? { right: props.rightInset } : undefined}>
        <button className={styles.toggleBtn} onClick={props.onToggleOpen} title="Open animation timeline">
          <AnimationIcon size={16} />
          {tracks.length > 0 ? ` (${tracks.length})` : ""}
        </button>
        {tracks.length > 0 ? (
          <>
            <button className={styles.iconBtn} onClick={props.onPlayPause} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
              {playing ? "⏸" : "▶"}
            </button>
            <button
              className={styles.iconBtn}
              disabled={prevTime === undefined}
              onClick={() => prevTime !== undefined && props.onSeek(prevTime)}
              title="Previous keyframe"
              aria-label="Previous keyframe"
            >
              ◀◆
            </button>
            <button
              className={styles.iconBtn}
              disabled={nextTime === undefined}
              onClick={() => nextTime !== undefined && props.onSeek(nextTime)}
              title="Next keyframe"
              aria-label="Next keyframe"
            >
              ◆▶
            </button>
            <span className={styles.time}>
              {playhead.toFixed(2)} / {duration.toFixed(2)}s
            </span>
            <input
              className={styles.scrub}
              style={{ flex: 1 }}
              type="range"
              min={0}
              max={span}
              step={0.01}
              value={Math.min(playhead, span)}
              onChange={(e) => props.onSeek(Number(e.target.value))}
              aria-label="Timeline scrubber"
            />
          </>
        ) : null}
      </div>
    );
  }

  const objects = buildGroups(tracks);

  const toggleGroup = (id: string) =>
    setCollapsed((c) => {
      const next = { ...c, [id]: !c[id] };
      saveCollapsed(next);
      return next;
    });

  const deleteSelectedKey = () => {
    if (!selectedKey) return;
    props.onDeleteKeyframe(selectedKey.trackId, selectedKey.time);
    setSelectedKey(null);
  };

  const trackLane = (track: AnimationTrack, label: string, depth: number) => (
    <div className={styles.lane} key={track.id}>
      <span className={styles.laneLabel} style={{ paddingLeft: depth * 14 }} title={`${props.nodeName(track.targetId)} • ${PROPERTY_LABEL[track.property] ?? track.property}`}>
        {label}
      </span>
      <div
        className={styles.track}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          props.onSeek(((e.clientX - rect.left) / rect.width) * span);
        }}
      >
        <div className={styles.playhead} style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }} />
        {track.keyframes.map((kf) => {
          const isDragging = drag !== null && drag.trackId === track.id && Math.abs(drag.fromTime - kf.time) <= 1e-4;
          const isSelected = selectedKey !== null && selectedKey.trackId === track.id && Math.abs(selectedKey.time - kf.time) <= 1e-4;
          const shownTime = isDragging ? drag.time : kf.time;
          return (
            <span
              key={kf.time}
              className={`${styles.key} ${isSelected ? styles.keySelected : ""} ${isDragging ? styles.keyDragging : ""}`}
              style={{ left: `${(shownTime / span) * 100}%` }}
              title={`t=${kf.time.toFixed(2)}s — drag to move, click to select + seek, ⌥/Alt-click to delete`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                dragGeom.current = { rect: e.currentTarget.parentElement!.getBoundingClientRect(), startX: e.clientX };
                setDrag({ trackId: track.id, fromTime: kf.time, time: kf.time, moved: false });
                props.onSelectNode(track.targetId);
              }}
              onPointerMove={(e) => {
                const geom = dragGeom.current;
                if (!isDragging || !geom) return;
                const moved = drag.moved || Math.abs(e.clientX - geom.startX) > 3;
                const time = Math.round(Math.min(Math.max(((e.clientX - geom.rect.left) / geom.rect.width) * span, 0), span) * 100) / 100;
                setDrag({ ...drag, time: moved ? time : kf.time, moved });
              }}
              onPointerUp={(e) => {
                if (!isDragging) return;
                if (drag.moved) {
                  props.onMoveKeyframe(track.id, drag.fromTime, drag.time);
                  setSelectedKey({ trackId: track.id, time: drag.time });
                  props.onSeek(drag.time);
                } else if (e.altKey) {
                  props.onDeleteKeyframe(track.id, kf.time);
                  setSelectedKey(null);
                } else {
                  setSelectedKey({ trackId: track.id, time: kf.time });
                  props.onSeek(kf.time);
                }
                setDrag(null);
                dragGeom.current = null;
              }}
              onPointerCancel={() => {
                setDrag(null);
                dragGeom.current = null;
              }}
            />
          );
        })}
      </div>
      <button className={styles.deleteTrack} onClick={() => props.onDeleteTrack(track.id)} title="Delete track" aria-label="Delete track">
        ✕
      </button>
    </div>
  );

  // Read-only summary lane for a collapsed group: union of key times, click to seek.
  const aggregateLane = (targetId: string, groupTracks: AnimationTrack[]) => (
    <div
      className={styles.track}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        props.onSeek(((e.clientX - rect.left) / rect.width) * span);
      }}
    >
      <div className={styles.playhead} style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }} />
      {keyTimes(groupTracks).map((time) => (
        <span
          key={time}
          className={`${styles.key} ${styles.keyAgg}`}
          style={{ left: `${(time / span) * 100}%` }}
          title={`t=${time.toFixed(2)}s — click to seek`}
          onClick={(e) => {
            e.stopPropagation();
            props.onSelectNode(targetId);
            props.onSeek(time);
          }}
        />
      ))}
    </div>
  );

  const groupHeader = (id: string, label: string, groupTracks: AnimationTrack[], depth: number) => {
    const isCollapsed = !!collapsed[id];
    return (
      <div className={styles.lane}>
        <span className={`${styles.laneLabel} ${styles.groupLabel}`} style={{ paddingLeft: depth * 14 }}>
          <button className={styles.caret} onClick={() => toggleGroup(id)} title={isCollapsed ? "Expand" : "Collapse"} aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}>
            {isCollapsed ? "▸" : "▾"}
          </button>
          {label}
        </span>
        {isCollapsed ? aggregateLane(groupTracks[0].targetId, groupTracks) : <span />}
        <span />
      </div>
    );
  };

  return (
    <div className={styles.timeline} style={{ ...(height !== null ? { height: clampHeight(height) } : null), ...(props.rightInset ? { right: props.rightInset } : null) }}>
      <div
        className={styles.resizeHandle}
        title="Drag to resize"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          resize.current = { startY: e.clientY, startHeight: e.currentTarget.parentElement!.offsetHeight };
        }}
        onPointerMove={(e) => {
          const r = resize.current;
          if (!r) return;
          setHeight(clampHeight(r.startHeight + (r.startY - e.clientY)));
        }}
        onPointerUp={() => {
          resize.current = null;
          setHeight((h) => {
            if (h !== null) saveHeight(h);
            return h;
          });
        }}
        onPointerCancel={() => {
          resize.current = null;
        }}
      />
      {/* Always-visible collapse control, pinned top-right so it's reachable even
          when the transport row scrolls horizontally (mobile). */}
      <button className={styles.collapsePin} onClick={props.onToggleOpen} title="Collapse timeline" aria-label="Collapse timeline">
        ▾
      </button>
      <div className={styles.transport}>
        <button className={styles.iconBtn} onClick={props.onPlayPause} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "⏸" : "▶"}
        </button>
        <button className={styles.iconBtn} onClick={() => props.onSeek(0)} title="Go to start" aria-label="Go to start">
          ⏮
        </button>
        <button
          className={styles.iconBtn}
          disabled={prevTime === undefined}
          onClick={() => prevTime !== undefined && props.onSeek(prevTime)}
          title="Previous keyframe"
          aria-label="Previous keyframe"
        >
          ◀◆
        </button>
        <button
          className={styles.iconBtn}
          disabled={nextTime === undefined}
          onClick={() => nextTime !== undefined && props.onSeek(nextTime)}
          title="Next keyframe"
          aria-label="Next keyframe"
        >
          ◆▶
        </button>
        <button
          className={`${styles.iconBtn} ${loop ? styles.iconBtnActive : ""}`}
          onClick={props.onToggleLoop}
          title="Loop"
          aria-label="Toggle loop"
        >
          ⟳
        </button>
        <button
          className={styles.iconBtn}
          disabled={!selectedKey}
          onClick={deleteSelectedKey}
          title={selectedKey ? `Delete keyframe @ ${selectedKey.time.toFixed(2)}s` : "Delete selected keyframe"}
          aria-label="Delete selected keyframe"
        >
          ◆✕
        </button>
        <span className={styles.time}>
          {playhead.toFixed(2)} / {duration.toFixed(2)}s
        </span>
        <label className={styles.durationField}>
          Duration
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={Number(duration.toFixed(2))}
            onChange={(e) => props.onSetDuration(Math.max(0.1, Number(e.target.value) || 0.1))}
          />
        </label>

        <span className={styles.spacer} />

        <div className={styles.keyGroup}>
          <span className={styles.keyLabel}>{selectedNode ? `Key ${props.nodeName(selectedNode.id)} @ ${playhead.toFixed(2)}s` : "Select a node to key"}</span>
          <button className={styles.keyBtn} disabled={!selectedNode} onClick={() => props.onKey(["position.x", "position.y", "position.z"])}>
            + Position
          </button>
          <button className={styles.keyBtn} disabled={!selectedNode} onClick={() => props.onKey(["rotation.x", "rotation.y", "rotation.z"])}>
            + Rotation
          </button>
          <button className={styles.keyBtn} disabled={!selectedNode} onClick={() => props.onKey(["scale.x", "scale.y", "scale.z"])}>
            + Scale
          </button>
        </div>
      </div>

      <div className={styles.scrubArea}>
        <div className={styles.ruler}>
          <input
            className={styles.scrub}
            type="range"
            min={0}
            max={span}
            step={0.01}
            value={Math.min(playhead, span)}
            onChange={(e) => props.onSeek(Number(e.target.value))}
          />
        </div>

        {tracks.length === 0 ? (
          <div className={styles.empty}>No animation yet. Select a node, move the playhead, and add a Position/Rotation/Scale key.</div>
        ) : (
          <div className={styles.lanes}>
            {objects.map((obj) => {
              const objId = `obj/${obj.targetId}`;
              const objCollapsed = !!collapsed[objId];
              const objTracks = obj.channelGroups.flatMap((g) => g.tracks);
              return (
                <div key={obj.targetId} className={styles.groupBlock}>
                  {groupHeader(objId, props.nodeName(obj.targetId), objTracks, 0)}
                  {!objCollapsed &&
                    obj.channelGroups.map((group) =>
                      group.tracks.length === 1 ? (
                        trackLane(group.tracks[0], PROPERTY_LABEL[group.tracks[0].property] ?? group.tracks[0].property, 1)
                      ) : (
                        <div key={group.id} className={styles.groupBlock}>
                          {groupHeader(group.id, group.label, group.tracks, 1)}
                          {!collapsed[group.id] && group.tracks.map((track) => trackLane(track, channelLabel(track.property), 2))}
                        </div>
                      )
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
