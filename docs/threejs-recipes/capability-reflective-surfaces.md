# Reflective Surfaces

Use this capability for mirrors, glossy floors, water-like reflections, showroom surfaces, or premium product staging where reflections matter to the final composition.

## Prompt Mapping

- premium showroom -> reflective floor under hero subject
- sleek product pedestal -> mild floor reflection, not mirror strength
- bathroom or gallery mirror -> explicit reflective plane
- rooftop dusk lounge -> subtle floor sheen is acceptable; full mirror is usually too strong

## Safe Pattern

- Start with material contrast and lighting before adding reflection logic.
- Prefer subtle reflectivity over large perfect mirrors unless the prompt asks for a mirror.
- For metadata-backed scenes, express the reflective intent as material and staging notes first.
- Escalate to custom code only when the effect is central to the prompt.

## Example Families

- `webgl_mirror`
- `webgl_materials_cubemap_dynamic`
- `webgl_pmrem_test`

## Requirements

- reflective surfaces need stable camera framing
- reflected subjects must be worth reflecting
- avoid giant reflective planes that dominate the frame without purpose
- keep horizon, wall, or subject anchors visible so the scene does not feel empty

## Failure Modes

- mirror logic added to a scene with no strong subject
- reflective floor brighter than the actual subject
- reflections used as decoration with weak base composition
- heavy effect path causing fragile runtime behavior

## Retrieval Hints

Match these terms:

- reflective
- mirror
- glossy floor
- showroom
- polished surface
