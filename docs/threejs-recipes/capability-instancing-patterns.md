# Instancing Patterns

Use this capability when the prompt needs many repeated objects such as towers of lights, repeated props, crowds, grids, particles made of meshes, or patterned arrays.

## Prompt Mapping

- field of lanterns -> repeated instances
- city lights grid -> repeated emissive units
- sculptural array -> repeated geometry with controlled variation
- planners or layout tools -> repeated markers or tiles

## Safe Pattern

- Use instancing only when repetition count is high enough to justify it.
- For editor-backed scenes, first attempt a reduced repeated layout with metadata-compatible objects.
- Move to code-authored instancing when:
  - object count is large
  - repeated transforms are algorithmic
  - performance matters to the prompt

## Example Families

- `webgl_instancing_dynamic`
- `webgl_instancing_performance`
- `webgl_instancing_raycast`

## Requirements

- repeated objects still need visual hierarchy
- vary scale, color, or spacing enough to avoid dead flat frames
- keep counts conservative in first-pass generation
- maintain an obvious focal region

## Failure Modes

- using instancing for only a few objects
- generating huge repeated counts that hurt preview performance
- no focal subject because every repeated object looks equally important
- interaction assumptions that do not match the chosen instancing pattern

## Retrieval Hints

Match these terms:

- many repeated objects
- grid
- array
- instanced
- field
- repeated lights
