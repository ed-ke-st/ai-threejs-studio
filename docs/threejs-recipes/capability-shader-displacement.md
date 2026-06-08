# Shader Displacement

Use this capability when the prompt needs animated surfaces, energy fields, ripples, wave motion, or obviously procedural motion that basic transforms cannot express cleanly.

## Prompt Mapping

- rippling portal -> shader-driven surface motion
- animated energy wall -> displacement or procedural material
- abstract motion sculpture -> shader layer may be appropriate if the subject remains readable

## Safe Pattern

- Reserve shader-heavy work for prompts that truly need it.
- Build a stable base mesh and lighting setup first.
- Keep fallback behavior available if the shader path fails.
- Avoid sending metadata-backed scenes down a shader-only path unless custom code is justified.

## Example Families

- `webgl_materials_modified`
- `webgl_shaders_ocean`
- `webgl_gpgpu_water`

## Requirements

- visible base geometry
- bounded animation speed
- simple controllable uniforms
- repairable code path if the shader fails

## Failure Modes

- shader complexity added where transforms/materials were enough
- unreadable scene because the animated surface consumes the whole frame
- difficult-to-repair custom shader code for a prompt that only asked for mood

## Retrieval Hints

Match these terms:

- shader
- procedural surface
- ripples
- animated material
- displacement
- energy field
