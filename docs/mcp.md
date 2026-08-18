# Studio MCP server

AI Three.js Studio includes a local STDIO MCP server. It lets an MCP-capable
client use the model included with that client to create and revise Studio
scenes. Studio remains the system of record: its API enforces project ownership,
normalizes Scene3D, creates rollback snapshots, runs builds, and mints preview
links.

This means MCP authoring itself does not require an OpenAI, Anthropic, or Gemini
API key in Studio. The existing Generate and Revise controls inside the web app
still use those provider APIs.

## Run it locally

Requirements are the same as the main project: Node 22+, pnpm 10, and a completed
`pnpm install`.

In one terminal, start the web app and API:

```bash
pnpm dev
```

The local API defaults to `http://127.0.0.1:4000` and runs without authentication
unless Supabase is configured. The MCP client starts the separate STDIO process
when it needs it; do not launch `pnpm mcp` in another terminal at the same time.

## Codex and ChatGPT configuration

Add a local STDIO server to the MCP configuration. For Codex, put this in
`~/.codex/config.toml`, replacing the repository path with an absolute path:

```toml
[mcp_servers.ai_threejs_studio]
command = "pnpm"
args = [
  "--silent",
  "--dir",
  "/absolute/path/to/ai-threejs-studio",
  "mcp"
]

[mcp_servers.ai_threejs_studio.env]
AI_THREEJS_STUDIO_API_URL = "http://127.0.0.1:4000"
```

Restart the MCP client after changing its configuration. ChatGPT desktop and
other local MCP clients can use the same command, arguments, and environment.
Use the client's MCP settings UI if it provides one.

The `--silent` flag matters: STDIO is reserved for MCP protocol messages. Server
diagnostics go to stderr.

## Connect to the hosted Studio API

For the Railway/Supabase deployment, point the server at the direct Railway API
origin and provide the signed-in user's current Supabase access token:

```toml
[mcp_servers.ai_threejs_studio.env]
AI_THREEJS_STUDIO_API_URL = "https://your-studio-api.up.railway.app"
AI_THREEJS_STUDIO_ACCESS_TOKEN = "your-current-supabase-access-token"
AI_THREEJS_STUDIO_REQUEST_TIMEOUT_MS = "120000"
```

Treat the access token like a password: keep it out of the repository, terminal
history, screenshots, and issue reports. Supabase access tokens expire, so a
local STDIO connection to the hosted API may need its token refreshed. A future
remote Streamable HTTP version should use an OAuth flow instead of manually
configured tokens.

The access token is sent only as an `Authorization: Bearer` header to the
configured API URL. The MCP tools never return it to the model.

## Tool workflow

The server exposes eight focused tools:

| Tool | Effect |
| --- | --- |
| `studio_list_projects` | Lists owned projects and their update versions. |
| `studio_create_project` | Creates a Scene3D-backed project. |
| `studio_get_scene_authoring_guide` | Returns supported Scene3D fields, enums, rules, and an example. |
| `studio_get_scene` | Returns the complete scene and a conflict-check version. |
| `studio_validate_scene` | Normalizes and validates a proposed scene without writing. |
| `studio_replace_scene` | Version-checks, snapshots, then replaces the complete scene. |
| `studio_build_project` | Runs the existing isolated build and visual validation. |
| `studio_start_preview` | Starts or refreshes a token-gated preview. |

The intended editing sequence is:

1. List projects or create one.
2. Read the authoring guide and current scene.
3. Preserve unrelated scene content and stable ids while editing.
4. Validate the complete proposed scene.
5. Replace it using the exact `projectUpdatedAt` returned by the read.
6. Build and, when useful, start a preview.

The server performs a stale-version check immediately before it snapshots and
writes. If the project changed after it was read, replacement is blocked; read
the scene again and reapply the intended change. Avoid simultaneous browser and
MCP edits during the short snapshot/write operation. Successful replacement
always creates a rollback snapshot first.

## Deliberate boundaries

This first MCP surface cannot:

- delete projects or snapshots;
- restore snapshots;
- publish public share links;
- upload assets;
- write arbitrary source files;
- execute shell commands; or
- invoke Studio's provider-backed AI generation routes.

Build and preview tools can consume hosted build quota. Build logs are truncated
before they enter model context. Preview URLs are token-gated and should still
be treated as sensitive while active.

## Troubleshooting

- `Could not reach the Studio API`: start `pnpm dev`, or verify the Railway API
  URL and network access.
- `401` or `403`: the hosted bearer token is missing, invalid, or expired.
- `404 Project not found`: the project id is wrong or the authenticated user
  does not own it.
- `project changed`: call `studio_get_scene` again before replacing it.
- preview/build failure: inspect the structured build result, repair the scene,
  and build again.

For client behavior and MCP server design guidance, see OpenAI's official
[MCP client documentation](https://learn.chatgpt.com/docs/extend/mcp) and
[MCP server guide](https://developers.openai.com/plugins/build/mcp-server).
