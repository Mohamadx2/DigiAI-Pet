import { useCallback, useEffect, useRef, useState } from "react";
import { CleanedSpriteImg } from "./components/CleanedSpriteImg";
import { TimelineModal } from "./components/TimelineModal";
import { TrainingModal } from "./components/TrainingModal";
import { CRITICAL, getEvolutionLine, PetLine } from "./digipet/config";
import { pickThought } from "./digipet/gameLogic";
import { createDefaultPetState, Pet, PetState, PlaygroundActivity } from "./digipet/pet";
import { SoundManager } from "./digipet/sounds";
import { VisitorController } from "./digipet/visitor";
import {
  advanceWeather,
  createInitialWeatherState,
  WEATHER_LABELS,
  WeatherKind,
  WeatherState,
} from "./digipet/weather";
import { GardenScene, SceneController } from "./three/GardenScene";

interface HudSnapshot {
  state: PetState;
  activity: PlaygroundActivity;
  stageLevel: string;
  stageName: string;
  stageSprite: string;
}

function makeSnapshot(pet: Pet): HudSnapshot {
  const info = pet.getEvolutionInfo();
  return {
    state: {
      ...pet.state,
      ai_memory: { ...pet.state.ai_memory },
    },
    activity: pet.activity,
    stageLevel: info.level,
    stageName: info.name,
    stageSprite: info.sprite,
  };
}

const ACTIVITY_LABELS: Record<PlaygroundActivity, string> = {
  idle: "Resting",
  walk: "Wandering",
  swing: "Riding Swinger",
  sandbox: "Playing in Sandbox",
  bushes: "Rustling Bushes",
  tree: "Perched in Tree",
  sleep: "Sleeping",
};

