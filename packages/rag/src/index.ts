import type {
  ProjectTemplateId,
  RagChunk,
  RagRetrievalMetadata,
  RagRetrievalReason,
  RagRetrievalReasonCode,
  RagRetrievalTuningProfile
} from "@ai-threejs-studio/shared";

export const ragCollections = [
  "threejs-core-docs",
  "r3f-docs",
  "drei-docs",
  "threejs-recipes",
  "local-project-examples",
  "accepted-agent-examples",
  "internal-components",
  "starter-templates",
  "common-errors",
  "performance-guidelines",
  "glb-gltf-workflows",
  "shader-patterns"
] as const;

export type RagCollection = (typeof ragCollections)[number];

export const referenceSources = [
  {
    collection: "threejs-core-docs",
    title: "Three.js Docs",
    url: "https://threejs.org/docs/"
  },
  {
    collection: "r3f-docs",
    title: "React Three Fiber Docs",
    url: "https://r3f.docs.pmnd.rs/getting-started/introduction"
  },
  {
    collection: "drei-docs",
    title: "Drei Docs",
    url: "https://drei.docs.pmnd.rs/"
  }
] as const;

export interface RagSearchOptions {
  collections?: string[];
  limit?: number;
  projectId?: string;
  projectName?: string;
  templateId?: ProjectTemplateId;
  tuningProfile?: RagRetrievalTuningProfile;
}

export interface RagIndex {
  version: 1;
  generatedAt: string;
  chunks: RagChunk[];
}

export const seedRagChunks: RagChunk[] = [
  {
    id: "r3f-canvas-scene-basics",
    collection: "r3f-docs",
    title: "React Three Fiber scene basics",
    url: "https://r3f.docs.pmnd.rs/getting-started/introduction",
    content:
      "React Three Fiber renders Three.js objects declaratively inside a Canvas. Scene components can return meshes, lights, controls, and Drei helpers as JSX. Keep scene code inside components and use hooks such as useFrame for animation.",
    metadata: {
      package: "@react-three/fiber",
      topic: "scene setup",
      apiName: "Canvas"
    }
  },
  {
    id: "r3f-useframe-animation",
    collection: "r3f-docs",
    title: "Animating with useFrame",
    url: "https://r3f.docs.pmnd.rs/api/hooks",
    content:
      "useFrame registers a callback that runs on every rendered frame. It is commonly used with a React ref to mutate mesh rotation, position, material values, or other Three.js object properties without triggering React state updates.",
    metadata: {
      package: "@react-three/fiber",
      topic: "animation",
      apiName: "useFrame"
    }
  },
  {
    id: "drei-orbit-controls",
    collection: "drei-docs",
    title: "Drei OrbitControls",
    url: "https://drei.docs.pmnd.rs/controls/orbit-controls",
    content:
      "Drei provides OrbitControls as a React component for camera orbiting. In a Canvas scene, use OrbitControls to allow rotate, pan, and zoom interaction. The makeDefault prop makes the controls the default camera controls.",
    metadata: {
      package: "@react-three/drei",
      topic: "controls",
      apiName: "OrbitControls"
    }
  },
  {
    id: "three-meshstandardmaterial",
    collection: "threejs-core-docs",
    title: "MeshStandardMaterial metalness and roughness",
    url: "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial",
    content:
      "MeshStandardMaterial is a physically based material. Roughness controls how diffuse or sharp reflections appear, while metalness controls whether the surface behaves like a dielectric or metallic material.",
    metadata: {
      package: "three",
      topic: "materials",
      apiName: "MeshStandardMaterial"
    }
  },
  {
    id: "drei-usegltf-center",
    collection: "glb-gltf-workflows",
    title: "GLB loading workflow",
    url: "https://drei.docs.pmnd.rs/loaders/gltf-use-gltf",
    content:
      "Drei useGLTF loads glTF and GLB assets. A reusable model component can call useGLTF(url), render the loaded scene as a primitive, and wrap it with Center to position the asset around the origin.",
    metadata: {
      package: "@react-three/drei",
      topic: "GLB loading",
      apiName: "useGLTF"
    }
  },
  {
    id: "three-lighting-shadows",
    collection: "threejs-core-docs",
    title: "Lighting and shadows",
    url: "https://threejs.org/docs/#manual/en/introduction/How-to-update-things",
    content:
      "DirectionalLight, ambient light, and mesh castShadow/receiveShadow settings are common building blocks for lit scenes. Shadows require a renderer with shadows enabled and objects configured to cast and receive shadows.",
    metadata: {
      package: "three",
      topic: "lighting shadows"
    }
  },
  {
    id: "common-missing-imports",
    collection: "common-errors",
    title: "Common R3F import errors",
    content:
      "If JSX uses hooks such as useFrame or Drei components such as Center, Html, or OrbitControls, import them from @react-three/fiber or @react-three/drei. Type-only Mesh imports should come from three.",
    metadata: {
      topic: "missing imports"
    }
  },
  {
    id: "performance-frame-state",
    collection: "performance-guidelines",
    title: "Avoid React state in per-frame animation",
    content:
      "For per-frame animation in React Three Fiber, prefer refs and useFrame mutations over React state updates. This avoids re-rendering React components on every animation frame.",
    metadata: {
      topic: "performance animation"
    }
  },
  {
    id: "starter-template-scene-file",
    collection: "starter-templates",
    title: "Starter template scene file",
    content:
      "Generated projects keep the main editable 3D implementation in src/scene/Scene.tsx. The app-level Canvas, camera, background, lights, and OrbitControls live in src/App.tsx.",
    metadata: {
      topic: "project structure"
    }
  }
];

