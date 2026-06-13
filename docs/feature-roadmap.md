# Feature roadmap

Forward-looking feature plan for AI Three.js Studio. Grounded in the current
architecture; sequenced by impact-to-effort.

## Architectural invariants (keep these intact)

1. **The scene is data, rendered by ONE interpreter.** Any new *visual* schema
   field added to `Scene3D` ([packages/scene3d/src/schema.ts](../packages/scene3d/src/schema.ts)) +
   `SceneView` ([packages/scene3d/src/SceneView.tsx](../packages/scene3d/src/SceneView.tsx)) +
   `validate` ([packages/scene3d/src/validate.ts](../packages/scene3d/src/validate.ts)) +
   the agent prompt ([apps/api/src/agent/scene3dGenerator.ts](../apps/api/src/agent/scene3dGenerator.ts))
   automatically flows to the editor preview, share links, AND the exported
   source (codegen copies `SceneView`). Land every visual feature in all four
   places together, or exports silently drift.
2. **The asset-library route schema already lists** `model/glb`, `model/gltf`,
   `environment/hdri`, `image/reference`, `material/preset` as valid kinds
   ([apps/api/src/routes.ts](../apps/api/src/routes.ts)) — scaffolding for several
   of these features already exists.

---

## Tier 1 — Render Studio (visual payoff)

### 1. Post-processing (bloom + vignette + SSAO/DOF)
Emissive/glow scenes currently clamp to white instead of blooming.

- **Dep:** add `@react-three/postprocessing` + `postprocessing` (v3.x, matches
  R3F v9 / three 0.177).
- **Schema:** add `postprocessing?: { bloom?: {intensity, luminanceThreshold,
  radius}, vignette?: {darkness}, ssao?: boolean, dof?: {focusDistance,
  bokehScale} }` to `Scene3D`; normalize in `validate.ts`.
- **Renderer:** `<EffectComposer>` with enabled passes, gated behind a prop so the
  editor toggles it live.
- **Editor:** sliders in the scene-settings panel (#9).
- **Export:** flows via codegen — add the dep to codegen's generated
  `package.json` template.
- **AI:** instruct the model to enable bloom on glow/neon/sci-fi prompts.
- **Effort:** M. **Risk:** SSAO/DOF are perf-heavy on mobile — ship bloom+vignette
  first, gate SSAO/DOF behind explicit opt-in.

### 2. Environment / HDRI picker
The `environment` field exists in schema + renderer with NO editor UI.

- **Editor:** preset dropdown (drei built-ins: studio/sunset/city/dawn/warehouse/
  night/…) + intensity slider + "show as background" toggle.
- **Schema:** extend `environment` with `background?: boolean`, optional `blur?`.
  Renderer passes `background`/`backgroundBlurriness` to `<Environment>`.
- **Stretch:** custom HDRI upload (`environment/hdri` asset kind already exists) →
  `<Environment files={url}>`.
- **Effort:** S (presets) / M (upload). **Risk:** low.

---

## Tier 2 — Interop & Output

### 3. GLB / glTF export
Universal output (Blender, Unity, AR, other viewers).

- **Approach:** client-side `GLTFExporter` (three/examples / three-stdlib) on an
  offscreen `<SceneView>` (no editor chrome — gizmo/grid/contact-shadows/edges
  excluded).
- **Bake animation:** convert `AnimationTrack`s → three `AnimationClip`s. Camera/
  fov tracks don't map to glTF cleanly — export node transforms, document the gap.
- **UI:** "Export GLB" in the ProjectToolbar overflow menu.
- **Effort:** M. **Risk:** node-filtering + animation-clip conversion are fiddly;
  transforms export trivially.

### 4. Still render export (PNG)
Clean hero image through the active camera, chosen resolution, transparent/solid.

- **Prereq:** add `gl={{ preserveDrawingBuffer: true }}` to the editor `<Canvas>`
  (currently absent; required for reliable `toDataURL`).
- **Approach:** render active camera, hide chrome for one frame, `toDataURL`. For
  >viewport resolution, render to a `WebGLRenderTarget` at 2×/4×.
- **UI:** "Render image" + resolution dropdown.
- **Effort:** S. **Risk:** low (screenshot pattern already in Scene3DEditor).

### 5. Animation video / GIF export
The payoff for the timeline — a shareable clip.

- **Approach:** `canvas.captureStream(fps)` → `MediaRecorder` → WebM. Step the
  playhead 0→duration deterministically (reuse controlled `animationTime` +
  `renderActiveCamera`). Needs `preserveDrawingBuffer` (#4).
- **GIF (optional):** `gif.js` encoder; make WebM primary.
- **UI:** "Export animation" with fps + duration-source options + progress bar.
- **Effort:** M (WebM) / +M (GIF). **Risk:** capture timing — step the playhead
  manually, don't rely on rAF wall-clock.

---

## Tier 3 — AI Workflow (differentiation)

### 6. Image-to-scene (reference image input)
"Build this" from a photo.

- **Providers:** multimodal user message — Anthropic `image` blocks, OpenAI
  `input_image`. Both default models are vision-capable.
- **Plumbing:** `GenerateScene3DInput` gains `referenceImage?` (data-URI); thread
  through agent + `/agent-run` route (`image/reference` asset kind exists).
- **Editor:** image drop-zone in the composer; thumbnail + clear.
- **Effort:** M. **Risk:** prompt-tuning to extract structure, not photo-match.

### 7. Variations ("Generate 3")
Generate N candidates, pick the best.

- **Approach:** N parallel `/agent-run` calls (streaming + cancel infra makes this
  cheap) into throwaway scratch scenes; render thumbnails; click to commit.
- **Quota:** counts as N runs — surface clearly.
- **UI:** "×3" toggle on Generate; results strip with Use/Discard.
- **Effort:** M–L. **Risk:** cost/quota UX.

### 8. Chat-style refine history
Iterative conversation with per-turn context + undo.

- **Approach:** per-project turn log (prompt + scene snapshot); reuse existing undo
  snapshots, surface as a visible thread.
- **Editor:** collapsible history panel in the composer; each turn revertable.
- **Effort:** M. **Risk:** low (mostly UI + small persistence).

---

## Tier 4 — Editor ergonomics (quick wins, interleave)

### 9. Scene-settings panel (hosts #1, #2)
A small panel/tab for scene-level fields with no UI today: fog, background color,
environment (#2), post-processing (#1). Build alongside Tier 1.
**Effort:** S (shell).

### 10. Group / ungroup selection
Wrap N selected nodes into a group (preserve world transforms) / dissolve a group.
Pure client + `updateNode` helpers.
**Effort:** S–M. **Risk:** world-transform preservation math.

### 11. Material preset library
One-click gold/chrome/glass/plastic/neon/matte on the selected mesh. Static preset
table merged into `material`. `material/preset` asset kind exists for user-saved
presets later.
**Effort:** S.

---

## Recommended sequencing

1. ~~**#1 Bloom + #9 settings panel + #2 environment**~~ — DONE (World menu).
2. ~~**#4 render PNG + #5 video**~~ — DONE (Capture menu; offscreen CaptureStage +
   useSceneCapture render a clean active-camera view to PNG / WebM).
3. **#3 GLB export** — interop. **← next**
4. **#11 presets + #10 group/ungroup** — cheap ergonomics, interleave anytime.
5. **#6 image-to-scene → #7 variations → #8 chat history** — AI tier, most
   product-defining, most effort.