export function App() {
  const petRef = useRef<Pet>(Pet.load());
  const soundsRef = useRef<SoundManager>(new SoundManager());
  const sceneControllerRef = useRef<SceneController | null>(null);

  const thoughtTextRef = useRef<string>("");
  const thoughtVisibleRef = useRef<boolean>(false);
  const menuOpenRef = useRef<boolean>(false);
  const timeModeRef = useRef<"auto" | "day" | "night">("auto");
  const weatherRef = useRef<WeatherState>(createInitialWeatherState());
  const pettingModeRef = useRef<boolean>(false);
  const visitorRef = useRef<VisitorController>(new VisitorController());

  const [hud, setHud] = useState<HudSnapshot>(() => makeSnapshot(petRef.current));
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [timeMode, setTimeMode] = useState<"auto" | "day" | "night">("auto");
  const [weatherMode, setWeatherMode] = useState<"auto" | WeatherKind>("auto");
  const [activeWeather, setActiveWeather] = useState<WeatherKind>("sunny");
  const [pettingMode, setPettingMode] = useState(false);
  const [toast, setToast] = useState<string>("");
  const [overlayKind, setOverlayKind] = useState<"toilet" | "sleep" | null>(null);
  const [nameInput, setNameInput] = useState<string>("");

  menuOpenRef.current = menuOpen || trainingOpen || timelineOpen;
  timeModeRef.current = timeMode;
  weatherRef.current.mode = weatherMode;
  pettingModeRef.current = pettingMode;

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string, durationMs = 2600) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), durationMs);
  }, []);

  // Pre-fill default name input whenever pet transitions to naming phase
  useEffect(() => {
    if (hud.state.life_phase === "naming") {
      const stages = getEvolutionLine(hud.state.line);
      setNameInput(stages[1].name);
    }
  }, [hud.state.life_phase, hud.state.line]);

  // Simulation loop driving weather, pet decay, Tiny AI thoughts, evolution & HUD sync
  useEffect(() => {
    let last = performance.now();
    let thoughtRemaining = 0;
    let nextThoughtDelay = 1.4;
    let lastLowWarn = 0;
    let hudAccum = 0;

    const interval = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;

      const paused = menuOpenRef.current;
      const pet = petRef.current;

      if (!paused) {
        const wEvent = advanceWeather(weatherRef.current, dt);
        const curWeather = weatherRef.current.current;

        if (wEvent.changedTo) {
          setActiveWeather(wEvent.changedTo);
          const reaction = pet.onWeatherChanged(wEvent.changedTo);
          soundsRef.current.play(wEvent.changedTo === "sunny" ? "play" : "wonder");
          showToast(
            reaction
              ? `${WEATHER_LABELS[wEvent.changedTo]} weather · ${reaction}`
              : `Weather shifted to ${WEATHER_LABELS[wEvent.changedTo]}`,
            3000
          );
        }

        if (wEvent.thunderStrike) {
          soundsRef.current.play("thunder");
          const tReaction = pet.onThunderStrike();
          if (tReaction) {
            soundsRef.current.play("scared");
            showToast(tReaction, 2800);
          }
        }

        pet.update(dt, curWeather);

        const vEv = visitorRef.current.update(dt, pet.worldX, pet.worldZ, curWeather);
        if (vEv.entered) {
          soundsRef.current.play("wonder");
          showToast("A wandering Tailmon appeared in the garden!", 3000);
        } else if (vEv.greeted) {
          soundsRef.current.play("play");
          if (pet.state.life_phase === "pet") {
            pet.applyAiStimulus("comfort");
            sceneControllerRef.current?.spawnBurst({
              kind: "hearts",
              worldX: pet.worldX,
              worldY: 1.0,
              worldZ: pet.worldZ,
            });
            showToast(`${pet.state.name} greets the Tailmon visitor!`, 2800);
          }
        } else if (vEv.left) {
          showToast("Tailmon left the garden for now.", 2400);
        }

        if (pet.consumeHatchEvent()) {
          soundsRef.current.play("hatch");
          sceneControllerRef.current?.spawnBurst({
            kind: "hatch",
            worldX: pet.worldX,
            worldY: 0.9,
            worldZ: pet.worldZ,
          });
          showToast("Your Digi-Egg hatched! Give your companion a name!", 3500);
          pet.save();
          setHud(makeSnapshot(pet));
        }

        const evo = pet.consumeEvolutionEvent();
        if (evo) {
          soundsRef.current.play("evolve");
          sceneControllerRef.current?.spawnBurst({
            kind: "hatch",
            worldX: pet.worldX,
            worldY: 1.0,
            worldZ: pet.worldZ,
          });
          showToast(`${pet.state.name} evolved into ${evo.name}!`, 3800);
          pet.save();
        }

        // Thoughts
        if (thoughtRemaining > 0) {
          thoughtRemaining = Math.max(0, thoughtRemaining - dt);
          thoughtVisibleRef.current = thoughtRemaining > 0;
        } else {
          thoughtVisibleRef.current = false;
          nextThoughtDelay = Math.max(0, nextThoughtDelay - dt);
          if (nextThoughtDelay <= 0) {
            thoughtTextRef.current = pickThought(pet.state, curWeather);
            thoughtRemaining = 3.4 + Math.random() * 1.6;
            thoughtVisibleRef.current = true;
            nextThoughtDelay = 4.2 + Math.random() * 4.0;
          }
        }

        // Low-needs alert
        const s = pet.state;
        const secNow = Date.now() / 1000;
        if (
          s.life_phase === "pet" &&
          secNow - lastLowWarn >= 8.0 &&
          (s.hunger < CRITICAL || s.cleanliness < CRITICAL || s.happiness < CRITICAL || s.energy < CRITICAL)
        ) {
          lastLowWarn = secNow;
          soundsRef.current.play("low");
          if (s.hunger < CRITICAL) pet.needIcon = "feed";
          else if (s.cleanliness < CRITICAL) pet.needIcon = "clean";
          else if (s.happiness < CRITICAL) pet.needIcon = "play";
          else if (s.energy < CRITICAL) pet.needIcon = "sleep";
          pet.needIconTimer = 3.0;
        }
      }

      hudAccum += dt;
      if (hudAccum >= 0.1) {
        hudAccum = 0;
        setHud(makeSnapshot(pet));
      }
    }, 50);

    const onBeforeUnload = () => petRef.current.save();
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [showToast]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (e.key === "Escape" || k === "q") {
        if (trainingOpen) setTrainingOpen(false);
        else if (timelineOpen) setTimelineOpen(false);
        else setMenuOpen((v) => !v);
      } else if (k === "m") {
        const next = soundsRef.current.toggle();
        setSoundEnabled(next);
        showToast(next ? "Sound ON" : "Sound OFF");
      } else if (k === "h") {
        setDockCollapsed((v) => !v);
      } else if (k === "p") {
        setPettingMode((v) => {
          const next = !v;
          showToast(
            next
              ? "Petting Hand ON · Gently stroke your Digimon (fast pokes startle it!)"
              : "Petting Hand OFF"
          );
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trainingOpen, timelineOpen, showToast]);

  const syncNow = () => {
    setHud(makeSnapshot(petRef.current));
  };

  const handleCycleWeather = () => {
    soundsRef.current.unlock();
    soundsRef.current.play("click");
    const order: Array<"auto" | WeatherKind> = ["auto", "sunny", "rain", "snow"];
    const nextMode = order[(order.indexOf(weatherRef.current.mode) + 1) % order.length];
    setWeatherMode(nextMode);
    weatherRef.current.mode = nextMode;

    if (nextMode !== "auto") {
      weatherRef.current.current = nextMode;
      setActiveWeather(nextMode);
      const reaction = petRef.current.onWeatherChanged(nextMode);
      showToast(
        reaction
          ? `Weather: ${WEATHER_LABELS[nextMode]} · ${reaction}`
          : `Weather set to ${WEATHER_LABELS[nextMode]}`
      );
      syncNow();
    } else {
      weatherRef.current.remainingSeconds = 25;
      showToast(`Weather: Auto (${WEATHER_LABELS[weatherRef.current.current]})`);
    }
  };

  const handleTogglePettingHand = () => {
    soundsRef.current.unlock();
    soundsRef.current.play("click");
    setPettingMode((prev) => {
      const next = !prev;
      showToast(
        next
          ? "Petting Hand ON · Gently stroke over your Digimon!"
          : "Petting Hand OFF"
      );
      return next;
    });
  };

  const handleWarmEgg = () => {
    soundsRef.current.unlock();
    const pet = petRef.current;
    const hatched = pet.warmEgg(35);
    soundsRef.current.play(hatched ? "hatch" : "click");
    sceneControllerRef.current?.spawnBurst({
      kind: hatched ? "hatch" : "hearts",
      worldX: pet.worldX,
      worldY: 0.7,
      worldZ: pet.worldZ,
    });
    if (hatched) {
      pet.consumeHatchEvent();
      showToast("Your Digi-Egg hatched! Give your companion a name!");
    } else {
      showToast(`Warming Digi-Egg (${Math.round(pet.state.egg_warmth)}%)`);
    }
    syncNow();
  };

  const handleConfirmName = (e: React.FormEvent) => {
    e.preventDefault();
    soundsRef.current.unlock();
    const pet = petRef.current;
    pet.confirmName(nameInput);
    soundsRef.current.play("learn");
    sceneControllerRef.current?.spawnBurst({
      kind: "hearts",
      worldX: pet.worldX,
      worldY: 1.0,
      worldZ: pet.worldZ,
    });
    pet.save();
    showToast(`Welcome to the garden, ${pet.state.name}!`);
    syncNow();
  };

  const handleAction = (action: "feed" | "toilet" | "play" | "sleep" | "medicine" | "train") => {
    soundsRef.current.unlock();
    const pet = petRef.current;
    if (action === "feed") {
      const msg = pet.feed();
      showToast(msg);
      if (msg.includes("Yummy")) {
        soundsRef.current.play("feed");
        sceneControllerRef.current?.spawnBurst({
          kind: "food",
          worldX: pet.worldX,
          worldY: 1.1,
          worldZ: pet.worldZ,
        });
      }
    } else if (action === "toilet") {
      const msg = pet.toilet();
      showToast(msg);
      if (msg.toLowerCase().includes("clean")) {
        soundsRef.current.play("clean");
        setOverlayKind("toilet");
        window.setTimeout(() => setOverlayKind(null), 1500);
      }
    } else if (action === "play") {
      const msg = pet.play();
      showToast(msg);
      if (msg.toLowerCase().includes("fun")) {
        soundsRef.current.play("play");
        sceneControllerRef.current?.spawnBurst({
          kind: "hearts",
          worldX: pet.worldX,
          worldY: 1.0,
          worldZ: pet.worldZ,
        });
      }
    } else if (action === "sleep") {
      const msg = pet.sleep();
      showToast(msg);
      if (msg.includes("Zzz")) {
        soundsRef.current.play("sleep");
        setOverlayKind("sleep");
        window.setTimeout(() => setOverlayKind(null), 1900);
      }
    } else if (action === "medicine") {
      const msg = pet.medicine();
      showToast(msg);
      if (msg.toLowerCase().includes("better")) {
        soundsRef.current.play("med");
      }
    } else if (action === "train") {
      if (pet.canAct()) {
        soundsRef.current.play("click");
        setTrainingOpen(true);
      } else {
        showToast(pet.state.life_phase !== "pet" ? "Hatch and name your Digimon first!" : "Wait a moment...");
      }
    }
    syncNow();
  };

  const handlePlaygroundSpot = useCallback(
    (spot: "swing" | "sandbox" | "bushes" | "tree") => {
      soundsRef.current.unlock();
      const pet = petRef.current;
      const msg = pet.sendToPlayground(spot);
      soundsRef.current.play("click");
      showToast(msg);
      setHud(makeSnapshot(pet));
    },
    [showToast]
  );

  const handlePettingStroke = useCallback(
    (isRough: boolean) => {
      soundsRef.current.unlock();
      const pet = petRef.current;
      const res = pet.handlePettingHand(isRough);
      if (res.emotion === "angry") {
        soundsRef.current.play("angry");
      } else if (res.emotion === "scared") {
        soundsRef.current.play("scared");
      } else if (res.emotion === "wondering") {
        soundsRef.current.play("wonder");
      } else {
        soundsRef.current.play("purr");
      }

      if (!isRough) {
        sceneControllerRef.current?.spawnBurst({
          kind: "hearts",
          worldX: pet.worldX,
          worldY: 1.0,
          worldZ: pet.worldZ,
        });
      }
      if (res.message) {
        showToast(res.message, 2200);
      }
      pet.save();
      setHud(makeSnapshot(pet));
    },
    [showToast]
  );

  const handleInteractPet = useCallback(() => {
    soundsRef.current.unlock();
    const pet = petRef.current;
    if (pet.state.life_phase === "egg") {
      const hatched = pet.warmEgg(35);
      soundsRef.current.play(hatched ? "hatch" : "click");
      sceneControllerRef.current?.spawnBurst({
        kind: hatched ? "hatch" : "hearts",
        worldX: pet.worldX,
        worldY: 0.8,
        worldZ: pet.worldZ,
      });
      if (hatched) {
        pet.consumeHatchEvent();
        showToast("Your Digi-Egg hatched! Give your companion a name!");
      } else {
        showToast(`Warming Digi-Egg (${Math.round(pet.state.egg_warmth)}%)`);
      }
      setHud(makeSnapshot(pet));
      return;
    }
    handlePettingStroke(false);
  }, [handlePettingStroke, showToast]);

  const handleInteractVisitor = useCallback(() => {
    soundsRef.current.unlock();
    const visitor = visitorRef.current;
    const msg = visitor.onClicked();
    if (!msg) return;
    soundsRef.current.play("play");
    sceneControllerRef.current?.spawnBurst({
      kind: "hearts",
      worldX: visitor.worldX,
      worldY: 1.05,
      worldZ: visitor.worldZ,
    });
    const pet = petRef.current;
    if (pet.state.life_phase === "pet") {
      pet.applyAiStimulus("comfort");
      pet.save();
    }
    showToast(msg, 2400);
    setHud(makeSnapshot(pet));
  }, [showToast]);

  const handleTrainingComplete = (kind: "learn" | "speed", success: boolean) => {
    const pet = petRef.current;
    const msg = kind === "speed" ? pet.trainSpeed(success) : pet.train(success);
    soundsRef.current.play(success ? "success" : "fail");
    setTrainingOpen(false);
    showToast(msg);
    pet.save();
    syncNow();
  };

  const handleStartNewEgg = (line: PetLine) => {
    soundsRef.current.unlock();
    const fresh = new Pet(createDefaultPetState(line));
    petRef.current = fresh;
    fresh.save();
    setTimelineOpen(false);
    setMenuOpen(false);
    soundsRef.current.play("click");
    showToast("A new Digi-Egg appeared in the nest!");
    syncNow();
  };

  const s = hud.state;
  const statsList = [
    { label: "Hunger", val: s.hunger, color: "bg-orange-400" },
    { label: "Clean", val: s.cleanliness, color: "bg-sky-400" },
    { label: "Happy", val: s.happiness, color: "bg-amber-300" },
    { label: "Health", val: s.health, color: "bg-rose-400" },
    { label: "Energy", val: s.energy, color: "bg-lime-400" },
    { label: "Stamina", val: s.stamina, color: "bg-violet-400" },
    { label: "Learn", val: s.learning, color: "bg-emerald-300" },
    { label: "Speed", val: s.speed, color: "bg-amber-400" },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#16223d] text-slate-100 select-none">
      {/* Full-bleed 3D Three.js Garden + 2D Sprite & Eye FX Overlay */}
      <GardenScene
        petRef={petRef}
        thoughtTextRef={thoughtTextRef}
        thoughtVisibleRef={thoughtVisibleRef}
        menuOpenRef={menuOpenRef}
        timeModeRef={timeModeRef}
        weatherRef={weatherRef}
        pettingModeRef={pettingModeRef}
        visitorRef={visitorRef}
        controllerRef={sceneControllerRef}
        onInteractPet={handleInteractPet}
        onPettingStroke={handlePettingStroke}
        onInteractPlayground={handlePlaygroundSpot}
        onInteractVisitor={handleInteractVisitor}
      />

      {/* Minimal Top Bar */}
      <header className="pointer-events-none fixed top-0 left-0 right-0 z-10 flex items-center justify-between gap-4 px-4 py-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/15 bg-[#121a2d]/90 px-4 py-2 shadow-lg">
          <CleanedSpriteImg src={hud.stageSprite} alt={hud.stageName} className="h-9 w-9" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-white whitespace-nowrap">
              <span>{s.name}</span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-sky-300 font-medium">{hud.stageLevel}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap tabular-nums">
              <span>{s.life_phase === "egg" ? "Incubating in nest" : ACTIVITY_LABELS[hud.activity]}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="capitalize text-amber-200">Mood: {s.mood}</span>
              <span className="text-slate-500 hidden sm:inline" aria-hidden="true">·</span>
              <span className="hidden sm:inline text-emerald-300">
                Bond {Math.round(s.ai_memory.trust)}% ({s.ai_memory.interactions})
              </span>
            </div>
          </div>
        </div>

        {/* Life Timeline Progress Strip (Born Egg -> Hatch -> Name -> Pet) */}
        <button
          type="button"
          onClick={() => setTimelineOpen(true)}
          className="pointer-events-auto hidden xl:flex items-center gap-2 rounded-xl border border-white/15 bg-[#121a2d]/90 px-4 py-2 text-xs text-slate-200 hover:bg-[#1c2845] transition-colors whitespace-nowrap shadow-lg"
        >
          <span className="font-semibold text-emerald-300">Born Egg</span>
          <span className="text-slate-500">→</span>
          <span className={s.hatched_at ? "font-semibold text-emerald-300" : "text-slate-400"}>
            Hatch
          </span>
          <span className="text-slate-500">→</span>
          <span className={s.named_at ? "font-semibold text-emerald-300" : "text-slate-400"}>
            Name
          </span>
          <span className="text-slate-500">→</span>
          <span className={s.life_phase === "pet" ? "font-semibold text-amber-300" : "text-slate-400"}>
            Pet ({hud.stageName})
          </span>
        </button>

        {/* Compact Top-Right Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#121a2d]/90 p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => setTimelineOpen(true)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-slate-800 whitespace-nowrap"
          >
            Evo Tree
          </button>
          <button
            type="button"
            onClick={handleCycleWeather}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-slate-800 whitespace-nowrap"
          >
            {weatherMode === "auto"
              ? `Weather: Auto · ${WEATHER_LABELS[activeWeather]}`
              : `Weather: ${WEATHER_LABELS[activeWeather]}`}
          </button>
          <button
            type="button"
            onClick={() =>
              setTimeMode((m) => (m === "auto" ? "day" : m === "day" ? "night" : "auto"))
            }
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            Sky: {timeMode === "auto" ? "Auto" : timeMode === "day" ? "Day" : "Night"}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = soundsRef.current.toggle();
              setSoundEnabled(next);
            }}
            className="hidden sm:inline-block rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            {soundEnabled ? "Sound On" : "Sound Off"}
          </button>
          <button
            type="button"
            onClick={() => sceneControllerRef.current?.resetCamera()}
            className="hidden md:inline-block rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            Reset View
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 whitespace-nowrap"
          >
            Menu
          </button>
        </div>
      </header>

      {/* Toast Feedback */}
      {toast && (
        <div className="pointer-events-none fixed top-20 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-sky-400/40 bg-[#121a2d]/95 px-4 py-2 text-sm font-medium text-sky-200 shadow-xl whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Egg Hatching Banner (Born Egg -> Hatch) */}
      {s.life_phase === "egg" && (
        <div className="fixed bottom-36 left-1/2 z-20 flex w-[min(420px,92vw)] -translate-x-1/2 flex-col items-center gap-3 rounded-2xl border border-amber-300/40 bg-[#162038]/95 p-4 text-center shadow-2xl">
          <div className="text-sm font-semibold text-amber-200">
            Born Egg · Warm the Digi-Egg to Hatch!
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-amber-400 transition-all duration-150"
              style={{ width: `${Math.min(100, Math.round(s.egg_warmth))}%` }}
            />
          </div>
          <div className="flex w-full items-center justify-between text-xs text-slate-300 tabular-nums">
            <span>Warmth: {Math.round(s.egg_warmth)}%</span>
            <button
              type="button"
              onClick={handleWarmEgg}
              className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Warm &amp; Hatch Egg
            </button>
          </div>
        </div>
      )}

      {/* Naming Modal (Hatch -> Name -> Pet) */}
      {s.life_phase === "naming" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#090d18]/75 p-4">
          <form
            onSubmit={handleConfirmName}
            className="w-full max-w-md rounded-2xl border border-sky-300/40 bg-[#1b2438] p-6 text-center shadow-2xl"
          >
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-[#253350]">
              <CleanedSpriteImg src={hud.stageSprite} alt={hud.stageName} className="h-20 w-20" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-white">
              Your Digi-Egg Hatched!
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Meet your new {hud.stageName}. Give your companion a name to begin:
            </p>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={18}
              placeholder="Enter pet name..."
              autoFocus
              className="mt-4 w-full rounded-xl border border-slate-600 bg-[#111829] px-4 py-2.5 text-center text-sm font-medium text-white outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              className="mt-4 w-full rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
            >
              Confirm Name &amp; Enter Garden
            </button>
          </form>
        </div>
      )}

      {/* Toilet / Sleep Short Visual Overlay */}
      {overlayKind && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-[#0b1020]/55">
          <div className="rounded-2xl border border-sky-300/35 bg-[#172138]/95 px-8 py-5 text-center shadow-2xl">
            <div className="text-2xl font-bold text-sky-200">
              {overlayKind === "toilet" ? "Cleaning..." : "Zzzzzz"}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              {overlayKind === "toilet"
                ? "Freshening up your Digimon"
                : "Sleeping... recovering energy"}
            </div>
          </div>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock */}
      <div
        className={`fixed bottom-4 left-1/2 z-10 w-[min(960px,95vw)] -translate-x-1/2 transition-transform duration-300 ${
          dockCollapsed ? "translate-y-[calc(100%-24px)]" : "translate-y-0"
        }`}
      >
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="rounded-t-xl border border-b-0 border-white/15 bg-[#121a2d]/95 px-4 py-1 text-[11px] font-medium text-slate-300 hover:text-white"
          >
            {dockCollapsed ? "▴ Show Controls (H)" : "▾ Hide Controls (H)"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/15 bg-[#121a2d]/95 p-3 shadow-2xl">
          {/* 8 Stat Bars */}
          <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 sm:grid-cols-8">
            {statsList.map((st) => (
              <div key={st.label} className="min-w-0">
                <div className="flex items-center justify-between text-[11px] text-slate-300 tabular-nums">
                  <span className="truncate">{st.label}</span>
                  <span>{Math.floor(st.val)}</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full ${st.val <= CRITICAL ? "bg-rose-500" : st.color}`}
                    style={{ width: `${Math.max(0, Math.min(100, st.val))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Care Actions + Petting Hand + 3D Playground Shortcuts */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/70 pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["feed", "Feed", "border-orange-400/60 hover:bg-orange-500/20"],
                  ["toilet", "Toilet", "border-sky-400/60 hover:bg-sky-500/20"],
                  ["play", "Play", "border-amber-300/60 hover:bg-amber-400/20"],
                  ["sleep", "Sleep", "border-lime-400/60 hover:bg-lime-500/20"],
                  ["medicine", "Medicine", "border-rose-400/60 hover:bg-rose-500/20"],
                  ["train", "Train", "border-emerald-300/60 hover:bg-emerald-400/20"],
                ] as const
              ).map(([key, label, cls]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleAction(key)}
                  className={`rounded-xl border bg-[#1f2b45] px-3 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap ${cls}`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleTogglePettingHand}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  pettingMode
                    ? "border-amber-300 bg-amber-400/25 text-amber-100"
                    : "border-pink-400/60 bg-[#1f2b45] text-white hover:bg-pink-500/20"
                }`}
              >
                {pettingMode ? "Hand On (P)" : "Hand (P)"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["swing", "Swinger"],
                  ["sandbox", "Sandbox"],
                  ["bushes", "Bushes"],
                  ["tree", "Tree"],
                ] as const
              ).map(([spot, label]) => (
                <button
                  key={spot}
                  type="button"
                  onClick={() => handlePlaygroundSpot(spot)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    hud.activity === spot
                      ? "border-amber-300 bg-amber-400/20 text-amber-200"
                      : "border-slate-600 bg-[#192338] text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Training Lab Modal */}
      {trainingOpen && (
        <TrainingModal
          petName={s.name}
          petSprite={hud.stageSprite}
          onComplete={handleTrainingComplete}
          onClose={() => setTrainingOpen(false)}
        />
      )}

      {/* Life Timeline & Digimon Evolution Tree Modal */}
      {timelineOpen && (
        <TimelineModal
          state={s}
          onStartNewEgg={handleStartNewEgg}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {/* Main Pause Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#090d18]/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-sky-400/40 bg-[#1b2438] p-6 text-center shadow-2xl">
            <h2 className="text-xl font-semibold text-white">DigiAI-Pet Menu</h2>
            <p className="mt-1 text-xs text-slate-300">
              Simulation is paused while this menu is open
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  petRef.current.save();
                  setMenuOpen(false);
                  showToast("Progress saved!");
                }}
                className="rounded-xl border border-emerald-400/50 bg-[#23364b] py-2.5 text-sm font-semibold text-white hover:bg-[#2b425c]"
              >
                Save Game
              </button>
              <button
                type="button"
                onClick={() => {
                  petRef.current = Pet.load();
                  syncNow();
                  setMenuOpen(false);
                  showToast("Game loaded!");
                }}
                className="rounded-xl border border-sky-400/50 bg-[#23364b] py-2.5 text-sm font-semibold text-white hover:bg-[#2b425c]"
              >
                Load Game
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setTimelineOpen(true);
                }}
                className="rounded-xl border border-amber-400/50 bg-[#23364b] py-2.5 text-sm font-semibold text-white hover:bg-[#2b425c]"
              >
                Timeline &amp; New Egg
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
