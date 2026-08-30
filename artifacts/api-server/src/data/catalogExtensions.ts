import {
  BADGES,
  BLOOKS,
  PACKS,
  type BadgeDefData,
  type BlookDefData,
  type PackDefData,
} from "./blacketData";

const BUG_PACK: PackDefData = {
  name: "Bug",
  price: 25,
  color1: "#67c96b",
  color2: "#123b47",
  image: "/api/content/packs/Bug%20Pack.webp?v=2",
  blooks: ["Ant", "Rhino Beetle", "Ladybug", "Fly", "Worm", "Bee", "Mantis", "Butterfly", "Blue Butterfly", "Spring Butterfly"],
};

const BUG_BLOOKS: BlookDefData[] = [
  // Chances sum to exactly 100 (rollPack invariant): the Mystical's 0.005 comes out of Ant.
  { name: "Ant", rarity: "Uncommon", chance: 19.62, price: 5, image: "/api/content/blooks/Ant.svg?v=2", pack: "Bug" },
  { name: "Rhino Beetle", rarity: "Uncommon", chance: 19.625, price: 5, image: "/api/content/blooks/Rhino%20Beetle.svg?v=2", pack: "Bug" },
  { name: "Ladybug", rarity: "Uncommon", chance: 19.625, price: 5, image: "/api/content/blooks/Ladybug.svg?v=2", pack: "Bug" },
  { name: "Fly", rarity: "Uncommon", chance: 19.625, price: 5, image: "/api/content/blooks/Fly.svg?v=2", pack: "Bug" },
  { name: "Worm", rarity: "Rare", chance: 9, price: 20, image: "/api/content/blooks/Worm.svg?v=2", pack: "Bug" },
  { name: "Bee", rarity: "Rare", chance: 9, price: 20, image: "/api/content/blooks/Bee.svg?v=2", pack: "Bug" },
  { name: "Mantis", rarity: "Epic", chance: 2.97, price: 75, image: "/api/content/blooks/Mantis.svg?v=2", pack: "Bug" },
  { name: "Butterfly", rarity: "Legendary", chance: 0.5, price: 200, image: "/api/content/blooks/Butterfly.svg?v=2", pack: "Bug" },
  { name: "Blue Butterfly", rarity: "Chroma", chance: 0.03, price: 300, image: "/api/content/blooks/Blue%20Butterfly.svg?v=2", pack: "Bug" },
  { name: "Spring Butterfly", rarity: "Mystical", chance: 0.005, price: 1000, image: "/api/content/blooks/Spring%20Butterfly.webp", pack: "Bug" },
];

const TECH_PACK: PackDefData = {
  name: "Tech",
  price: 25,
  color1: "#8f7ff0",
  color2: "#241d4f",
  image: "/api/content/packs/Tech.webp?v=3",
  blooks: ["Monitor", "Microsoft", "Laptop", "Error", "Glitch Man", "Camera Drone", "Hacker Kid", "Nintendo Switch"],
};

const TECH_BLOOKS: BlookDefData[] = [
  // Chances sum to exactly 100 (rollPack invariant).
  { name: "Monitor", rarity: "Uncommon", chance: 36.85, price: 5, image: "/api/content/blooks/Moniter.webp", pack: "Tech" },
  { name: "Microsoft", rarity: "Uncommon", chance: 36.85, price: 5, image: "/api/content/blooks/Microsoft.webp", pack: "Tech" },
  { name: "Laptop", rarity: "Rare", chance: 11, price: 20, image: "/api/content/blooks/Laptop.webp?v=4", pack: "Tech" },
  { name: "Error", rarity: "Rare", chance: 11, price: 20, image: "/api/content/blooks/Error.webp?v=3", pack: "Tech" },
  { name: "Glitch Man", rarity: "Epic", chance: 3.5, price: 75, image: "/api/content/blooks/Glitch%20Man.webp", pack: "Tech" },
  { name: "Camera Drone", rarity: "Legendary", chance: 0.745, price: 200, image: "/api/content/blooks/Camera%20Drone.webp", pack: "Tech" },
  { name: "Hacker Kid", rarity: "Chroma", chance: 0.05, price: 300, image: "/api/content/blooks/Hacker%20Kid.webp", pack: "Tech" },
  { name: "Nintendo Switch", rarity: "Mystical", chance: 0.005, price: 1000, image: "/api/content/blooks/Nintendo%20Switch.webp?v=3", pack: "Tech" },
];

// The limited gamble pack was renamed "Top" -> "1k". Historical DB rows keep
// the old name (see LEGACY_TOP_PACK in lib/game.ts); the sold-out state and
// app_settings keys are untouched by the rename.
const RENAMED_PACKS: PackDefData[] = PACKS.map((pack) =>
  pack.name === "Top" ? { ...pack, name: "1k" } : pack,
);

const aquaticIndex = RENAMED_PACKS.findIndex((pack) => pack.name === "Aquatic");

// Keep custom catalog additions separate from the generated source data.
const BASE_PACKS: PackDefData[] =
  aquaticIndex < 0
    ? [...RENAMED_PACKS, BUG_PACK]
    : [...RENAMED_PACKS.slice(0, aquaticIndex + 1), BUG_PACK, ...RENAMED_PACKS.slice(aquaticIndex + 1)];

// Tech leads the regular lineup: right after the limited "1k" gamble pack, else first.
const topIndex = BASE_PACKS.findIndex((pack) => pack.name === "1k");
export const CATALOG_PACKS: PackDefData[] = [
  ...BASE_PACKS.slice(0, topIndex + 1),
  TECH_PACK,
  ...BASE_PACKS.slice(topIndex + 1),
];

export const CATALOG_BLOOKS: BlookDefData[] = [...BLOOKS, ...BUG_BLOOKS, ...TECH_BLOOKS];

export const CATALOG_BADGES: BadgeDefData[] = [
  ...BADGES,
  {
    name: "Admin",
    image: "/api/content/badges/badge_admin_v4.png?v=4",
    description: "Cloaket administrator",
  },
  {
    name: "Cloaket+",
    image: "/api/content/badges/badge_cloaket_plus.png?v=2",
    description: "Owns the Starter Bundle",
  },
];