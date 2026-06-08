# AI Three.js Studio — Master Plan

## 0. Product Goal

Build a web app where users can describe a 3D scene, product configurator, interactive planner, GLB viewer, or Three.js experience, and an AI agent can create or modify the project.

The app should not only output code. It should:

- create/edit project files
- show a live preview
- run validation/build checks
- fix errors automatically where possible
- let the user inspect and accept/revert changes
- support uploaded assets such as GLB models, textures, HDRIs, and images
- use curated Three.js / React Three Fiber / Drei knowledge through RAG
- later expose the internal agent tools through MCP

The long-term product direction is:

> AI-assisted Three.js / React Three Fiber development studio with project files, asset library, live preview, RAG, safe code editing, and optional MCP compatibility.

---

## 1. Recommended Initial Stack

### Frontend

Use:

- Vite
- React
- TypeScript
- Three.js
- @react-three/fiber
- @react-three/drei
- Zustand for editor/project state
- Monaco Editor for file inspection/editing
- iframe-based live preview
- Tailwind or plain CSS modules for UI

Reasoning:

- Vite is simpler than Next.js for a sandboxed builder/editor MVP.
- React matches current developer familiarity.
- React Three Fiber allows declarative Three.js scenes inside React.
- Drei provides common scene helpers and avoids reinventing common patterns.

### Backend

Use:

- Node.js
- TypeScript
- Fastify
- OpenAI Responses API integration
- Supabase client
- RAG retrieval service
- isolated project runner/build service

The backend is responsible for:

- user/project CRUD
- agent orchestration
- file operations
- RAG search
- AI calls
- safe build/typecheck execution
- version snapshots
- project exports

### Database and Storage

Use Supabase:

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- pgvector or external vector DB for RAG

Core tables:

- users
- projects
- project_files
- project_versions
- agent_messages
- agent_runs
- assets
- rag_documents
- rag_chunks
- build_logs

Storage buckets:

- user-assets
- project-snapshots
- generated-previews
- project-exports

### Reference Sources

Use official source documentation as the first RAG ingestion targets and architecture references:

- OpenAI Responses API: <https://platform.openai.com/docs/api-reference/responses>
- Model Context Protocol specification: <https://modelcontextprotocol.io/specification/latest>
- Three.js docs: <https://threejs.org/docs/>
- React Three Fiber docs: <https://r3f.docs.pmnd.rs/getting-started/introduction>
- Drei docs: <https://drei.docs.pmnd.rs/>
- Vite docs: <https://vite.dev/guide/>
- Fastify docs: <https://fastify.dev/docs/latest/>
- Supabase docs: <https://supabase.com/docs>

### Storage Decision

Start with local project workspaces for the MVP, behind a storage adapter interface.

Reasoning:

- Local files are faster to implement and easier to debug for preview/build execution.
- Vite, TypeScript, and asset tooling naturally operate on a filesystem.
- A storage adapter keeps the path open to Supabase Storage or object-backed workspaces later.

Initial storage responsibilities:

- Project metadata: Supabase Postgres.
- Project files during active editing/builds: local workspace.
- User assets: local development storage first, Supabase Storage-ready API shape.
- Snapshots: local serialized snapshots first, with the same structure later stored in Supabase Storage.

Define the storage adapter early:

- `listProjectFiles(projectId)`
- `getProjectFile(projectId, path)`
- `writeProjectFile(projectId, path, content)`
- `deleteProjectFile(projectId, path)`
- `createProjectSnapshot(projectId)`
- `restoreProjectSnapshot(projectId, snapshotId)`

---

## 2. Important Architecture Decision

Do not build MCP first.

Build internal agent tools first:

- readFile
- writeFile
- patchFile
- listFiles
- runTypecheck
- runBuild
- searchDocs
- searchAssets
- createVersionSnapshot
- restoreVersionSnapshot

Later, expose these same tools through an MCP server.

MCP is useful because it standardizes how AI apps connect to tools and external context, but it should not be the first dependency of the MVP. The MCP specification defines a protocol for connecting LLM applications with external tools/data sources, which fits this project well later. However, the first version should use direct backend functions so the product can move faster.

Security note:

Generated code and tool calls must be sandboxed. MCP and agent tools can create security risk if they expose filesystem, shell, or network access too freely. Treat all AI-generated actions as untrusted until validated.

