import {
  CRITICAL,
  DECAY,
  EvolutionStageInfo,
  getEvolutionLine,
  GOOD,
  LOW,
  PetLine,
  SAVE_STORAGE_KEY,
} from "./config";
import {
  createDefaultAiMemory,
  InteractionStimulus,
  PetEmotion,
  TinyAiMemory,
  TinyPetBrain,
} from "./tinyAi";
import type { WeatherKind } from "./weather";

export type PetMood = PetEmotion;
export type LifePhase = "egg" | "naming" | "pet";
export type PlaygroundActivity = "idle" | "walk" | "swing" | "sandbox" | "bushes" | "tree" | "sleep";
export type EyeFxKind =
  | "none"
  | "blink"
  | "happy_arcs"
  | "hearts"
  | "sparkles"
  | "sweat"
  | "dizzy"
  | "sleep_z"
  | "curious"
  | "angry_brows"
  | "scared_wide"
  | "sad_tears"
  | "wondering_stars";

export interface PetState {
  line: PetLine;
  life_phase: LifePhase;
  egg_warmth: number;
  name: string;
  evolution_stage: number;
  hunger: number;
  cleanliness: number;
  happiness: number;
  energy: number;
  health: number;
  stamina: number;
  learning: number;
  speed: number;
  age_seconds: number;
  total_feedings: number;
  total_plays: number;
  total_trains: number;
  is_sick: boolean;
  is_sleeping: boolean;
  mood: PetMood;
  ai_memory: TinyAiMemory;
  born_at: number;
  hatched_at: number | null;
  named_at: number | null;
  evolution_timestamps: Record<number, number>;
  last_update: number;
}

export const PLAYGROUND_SPOTS: Record<
  "swing" | "sandbox" | "bushes" | "tree",
  { x: number; z: number; label: string }
> = {
  swing: { x: 4.8, z: -2.6, label: "Swinger" },
  sandbox: { x: -4.6, z: 2.2, label: "Sandbox" },
  bushes: { x: 4.5, z: 3.1, label: "Garden Bushes" },
  tree: { x: -5.2, z: -3.2, label: "Climbable Tree" },
};

export function createDefaultPetState(line: PetLine = "pumpkin"): PetState {
  const now = Date.now();
  const stages = getEvolutionLine(line);
  return {
    line,
    life_phase: "egg",
    egg_warmth: 0,
    name: stages[0].name,
    evolution_stage: 0,
    hunger: 85.0,
    cleanliness: 90.0,
    happiness: 80.0,
    energy: 92.0,
    health: 98.0,
    stamina: 85.0,
    learning: 10.0,
    speed: 10.0,
    age_seconds: 0.0,
    total_feedings: 0,
    total_plays: 0,
    total_trains: 0,
    is_sick: false,
    is_sleeping: false,
    mood: "happy",
    ai_memory: createDefaultAiMemory(),
    born_at: now,
    hatched_at: null,
    named_at: null,
    evolution_timestamps: { 0: now },
    last_update: now / 1000,
  };
}

export function emotionToEyeFx(emotion: PetEmotion): EyeFxKind {
  switch (emotion) {
    case "happy":
      return "happy_arcs";
    case "sad":
      return "sad_tears";
    case "angry":
      return "angry_brows";
    case "scared":
      return "scared_wide";
    case "tired":
      return "sweat";
    case "wondering":
      return "wondering_stars";
    case "sick":
      return "dizzy";
    default:
      return "none";
  }
}

export class Pet {
  state: PetState;
  brain: TinyPetBrain;
  worldX = 0.0;
  worldZ = 0.6;
  vx = 0.0;
  vz = 0.0;
  facingRight = true;
  targetX: number | null = null;
  targetZ: number | null = null;
  pendingActivity: PlaygroundActivity | null = null;
  activity: PlaygroundActivity = "idle";
  activityTimer = 0.0;
  swingPhase = 0.0;