export function createRagIndex(chunks: RagChunk[] = seedRagChunks): RagIndex {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    chunks
  };
}

export function searchRagChunks(chunks: RagChunk[], query: string, options: RagSearchOptions = {}): RagChunk[] {
  const limit = options.limit ?? 5;
  const queryTokens = tokenize(query);
  const collectionFilter = new Set(options.collections ?? []);

  if (queryTokens.length === 0) {
    return [];
  }

  return chunks
    .filter((chunk) => collectionFilter.size === 0 || collectionFilter.has(chunk.collection))
    .map((chunk) => ({
      chunk,
      retrieval: scoreChunk(chunk, queryTokens, options)
    }))
    .filter((result) => result.retrieval.score > 0)
    .sort((a, b) => b.retrieval.score - a.retrieval.score || a.chunk.title.localeCompare(b.chunk.title))
    .slice(0, limit)
    .map((result) => ({
      ...result.chunk,
      retrieval: result.retrieval
    }));
}

function scoreChunk(chunk: RagChunk, queryTokens: string[], options: RagSearchOptions): RagRetrievalMetadata {
  const metadataText = Object.entries(chunk.metadata)
    .flatMap(([key, value]) => (value ? [key, String(value)] : []))
    .join(" ");
  const haystack = tokenize(`${chunk.title} ${chunk.collection} ${chunk.content} ${metadataText}`);
  const matchedTerms = new Set<string>();
  const reasons: RagRetrievalReason[] = [];
  let score = 0;
  let lexicalScore = 0;
  let titleBoost = 0;
  let collectionBoost = 0;
  let sceneTypeBoost = 0;
  let patternBoost = 0;
  let failureBoost = 0;

  for (const token of queryTokens) {
    const matches = haystack.filter((candidate) => candidate === token || candidate.includes(token) || token.includes(candidate));
    if (matches.length > 0) {
      lexicalScore += matches.length;
      matchedTerms.add(token);
    }

    if (chunk.title.toLowerCase().includes(token)) {
      titleBoost += 3;
      matchedTerms.add(token);
    }

    if (chunk.collection.toLowerCase().includes(token)) {
      collectionBoost += 2;
      matchedTerms.add(token);
    }

    if (chunk.metadata.sceneType?.toLowerCase().includes(token)) {
      sceneTypeBoost += 4;
      matchedTerms.add(token);
    }

    if (chunk.metadata.pattern?.toLowerCase().includes(token)) {
      patternBoost += 3;
      matchedTerms.add(token);
    }

    if (chunk.metadata.failureMode?.toLowerCase().includes(token)) {
      failureBoost += 2;
      matchedTerms.add(token);
    }
  }

  const matchedTermList = [...matchedTerms];
  const hasStrongLexicalMatch = matchedTermList.length >= 2;
  const allowsExampleContextBoost = hasStrongLexicalMatch || chunk.metadata.sourceKind !== "example";

  score += addReason(reasons, "query-overlap", "query overlap", lexicalScore, summarizeTerms(matchedTermList), options.tuningProfile);
  score += addReason(reasons, "title-match", "title match", titleBoost, undefined, options.tuningProfile);
  score += addReason(reasons, "collection-match", "collection match", collectionBoost, chunk.collection, options.tuningProfile);
  score += addReason(reasons, "scene-type-match", "scene type match", sceneTypeBoost, chunk.metadata.sceneType, options.tuningProfile);
  score += addReason(reasons, "pattern-match", "pattern match", patternBoost, chunk.metadata.pattern, options.tuningProfile);
  score += addReason(reasons, "failure-mode-match", "failure mode match", failureBoost, chunk.metadata.failureMode, options.tuningProfile);

  if (chunk.metadata.sourceKind === "recipe") {
    score += addReason(reasons, "recipe-prior", "recipe", 2, undefined, options.tuningProfile);
  }

  if (chunk.metadata.sourceKind === "example") {
    score += addReason(reasons, "example-prior", "example", 1, undefined, options.tuningProfile);
  }

  if (chunk.metadata.outcome === "accepted") {
    score += addReason(reasons, "accepted-example", "accepted example", 2, undefined, options.tuningProfile);
  }

  if (allowsExampleContextBoost && options.projectId && chunk.metadata.projectId === options.projectId) {
    score += addReason(reasons, "project-match", "same project", 8, undefined, options.tuningProfile);
  }

  if (allowsExampleContextBoost && options.templateId && chunk.metadata.templateId === options.templateId) {
    score += addReason(reasons, "template-match", "same template", 5, chunk.metadata.templateId, options.tuningProfile);
  }

  if (allowsExampleContextBoost && options.projectName && chunk.metadata.projectName) {
    const currentProjectTokens = tokenize(options.projectName);
    const exampleProjectTokens = tokenize(chunk.metadata.projectName);
    const matchingProjectTokens = currentProjectTokens.filter((token) => exampleProjectTokens.includes(token));
    const projectNameBoost = matchingProjectTokens.length * 2;
    score += addReason(
      reasons,
      "project-name-match",
      "project name overlap",
      projectNameBoost,
      summarizeTerms(matchingProjectTokens),
      options.tuningProfile
    );
  }

  const collectionTuningWeight = options.tuningProfile
    ? getCollectionTuningWeight(options.tuningProfile, chunk.collection)
    : 0;
  if (collectionTuningWeight !== 0) {
    score += addReason(
      reasons,
      "collection-tuning",
      collectionTuningWeight > 0 ? "collection boost" : "collection penalty",
      collectionTuningWeight,
      chunk.collection,
      undefined
    );
  }

  return {
    score,
    matchedTerms: matchedTermList.slice(0, 6),
    reasons: reasons.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
  };
}

