import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { RagChunk } from "@ai-threejs-studio/shared";
import { createRagIndex, seedRagChunks } from "../packages/rag/src/index.js";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const outputPath = path.resolve(repoRoot, process.env.STUDIO_RAG_INDEX ?? ".studio/rag-index.json");
const recipeDir = path.resolve(repoRoot, "docs/threejs-recipes");

const recipeSceneTypes: Record<string, string> = {
  "camera-framing": "camera-framing",
  "capability-environment-atmosphere": "environment-atmosphere",
  "capability-instancing-patterns": "instancing",
  "capability-particle-fields": "particles",
  "capability-postprocessing": "postprocessing",
  "capability-reflective-surfaces": "reflective-surfaces",
  "capability-shader-displacement": "shader-displacement",
  "lighting-rigs": "lighting",
  "material-palettes": "materials",
  "model-viewer": "model-viewer",
  "planner-layout": "interactive-layout-planning",
  "product-stage": "product-stage",
  "room-gallery": "room-gallery"
};

const recipePatterns: Record<string, string> = {
  "camera-framing": "composition and subject framing",
  "capability-environment-atmosphere": "sky, fog, dusk, and background atmosphere",
  "capability-instancing-patterns": "repeated geometry and instancing performance",
  "capability-particle-fields": "points, particles, and floating field composition",
  "capability-postprocessing": "composer effects, bloom, and final image polish",
  "capability-reflective-surfaces": "mirrors, floors, and reflective staging",
  "capability-shader-displacement": "animated surfaces and shader-driven motion",
  "lighting-rigs": "lighting rigs and readability",
  "material-palettes": "material styling and contrast",
  "model-viewer": "asset presentation and fallback behavior",
  "planner-layout": "layout planning, grids, and editable zone arrangement",
  "product-stage": "product staging and hero composition",
  "room-gallery": "interior layout and wall composition"
};

async function main(): Promise<void> {
  const recipeChunks = await loadRecipeChunks();
  const index = createRagIndex([...seedRagChunks, ...recipeChunks]);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(index, null, 2), "utf8");

  console.log(
    `Wrote ${index.chunks.length} RAG chunks to ${path.relative(repoRoot, outputPath)} ` +
      `(${seedRagChunks.length} seed, ${recipeChunks.length} recipe)`
  );
}

async function loadRecipeChunks(): Promise<RagChunk[]> {
  const entries = await safeReadDir(recipeDir);
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
  const chunks: RagChunk[] = [];

  for (const fileName of files) {
    const filePath = path.join(recipeDir, fileName);
    const markdown = await fs.readFile(filePath, "utf8");
    const slug = fileName.replace(/\.md$/i, "");
    const title = extractTitle(markdown) ?? humanizeSlug(slug);
    const sections = splitMarkdownSections(markdown);
    const baseMetadata = {
      sourceKind: "recipe" as const,
      sceneType: recipeSceneTypes[slug] ?? slug,
      pattern: recipePatterns[slug] ?? humanizeSlug(slug),
      filePath: path.relative(repoRoot, filePath)
    };

    const intro = extractIntro(markdown);
    if (intro) {
      chunks.push({
        id: `recipe-${slug}-overview`,
        collection: "threejs-recipes",
        title: `${title} overview`,
        content: intro,
        metadata: {
          ...baseMetadata,
          topic: "overview"
        }
      });
    }

    for (const section of sections) {
      chunks.push({
        id: `recipe-${slug}-${slugify(section.heading)}`,
        collection: "threejs-recipes",
        title: `${title}: ${section.heading}`,
        content: section.body,
        metadata: {
          ...baseMetadata,
          topic: section.heading.toLowerCase(),
          failureMode: section.heading.toLowerCase().includes("failure") ? summarizeFailureMode(section.body) : undefined
        }
      });
    }
  }

  return chunks;
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function extractIntro(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const introLines: string[] = [];
  let started = false;

  for (const line of lines) {
    if (!started) {
      if (line.startsWith("# ")) {
        started = true;
      }
      continue;
    }

    if (line.startsWith("## ")) {
      break;
    }

    if (line.trim()) {
      introLines.push(line.trim());
    }
  }

  return introLines.join(" ").trim();
}

function splitMarkdownSections(markdown: string): Array<{ heading: string; body: string }> {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];

  return matches
    .map((match, index) => {
      const heading = match[1]?.trim() ?? "Section";
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? markdown.length;
      const body = markdown
        .slice(start + match[0].length, end)
        .trim()
        .replace(/\n{2,}/g, "\n\n");

      return {
        heading,
        body
      };
    })
    .filter((section) => section.body.length > 0);
}

function summarizeFailureMode(content: string): string {
  const sentence = content
    .replace(/\s+/g, " ")
    .split(/[.!?]/)
    .map((part) => part.trim())
    .find(Boolean);

  return sentence ?? "scene quality failure";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function safeReadDir(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

await main();
