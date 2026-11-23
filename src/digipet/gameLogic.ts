import { CRITICAL, LOW } from "./config";
import type { PetState } from "./pet";
import type { WeatherKind } from "./weather";

export function pickThought(state: PetState, weather: WeatherKind = "sunny"): string {
  if (state.life_phase === "egg") {
    return state.egg_warmth > 65
      ? "crackling... almost ready!!"
      : "pet my shell to keep me warm!";
  }

  if (state.mood === "angry") {
    return [
      "hmph! too rough!! 💢",
      "gentle strokes please!",
      "grrr... need a breather!",
    ][Math.floor(Math.random() * 3)];
  }
  if (state.mood === "scared") {
    return [
      "eep!! what was that?!",
      "hold me gently please...",
      "a little startled right now!",
    ][Math.floor(Math.random() * 3)];
  }
  if (state.mood === "wondering") {
    if (weather === "snow") return "ooh snowflakes!! where do they come from?";
    if (weather === "rain") return "listening to the raindrops...";
    return [
      "ooh what's over in the bushes?",
      "hmm... I wonder how high the swinger goes?",
      "tilts head curiously... ?",
    ][Math.floor(Math.random() * 3)];
  }

  let pool: string[];
  if (state.is_sleeping || state.energy < CRITICAL || state.mood === "tired") {
    pool = [
      "hmm feeling eepy!!",
      "five more minutes... zzz",
      "my paws need a tiny nap",
      "dreaming of fluffy clouds",
    ];
  } else if (state.hunger < CRITICAL) {
    pool = [
      "mhhm hungery :o",
      "is that a snack I smell?",
      "my tummy is doing a drum solo",
      "one tiny treat, please?",
    ];
  } else if (state.happiness < LOW || state.mood === "sad") {
    pool = [
      "could use some gentle petting...",
      "let's play on the swinger :-D",
      "where did all the fun go?",
      "boop my nose softly?",
    ];
  } else {
    pool = [
      "let's play :-D",
      "the swinger goes so high!!",
      "let's build a sandcastle!",
      "something rustled in the bushes!",
      weather === "snow" ? "snowy garden day!!" : weather === "rain" ? "cozy rainy garden!" : "warm sunny garden!",
      "sparkles!! so many sparkles!!",
      "I am a very clever little Digimon",
      "boop!",
      "*happy tiny noises*",
    ];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
