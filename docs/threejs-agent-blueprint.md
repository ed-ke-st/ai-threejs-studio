# Three.js Agent Blueprint

## Goal

Build a strong Three.js / React Three Fiber agent that consistently produces:

- scenes that match user intent
- valid project structure and code
- good visual composition
- reliable repair behavior after errors
- outputs that improve over time through evals

This document is the implementation blueprint for improving the current agent stack in this repository.

## Current State

The current system already has the right base primitives:

- project-aware agent orchestration
- local RAG retrieval
- dual generation paths:
  - code-authored `src/scene/Scene.tsx`
  - metadata-backed `src/scene/scene.config.json`
- build validation
- repair loop
- preview runtime

That is a solid baseline. The next stage is to reduce model guessing and increase structure, retrieval quality, visual checking, and evaluation discipline.

## Principles

1. Do not rely on model memory alone.
2. Prefer structured scene representations over freeform code when possible.
3. Use working local examples as part of retrieval.
4. Treat build-passing output as necessary but not sufficient.
5. Improve through evals, not anecdotal prompting.

## Target Architecture

The strongest version of this agent should operate as:

1. User prompt is parsed into scene intent.
2. Agent retrieves relevant docs, local recipes, and prior examples.
3. Agent creates a structured scene plan.
4. Scene plan is converted into a typed scene spec.
5. Scene spec is rendered into:
   - metadata for editor-backed projects
   - code for code-authored projects when needed
6. Build validation runs.
7. Visual validation runs.
8. If either fails, repair loop uses structured diagnostics.
9. Accepted outputs are logged into eval datasets and example libraries.

## Phase 1: Improve Retrieval

### Objective

Make the agent retrieve the right knowledge before it writes anything.

### Work

- Expand the RAG corpus beyond generic docs.
- Add curated local recipe documents for:
  - room scenes
  - gallery scenes
  - product stages
  - GLB viewer layouts
  - lighting rigs
  - material palettes
  - interaction patterns
  - camera/framing setups
- Add local “known good” project examples generated in this repo.
- Tag RAG chunks by:
  - `scene_type`
  - `topic`
  - `api`
  - `difficulty`
  - `pattern`
  - `failure_mode`

### Deliverables

- richer `.studio/rag-index.json`
- documented ingest process
- local recipe corpus under `docs/` or a dedicated knowledge folder

### Success Criteria

- agent retrieves relevant scene recipes, not just API snippets
- agent can distinguish between lighting, layout, material, and interaction guidance

## Phase 2: Add Scene Plan Layer

### Objective

Insert an explicit planning step between prompt and generation.

### Work

- Define a `ScenePlan` type with fields such as:
  - scene category
  - visual goal
  - object list
  - light strategy
  - camera strategy
  - interaction requirements
  - asset requirements
  - environment constraints
- Add agent step:
  - prompt -> `ScenePlan`
- Persist the plan in each agent run.

### Deliverables

- shared `ScenePlan` type
- plan generation prompt/tool
- plan stored with `agent_runs`

### Success Criteria

- plans are explicit and inspectable
- generation is based on plan rather than directly on raw prompt

## Phase 3: Add Typed Scene Spec

### Objective

Make the agent generate a structured scene representation before code.

### Work

- Define a typed `SceneSpec` richer than current `scene.config.json`.
- Include:
  - object type
  - geometry family
  - transform
  - material
  - light kind and parameters
  - grouping
  - camera hints
  - environment settings
  - interaction annotations
- Add converter:
  - `ScenePlan -> SceneSpec`
- Add renderer:
  - `SceneSpec -> scene.config.json`
  - optional `SceneSpec -> Scene.tsx`

### Deliverables

- new shared scene-spec schema
- validation for scene spec
- conversion pipeline

### Success Criteria

- metadata-backed scene generation becomes the default high-reliability path
- code generation is used only where metadata/spec cannot express the result cleanly

## Phase 4: Build Specialist Generators

### Objective

Split scene generation into targeted capabilities instead of one monolithic prompt.

### Work

- Introduce specialist tools/functions:
  - `generateLayout`
  - `generateLightingRig`
  - `generateMaterialPalette`
  - `generateInteractionPlan`
  - `generateEnvironment`
  - `generateAssetPlacement`
- Compose these into final `SceneSpec`.

### Deliverables

- small specialist prompts/tools
- orchestrator logic in `AgentRunner`

### Success Criteria

- fewer generic scenes
- better consistency across scene categories

## Phase 5: Strengthen Validation

