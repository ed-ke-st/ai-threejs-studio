# Particle Fields

Use this capability for fireflies, dust, floating embers, magical fields, star swarms, and ambient moving detail that should not become the main subject.

## Prompt Mapping

- dreamy rooftop dusk -> sparse floating particles can support atmosphere
- magical portal -> denser particles near the portal only
- abstract scene -> particles may become a main visual layer if composition stays legible

## Safe Pattern

- Treat particles as a secondary layer unless the prompt explicitly centers them.
- Keep the density low in first-pass generation.
- Particle fields should reinforce lighting and mood, not replace objects, walls, or floor structure.
- If metadata-backed mode cannot express the effect well, keep the base scene in metadata and reserve particle logic for code-authored scenes.

## Example Families

- `webgl_points_billboards`
- `webgl_points_sprites`
- `webgl_buffergeometry_points`

## Requirements

- visible primary subject before particle polish
- controlled particle bounds around the camera target
- avoid all-frame noise that flattens the scene

## Failure Modes

- scene is mostly empty except for particles
- particles obscure the hero object
- too much density for local preview
- particles used to hide weak composition

## Retrieval Hints

Match these terms:

- particles
- floating dust
- fireflies
- embers
- stars
- atmospheric detail