---

## 3. High-Level User Flow

1. User creates a new project.
2. User selects a starter template.
3. App creates a project file tree.
4. User enters a prompt.
5. Backend creates an agent run.
6. Agent inspects current files.
7. Agent retrieves relevant docs/examples through RAG.
8. Agent proposes a change plan.
9. Agent edits files.
10. Backend runs typecheck/build.
11. If errors occur, agent gets logs and attempts a fix.
12. Frontend reloads preview.
13. User sees changed files and accepts/reverts.

---

# Phase 1 — Repo and Project Foundation

## Goal

Create the basic monorepo structure with frontend, backend, shared types, and local development scripts.

## Tasks

Create repo structure:

```txt
/apps
  /web
  /api
/packages
  /shared
  /agent-tools
  /three-templates
  /rag
/docker
/docs
```

### `/apps/web`

Set up:

- Vite
- React
- TypeScript
- basic routing
- app shell layout
- Tailwind or CSS modules
- Zustand store

Pages/views:

- Dashboard
- Project editor
- Asset library placeholder
- Settings placeholder

### `/apps/api`

Set up:

- Fastify
- TypeScript
- env loading
- basic health route
- Supabase client
- OpenAI client wrapper
- structured logging

Routes:

- `GET /health`
- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `POST /projects/:id/agent-runs`
- `GET /projects/:id/files`
- `GET /projects/:id/files/*`
- `PUT /projects/:id/files/*`

### `/packages/shared`

Add shared types:

- `Project`
- `ProjectFile`
- `ProjectVersion`
- `AgentMessage`
- `AgentRun`
- `Asset`
- `BuildResult`
- `RagChunk`

## Acceptance Criteria

- `pnpm dev` starts frontend and backend.
- Frontend can call backend `/health`.
- Basic dashboard loads.
- Basic project editor route exists.
- Shared types are imported by both apps.

---

# Phase 2 — Project File System Model

## Goal

Implement project creation, file storage, file reading/writing, and version snapshots.

## Tasks

Create starter project templates:

- `blank-r3f-scene`
- `glb-viewer`
- `product-configurator`
- `room-scene`
- `interactive-planner`

Each starter should include:

- `package.json`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/scene/Scene.tsx`
- `src/scene/components/`
- `src/scene/materials/`
- `src/styles.css`

Store project files in local project workspaces initially, behind the storage adapter.

Later, move durable project snapshots and larger asset-backed file trees to Supabase Storage or another object-backed workspace.

Implement file operations:

- `listProjectFiles(projectId)`
- `getProjectFile(projectId, path)`
- `writeProjectFile(projectId, path, content)`
- `deleteProjectFile(projectId, path)`
- `createProjectSnapshot(projectId)`
- `restoreProjectSnapshot(projectId, snapshotId)`

Add versioning:

- Every accepted agent run should create a version snapshot.
- User can manually create a snapshot.
- User can revert to a previous snapshot.

## Acceptance Criteria

- User can create a project from a template.
- Project file tree appears in editor.
- User can open file content.
- User can edit and save file.
- User can create and restore a snapshot.

---

# Phase 3 — Live Preview MVP

## Goal

Render project output in a live preview iframe.

## Tasks

Implement a preview runner.

MVP approach:

- Generate a temporary project workspace from stored files.
- Install allowed dependencies.
- Run Vite dev server or build.
- Serve preview through a sandboxed URL.
- Display preview in iframe.

Allowed initial dependencies:

- `react`
- `react-dom`
- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `zustand`
- `leva`
- `maath`

Security constraints:

- Do not expose backend secrets to preview.
- Run preview code in an isolated workspace.
- Do not allow arbitrary shell commands.
- Use timeouts for build and preview start.
- Sanitize project paths.
- Only allow writes inside the project workspace.

Frontend editor layout:

```txt
------------------------------------------------
| File Tree | Code/Changes | Chat/Agent Panel  |
|           |              |                   |
|           |--------------|                   |
|           | Live Preview |                   |
------------------------------------------------
```

## Acceptance Criteria

- User can open a project and see the default R3F scene.
- Editing `Scene.tsx` updates the preview after save.
- Build errors are captured and shown in the UI.
- Preview runs in a sandboxed iframe.

---

# Phase 4 — Basic AI Agent Loop

## Goal

Allow the AI agent to edit project files based on a user prompt.

## Initial Agent Tools

Implement internal backend tools:

- `listFiles(projectId)`
- `readFile(projectId, path)`
- `writeFile(projectId, path, content)`
- `patchFile(projectId, path, patch)`
- `createFile(projectId, path, content)`
- `deleteFile(projectId, path)`
- `runTypecheck(projectId)`
- `runBuild(projectId)`
- `getBuildLogs(projectId)`
- `createSnapshot(projectId)`

## Agent Flow

1. User prompt.
2. Create agent run.
3. Inspect project files.
4. Retrieve relevant docs/examples if available.
5. Create implementation plan.
6. Edit files.
7. Run build/typecheck.
8. If errors occur, attempt fix.
9. Return summary and changed files.

## Agent Run States

- `queued`
- `planning`
- `retrieving_context`
- `editing_files`
- `building`
- `fixing_errors`
- `ready_for_review`
- `accepted`
- `reverted`
- `failed`

## Frontend UI

Chat panel should show:

- user prompt
- agent plan
- files changed
- build result
- accept button
- revert button
- retry/fix button

## Acceptance Criteria

- User can ask: "Create a rotating cube with orbit controls and a dark background."
- Agent edits the relevant files.
- Preview updates.
- User can inspect changed files.
- User can accept or revert.

---

# Phase 5 — RAG Knowledge Base

## Goal

Give the agent curated Three.js/R3F/Drei knowledge instead of relying only on model memory.

The official Three.js documentation should be part of the knowledge sources because it is the source of truth for core APIs. React Three Fiber and Drei docs should also be indexed because the app is React-based.

## RAG Collections

Create collections:

- `threejs-core-docs`
- `r3f-docs`
- `drei-docs`
- `internal-components`
- `starter-templates`
- `common-errors`
- `performance-guidelines`
- `glb-gltf-workflows`
- `shader-patterns`

## Tasks

Build ingestion scripts:

- `/scripts/ingest-three-docs.ts`
- `/scripts/ingest-r3f-docs.ts`
- `/scripts/ingest-drei-docs.ts`
- `/scripts/ingest-internal-components.ts`

Each document chunk should store:

```ts
{
  id: string
  collection: string
  title: string
  url?: string
  content: string
  metadata: {
    package?: string
    topic?: string
    apiName?: string
    version?: string
  }
}
```

Implement retrieval tool:

- `searchDocs(query, collections?, limit?)`

Agent should use RAG for:

- unfamiliar APIs
- GLB loading
- materials
- lighting
- shadows
- cameras
- controls
- performance
- postprocessing
- export workflows
- common errors

## Acceptance Criteria

- Agent retrieves relevant docs before making Three.js/R3F changes.
- Retrieved context is stored with each agent run.
- Agent summaries can mention which internal docs/examples were used.
- Search works for queries like:
  - "load GLB in R3F"
  - "OrbitControls drei"
  - "MeshStandardMaterial roughness metalness"
  - "performance instancing three js"

---

# Phase 6 — Asset Library

## Goal

Allow users to upload and reuse GLB models, textures, HDRIs, and images.

## Asset Types

- `model/glb`
- `model/gltf`
- `texture/image`
- `environment/hdri`
- `image/reference`
- `material/preset`

## Tasks

Add asset upload UI.

Asset fields:

```ts
Asset {
  id
  userId
  projectId?
  name
  type
  url
  thumbnailUrl?
  metadata
  tags
  createdAt
}
```

Implement backend routes:

- `POST /assets/upload`
- `GET /assets`
- `GET /projects/:id/assets`
- `POST /projects/:id/assets/:assetId/link`

Add agent tools:

- `searchAssets(query)`
- `getAsset(assetId)`
- `insertAssetIntoScene(projectId, assetId, options)`

Add first generated components:

- `ModelAsset.tsx`
- `TextureAsset.tsx`
- `EnvironmentAsset.tsx`

## Acceptance Criteria

- User can upload a GLB.
- User can see uploaded asset in project asset panel.
- Agent can use an uploaded GLB in the scene.
- Agent can add texture assets to materials.

---

# Phase 7 — Safer Code Editing and Review System

## Goal

Make agent edits auditable, reversible, and safer.

## Tasks

Replace direct blind writes with a patch/change proposal system.

Each agent run should produce:

```ts
ChangedFile {
  path
  before
  after
  diff
  changeReason
}
```

User can:

- accept all
- reject all
- accept individual files
- revert to previous snapshot
- ask agent to revise

Add static safety checks:

- block access to dangerous Node APIs in frontend project code
- block shell-command generation
- prevent path traversal
- detect secrets in generated files
- detect oversized files
- restrict package installs

Add dependency allowlist.

Initial allowed packages:

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`
- `zustand`
- `leva`
- `maath`
- `framer-motion`
- `gsap`

