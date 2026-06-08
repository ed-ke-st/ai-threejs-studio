# Building Trees and Plants

Trees and plants are multi-part objects best built as a named group: a trunk plus one or more foliage masses. Vary trunk thickness, foliage shape, and colour to make a believable plant, and rest the trunk base on the ground.

## Parts and grouping

A tree is a group named for the species (e.g. "Pine Tree", "Oak Tree") containing a trunk and foliage. The trunk is a thin tapered cylinder (top radius slightly smaller than the bottom), brown. Foliage is one or more cones (conifer) or spheres/icosahedrons (broadleaf) stacked above the trunk. Put the group transform at the tree's ground position and position the trunk and foliage relative to the group so the whole tree moves as one unit.

## Proportions

Treat 1 unit as roughly 1 metre. A small tree is 2-4m tall with a trunk radius of about 0.15-0.25m. The trunk base sits at y=0 (its centre at half its height). Foliage begins near the top of the trunk and rises above it. Bushes are 0.5-1m foliage masses with little or no trunk.

## Materials and style

Low-poly / stylized: use flatShading true, low geometry segments (a cone with 6-8 radial segments, icosahedron detail 0), and bold flat greens and browns. Realistic: higher roughness with subtle colour variation between trees. Avoid metalness on bark and leaves.

## Composition

Scatter several trees at different positions, rotations, and scales so they do not look cloned. Add a wide green ground disc or plane, optional rocks (icosahedrons), and hemisphere plus directional "sun" lighting for an outdoor feel.

## Common failure modes

Floating trees: ensure the trunk base touches the ground. Cloned trees: vary scale, rotation, colour, and foliage shape. A single mesh standing in for a whole tree: always split the trunk and foliage into a named group.
