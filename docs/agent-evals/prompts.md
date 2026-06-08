# Agent Eval Prompts

This prompt set is the baseline benchmark corpus for the Three.js scene agent.

Each case includes:
- the prompt
- the project template to scaffold
- the expected scene category and structural signals

The runner parses the JSON block below and writes comparable reports into `.studio/evals/`.

```json
[
  {
    "id": "gallery-room-editor",
    "title": "Gallery Room With Artwork",
    "category": "gallery-room",
    "templateId": "interactive-planner",
    "prompt": "Create an interior gallery room with a floor, two walls, three framed artworks, and adjustable warm accent lighting that keeps the art readable.",
    "expectation": {
      "expectedSceneCategories": ["room-gallery"],
      "requiredPlanTerms": ["wall", "artwork", "light"],
      "minimumObjects": 4,
      "minimumLights": 2,
      "requireMetadataFlow": true,
      "forbidRemoteAssets": true
    }
  },
  {
    "id": "product-stage-hero",
    "title": "Product Hero Stage",
    "category": "product-stage",
    "templateId": "product-configurator",
    "prompt": "Create a premium product stage with a central pedestal, a dominant hero object, soft fill light, and a rim light against a darker backdrop.",
    "expectation": {
      "expectedSceneCategories": ["product-stage"],
      "requiredPlanTerms": ["hero", "pedestal", "light"],
      "minimumObjects": 2,
      "minimumLights": 1,
      "forbidRemoteAssets": true
    }
  },
  {
    "id": "model-viewer-stage",
    "title": "Uploaded Model Viewer Stage",
    "category": "model-viewer",
    "templateId": "glb-viewer",
    "prompt": "Create a neutral uploaded-model viewer stage with a ground plane, soft studio lighting, and a clear center presentation area for the future asset.",
    "expectation": {
      "expectedSceneCategories": ["model-viewer"],
      "requiredPlanTerms": ["model", "ground", "light"],
      "minimumObjects": 1,
      "minimumLights": 1,
      "requireMetadataFlow": true,
      "forbidRemoteAssets": true
    }
  },
  {
    "id": "planner-layout",
    "title": "Interactive Planner Layout",
    "category": "planner",
    "templateId": "interactive-planner",
    "prompt": "Create an interactive layout planning scene with a floor grid, two movable zone markers, and readable overhead lighting for arrangement work.",
    "expectation": {
      "expectedSceneCategories": ["custom-scene", "interactive-layout-planning"],
      "requiredPlanTerms": ["layout", "zone", "light"],
      "minimumObjects": 3,
      "minimumLights": 1,
      "requireInteraction": true,
      "requireMetadataFlow": true,
      "forbidRemoteAssets": true
    }
  },
  {
    "id": "abstract-installation",
    "title": "Abstract Installation",
    "category": "abstract-scene",
    "templateId": "blank-r3f-scene",
    "prompt": "Create an abstract installation with floating sculptural forms, layered depth, and dramatic but readable lighting.",
    "expectation": {
      "expectedSceneCategories": ["abstract-installation"],
      "requiredPlanTerms": ["subject", "light"],
      "minimumObjects": 2,
      "minimumLights": 1,
      "requireMetadataFlow": true,
      "forbidRemoteAssets": true
    }
  },
  {
    "id": "lighting-room-vignette",
    "title": "Lighting-Focused Room Vignette",
    "category": "lighting-scene",
    "templateId": "room-scene",
    "prompt": "Create a moody room vignette with a floor, one wall, a focal object, and contrasting warm and cool lights that keep the subject visible.",
    "expectation": {
      "expectedSceneCategories": ["room-gallery"],
      "requiredPlanTerms": ["wall", "light", "subject"],
      "minimumObjects": 3,
      "minimumLights": 2,
      "forbidRemoteAssets": true
    }
  }
]
```