  actionCooldown = 0.0;
  needIcon: string | null = null;
  needIconTimer = 0.0;
  eyeFx: EyeFxKind = "none";
  eyeFxTimer = 0.0;
  emotionOverrideTimer = 0.0;
  blinkCooldown = 2.8;
  currentWeather: WeatherKind = "sunny";

  private _pendingEvolution: EvolutionStageInfo | null = null;
  private _pendingHatch = false;

  constructor(state?: Partial<PetState>) {
    const line: PetLine = state?.line === "luminamon" ? "luminamon" : "pumpkin";
    this.state = { ...createDefaultPetState(line), ...state };
    this.brain = new TinyPetBrain(this.state.ai_memory);
    this.state.ai_memory = this.brain.memory;
    const stages = getEvolutionLine(this.state.line);
    this.state.evolution_stage = Math.max(0, Math.min(stages.length - 1, this.state.evolution_stage));
  }

  getEvolutionLine(): EvolutionStageInfo[] {
    return getEvolutionLine(this.state.line);
  }

  getEvolutionInfo(): EvolutionStageInfo {
    const stages = this.getEvolutionLine();
    const idx = Math.max(0, Math.min(stages.length - 1, this.state.evolution_stage));
    return stages[idx];
  }

  getNextEvolutionInfo(): EvolutionStageInfo | null {
    const stages = this.getEvolutionLine();
    const nextIdx = this.state.evolution_stage + 1;
    return nextIdx < stages.length ? stages[nextIdx] : null;
  }

  warmEgg(amount = 34): boolean {
    if (this.state.life_phase !== "egg") return false;
    this.state.egg_warmth = Math.min(100, this.state.egg_warmth + amount);
    this.triggerEyeFx("hearts", 1.2);
    if (this.state.egg_warmth >= 100) {
      this.hatch();
      return true;
    }
    return false;
  }

  hatch(): void {
    if (this.state.life_phase !== "egg") return;
    const stages = this.getEvolutionLine();
    const now = Date.now();
    this.state.life_phase = "naming";
    this.state.egg_warmth = 100;
    this.state.evolution_stage = 1;
    this.state.name = stages[1].name;
    this.state.hatched_at = now;
    this.state.evolution_timestamps = {
      ...this.state.evolution_timestamps,
      1: now,
    };
    this._pendingHatch = true;
    this.triggerEyeFx("sparkles", 2.5);
  }

  confirmName(rawName: string): void {
    const stages = this.getEvolutionLine();
    const trimmed = rawName.trim();
    this.state.name = trimmed.length > 0 ? trimmed.slice(0, 18) : stages[1].name;
    this.state.life_phase = "pet";
    this.state.named_at = Date.now();
    this.setEmotion("happy", 3.0);
  }

  consumeHatchEvent(): boolean {
    const v = this._pendingHatch;
    this._pendingHatch = false;
    return v;
  }

  triggerEyeFx(kind: EyeFxKind, duration = 2.0): void {
    this.eyeFx = kind;
    this.eyeFxTimer = duration;
  }

  setEmotion(emotion: PetEmotion, duration = 4.5): void {
    this.state.mood = emotion;
    this.emotionOverrideTimer = duration;
    const fx = emotionToEyeFx(emotion);
    if (fx !== "none") {
      this.triggerEyeFx(fx, Math.min(duration, 3.2));
    }
  }

  applyAiStimulus(stimulus: InteractionStimulus): {
    emotion: PetEmotion;
    reactionText: string;
  } {
    const result = this.brain.evaluateInteraction(stimulus, {
      weather: this.currentWeather,
      energy: this.state.energy,
      happiness: this.state.happiness,
      hunger: this.state.hunger,
      isSick: this.state.is_sick,
      currentEmotion: this.state.mood,
    });
    this.state.ai_memory = this.brain.memory;
    this.state.happiness = Math.max(0, Math.min(100, this.state.happiness + result.happinessDelta));
    this.setEmotion(result.emotion, 5.0);
    return {
      emotion: result.emotion,
      reactionText: result.reactionText,
    };
  }

