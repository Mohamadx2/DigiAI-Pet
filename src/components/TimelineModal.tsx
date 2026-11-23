import { getEvolutionLine, PetLine } from "../digipet/config";
import type { PetState } from "../digipet/pet";
import { CleanedSpriteImg } from "./CleanedSpriteImg";

interface TimelineModalProps {
  state: PetState;
  onStartNewEgg: (line: PetLine) => void;
  onClose: () => void;
}

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "Pending";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function TimelineModal({ state, onStartNewEgg, onClose }: TimelineModalProps) {
  const stages = getEvolutionLine(state.line);
  const totalActions = state.total_feedings + state.total_plays + state.total_trains;

  const lifeSteps = [
    {
      id: "born_egg",
      title: "Born Egg",
      subtitle: `${stages[0].name} Digi-Egg appeared`,
      done: true,
      time: fmtTime(state.born_at),
    },
    {
      id: "hatched",
      title: "Hatch",
      subtitle: `Hatched into ${stages[1].name}`,
      done: state.hatched_at !== null,
      time: fmtTime(state.hatched_at),
    },
    {
      id: "named",
      title: "Name",
      subtitle: state.named_at ? `Named "${state.name}"` : "Choose a companion name",
      done: state.named_at !== null,
      time: fmtTime(state.named_at),
    },
    {
      id: "pet",
      title: "Pet Care & Training",
      subtitle: `${totalActions} care actions · ${Math.floor(state.age_seconds)}s active`,
      done: state.life_phase === "pet",
      time: state.life_phase === "pet" ? "Active" : "Waiting",
    },
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#090d18]/78 p-4">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-sky-300/35 bg-[#1b2438] p-6 text-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Life Timeline &amp; Digimon Evolution Tree
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Born Egg → Hatch → Name → Pet → Evolution Line ({state.line === "pumpkin" ? "Harvest Pumpkin Tree" : "Luminamon Tree"})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap"
          >
            Close
          </button>
        </div>

        {/* Life Timeline Stepper */}
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-200">Pet Life Timeline</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            {lifeSteps.map((step, i) => (
              <div
                key={step.id}
                className={`rounded-xl border p-3 ${
                  step.done
                    ? "border-emerald-400/50 bg-[#223347]"
                    : "border-slate-700 bg-[#182032] opacity-75"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-semibold">
                    0{i + 1}. {step.title}
                  </span>
                  <span className="tabular-nums text-[11px] text-slate-400">{step.time}</span>
                </div>
                <div className="mt-1.5 text-xs text-slate-200">{step.subtitle}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Digimon Evolution Tree */}
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Evolution Tree ({stages.length} Stages)
            </h3>
            <span className="text-xs text-slate-300 tabular-nums">
              Age: {Math.floor(state.age_seconds)}s · Learn: {Math.floor(state.learning)} · Actions: {totalActions}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {stages.map((stage) => {
              const unlocked = state.evolution_stage >= stage.stage;
              const current = state.evolution_stage === stage.stage;
              const ts = state.evolution_timestamps?.[stage.stage];
              return (
                <div
                  key={stage.stage}
                  className={`flex flex-col items-center rounded-xl border p-3 text-center ${
                    current
                      ? "border-amber-400 bg-[#2a3954]"
                      : unlocked
                      ? "border-emerald-400/45 bg-[#213049]"
                      : "border-slate-700 bg-[#151c2c] opacity-70"
                  }`}
                >
                  <CleanedSpriteImg
                    src={stage.sprite}
                    alt={stage.name}
                    className={`h-20 w-20 ${!unlocked ? "grayscale opacity-65" : ""}`}
                  />
                  <div className="mt-2 text-xs font-semibold text-white">{stage.name}</div>
                  <div className="text-[11px] text-sky-300">{stage.level}</div>
                  <div className="mt-1 text-[10px] text-slate-300">
                    {stage.attribute} · {stage.type}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 tabular-nums">
                    {unlocked
                      ? current
                        ? "Current Form"
                        : `Reached ${fmtTime(ts)}`
                      : `Age ${stage.min_age}s · Lrn ${stage.min_learning} · Act ${stage.min_actions}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* New Egg / Switch Line */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
          <div className="text-xs text-slate-300">
            Start a fresh Digi-Egg to replay Born Egg → Hatch → Name → Pet or switch evolution trees:
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onStartNewEgg("pumpkin")}
              className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 whitespace-nowrap"
            >
              New Harvest Egg (6 Stages)
            </button>
            <button
              type="button"
              onClick={() => onStartNewEgg("luminamon")}
              className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/30 whitespace-nowrap"
            >
              New Luminamon Egg (5 Stages)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
