export const TITLE = "DigiAI-Pet";

export type PetLine = "pumpkin" | "luminamon";

export interface EvolutionStageInfo {
  stage: number;
  level: string;
  name: string;
  attribute: string;
  type: string;
  sprite: string;
  min_age: number;
  min_learning: number;
  min_actions: number;
}

// Primary Digimon Evolution Tree built from the /assets folder
export const PUMPKIN_EVOLUTION_LINE: EvolutionStageInfo[] = [
  {
    stage: 0,
    level: "Stage 0 · Digi-Egg",
    name: "Seedmon",
    attribute: "Data",
    type: "Seed Egg",
    sprite: "/assets/Seedmon.png",
    min_age: 0,
    min_learning: 0,
    min_actions: 0,
  },
  {
    stage: 1,
    level: "Stage 1 · In-Training",
    name: "Sproutmon",
    attribute: "Data",
    type: "Seedling",
    sprite: "/assets/sproutmon.png",
    min_age: 0,
    min_learning: 0,
    min_actions: 0,
  },
  {
    stage: 2,
    level: "Stage 2 · Rookie",
    name: "Pumpkinmon",
    attribute: "Data",
    type: "Puppet",
    sprite: "/assets/pumpkinmon.png",
    min_age: 45,
    min_learning: 18,
    min_actions: 3,
  },
  {
    stage: 3,
    level: "Stage 3 · Champion",
    name: "Lanternmon",
    attribute: "Virus",
    type: "Phantom",
    sprite: "/assets/lanternmon.png",
    min_age: 120,
    min_learning: 36,
    min_actions: 6,
  },
  {
    stage: 4,
    level: "Stage 4 · Ultimate",
    name: "Gourdramon",
    attribute: "Vaccine",
    type: "Flame Golem",
    sprite: "/assets/gourdramon.png",
    min_age: 220,
    min_learning: 58,
    min_actions: 10,
  },
  {
    stage: 5,
    level: "Stage 5 · Mega",
    name: "Samhainmon",
    attribute: "Data",
    type: "Harvest Lord",
    sprite: "/assets/samhainmon.png",
    min_age: 340,
    min_learning: 82,
    min_actions: 15,
  },
];

// Secondary Luminamon Evolution Tree from /assets folder
export const LUMINAMON_EVOLUTION_LINE: EvolutionStageInfo[] = [
  {
    stage: 0,
    level: "Stage 0 · Digi-Egg",
    name: "Seedmon",
    attribute: "Vaccine",
    type: "Light Egg",
    sprite: "/assets/Seedmon.png",
    min_age: 0,
    min_learning: 0,
    min_actions: 0,
  },
  {
    stage: 1,
    level: "Stage 1 · In-Training",
    name: "Puwamon",
    attribute: "Vaccine",
    type: "Slime",
    sprite: "/assets/puwamon.png",
    min_age: 0,
    min_learning: 0,
    min_actions: 0,
  },
  {
    stage: 2,
    level: "Stage 2 · Rookie",
    name: "Luminamon",
    attribute: "Vaccine",
    type: "Holy Beast",
    sprite: "/assets/luminamon.png",
    min_age: 45,
    min_learning: 18,
    min_actions: 3,
  },
  {
    stage: 3,
    level: "Stage 3 · Champion",
    name: "Solarmon",
    attribute: "Vaccine",
    type: "Holy Knight",
    sprite: "/assets/solarmon.png",
    min_age: 130,
    min_learning: 42,
    min_actions: 7,
  },
  {
    stage: 4,
    level: "Stage 4 · Ultimate",
    name: "Aethelmon",
    attribute: "Vaccine",
    type: "Archangel",
    sprite: "/assets/aethelmon.png",
    min_age: 240,
    min_learning: 70,
    min_actions: 12,
  },
];

export function getEvolutionLine(line: PetLine): EvolutionStageInfo[] {
  return line === "luminamon" ? LUMINAMON_EVOLUTION_LINE : PUMPKIN_EVOLUTION_LINE;
}

export const DECAY = {
  hunger: 0.011,
  cleanliness: 0.007,
  happiness: 0.004,
  energy: 0.0035,
  health: 0.04,
  stamina: 0.05,
} as const;

export const CRITICAL = 25;
export const LOW = 40;
export const GOOD = 70;

export const SAVE_STORAGE_KEY = "digipet_save_v2";