  handlePettingHand(isRough: boolean): { emotion: PetEmotion; message: string } {
    if (this.state.life_phase === "egg") {
      const hatched = this.warmEgg(isRough ? 18 : 34);
      return {
        emotion: "happy",
        message: hatched
          ? "The Digi-Egg is hatching!"
          : `Warmed the Digi-Egg (${Math.round(this.state.egg_warmth)}%)`,
      };
    }
    if (this.state.life_phase !== "pet") {
      return { emotion: this.state.mood, message: "" };
    }
    const res = this.applyAiStimulus(isRough ? "rough_poke" : "gentle_stroke");
    if (!isRough) {
      this.triggerEyeFx(res.emotion === "wondering" ? "wondering_stars" : "hearts", 2.2);
    }
    return {
      emotion: res.emotion,
      message: `${this.state.name}: ${res.reactionText}`,
    };
  }

  onWeatherChanged(weather: WeatherKind): string | null {
    this.currentWeather = weather;
    if (this.state.life_phase !== "pet" || this.state.is_sleeping) return null;
    const res = this.applyAiStimulus("weather_shift");
    // In rain, pet might seek shelter under the tree automatically
    if (weather === "rain" && this.activity !== "tree" && Math.random() < 0.6) {
      this.sendToPlayground("tree");
    }
    return `${this.state.name}: ${res.reactionText}`;
  }

  onThunderStrike(): string | null {
    if (this.state.life_phase !== "pet" || this.state.is_sleeping) return null;
    if (this.activity === "tree") {
      return null; // Sheltered under tree
    }
    const res = this.applyAiStimulus("thunder");
    return `${this.state.name}: ${res.reactionText}`;
  }

  checkEvolution(): EvolutionStageInfo | null {
    if (this.state.life_phase !== "pet") return null;
    if (this.state.is_sick || this.state.health < 50.0) return null;

    const nextStage = this.getNextEvolutionInfo();
    if (!nextStage) return null;

    const totalActions =
      this.state.total_feedings + this.state.total_plays + this.state.total_trains;
    if (
      this.state.age_seconds >= nextStage.min_age &&
      this.state.learning >= nextStage.min_learning &&
      totalActions >= nextStage.min_actions
    ) {
      this.state.evolution_stage = nextStage.stage;
      this.state.evolution_timestamps = {
        ...this.state.evolution_timestamps,
        [nextStage.stage]: Date.now(),
      };
      this.state.happiness = Math.min(100.0, this.state.happiness + 20.0);
      this.state.health = Math.min(100.0, this.state.health + 15.0);
      this.state.stamina = Math.min(100.0, this.state.stamina + 20.0);
      this.needIcon = "learn";
      this.needIconTimer = 3.0;
      this._pendingEvolution = nextStage;
      this.setEmotion("happy", 4.0);
      this.triggerEyeFx("sparkles", 3.0);
      return nextStage;
    }
    return null;
  }

  consumeEvolutionEvent(): EvolutionStageInfo | null {
    const ev = this._pendingEvolution;
    this._pendingEvolution = null;
    return ev;
  }

  sendToPlayground(spot: "swing" | "sandbox" | "bushes" | "tree"): string {
    if (this.state.life_phase !== "pet") return "Wait until your pet is hatched and named!";
    if (this.state.is_sleeping) return "Shh... sleeping right now.";
    const dest = PLAYGROUND_SPOTS[spot];
    this.activity = "walk";
    this.targetX = dest.x;
    this.targetZ = dest.z;
    this.pendingActivity = spot;
    this.setEmotion("wondering", 2.8);
    if (spot === "swing") {
      return this.currentWeather === "snow"
        ? "Braving the snowy breeze on the Swinger!"
        : `Heading to the ${dest.label}!`;
    }
    if (spot === "sandbox") {
      return this.currentWeather === "rain"
        ? "Splashing in muddy rain puddles in the Sandbox!"
        : this.currentWeather === "snow"
        ? "Building a snowy sandcastle!"
        : `Running to play in the ${dest.label}!`;
    }
    if (spot === "bushes") {
      return this.currentWeather === "snow"
        ? "Shaking snow off the Garden Bushes!"
        : `Exploring the ${dest.label}!`;
    }
    return this.currentWeather === "rain"
      ? "Taking shelter under the Tree canopy!"
      : `Heading over to climb the ${dest.label}!`;
  }

