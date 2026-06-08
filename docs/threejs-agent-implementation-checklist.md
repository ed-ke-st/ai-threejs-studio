# Three.js Agent Implementation Checklist

This document turns [threejs-agent-blueprint.md](./threejs-agent-blueprint.md) into a concrete implementation sequence for this repository.

## Objective

Improve the current scene agent from:

- prompt -> retrieve docs -> generate code/metadata -> build -> repair

to:

- prompt -> retrieve docs and recipes -> create scene plan -> create typed scene spec -> render output -> build -> visual check -> repair -> evaluate

## Current Repo Mapping

These are the current files that matter most for the next phase of work.

### Agent orchestration

- `apps/api/src/agent/agentRunner.ts`
- `apps/api/src/agent/dynamicSceneGenerator.ts`
- `apps/api/src/agent/openAiSceneGenerator.ts`
- `apps/api/src/agent/geminiSceneGenerator.ts`
- `apps/api/src/agent/sceneGenerator.ts`

### Retrieval and knowledge

- `apps/api/src/rag/localRagService.ts`
- `scripts/ingest-seed-docs.ts`
- `packages/rag/src/index.ts`
- `.studio/rag-index.json`

### Shared types

- `packages/shared/src/index.ts`

### Metadata-backed scene path

- `apps/api/src/scene/sceneMetadata.ts`
- `apps/api/src/routes.ts`
- `packages/three-templates/src/index.ts`

### Editor and preview surface

- `apps/web/src/stores/projectStore.ts`
- `apps/web/src/App.tsx`

## Implementation Strategy

Do this in small, reviewable steps. Do not try to jump directly to a full autonomous system.

Recommended order:

1. Improve retrieval quality.
2. Add a `ScenePlan` intermediate layer.
3. Add a `SceneSpec` intermediate layer.
4. Route metadata-backed generation through `SceneSpec`.
5. Add stronger validation.
6. Add visual validation.
7. Add evals.

## Current Status

Completed in the repo:

- recipe-backed RAG
- `ScenePlan` layer
- `SceneSpec` layer for metadata-backed generation
- static validation
- visual validation
- eval harness
- structured repair strategy
- accepted/rejected example bank
- inspectable learning bank
- context-aware retrieval for accepted examples
- retrieval provenance in agent runs and docs search
- eval retrieval provenance
- eval-derived retrieval tuning
- retrieval recommendation queue

Current active improvement loop:

1. run evals
2. generate retrieval tuning
3. generate retrieval recommendations
4. patch recipes / tags / examples
5. re-run evals

## Evaluation Environment Note

The eval loop only gives meaningful quality signals when it runs in a provider-enabled local environment:

- outbound model API access must work
- the selected provider key must be available
- Chrome must be available for visual validation

Sandbox runs inside Codex can still validate the harness and reporting flow, but they can produce false negatives such as `agent-run-failed` before scene generation even starts. Treat those runs as infrastructure checks, not model-quality verdicts.

## PR 1: Recipe RAG Upgrade

### Goal

Give the agent better source material before it generates anything.

### Scope

- Add a local recipe corpus for common scene categories.
- Extend retrieval to search recipes and local examples in addition to API docs.
- Make retrieved context more structured and easier to inspect in agent runs.

### Files To Add

- `docs/threejs-recipes/room-gallery.md`
- `docs/threejs-recipes/product-stage.md`
- `docs/threejs-recipes/model-viewer.md`
- `docs/threejs-recipes/lighting-rigs.md`
- `docs/threejs-recipes/material-palettes.md`
- `docs/threejs-recipes/camera-framing.md`

### Files To Change

- `scripts/ingest-seed-docs.ts`
- `packages/rag/src/index.ts`
- `apps/api/src/rag/localRagService.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/agent/agentRunner.ts`

### Concrete Changes

- Add recipe ingestion into the RAG index.
- Add chunk metadata such as:
  - `sceneType`
  - `pattern`
  - `topic`
  - `failureMode`
- Update agent retrieval logging so each run shows:
  - docs retrieved
  - recipes retrieved
  - local examples retrieved

### Output

- richer retrieval context
- no architecture change yet

### Acceptance Criteria

- RAG includes local recipes
- agent run history shows recipe retrieval
- retrieval results are more relevant for scene-building prompts

## PR 2: ScenePlan Layer

### Goal

Make the agent create an explicit plan before generating output.

### Scope

- Add a shared `ScenePlan` type.
- Add plan generation step in the backend.
- Store plan in each agent run.

