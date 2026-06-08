# Building Characters and Figures

Characters — people, robots, mascots, creatures — are built by stacking simple primitives into a symmetric named group: a body, a head, eyes, arms, and legs. Keep left/right parts mirrored, and stand the figure on the ground.

## Parts and grouping

Use one group named for the character (e.g. "Robot", "Snowman", "Knight"). Inside it: a torso/body (box, capsule, or stacked spheres), a head on top (box or sphere), two eyes (small spheres, often emissive), two arms (capsules or cylinders on each side), and two legs (capsules or cylinders below the body). Add character-specific details: antenna, hat, ears, tail. Mirror left and right parts across the centre (x and -x).

## Proportions

Treat 1 unit as roughly 1 metre. A stylized character is about 1.5-2m tall. Stack from the ground up: legs from y=0, body above the legs, head above the body, so the feet rest on the floor. Keep the head fairly large for an appealing, cartoon-like look.

## Materials and style

Robots and sci-fi: metallic (low-medium roughness, higher metalness), with bright emissive eyes/lights. Organic or toy characters: matte (high roughness, no metalness) in friendly saturated colours. Use emissive for eyes, screens, or glowing accents, and add a matching point light near a glowing feature.

## Composition

Pose the figure facing roughly toward the camera. Light with an ambient/hemisphere fill plus a directional key, and a rim or accent light to separate the character from the background. Keep the background simple so the character reads as the focal point.

## Common failure modes

A single blob instead of a stacked figure — separate body, head, and limbs into a group. Asymmetric arms/legs — mirror them across the centre. A floating character — start the legs at the floor.
