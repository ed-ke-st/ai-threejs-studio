# Room Gallery

A room or gallery scene should read clearly within one second: floor plane, enclosing walls, artwork or focal objects, and a light rig that gives depth without crushing the corners into black.

## Prompt Mapping

When the prompt mentions a gallery, framed artwork, readable lighting, or an interior vignette, map it to a room-gallery plan unless the user explicitly asks for a different scene family. Treat `wall`, `artwork`, `frame`, `floor`, `accent light`, `gallery`, and `readable` as strong room-gallery anchors.

For the eval prompt family in this repo, the minimum intent is:

- one floor plane
- two enclosing walls
- three framed artworks or equivalent focal wall pieces
- at least two lights with one key and one accent/fill
- a diagonal camera that shows floor depth and one wall intersection

## Layout Pattern

Use a floor plus two or three walls to establish enclosure quickly. Keep the main subject off the exact centerline unless the prompt asks for symmetry. Give the camera a diagonal view so wall planes, floor depth, and object spacing are all legible at once.

## Required Structure Checklist

Before treating a room-gallery scene as complete, verify these minimums:

- `4+` visible non-light objects for floor, walls, and artwork
- `2+` visible lights
- at least one object with a wall or frame role
- camera framing that sees both floor and wall planes
- no remote texture dependency required for the scene to read

If any of those are missing, the scene is under-built even if the code compiles.

## Lighting Pattern

Start with a soft ambient contribution, then add a key light angled down across the main wall and a weaker fill from the opposite side. If framed artwork or objects need emphasis, add local accent lights rather than raising ambient intensity globally.

For gallery prompts, prefer:

- one modest ambient or soft base light
- one directional or spot key from above/front-side
- one weaker fill or secondary accent from the opposite side
- optional local spot accents near artwork

Do not solve readability by raising ambient intensity until the whole room flattens out.

## Materials And Color

Keep wall and floor materials restrained. Slight roughness variation is enough. Use one stronger accent color in art, furniture, or props so the room does not flatten into gray surfaces.

## Camera Framing

Frame the floor edge and at least one wall intersection. Avoid placing the camera so close that objects clip the near plane. A mild downward angle usually reads better than a level eye line for compact gallery scenes.

For compact interiors, a reliable starting point is:

- three-quarter view
- enough distance to see artwork grouping, not just one wall patch
- slight downward angle
- framing that keeps the focal wall readable without orbit interaction

## ScenePlan Example

Use a plan close to this when the user asks for an interior gallery room:

- `sceneCategory`: `room-gallery`
- `visualGoal`: readable interior gallery with framed focal pieces
- `objects`:
  - floor
  - left wall
  - back wall
  - artwork group or three separate framed pieces
- `lightStrategy`:
  - soft base light
  - main wall key
  - secondary fill or accent
- `cameraStrategy`: diagonal interior view with floor edge and wall intersection visible
- `constraints`:
  - no remote dependencies
  - keep artwork readable
  - avoid black corners

## SceneSpec Example

For metadata-backed generation, the structure should resemble:

- floor object with `geometry: floor`
- two wall objects with `geometry: wall`
- three artwork objects with `geometry: frame`
- one directional or spot light as key
- one point or spot light as fill/accent
- camera framing set for diagonal enclosure read

If the spec has only a single cube or only one wall-like object, it is not a valid gallery-room output.

## Failure Modes

Black or muddy rooms usually come from relying on a single weak light or placing the camera inside geometry. Flat rooms usually come from uniform materials, no shadow contrast, and front-on camera placement.

Common retrieval-relevant failures for this project:

- the plan says `custom-scene` instead of `room-gallery`
- floor or wall count is below the prompt minimum
- artwork is implied in prose but not represented as explicit objects
- only recipe overview text is retrieved and the result misses structural counts
- camera framing describes a room but does not show enclosure in the first frame
