// Timeline — the keyframe-animation panel docked at the bottom of the viewport.
// Transport (play/pause, loop, duration, scrubber) drives the editor playhead,
// which is fed to SceneView as a controlled animationTime so the viewport reflects
// the timeline. Per-selected-node "key" buttons capture the live pose into tracks;
// each track shows its keyframes as draggable-free dots (click to seek, click the
// diamond's ✕-on-hover semantics via the lane to delete).

import type { AnimatableProperty, Animation, SceneNode } from "@ai-threejs-studio/scene3d";
import styles from "./Timeline.module.css";

const PROPERTY_LABEL: Record<string, string> = {
  "position.x": "Position X", "position.y": "Position Y", "position.z": "Position Z",
  "rotation.x": "Rotation X", "rotation.y": "Rotation Y", "rotation.z": "Rotation Z",
  "scale.x": "Scale X", "scale.y": "Scale Y", "scale.z": "Scale Z", scale: "Scale",
  opacity: "Opacity", "target.x": "Target X", "target.y": "Target Y", "target.z": "Target Z"
};

export interface TimelineProps {
  open: boolean;
  animation?: Animation;
  duration: number;
  playhead: number;
  playing: boolean;
  selectedNode: SceneNode | null;
  nodeName: (id: string) => string;
  onToggleOpen: () => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSetDuration: (duration: number) => void;
  onToggleLoop: () => void;
  onKey: (channels: AnimatableProperty[]) => void;
  onDeleteTrack: (trackId: string) => void;
  onDeleteKeyframe: (trackId: string, time: number) => void;
}

export function Timeline(props: TimelineProps) {
  const { open, animation, duration, playhead, playing, selectedNode } = props;

  if (!open) {
    const count = animation?.tracks.length ?? 0;
    return (
      <div className={styles.collapsedBar}>
        <button className={styles.toggleBtn} onClick={props.onToggleOpen} title="Open animation timeline">
          ▸ Animation{count > 0 ? ` (${count})` : ""}
        </button>
      </div>
    );
  }

  const span = duration > 0 ? duration : 1;
  const loop = animation?.loop !== false;
  const tracks = animation?.tracks ?? [];

  return (
    <div className={styles.timeline}>
      <div className={styles.transport}>
        <button className={styles.iconBtn} onClick={props.onPlayPause} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "⏸" : "▶"}
        </button>
        <button className={styles.iconBtn} onClick={() => props.onSeek(0)} title="Go to start" aria-label="Go to start">
          ⏮
        </button>
        <button
          className={`${styles.iconBtn} ${loop ? styles.iconBtnActive : ""}`}
          onClick={props.onToggleLoop}
          title="Loop"
          aria-label="Toggle loop"
        >
          ⟳
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
          <button className={styles.keyBtn} disabled={!selectedNode} onClick={() => props.onKey(["scale"])}>
            + Scale
          </button>
        </div>

        <button className={styles.toggleBtn} onClick={props.onToggleOpen} title="Close timeline" style={{ marginLeft: 4 }}>
          ▾
        </button>
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
            {tracks.map((track) => (
              <div className={styles.lane} key={track.id}>
                <span className={styles.laneLabel} title={`${props.nodeName(track.targetId)} • ${PROPERTY_LABEL[track.property] ?? track.property}`}>
                  {props.nodeName(track.targetId)} • {PROPERTY_LABEL[track.property] ?? track.property}
                </span>
                <div
                  className={styles.track}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    props.onSeek(((e.clientX - rect.left) / rect.width) * span);
                  }}
                >
                  <div className={styles.playhead} style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }} />
                  {track.keyframes.map((kf) => (
                    <span
                      key={kf.time}
                      className={styles.key}
                      style={{ left: `${(kf.time / span) * 100}%` }}
                      title={`t=${kf.time.toFixed(2)}s — click to seek, ⌥/Alt-click to delete`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.altKey) props.onDeleteKeyframe(track.id, kf.time);
                        else props.onSeek(kf.time);
                      }}
                    />
                  ))}
                </div>
                <button className={styles.deleteTrack} onClick={() => props.onDeleteTrack(track.id)} title="Delete track" aria-label="Delete track">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
