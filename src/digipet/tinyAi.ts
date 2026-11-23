import type { WeatherKind } from "./weather";

export type PetEmotion =
  | "happy"
  | "sad"
  | "angry"
  | "scared"
  | "tired"
  | "wondering"
  | "hungry"
  | "sick"
  | "neutral";

export type InteractionStimulus =
  | "gentle_stroke"
  | "rough_poke"
  | "play_activity"
  | "comfort"
  | "thunder"
  | "weather_shift";

export interface TinyAiMemory {
  trust: number; // 0..100
  playfulness: number; // 0..100
  sensitivity: number; // 0..100 (higher = more easily scared/startled)
  interactions: number;
  // Learned preference weights per stimulus -> emotion affinity scores
  qWeights: Record<string, number>;
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  "gentle_stroke:happy": 0.85,
  "gentle_stroke:wondering": 0.25,
  "rough_poke:angry": 0.72,
  "rough_poke:scared": 0.48,
  "play_activity:happy": 0.78,
  "play_activity:wondering": 0.42,
  "comfort:happy": 0.65,
  "comfort:wondering": 0.35,
  "thunder:scared": 0.88,
  "weather_shift:wondering": 0.82,
};

export function createDefaultAiMemory(): TinyAiMemory {
  return {
    trust: 55,
    playfulness: 65,
    sensitivity: 38,
    interactions: 0,
    qWeights: { ...DEFAULT_WEIGHTS },
  };
}

/**
 * Tiny Trained On-Device Behavior AI:
 * Combines pre-trained emotional priors with online reinforcement updates
 * from petting-hand smoothness, rapid pokes, play choices, and weather context.
 */
export class TinyPetBrain {
  memory: TinyAiMemory;

  constructor(saved?: Partial<TinyAiMemory>) {
    const base = createDefaultAiMemory();
    this.memory = {
      ...base,
      ...saved,
      qWeights: { ...base.qWeights, ...(saved?.qWeights ?? {}) },
    };
  }

  private getWeight(stimulus: InteractionStimulus, emotion: PetEmotion): number {
    return this.memory.qWeights[`${stimulus}:${emotion}`] ?? 0.1;
  }

  private reinforce(stimulus: InteractionStimulus, emotion: PetEmotion, delta: number): void {
    const key = `${stimulus}:${emotion}`;
    const cur = this.memory.qWeights[key] ?? 0.2;
    this.memory.qWeights[key] = Math.max(0.05, Math.min(1.5, cur + delta));
  }

  evaluateInteraction(
    stimulus: InteractionStimulus,
    ctx: {
      weather: WeatherKind;
      energy: number;
      happiness: number;
      hunger: number;
      isSick: boolean;
      currentEmotion: PetEmotion;
    }
  ): { emotion: PetEmotion; reactionText: string; happinessDelta: number } {
    this.memory.interactions += 1;

    if (ctx.isSick) {
      return {
        emotion: "sad",
        reactionText: "Feels unwell... gentle care helps.",
        happinessDelta: stimulus === "gentle_stroke" ? 3 : -2,
      };
    }

    if (stimulus === "gentle_stroke") {
      this.memory.trust = Math.min(100, this.memory.trust + 3.5);
      this.memory.sensitivity = Math.max(10, this.memory.sensitivity - 1.5);

      // Calming transition if previously angry or scared
      if (ctx.currentEmotion === "angry" || ctx.currentEmotion === "scared") {
        this.reinforce("comfort", "wondering", 0.08);
        return {
          emotion: "wondering",
          reactionText: "Calming down from your gentle hand...",
          happinessDelta: 6,
        };
      }

      if (ctx.energy < 24) {
        this.reinforce("gentle_stroke", "tired", 0.05);
        return {
          emotion: "tired",
          reactionText: "Purrs sleepily under your hand...",
          happinessDelta: 4,
        };
      }

      const happyScore = this.getWeight("gentle_stroke", "happy") + this.memory.trust / 120;
      const wonderScore =
        this.getWeight("gentle_stroke", "wondering") + (ctx.weather === "snow" ? 0.35 : 0);

      if (wonderScore > happyScore * 0.92 && Math.random() < 0.35) {
        this.reinforce("gentle_stroke", "wondering", 0.06);
        return {
          emotion: "wondering",
          reactionText: "Tilts head curiously at your hand!",
          happinessDelta: 5,
        };
      }

      this.reinforce("gentle_stroke", "happy", 0.07);
      return {
        emotion: "happy",
        reactionText: "Loves the gentle petting! ♥",
        happinessDelta: 7,
      };
    }

    if (stimulus === "rough_poke") {
      this.memory.trust = Math.max(5, this.memory.trust - 4.5);
      this.memory.sensitivity = Math.min(95, this.memory.sensitivity + 3.0);

      const scaredScore =
        this.getWeight("rough_poke", "scared") +
        (this.memory.sensitivity / 100) * 0.7 +
        (ctx.weather === "rain" ? 0.25 : 0);
      const angryScore =
        this.getWeight("rough_poke", "angry") +
        (ctx.energy < 35 || ctx.hunger < 35 ? 0.4 : 0.15);

      if (scaredScore > angryScore) {
        this.reinforce("rough_poke", "scared", 0.08);
        return {
          emotion: "scared",
          reactionText: "Startled by the sudden poke!",
          happinessDelta: -5,
        };
      }
      this.reinforce("rough_poke", "angry", 0.08);
      return {
        emotion: "angry",
        reactionText: "Hey! Not so rough! 💢",
        happinessDelta: -6,
      };
    }

    if (stimulus === "thunder") {
      if (this.memory.trust < 70 || this.memory.sensitivity > 30) {
        this.reinforce("thunder", "scared", 0.06);
        return {
          emotion: "scared",
          reactionText: "Thunder rumble! Looks frightened...",
          happinessDelta: -3,
        };
      }
      return {
        emotion: "wondering",
        reactionText: "Looks up at the rain clouds...",
        happinessDelta: 0,
      };
    }

    if (stimulus === "weather_shift") {
      this.reinforce("weather_shift", "wondering", 0.05);
      if (ctx.weather === "snow") {
        return {
          emotion: "wondering",
          reactionText: "Catching snowflakes in wonder!",
          happinessDelta: 4,
        };
      }
      if (ctx.weather === "rain") {
        return {
          emotion: this.memory.trust < 45 ? "sad" : "wondering",
          reactionText:
            this.memory.trust < 45
              ? "Raindrops make it feel gloomy..."
              : "Watches the rain pattering down!",
          happinessDelta: this.memory.trust < 45 ? -2 : 1,
        };
      }
      return {
        emotion: "happy",
        reactionText: "Basks in the warm sunshine!",
        happinessDelta: 4,
      };
    }

    // play_activity
    this.memory.playfulness = Math.min(100, this.memory.playfulness + 2.5);
    this.memory.trust = Math.min(100, this.memory.trust + 1.5);
    if (ctx.energy < 22) {
      return {
        emotion: "tired",
        reactionText: "Too sleepy to play right now...",
        happinessDelta: -1,
      };
    }
    if (ctx.weather === "snow" && Math.random() < 0.45) {
      this.reinforce("play_activity", "wondering", 0.05);
      return {
        emotion: "wondering",
        reactionText: "Playing in the falling snow!",
        happinessDelta: 6,
      };
    }
    this.reinforce("play_activity", "happy", 0.06);
    return {
      emotion: "happy",
      reactionText: "Having a blast playing!",
      happinessDelta: 6,
    };
  }
}