### Objective

Catch quality failures that typecheck/build cannot catch.

### Work

- Keep existing build validation.
- Add static scene validation:
  - invalid object types
  - missing required fields
  - absurd scales or positions
  - invalid light settings
  - unsupported external dependencies
- Add runtime validation:
  - preview boot success
  - no fatal canvas/runtime errors

### Deliverables

- scene-spec validator
- metadata validator
- stronger runtime error summaries

### Success Criteria

- fewer accepted scenes that are technically valid but obviously broken

## Phase 6: Add Visual Validation

### Objective

Judge the rendered result, not just the code.

### Work

- Capture preview screenshots automatically after build success.
- Run visual checks for:
  - blank or near-blank frames
  - scene too dark
  - major object off-screen
  - camera clipped into geometry
  - missing focal object
  - no visible light contribution
- Feed these failures into repair loop as structured diagnostics.

### Deliverables

- screenshot capture pipeline
- visual heuristic checker
- visual repair prompt inputs

### Success Criteria

- fewer “build passed but looks wrong” results

## Phase 7: Build a Three.js Recipe Library

### Objective

Give the agent reusable patterns that are already known to work.

### Work

- Create a library of reusable scene modules and specs for:
  - gallery room
  - showroom pedestal
  - interactive planner
  - soft daylight interior
  - dark studio hero shot
  - model presentation stage
- Store each recipe with:
  - prompt examples
  - scene plan
  - scene spec
  - generated output
  - known pitfalls

### Deliverables

- recipe files in repo
- retrieval integration for recipes

### Success Criteria

- prompts map to strong base compositions instead of starting from nothing

## Phase 8: Build Evals

### Objective

Measure improvements with repeatable benchmarks.

### Work

- Create a fixed prompt benchmark set by category:
  - room
  - gallery
  - product
  - viewer
  - planner
  - abstract
- Score each run on:
  - build pass
  - runtime pass
  - visual validation pass
  - prompt alignment
  - no forbidden dependencies
  - metadata/code quality
- Track failure modes over time.

### Deliverables

- prompt benchmark corpus
- evaluation runner
- score reports

### Success Criteria

- every prompt/system/tooling change can be compared against baseline

## Phase 9: Improve Repair Strategy

### Objective

Repair with structured diagnostics rather than generic “fix the error” prompting.

### Work

- Separate repair reasons:
  - syntax/build failure
  - runtime crash
  - visual failure
  - spec validation failure
- Repair from the narrowest layer possible:
  - repair `SceneSpec`
  - then metadata
  - only repair `Scene.tsx` directly when necessary

### Deliverables

- categorized repair inputs
- repair prompts by failure class

### Success Criteria

- fewer overcorrections
- better first-repair success rate

## Phase 10: Capture Learning From Real Usage

### Objective

Make the system improve from accepted and rejected results.

### Work

- Save accepted outputs as retrieval candidates.
- Save rejected outputs with failure labels.
- Track:
  - prompt
  - plan
  - spec
  - changed files
  - build logs
  - visual diagnostics
  - final acceptance/rejection

### Deliverables

- reusable internal example bank
- failure taxonomy

### Success Criteria

- retrieval quality improves with actual product usage

## Implementation Order

Recommended order for this codebase:

1. Expand RAG with recipes and local examples.
2. Add `ScenePlan`.
3. Add typed `SceneSpec`.
4. Route metadata-backed generation through `SceneSpec`.
5. Add static/spec validation.
6. Add screenshot capture and visual validation.
7. Add benchmark eval suite.
8. Add usage-derived example bank.

## What Not To Do First

Avoid these early:

- fine-tuning before evals exist
- chasing model swaps without fixing retrieval and structure
- building a huge autonomous toolchain before adding typed intermediate representations
- using only freeform `Scene.tsx` generation for everything

## OpenAI Platform Guidance

You do not need OpenAI Agent Builder to make this strong.

The better approach for this repo is:

- keep orchestration in your own backend
- use the `Responses` API
- use function/tool-style generation stages
- add evals
- add retrieval and validation layers

Agent Builder may be useful later for experimentation, but it is not required for the production architecture here.

## Definition Of A Strong Three.js Agent

A strong Three.js agent is not just one that writes code that compiles.

It should:

- understand scene intent
- choose appropriate scene structure
- use reliable Three.js / R3F patterns
- avoid fragile dependencies
- recover from failures
- produce visually coherent output
- improve through evaluation and example reuse

That is the bar to design for.