function tokenize(value: string): string[] {
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "are",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "up",
    "with",
    "as",
    "your",
    "you",
    "make",
    "create"
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9@/-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopwords.has(token));
}

function addReason(
  reasons: RagRetrievalReason[],
  code: RagRetrievalReasonCode,
  label: string,
  weight: number,
  detail?: string,
  tuningProfile?: RagRetrievalTuningProfile
): number {
  const adjustedWeight = applyReasonAdjustment(weight, code, tuningProfile);

  if (adjustedWeight === 0) {
    return 0;
  }

  reasons.push({
    code,
    label,
    weight: adjustedWeight,
    detail
  });

  return adjustedWeight;
}

function summarizeTerms(tokens: string[]): string | undefined {
  if (tokens.length === 0) {
    return undefined;
  }

  return tokens.slice(0, 4).join(", ");
}

function applyReasonAdjustment(weight: number, code: RagRetrievalReasonCode, tuningProfile?: RagRetrievalTuningProfile): number {
  if (weight === 0) {
    return 0;
  }

  const multiplier = tuningProfile?.reasonAdjustments.find((adjustment) => adjustment.code === code)?.multiplier ?? 1;
  const adjustedWeight = weight * multiplier;

  if (adjustedWeight > 0) {
    return Math.max(0.5, roundWeight(adjustedWeight));
  }

  return Math.min(-0.5, roundWeight(adjustedWeight));
}

function getCollectionTuningWeight(tuningProfile: RagRetrievalTuningProfile, collection: string): number {
  const adjustment = tuningProfile.collectionAdjustments.find((entry) => entry.collection === collection);
  return adjustment ? roundWeight(adjustment.weight) : 0;
}

function roundWeight(value: number): number {
  return Math.round(value * 10) / 10;
}