  petInteraction(): string {
    const res = this.handlePettingHand(false);
    return res.message;
  }

  update(dt: number, weather: WeatherKind = this.currentWeather): void {
    this.currentWeather = weather;
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.needIconTimer = Math.max(0, this.needIconTimer - dt);
    if (this.needIconTimer <= 0) this.needIcon = null;

    this.emotionOverrideTimer = Math.max(0, this.emotionOverrideTimer - dt);
    this.eyeFxTimer = Math.max(0, this.eyeFxTimer - dt);
    if (this.eyeFxTimer <= 0) {
      this.eyeFx = "none";
    }

    // Periodic natural blink
    this.blinkCooldown -= dt;
    if (this.blinkCooldown <= 0) {
      if (this.eyeFx === "none" && !this.state.is_sleeping) {
        this.eyeFx = "blink";
        this.eyeFxTimer = 0.16;
      }
      this.blinkCooldown = 2.4 + Math.random() * 2.8;
    }

    if (this.state.life_phase === "egg") {
      const sunBoost = weather === "sunny" ? 13.5 : weather === "snow" ? 6.5 : 9.0;
      this.state.egg_warmth = Math.min(100, this.state.egg_warmth + sunBoost * dt);
      if (this.state.egg_warmth >= 100) {
        this.hatch();
      }
      return;
    }

    if (this.state.life_phase === "naming") {
      return;
    }

    this.state.age_seconds += dt;
    this.state.last_update = Date.now() / 1000;

    if (this.state.is_sleeping) {
      this.activity = "sleep";
      this.vx = 0;
      this.vz = 0;
      this.state.mood = "tired";
      this.eyeFx = "sleep_z";
      this.eyeFxTimer = 0.5;
      this.state.energy = Math.min(100, this.state.energy + 8.0 * dt);
      this.state.health = Math.min(100, this.state.health + 1.5 * dt);
      this.state.stamina = Math.min(100, this.state.stamina + 3.0 * dt);
      if (this.state.energy >= 95.0) {
        this.state.is_sleeping = false;
        this.activity = "idle";
        this._setMood();
      }
      return;
    }

    // Natural decay
    for (const [key, rate] of Object.entries(DECAY) as Array<[keyof typeof DECAY, number]>) {
      if (key === "health") {
        if (this.state.is_sick || this._anyCritical()) {
          this.state.health = Math.max(0, this.state.health - rate * dt);
        }
      } else {
        this.state[key] = Math.max(0, this.state[key] - rate * dt);
      }
    }

    // Weather-driven environmental modifiers
    if (weather === "sunny") {
      this.state.happiness = Math.min(100, this.state.happiness + 0.16 * dt);
    } else if (weather === "rain") {
      if (this.activity === "tree") {
        // Cozy shelter under tree
        this.state.happiness = Math.min(100, this.state.happiness + 0.18 * dt);
      } else {
        this.state.happiness = Math.max(0, this.state.happiness - 0.14 * dt);
        if (this.activity === "sandbox") {
          this.state.cleanliness = Math.max(0, this.state.cleanliness - 0.45 * dt);
        }
      }
    } else if (weather === "snow") {
      this.state.energy = Math.max(0, this.state.energy - 0.18 * dt);
      if (this.activity === "bushes" || this.activity === "sandbox") {
        this.state.happiness = Math.min(100, this.state.happiness + 0.12 * dt);
      }
    }

    // Sickness check
    if (!this.state.is_sick && this._shouldGetSick(dt)) {
      this.state.is_sick = true;
      this.needIcon = "sick";
      this.needIconTimer = 4.0;
      this.triggerEyeFx("dizzy", 3.0);
    }

    if (this.state.is_sick) {
      this.state.happiness = Math.max(0, this.state.happiness - 1.2 * dt);
      this.state.stamina = Math.max(0, this.state.stamina - 0.8 * dt);
      this.vx = 0;
      this.vz = 0;
      this.activity = "idle";
      this._setMood();
      return;
    }

    this.checkEvolution();
    if (this.emotionOverrideTimer <= 0) {
      this._setMood();
    }
    this._updatePlaygroundBehavior(dt);
  }

