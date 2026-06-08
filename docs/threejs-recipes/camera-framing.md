# Camera Framing

Camera framing is part of scene generation, not a final cosmetic step. A strong scene can still fail if the default camera misses the subject, clips through geometry, or leaves the focal area too small in frame.

## Default Composition Pattern

Give the camera a three-quarter view when possible. It reveals depth, silhouette, and spacing better than a flat head-on view. Keep the main subject large enough to read without needing the user to orbit immediately.

## Distance And Scale

Set the camera for the expected scene scale. Small tabletop or product scenes need tighter framing than room scenes. Leave enough margin that small repair edits do not push the subject out of frame.

## Interior Framing

For rooms, include a floor edge and at least one wall intersection so the viewer can understand enclosure instantly. Avoid starting with the camera flush against a wall or inside another mesh.

For the gallery-room eval family, the starting frame should make all of these legible without orbiting:

- floor plane
- two enclosing planes or their intersection
- artwork grouping on the focal wall
- enough distance that the room reads as a room rather than a close crop of one object

If the camera only sees a cube-like prop or misses the wall/floor relationship, the framing is wrong even if the scene graph is correct.

## Viewer Framing

For asset viewers, assume models may be bigger than expected. Use a framing distance that survives moderate scale variation, and center the subject around the origin or an intentional presentation point.

## Failure Modes

Camera framing fails when the default shot shows mostly empty space, when the subject intersects the near plane, or when dramatic perspective distortion overwhelms the object the user asked to inspect.

Additional retrieval-focused notes:

- prompts containing `interior`, `room`, `wall`, or `gallery` should bias toward interior framing, not viewer framing
- compact gallery prompts usually benefit from mild downward angle and diagonal placement
- if the scene is structurally correct but reads as sparse, step the camera back before adding more objects
