export const HIGH_TIER_RARITIES = ["Legendary", "Chroma", "Mystical", "Unique", "Iridescent"];

export function isHighTierRarity(rarity: string | undefined | null): boolean {
  return !!rarity && HIGH_TIER_RARITIES.includes(rarity);
}

/** Blooks whose artwork continuously cycles through rainbow colors (CSS hue-rotate). */
// (Rainbow Astronaut now uses an animated webp instead of a CSS hue-rotate,
// so the visor keeps its normal tint while the suit cycles colors.)
const RAINBOW_BLOOKS: string[] = [];

/** Blooks that gently bob up and down, matching their Blooket animation. */
// (Phantom King's artwork is an animated webp with its own motion baked in.)
const FLOAT_BLOOKS: string[] = ["Spooky Ghost"];

/** Extra className for blook images that should animate (e.g. floating mysticals). */
export function blookImageAnimation(name: string | undefined | null): string {
  if (!name) return "";
  if (RAINBOW_BLOOKS.includes(name)) return "animate-rainbow";
  if (FLOAT_BLOOKS.includes(name)) return "animate-blook-float";
  return "";
}

/** Blook images no longer get a rarity glow (kept for API compatibility). */
export function rarityGlow(_rarity: string | undefined | null, _color: string | undefined | null): string | undefined {
  return undefined;
}
