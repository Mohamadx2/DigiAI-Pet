export type WeatherKind = "sunny" | "rain" | "snow";

export interface WeatherState {
  current: WeatherKind;
  mode: "auto" | WeatherKind;
  remainingSeconds: number;
  intensity: number;
  lightningFlash: number;
}

const WEATHER_ORDER: WeatherKind[] = ["sunny", "rain", "snow"];

export function createInitialWeatherState(): WeatherState {
  return {
    current: "sunny",
    mode: "auto",
    remainingSeconds: 32 + Math.random() * 25,
    intensity: 1.0,
    lightningFlash: 0.0,
  };
}

export function pickNextRandomWeather(current: WeatherKind): WeatherKind {
  const pool = WEATHER_ORDER.filter((w) => w !== current);
  // Slightly favor sunny, while keeping rain and snow frequent and lively
  const weights = pool.map((w) => (w === "sunny" ? 0.44 : 0.28));
  const total = weights[0] + weights[1];
  const r = Math.random() * total;
  return r < weights[0] ? pool[0] : pool[1];
}

export function advanceWeather(
  state: WeatherState,
  dt: number
): { changedTo: WeatherKind | null; thunderStrike: boolean } {
  let changedTo: WeatherKind | null = null;
  let thunderStrike = false;

  if (state.lightningFlash > 0) {
    state.lightningFlash = Math.max(0, state.lightningFlash - dt * 2.8);
  }

  if (state.mode !== "auto") {
    if (state.current !== state.mode) {
      state.current = state.mode;
      changedTo = state.current;
    }
  } else {
    state.remainingSeconds -= dt;
    if (state.remainingSeconds <= 0) {
      state.current = pickNextRandomWeather(state.current);
      state.remainingSeconds = 30 + Math.random() * 30;
      changedTo = state.current;
    }
  }

  // Occasional subtle thunder flash during rain
  if (state.current === "rain" && Math.random() < 0.015 * dt) {
    state.lightningFlash = 1.0;
    thunderStrike = true;
  }

  return { changedTo, thunderStrike };
}

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  sunny: "Sunny",
  rain: "Rainy",
  snow: "Snowy",
};