## Acceptance Criteria

- Every AI file change is visible before acceptance.
- Revert works reliably.
- Agent cannot edit files outside the project.
- Agent cannot install arbitrary packages without approval.
- Build logs are attached to the agent run.

---

# Phase 8 — Scene Metadata and Visual Editor Basics

## Goal

Add a basic scene tree and object selection/editing system.

## Tasks

Create a scene metadata layer.

Possible file:

- `src/scene/scene.config.ts`

Example:

```ts
export const sceneObjects = [
  {
    id: "main-cube",
    type: "mesh",
    label: "Main Cube",
    editable: true,
    transform: {
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    material: {
      color: "#ffffff",
      roughness: 0.4,
      metalness: 0.1
    }
  }
]
```

Frontend editor features:

- scene tree
- selected object panel
- transform fields
- material color
- roughness/metalness fields
- visibility toggle
- delete object
- duplicate object

Agent should understand selected object context.

Example:

1. User selects "Main Cube".
2. User says: "Make this look like brushed metal and add subtle reflections."
3. Agent receives `selectedObjectId` and file context.

## Acceptance Criteria

- Scene tree displays editable objects.
- User can select object.
- User can adjust basic transform/material values.
- Agent can modify selected object.

---

# Phase 9 — Build Debugging Loop

## Goal

Make the agent capable of fixing its own TypeScript/build/runtime errors.

## Tasks

Capture:

- TypeScript errors
- Vite build errors
- runtime console errors from preview
- missing imports
- missing package errors

Agent flow:

1. Edit files.
2. Run typecheck.
3. Run build.
4. Capture errors.
5. Send errors to model.
6. Patch files.
7. Rerun checks.
8. Stop after max attempts.

Set max attempts:

```txt
MAX_AGENT_FIX_ATTEMPTS=3
```

Frontend should show:

- build status
- error logs
- fix attempts
- final result

## Acceptance Criteria

- Agent can recover from common import/type errors.
- Agent stops after max attempts.
- User sees useful error summary if fixing fails.

---

# Phase 10 — Export and Sharing

## Goal

Let users export or share their generated projects.

## Tasks

Add export options:

- download source zip
- export built static bundle
- share preview link
- later: deploy to Vercel/Netlify
- later: export selected scene/model to GLB where possible

Backend routes:

- `POST /projects/:id/export/source`
- `POST /projects/:id/export/build`
- `POST /projects/:id/share`

## Acceptance Criteria

- User can download project as zip.
- Project can run locally after download.
- User can create a read-only preview link.

---

# Phase 11 — MCP Adapter

## Goal

Expose the mature internal tool system as an MCP server.

Do this only after Phases 1–10 are stable.

## MCP Server Name

`ai-threejs-studio-mcp`

## MCP Tools

Expose:

- `project.list_files`
- `project.read_file`
- `project.write_file`
- `project.apply_patch`
- `project.run_build`
- `project.get_build_logs`
- `project.create_snapshot`
- `project.restore_snapshot`
- `docs.search`
- `assets.search`
- `assets.insert_into_scene`
- `preview.get_url`
- `preview.capture_screenshot`

## MCP Resources

Expose:

- `project://current/files`
- `project://current/metadata`
- `docs://threejs`
- `docs://r3f`
- `docs://drei`
- `assets://user-library`

## Security Requirements

- Require authentication.
- Scope access to one project at a time.
- No unrestricted shell access.
- No arbitrary file system access.
- Log all MCP tool calls.
- Add user confirmation for destructive operations.
- Add rate limits.

## Acceptance Criteria