### Files To Change

- `packages/shared/src/index.ts`
- `apps/api/src/agent/sceneGenerator.ts`
- `apps/api/src/agent/dynamicSceneGenerator.ts`
- `apps/api/src/agent/openAiSceneGenerator.ts`
- `apps/api/src/agent/geminiSceneGenerator.ts`
- `apps/api/src/agent/agentRunner.ts`

### Concrete Changes

- Add `ScenePlan` type in shared package.
- Add generation methods:
  - `generateScenePlan(...)`
  - `repairScenePlan(...)` if needed later
- Change `AgentRunner` flow:
  - retrieve context
  - create scene plan
  - log scene plan
  - then generate metadata or code
- Add plan persistence to `AgentRun`.

### Suggested `ScenePlan` Shape

- `sceneCategory`
- `visualGoal`
- `objects`
- `lightStrategy`
- `cameraStrategy`
- `interactionRequirements`
- `assetRequirements`
- `constraints`

### Acceptance Criteria

- each run produces a machine-readable scene plan
- plan is visible in run details
- downstream generation consumes the plan, not just the raw prompt

## PR 3: SceneSpec Layer For Metadata-Backed Projects

### Goal

Introduce a typed scene spec and make metadata-backed generation go through it.

### Scope

- Add `SceneSpec` schema in shared types.
- Add `ScenePlan -> SceneSpec` generation.
- Add renderer:
  - `SceneSpec -> scene.config.json`
- Keep code-authored `Scene.tsx` generation as fallback for now.

### Files To Change

- `packages/shared/src/index.ts`
- `apps/api/src/agent/sceneGenerator.ts`
- `apps/api/src/agent/dynamicSceneGenerator.ts`
- `apps/api/src/agent/openAiSceneGenerator.ts`
- `apps/api/src/agent/geminiSceneGenerator.ts`
- `apps/api/src/agent/agentRunner.ts`
- `apps/api/src/scene/sceneMetadata.ts`

### Optional New Files

- `apps/api/src/agent/sceneSpec.ts`
- `apps/api/src/agent/sceneSpecRenderer.ts`
- `apps/api/src/agent/sceneSpecValidator.ts`

### Concrete Changes

- Add `SceneSpec` richer than current metadata:
  - geometry family
  - light kind and parameters
  - grouping
  - camera hints
  - environment hints
  - interaction annotations
- Generate `SceneSpec` from `ScenePlan`.
- Render metadata from `SceneSpec`.
- Normalize and validate before writing.

### Acceptance Criteria

- metadata-backed projects no longer generate raw JSON directly from prompt
- `SceneSpec` is stored or at least logged during the run
- output quality becomes more stable for editor-backed scenes

## PR 4: Static Validation Upgrade

### Goal

Catch obvious scene quality issues before visual validation.

### Scope

- Add structural validation for plans/specs/metadata.
- Improve repair prompts with structured validation failures.

### Files To Change

- `apps/api/src/agent/agentRunner.ts`
- `apps/api/src/scene/sceneMetadata.ts`
- `apps/api/src/agent/sceneSpecValidator.ts`
- `packages/shared/src/index.ts`

### Validation Rules

- invalid object types
- missing fields
- unreasonable scales
- impossible light values
- invalid positions for expected scene categories
- unsupported external assets

### Acceptance Criteria

- invalid scene output fails early with specific diagnostics
- repair loop receives structured failure messages

## PR 5: Visual Validation

### Goal

Check whether the result looks plausible after it builds.

### Scope

- capture preview screenshots
- run simple visual heuristics
- feed failures into repair loop

### Files To Change

- `apps/api/src/preview/previewRunner.ts`
- `apps/api/src/agent/agentRunner.ts`
- `packages/shared/src/index.ts`

### Optional New Files

- `apps/api/src/preview/screenshotValidation.ts`

### Checks

- blank frame
- scene too dark
- main object off-screen
- severe camera clipping
- no visible light contribution

### Acceptance Criteria

- successful build is no longer the only acceptance gate
- repair loop can respond to visual failures

## PR 6: Evals

### Goal

Measure improvements with repeatable prompts and scoring.

### Scope

- create benchmark prompt set
- define pass/fail scoring
- produce summary output for comparison

### Files To Add

- `docs/agent-evals/prompts.md`
- `scripts/run-agent-evals.ts`

### Files To Change

- `packages/shared/src/index.ts`
- `apps/api/src/agent/agentRunner.ts`

### Prompt Categories

