# Model Viewer

A model viewer scene should make the asset readable first and decorative second. The fallback path matters: the scene should still be useful if the asset is missing, slow, or poorly centered.

## Asset Handling Pattern

Use local project assets only. Load the model through existing asset URLs and center it so the preview does not depend on authoring origin. If the asset is missing, show a procedural placeholder rather than a blank scene.

## Lighting Pattern

Prefer a neutral studio light rig: ambient support, one stronger key, and a softer fill or rim. The goal is even readability across many assets rather than dramatic mood.

## Camera Framing

The camera should start far enough back that a moderately oversized asset still fits. Orbit controls are useful, but the default framing must already be readable before interaction.

## Materials And Background

Keep the environment neutral. Use a background that contrasts with most assets. Avoid busy floors, wall props, or strong color casts that can make unknown uploaded models harder to inspect.

## Failure Modes

Model viewers fail when the asset loads off-screen, when the only visible content is a blank dark background during loading, or when remote HDRI or texture dependencies break the preview.
