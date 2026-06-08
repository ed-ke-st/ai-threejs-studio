# Building Animals and Creatures

Animals are built from stacked, mostly horizontal primitives: a body, a head, four legs, and a tail, assembled into one named group. Keep the body horizontal (unlike upright characters) and stand the legs on the ground.

## Parts and grouping

Use a group named for the animal (e.g. "Cat", "Dog", "Cow", "Bird"). Inside it: a body — a horizontal capsule, ellipsoid (a scaled sphere), or box; a head at the front (sphere or box); four legs (thin cylinders or capsules) at the body's corners; a tail (a small capsule or cone at the back); and details like ears (cones), a snout, eyes (small spheres), horns, or wings. Mirror left/right legs and ears.

## Proportions

Treat 1 unit as roughly 1 metre. A cat or dog body is about 0.4-0.7m long and sits about 0.3-0.5m off the ground on its legs; a cow or horse is larger. The head is roughly a third of the body length. Legs run from the body down to y=0 so the feet touch the ground; the body floats above them.

## Materials and style

Fur and skin: matte (high roughness, no metalness) in natural tones, or bold flat colours for a stylized/low-poly look with flatShading. Use small emissive spheres only for glowing eyes on stylized creatures. Vary colour for markings (a darker patch, a lighter belly).

## Composition

Pose the animal in profile or three-quarter view on a ground plane with simple context (grass, a mat). Light with hemisphere + directional for outdoor animals, or a soft indoor rig for pets.

## Common failure modes

A single shape instead of a body with head, legs, and tail — separate them into a group. An upright body — most animals are horizontal, with the long axis parallel to the ground. Legs not reaching the floor, or a floating animal.