- gallery room
- product stage
- model viewer
- planner
- abstract scene
- lighting-focused scene

### Acceptance Criteria

- changes can be measured against baseline
- failures are grouped by category

## PR 7: Repair Strategy Upgrade

### Goal

Repair from the narrowest structured layer with failure-class-aware prompts.

### Scope

- classify repair failures
- repair `SceneSpec` before raw metadata
- keep code-scene repair as fallback only

### Status

- complete

## PR 8: Learning Bank

### Goal

Store accepted and rejected runs as reusable retrieval and analysis data.

### Scope

- persist accepted/rejected runs
- expose summary and project-scoped inspection
- feed accepted examples back into retrieval

### Status

- complete

## PR 9: Retrieval Scoping And Provenance

### Goal

Make retrieval context-aware and explainable.

### Scope

- boost accepted examples by project/template context
- attach retrieval reasons and matched terms to ranked chunks
- expose provenance in agent details and docs search

### Status

- complete

## PR 10: Eval-Derived Retrieval Tuning

### Goal

Use eval results to generate retrieval weight adjustments instead of treating evals as read-only reporting.

### Scope

- derive reason multipliers from eval pass/fail correlation
- derive collection boosts/penalties
- load tuning profile at runtime during retrieval

### Files To Add

- `scripts/generate-retrieval-tuning.ts`

### Files To Change

- `packages/shared/src/index.ts`
- `packages/rag/src/index.ts`
- `apps/api/src/rag/localRagService.ts`
- `apps/api/src/config.ts`
- `apps/api/src/server.ts`

### Status

- complete

## PR 11: Retrieval Recommendation Queue

### Goal

Turn failed eval retrieval patterns into concrete documentation and indexing tasks.

### Scope

- generate a ranked recommendation queue
- point to concrete recipe docs or ingest code
- include rationale, evidence, and suggested changes

### Files To Add

- `scripts/generate-retrieval-recommendations.ts`

### Files To Change

- `packages/shared/src/index.ts`

### Status

- complete

## Checklist

### Foundation

- [x] add recipe documents
- [x] extend RAG ingestion
- [x] tag retrieval chunks more richly
- [x] expose retrieved context cleanly in agent runs

### Planning

- [x] add `ScenePlan` shared type
- [x] add scene-plan generation methods to providers
- [x] persist `ScenePlan` in `AgentRun`
- [x] route downstream generation through the plan

### Structured generation

- [x] add `SceneSpec` shared type
- [x] add `ScenePlan -> SceneSpec` generation
- [x] add `SceneSpec -> scene.config.json` renderer
- [x] validate `SceneSpec` before writing

### Validation

- [x] add static validation for metadata/spec output
- [x] improve repair prompts with structured diagnostics
- [x] add screenshot capture
- [x] add visual validation heuristics

### Improvement loop

- [x] define benchmark prompts
- [x] add eval runner script
- [x] score runs consistently
- [x] store accepted examples for retrieval reuse

### Retrieval tuning loop

- [x] add retrieval provenance to eval reports
- [x] generate eval-derived retrieval tuning profile
- [x] load retrieval tuning at runtime
- [x] generate retrieval recommendation queue
- [x] apply top queue items to recipe docs
- [x] re-run evals after recipe updates
- [ ] re-run evals in a provider-enabled local environment
- [ ] improve recipe chunk granularity based on failing retrieval patterns
- [ ] expand accepted-example coverage for failing categories
- [ ] add planner-specific and abstract-scene-specific recipe documents

## Immediate Next Step

The best next implementation step is:

`run the eval loop in a provider-enabled local environment, then decide whether gallery-room still needs recipe work or whether the remaining failures are generator-side`

Reason:

- the retrieval loop is now instrumented end to end
- the latest sandbox rerun retrieved the right `gallery-room` recipe chunks but failed before generation completed
- that means the next trustworthy signal has to come from a real local run with provider access
- after that run, recipe quality versus generator quality will be much easier to separate

## Non-Goals For Now

Do not do these before the phases above land:

- model fine-tuning
- large autonomous toolchains
- broad codegen refactors across all scene paths
- replacing the current editor-backed metadata path

## Definition Of Done For “Strong Agent v1”

Call the first serious version done when all of these are true:

- agent uses recipe-aware retrieval
- every run has a scene plan
- metadata-backed generation uses a typed scene spec
- build validation and visual validation both run
- repair loops use structured diagnostics
- benchmark prompts exist and are runnable
- retrieval tuning and recommendation queue both exist