  private _anyCritical(): boolean {
    return (
      this.state.hunger < CRITICAL ||
      this.state.cleanliness < CRITICAL ||
      this.state.happiness < CRITICAL ||
      this.state.energy < CRITICAL
    );
  }

  private _shouldGetSick(dt: number): boolean {
    const scale = dt * 60;
    if (this.state.health < 40) return Math.random() < 0.002 * scale;
    if (this._anyCritical()) return Math.random() < 0.0008 * scale;
    return false;
  }

  private _setMood(): void {
    const s = this.state;
    if (s.is_sick) s.mood = "sick";
    else if (s.energy < CRITICAL) s.mood = "tired";
    else if (s.hunger < CRITICAL) s.mood = "hungry";
    else if (s.happiness < LOW) s.mood = "sad";
    else if (s.happiness > GOOD && s.energy > GOOD) s.mood = "happy";
    else s.mood = "neutral";
  }

  private _updatePlaygroundBehavior(dt: number): void {
    if (
      this.activity === "swing" ||
      this.activity === "sandbox" ||
      this.activity === "bushes" ||
      this.activity === "tree"
    ) {
      this.activityTimer -= dt;
      this.vx = 0;
      this.vz = 0;
      if (this.activity === "swing") {
        this.swingPhase += dt * (this.currentWeather === "snow" ? 2.2 : 3.0);
        this.state.happiness = Math.min(100, this.state.happiness + 1.1 * dt);
      } else if (this.activity === "sandbox") {
        this.state.happiness = Math.min(100, this.state.happiness + 0.9 * dt);
      } else if (this.activity === "bushes") {
        this.state.happiness = Math.min(100, this.state.happiness + 0.9 * dt);
      }
      if (this.activityTimer <= 0) {
        this.activity = "idle";
        this.swingPhase = 0;
        this.targetX = (Math.random() - 0.5) * 6;
        this.targetZ = (Math.random() - 0.5) * 4;
      }
      return;
    }

    if (this.targetX === null || this.targetZ === null) {
      if (Math.random() < 0.014 * dt * 60) {
        const roll = Math.random();
        if (roll < 0.58) {
          // Weather-aware spot preferences
          let spots: Array<"swing" | "sandbox" | "bushes" | "tree"> = [
            "swing",
            "sandbox",
            "bushes",
            "tree",
          ];
          if (this.currentWeather === "rain") {
            spots = ["tree", "tree", "bushes", "sandbox"];
          } else if (this.currentWeather === "snow") {
            spots = ["bushes", "sandbox", "tree", "swing"];
          }
          const chosen = spots[Math.floor(Math.random() * spots.length)];
          this.targetX = PLAYGROUND_SPOTS[chosen].x;
          this.targetZ = PLAYGROUND_SPOTS[chosen].z;
          this.pendingActivity = chosen;
          this.activity = "walk";
        } else {
          this.targetX = (Math.random() - 0.5) * 11.5;
          this.targetZ = (Math.random() - 0.5) * 7.5;
          this.pendingActivity = null;
          this.activity = "walk";
        }
      }
      return;
    }

    const dx = this.targetX - this.worldX;
    const dz = this.targetZ - this.worldZ;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.25) {
      this.worldX = this.targetX;
      this.worldZ = this.targetZ;
      this.targetX = null;
      this.targetZ = null;
      this.vx = 0;
      this.vz = 0;
      if (this.pendingActivity) {
        this.activity = this.pendingActivity;
        this.pendingActivity = null;
        this.activityTimer = 5.5 + Math.random() * 4.5;
        this.swingPhase = 0;
        this.applyAiStimulus("play_activity");
      } else {
        this.activity = "idle";
      }
    } else {
      const moveSpeed = 1.85 + (this.state.speed / 100) * 0.9;
      this.vx = (dx / dist) * moveSpeed;
      this.vz = (dz / dist) * moveSpeed;
      if (Math.abs(this.vx) > 0.05) {
        this.facingRight = this.vx >= 0;
      }
      this.worldX += this.vx * dt;
      this.worldZ += this.vz * dt;
      this.worldX = Math.max(-6.8, Math.min(6.8, this.worldX));
      this.worldZ = Math.max(-4.8, Math.min(4.8, this.worldZ));
    }
  }

  canAct(): boolean {
    return (
      this.state.life_phase === "pet" &&
      this.actionCooldown <= 0 &&
      !this.state.is_sleeping
    );
  }

  feed(): string {
    if (this.state.life_phase !== "pet") return "Hatch and name your Digimon first!";
    if (!this.canAct()) return "Wait a moment...";
    if (this.state.hunger > 95) return "Already full!";
    this.state.hunger = Math.min(100, this.state.hunger + 28);
    this.state.happiness = Math.min(100, this.state.happiness + 6);
    this.state.stamina = Math.min(100, this.state.stamina + 4);
    this.state.total_feedings += 1;
    this.actionCooldown = 1.2;
    this.needIcon = "feed";
    this.needIconTimer = 2.0;
    this.setEmotion("happy", 3.0);
    return "Yummy! *chomp*";
  }

  toilet(): string {
    if (this.state.life_phase !== "pet") return "Hatch and name your Digimon first!";
    if (!this.canAct()) return "Wait a moment...";
    this.state.cleanliness = Math.min(100, this.state.cleanliness + 35);
    this.state.happiness = Math.min(100, this.state.happiness + 4);
    this.actionCooldown = 1.0;
    this.needIcon = "clean";
    this.needIconTimer = 2.0;
    this.setEmotion("happy", 2.5);
    return "All clean!";
  }

  play(): string {
    if (this.state.life_phase !== "pet") return "Hatch and name your Digimon first!";
    if (!this.canAct()) return "Wait a moment...";
    if (this.state.energy < 20) {
      this.setEmotion("tired", 3.5);
      return "Too tired to play...";
    }
    if (this.state.stamina < 15) {
      this.setEmotion("tired", 3.5);
      return "Not enough stamina.";
    }
    this.state.happiness = Math.min(100, this.state.happiness + 22);
    this.state.energy = Math.max(0, this.state.energy - 12);
    this.state.stamina = Math.max(0, this.state.stamina - 10);
    this.state.hunger = Math.max(0, this.state.hunger - 5);
    this.state.total_plays += 1;
    this.actionCooldown = 1.5;
    this.needIcon = "play";
    this.needIconTimer = 2.0;
    const spots: Array<"swing" | "sandbox" | "bushes"> = ["swing", "sandbox", "bushes"];
    const pick = spots[Math.floor(Math.random() * spots.length)];
    this.sendToPlayground(pick);
    this.applyAiStimulus("play_activity");
    return "So fun! *happy bounce*";
  }

  sleep(): string {
    if (this.state.life_phase !== "pet") return "Hatch and name your Digimon first!";
    if (this.state.is_sleeping) return "Already sleeping...";
    if (this.state.energy > 85) {
      this.setEmotion("wondering", 2.5);
      return "Not sleepy yet.";
    }
    this.state.is_sleeping = true;
    this.activity = "sleep";
    this.vx = 0;
    this.vz = 0;
    this.targetX = null;
    this.targetZ = null;
    this.needIcon = "sleep";
    this.needIconTimer = 3.0;
    this.setEmotion("tired", 3.0);
    this.triggerEyeFx("sleep_z", 3.0);
    return "Zzz...";
  }

  medicine(): string {
    if (this.state.life_phase !== "pet") return "Hatch and name your Digimon first!";
    if (!this.canAct()) return "Wait a moment...";
    if (!this.state.is_sick && this.state.health > 70) {
      return "Feeling fine already.";
    }
    this.state.is_sick = false;
    this.state.health = Math.min(100, this.state.health + 40);
    this.state.happiness = Math.min(100, this.state.happiness + 8);
    this.actionCooldown = 1.5;
    this.needIcon = "med";
    this.needIconTimer = 2.5;
    this.setEmotion("happy", 3.2);
    return "Feeling better!";
  }

  train(success = true): string {
    if (!this.canAct()) return "Wait a moment...";
    if (this.state.stamina < 20) {
      this.setEmotion("tired", 3.0);
      return "Too exhausted to train.";
    }
    if (this.state.energy < 25) {
      this.setEmotion("tired", 3.0);
      return "Too tired.";
    }

    this.state.stamina = Math.max(0, this.state.stamina - 15);
    this.state.energy = Math.max(0, this.state.energy - 10);
    this.state.total_trains += 1;
    this.actionCooldown = 2.0;

    if (success) {
      const gain = 4.5 + this.state.learning / 38.0;
      this.state.learning = Math.min(100, this.state.learning + gain);
      this.state.happiness = Math.min(100, this.state.happiness + 10);
      this.needIcon = "learn";
      this.needIconTimer = 2.5;
      this.setEmotion("happy", 3.2);
      this.triggerEyeFx("sparkles", 2.4);
      return `Great training! Learning +${gain.toFixed(1)}`;
    }
    this.state.happiness = Math.max(0, this.state.happiness - 3);
    this.setEmotion("sad", 2.8);
    return "Almost... try again!";
  }

  trainSpeed(success = true): string {
    if (!this.canAct()) return "Wait a moment...";
    if (this.state.stamina < 15) {
      this.setEmotion("tired", 3.0);
      return "Too exhausted to run.";
    }
    if (this.state.energy < 20) {
      this.setEmotion("tired", 3.0);
      return "Too tired to jump.";
    }

    this.state.stamina = Math.max(0, this.state.stamina - 12);
    this.state.energy = Math.max(0, this.state.energy - 8);
    this.state.total_trains += 1;
    this.actionCooldown = 1.8;

    if (success) {
      this.state.speed = Math.min(100, this.state.speed + 6.0);
      this.state.happiness = Math.min(100, this.state.happiness + 8);
      this.needIcon = "speed";
      this.needIconTimer = 2.5;
      this.setEmotion("happy", 3.2);
      this.triggerEyeFx("sparkles", 2.4);
      return "Nice jump! Speed +6";
    }
    this.state.happiness = Math.max(0, this.state.happiness - 2);
    this.setEmotion("scared", 2.5);
    return "Bonk! Watch the obstacle!";
  }

  save(): void {
    try {
      this.state.ai_memory = this.brain.memory;
      localStorage.setItem(
        SAVE_STORAGE_KEY,
        JSON.stringify({
          ...this.state,
          worldX: this.worldX,
          worldZ: this.worldZ,
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  static load(): Pet {
    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return new Pet();
      const data = JSON.parse(raw) as Partial<PetState> & { worldX?: number; worldZ?: number };
      const pet = new Pet(data);
      if (typeof data.worldX === "number") pet.worldX = data.worldX;
      if (typeof data.worldZ === "number") pet.worldZ = data.worldZ;
      return pet;
    } catch {
      return new Pet();
    }
  }
}
