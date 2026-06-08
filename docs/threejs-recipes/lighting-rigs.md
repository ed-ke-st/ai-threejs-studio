# Lighting Rigs

Lighting should establish hierarchy, depth, and subject readability before it adds mood. A working agent needs a few dependable rigs that can be adapted rather than improvising from scratch each time.

## Basic Readability Rig

Use one ambient or hemisphere-style base, one clear key light from above and to one side, and one weaker fill. This is the default for general scenes when the prompt does not imply a stylized mood.

## Product Rim Rig

Use a key light for form, a lower-intensity fill, and a rim or back light to separate edges from the background. This works well for hero objects, viewer scenes, and pedestal compositions.

## Interior Accent Rig

Keep ambient contribution modest. Use a directional key plus one or more local accent lights near focal objects or walls. This keeps the room readable without making the entire interior equally bright.

For gallery-room prompts in this repo, treat this as the default interior rig:

- ambient/base light kept low to moderate
- one stronger key angled toward the focal wall
- one weaker fill or accent from the opposite side
- optional per-artwork accent only if the prompt asks for strong readability

Do not collapse the rig into one ambient plus one weak point light.

## Shadow Strategy

Shadows should help depth, not dominate the frame. Use them on main objects and floors, but avoid so many overlapping hard shadows that the scene becomes noisy.

For compact room scenes, prioritize:

- readable floor shadow under main objects
- soft wall contrast rather than harsh spotlight cones everywhere
- enough variation that the room does not look uniformly lit

## Minimum Light Checklist

If the prompt implies an interior room or gallery, the scene should usually have:

- `2+` visible lights
- one designated key light
- one fill or accent light
- intensities strong enough that the first frame is not near-black

If the generated metadata has fewer than two lights for a gallery prompt, treat it as incomplete.

## Failure Modes

Scenes often fail when ambient light is missing entirely, when all lights have the same intensity and direction, or when the light rig is too weak and the preview reads as black.

Additional failure notes for retrieval:

- `readable lighting` should bias toward multi-light rigs, not higher ambient only
- `warm accent lighting` should map to localized accent placement, not full-scene orange wash
- if visual validation reports darkness, increase key/fill contribution before adding more decorative lights
