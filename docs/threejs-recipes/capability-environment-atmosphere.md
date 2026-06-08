# Environment Atmosphere

Use this capability for dusk, fog, skyline mood, sky color transitions, and background atmosphere that gives the scene a believable time-of-day or weather context.

## Prompt Mapping

- rooftop lounge at dusk -> skyline/backdrop tone, warmer local lights, cooler ambient background
- foggy gallery or moody hall -> controlled fog depth with readable subject contrast
- sunrise or sunset terrace -> warm horizon, cooler shadows, restrained saturation

## Safe Pattern

- Solve readable subject lighting before adding heavy fog.
- Environment color should support the prompt mood without flattening the scene.
- In metadata-backed scenes, encode the environment as camera/background intent and use lighting/material contrast to carry most of the effect.

## Example Families

- `webgl_shaders_sky`
- `webgl_fog`
- `webgl_lights_hemisphere`

## Requirements

- clear foreground/background separation
- enough contrast for subject readability
- no fog so dense that walls and artwork disappear
- dusk scenes should usually combine cool ambient base with warm practical accents

## Failure Modes

- atmosphere overwhelms the subject
- fog used to hide missing scene structure
- uniform blue/orange wash with no lighting hierarchy
- background reads correctly but the foreground is too dark to inspect

## Retrieval Hints

Match these terms:

- dusk
- dawn
- fog
- atmosphere
- skyline
- rooftop