- External MCP-compatible client can list project files.
- External MCP-compatible client can search docs.
- External MCP-compatible client can propose file patches.
- User approval is still required for risky/destructive actions.

---

# Phase 12 — GLB / Model Workflows

## Goal

Make uploaded 3D model assets usable inside generated Three.js scenes without requiring manual file wiring.

## Tasks

- Add a project asset library for uploaded GLB/GLTF files.
- Store asset metadata separately from project source files.
- Expose API routes to list, upload, and serve project assets.
- Let the user insert an uploaded model into the current scene.
- Extend scene metadata so scene objects can reference asset-backed models.
- Render model scene objects through a config-driven `Scene.tsx`.
- Show a placeholder in the scene when a model slot exists but has no linked asset URL yet.

### Follow-on Improvements

#### Visual Inspection

- Capture preview screenshot.
- Let agent compare screenshot against prompt.
- Let user annotate screenshot.
- Agent fixes layout/scene visually.

#### Expanded Model Tools

- Inspect nodes/materials.
- Replace materials.
- Optimize model.
- Generate thumbnails.
- Add transform controls.

#### Blender Integration

- Send tasks to Blender through separate service or MCP.
- Generate/modify GLB files.
- Create procedural geometry.
- Bake assets.

#### Templates Marketplace

- Product configurator
- Exhibition planner
- AR painting viewer
- Interior layout planner
- Interactive house/system planner
- 3D landing page hero
- Model viewer

## Acceptance Criteria

- User can upload a `.glb` or `.gltf` asset into a project.
- User can list uploaded model assets in the project editor.
- User can insert an uploaded model into the scene without editing files manually.
- Inserted model is represented in scene metadata with an asset reference.
- Generated scene source can render both primitive scene objects and asset-backed model objects.
- The linked project still typechecks, builds, and previews successfully.

---

# Phase 13 — Deployment

## Goal

Package finished projects for hosting and sharing outside the local editor.

## Tasks

- Vercel export
- Netlify export
- static hosting
- iframe embed

## Acceptance Criteria

- User can export a production-ready build artifact.
- User can generate a deployment-ready package for at least one hosting target.
- Shared/embed output points at a stable preview or deployed URL.

---

# Agent Prompting Guidelines

The agent must follow this workflow:

- Understand the user request.
- Inspect existing project files before editing.
- Retrieve relevant docs/examples when working with Three.js/R3F/Drei APIs.
- Create a short implementation plan.
- Make the smallest safe set of file changes.
- Run typecheck/build.
- Fix errors if needed.
- Summarize:
  - what changed
  - files changed
  - any limitations
  - next recommended steps

The agent must not:

- invent files without checking structure
- delete user work without snapshot
- install packages without allowlist or approval
- run arbitrary shell commands
- access files outside project workspace
- expose secrets to frontend code
- claim success if build failed

---

# Initial MVP Milestone

The first usable MVP is complete when:

- user can create a blank R3F project
- user can prompt the AI to create/edit a scene
- agent can edit files
- preview updates
- build/typecheck runs
- errors are shown
- user can accept/revert changes
- RAG search is available for Three.js/R3F/Drei
- uploaded GLB can be used in a scene

This should be the first target before adding MCP, visual editing, or deployment integrations.

---

# Suggested First Test Prompts

Use these to test the MVP:

## Test 1

Create a dark studio scene with a rotating cube, orbit controls, soft shadows, and a warm key light.

## Test 2

Replace the cube with a simple product display: a rounded box on a pedestal with realistic metal and plastic materials.

## Test 3

Add a GLB loader component that loads an uploaded model and centers it in the scene.

## Test 4

Create an interactive room scene with a floor, two walls, framed artwork, and adjustable lighting.

## Test 5

Add a small control panel where the user can change the main object color, roughness, and metalness.

---

# Immediate Next Steps for Codex

1. Create the monorepo structure.
2. Build the Vite React frontend shell.
3. Build the Fastify backend shell.
4. Add Supabase config placeholders.
5. Add shared types.
6. Add project template creation.
7. Add file tree UI.
8. Add editable file viewer.
9. Add preview iframe placeholder.
10. Add first AI agent route stub.
11. Add internal tool interfaces but mock implementation first.
12. Add real file read/write operations.
13. Add build runner.
14. Add OpenAI integration.
15. Add first full agent loop.
