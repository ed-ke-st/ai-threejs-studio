# Product Stage

A product stage is a controlled hero setup: one clear focal object, a readable ground plane or pedestal, and a lighting rig that separates silhouette, front form, and contact shadow.

## Layout Pattern

Place the subject close to the origin and give it enough negative space around the silhouette. Add a pedestal, backing plane, or shadow-catching floor only if it supports the product rather than competing with it.

## Lighting Pattern

Use a key light for form, a softer fill light to keep shadows readable, and a rim or back light to pull the silhouette away from the background. For glossy objects, keep highlights intentional and limited.

## Materials And Color

Use a restrained palette. The stage should support the product. Roughness and metalness variation usually matter more than adding many colors. If the subject is dark, brighten the background or rim light rather than overexposing the key.

## Camera Framing

Use a medium focal length feel and keep the subject large enough to read material detail. Avoid extreme wide-angle distortion unless the prompt explicitly asks for drama.

## Code Path Guardrails

When this scene goes through custom `Scene.tsx` generation instead of metadata:

- keep the object count small and explicit
- prefer `ambientLight`, `directionalLight`, `spotLight`, and `pointLight` over introducing unusual light APIs
- if using `hemisphereLight`, do not invent unsupported JSX props like `sky` or `ground`
- React hooks must use valid signatures, for example `useMemo(() => value, [])`
- first pass should favor resilient, boring-valid code over clever abstractions

## Failure Modes

Product scenes fail when the pedestal is larger than the subject, when the background and object share the same value range, or when every light is equally bright and the form loses hierarchy.

Additional code-generation failures to avoid:

- unsupported R3F prop names on lights
- hook calls with missing dependency arrays
- trying to solve a simple pedestal scene with overcomplicated helper code
