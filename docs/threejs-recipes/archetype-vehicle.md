# Building Vehicles

A vehicle (car, truck, bus) is a grouped object: a body, a cabin, four wheels, and details like headlights. Orient the wheels correctly and rest them on the ground.

## Parts and grouping

Use a group named for the vehicle (e.g. "Sports Car"). It contains a body — a long box with its length along X, the main mass; a cabin — a smaller box on top, often set back; four wheels — cylinders, one near each corner; and details such as headlights (small emissive spheres at the front) and optional bumpers or a spoiler.

## Wheels

This is the part models get wrong. A cylinder's axis is vertical (Y) by default, so an un-rotated cylinder looks like a drum, not a wheel. Rotate each wheel by half pi (about 1.5708 radians) around the X axis so its round face points sideways along the car's width. Place the four wheels at the corners with their bottoms touching the ground, and set the group's y so the wheels rest on the floor.

## Proportions

Treat 1 unit as roughly 1 metre. A car is about 4m long, 1.8m wide, with wheels about 0.3-0.35m in radius (scale the numbers consistently). The body sits above the wheel centres and the cabin is shorter than the body.

## Materials and lighting

Painted body: low roughness, medium metalness, a saturated colour. Tyres: near-black, high roughness. Windows and cabin: dark, low roughness. Headlights: emissive warm. Light with a studio rig — an ambient fill, a bright directional key, and a coloured rim or spot light for a glossy highlight.

## Common failure modes

Wheels left as vertical cylinders — rotate them about X. Wheels floating or sunk into the road — align their bottoms with the ground via the group's y. A single-box car — always split body, cabin, wheels, and lights into a group.
