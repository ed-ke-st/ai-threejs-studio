# Postprocessing

Use this capability when the prompt asks for bloom, glow, depth-heavy atmosphere, dreamy polish, filmic contrast, or "final image" styling beyond raw geometry and lights.

## Prompt Mapping

- dreamy neon lounge -> bloom + restrained emissive accents
- sci-fi portal or hologram -> bloom + selective bright subjects
- polished product hero -> optional mild bloom, stronger tonemapping discipline
- moody dusk rooftop -> do not start with heavy bloom; first solve readable lighting and composition

## Safe Pattern

- Prefer a good scene without postprocessing over a weak scene with effects.
- Add postprocessing only after:
  - subject is visible
  - light hierarchy is readable
  - camera framing is stable
- Keep the first pass local and dependency-light.
- If the project is metadata-backed, encode the visual intent in plan/spec notes first; do not force a code-only effect path unless the prompt truly needs it.

## Example Families

- `webgl_postprocessing_unreal_bloom`
- `webgl_postprocessing_afterimage`
- `webgl_postprocessing_outline`

These examples are useful for effect vocabulary and sequencing, not for direct copy-paste into generated scenes.

## Requirements

- bright emissive accents need dark-enough surroundings to read
- bloom scenes still need base key/fill separation
- avoid stacking multiple aggressive effects in a first-pass agent generation
- keep fallback behavior simple if composer setup fails

## Failure Modes

- bloom added to a badly lit scene instead of fixing the lighting
- washed-out frame with no readable focal subject
- over-reliance on emissive materials to fake lighting
- effect-heavy output that breaks local preview or becomes hard to repair

## Retrieval Hints

Match these terms:

- bloom
- postprocessing
- dreamy
- glow
- atmospheric polish
- filmic
