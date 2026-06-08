// Prompt-composer data: presets and modifiers append rich, agent-friendly
// guidance to the user's base prompt. Pure client-side — the composed string is
// what gets sent to the Scene3D agent, so no backend change is needed.

export interface PromptOption {
  id: string;
  label: string;
  guidance: string;
}

export const STYLE_PRESETS: PromptOption[] = [
  { id: "lowpoly", label: "Low poly", guidance: "low-poly flat-shaded geometry with few segments, faceted surfaces, and bold flat colors" },
  { id: "realistic", label: "Realistic", guidance: "physically-based realistic materials with accurate roughness and metalness and soft realistic lighting" },
  { id: "toon", label: "Stylized", guidance: "a stylized toon look with bright saturated colors and soft even lighting" },
  { id: "neon", label: "Neon", guidance: "a dark scene with glowing neon emissive accents and colored point lights" },
  { id: "minimal", label: "Minimal", guidance: "a minimalist composition with few objects, a neutral palette, and clean soft lighting" },
  { id: "clay", label: "Clay", guidance: "soft matte clay-like materials with rounded forms and pastel colors" },
  { id: "wireframe", label: "Wireframe", guidance: "a wireframe blueprint aesthetic with visible edges on a dark background" }
];

export const MODIFIERS: PromptOption[] = [
  { id: "dawn", label: "Dawn", guidance: "warm soft dawn lighting" },
  { id: "dusk", label: "Dusk", guidance: "moody dusk lighting with long shadows" },
  { id: "night", label: "Night", guidance: "a dark night scene with cool moonlight" },
  { id: "dramatic", label: "Dramatic", guidance: "dramatic high-contrast lighting" },
  { id: "cozy", label: "Cozy", guidance: "a warm cozy atmosphere" },
  { id: "foggy", label: "Foggy", guidance: "soft atmospheric fog" }
];

export const EXAMPLE_PROMPTS: string[] = [
  "a glowing crystal floating above a stone pedestal",
  "a cozy reading nook with a warm lamp",
  "a low-poly floating island with trees",
  "a retro arcade machine in a dark room",
  "a small zen garden with raked sand and three stones"
];

export function composePrompt(base: string, styleId: string | null, modifierIds: string[]): string {
  const parts = [base.trim()];
  const style = STYLE_PRESETS.find((preset) => preset.id === styleId);
  if (style) {
    parts.push(`Style: ${style.guidance}`);
  }
  const mods = MODIFIERS.filter((modifier) => modifierIds.includes(modifier.id)).map((modifier) => modifier.guidance);
  if (mods.length > 0) {
    parts.push(`Atmosphere: ${mods.join(", ")}`);
  }
  return parts.filter(Boolean).join(". ");
}
