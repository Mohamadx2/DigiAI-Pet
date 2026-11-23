import { useEffect, useRef, useState } from "react";
import { loadCleanedSpriteCanvas } from "../digipet/spriteCleaner";
import { CleanedSpriteImg } from "./CleanedSpriteImg";

export type MinigameMode = "menu" | "rps" | "ttt" | "jump" | "memory";

interface TrainingModalProps {
  petName: string;
  petSprite: string;
  onComplete: (kind: "learn" | "speed", success: boolean) => void;
  onClose: () => void;
}

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const MEMORY_TILES = [
  { id: 0, label: "Sun", color: "bg-amber-500", activeColor: "bg-amber-300" },
  { id: 1, label: "Leaf", color: "bg-emerald-500", activeColor: "bg-emerald-300" },
  { id: 2, label: "Aqua", color: "bg-sky-500", activeColor: "bg-sky-300" },
  { id: 3, label: "Flame", color: "bg-rose-500", activeColor: "bg-rose-300" },
];

export function TrainingModal({
  petName,
  petSprite,
  onComplete,
  onClose,
}: TrainingModalProps) {
  const [mode, setMode] = useState<MinigameMode>("menu");
  const [statusMsg, setStatusMsg] = useState("Choose a training minigame");

  // Rock / Paper / Scissors
  const handleRps = (choice: "r" | "p" | "s") => {
    const opts: Array<"r" | "p" | "s"> = ["r", "p", "s"];
    const cpu = opts[Math.floor(Math.random() * 3)];
    const wins: Record<"r" | "p" | "s", "r" | "p" | "s"> = { r: "s", p: "r", s: "p" };
    const success = choice !== cpu && wins[choice] === cpu;
    const names = { r: "Rock", p: "Paper", s: "Scissors" };
    setStatusMsg(`You: ${names[choice]} · ${petName}: ${names[cpu]} — ${success ? "You win!" : "Try again!"}`);
    setTimeout(() => onComplete("learn", success), 650);
  };

  // Tic-Tac-Toe
  const [tttBoard, setTttBoard] = useState<string[]>(Array(9).fill(""));
  const [tttLocked, setTttLocked] = useState(false);

  const hasWinner = (b: string[], mark: string) =>
    WIN_LINES.some((line) => line.every((idx) => b[idx] === mark));

  const handleTttClick = (idx: number) => {
    if (tttLocked || tttBoard[idx]) return;
    const next = [...tttBoard];
    next[idx] = "X";
    if (hasWinner(next, "X")) {
      setTttBoard(next);
      setTttLocked(true);
      setStatusMsg("Great strategy! You win!");
      setTimeout(() => onComplete("learn", true), 650);
      return;
    }
    const free = next.map((v, i) => (v === "" ? i : -1)).filter((i) => i !== -1);
    if (free.length === 0) {
      setTttBoard(next);
      setTttLocked(true);
      setStatusMsg("A draw — try again!");
      setTimeout(() => onComplete("learn", false), 650);
      return;
    }
    const pick = free[Math.floor(Math.random() * free.length)];
    next[pick] = "O";
    setTttBoard(next);
    if (hasWinner(next, "O")) {
      setTttLocked(true);
      setStatusMsg(`${petName} wins this round!`);
      setTimeout(() => onComplete("learn", false), 650);
    } else if (next.every((c) => c !== "")) {
      setTttLocked(true);
      setStatusMsg("A draw — try again!");
      setTimeout(() => onComplete("learn", false), 650);
    }
  };

  // Jump Obstacles canvas
  const jumpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const jumpRef = useRef<{ triggerJump: () => void } | null>(null);

  useEffect(() => {
    if (mode !== "jump") return;
    const canvas = jumpCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let spriteCanvas: HTMLCanvasElement | null = null;
    loadCleanedSpriteCanvas(petSprite).then((c) => {
      spriteCanvas = c;
    });

    let playerY = 0; // height above ground
    let vy = 0;
    let obstacleX = 540;
    let cleared = 0;
    let finished = false;
    let last = performance.now();
    let raf = 0;

    const triggerJump = () => {
      if (playerY <= 2 && !finished) {
        vy = 390;
      }
    };
    jumpRef.current = { triggerJump };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        triggerJump();
      }
    };
    window.addEventListener("keydown", onKey);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!finished) {
        // Physics
        vy -= 980 * dt;
        playerY += vy * dt;
        if (playerY < 0) {
          playerY = 0;
          vy = 0;
        }

        obstacleX -= 275 * dt;

        // Collision check around player X = 110
        if (obstacleX < 132 && obstacleX + 26 > 90 && playerY < 34) {
          finished = true;
          setStatusMsg("Bonk! Jump a little earlier.");
          setTimeout(() => onComplete("speed", false), 600);
        } else if (obstacleX < 35) {
          cleared += 1;
          obstacleX = 560;
          setStatusMsg(`Hurdles cleared: ${cleared} / 3`);
          if (cleared >= 3) {
            finished = true;
            setStatusMsg("Speed course cleared!");
            setTimeout(() => onComplete("speed", true), 600);
          }
        }
      }

      // Draw
      ctx.fillStyle = "#162033";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Ground
      const groundY = 175;
      ctx.fillStyle = "#3f7d4b";
      ctx.fillRect(0, groundY, canvas.width, 45);
      ctx.fillStyle = "#52995d";
      ctx.fillRect(0, groundY, canvas.width, 6);

      // Player Digimon sprite
      const px = 110;
      const py = groundY - 56 - playerY;
      if (spriteCanvas) {
        ctx.drawImage(spriteCanvas, px - 28, py, 56, 56);
      } else {
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(px, py + 28, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      // Obstacle (garden hurdle bush)
      ctx.fillStyle = "#d97706";
      ctx.fillRect(obstacleX, groundY - 36, 28, 36);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(obstacleX - 2, groundY - 40, 32, 8);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [mode, petSprite, onComplete]);

  // Memory Sparkle Pattern (4-step sequence)
  const [seq, setSeq] = useState<number[]>([]);
  const [seqPlaying, setSeqPlaying] = useState(false);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [userStep, setUserStep] = useState(0);

  const startMemory = () => {
    const nextSeq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
    setSeq(nextSeq);
    setUserStep(0);
    setSeqPlaying(true);
    setMode("memory");
    setStatusMsg("Watch the 4-tile pattern carefully...");

    nextSeq.forEach((tile, i) => {
      setTimeout(() => setFlashIdx(tile), i * 550 + 250);
      setTimeout(() => setFlashIdx(null), i * 550 + 620);
    });
    setTimeout(() => {
      setSeqPlaying(false);
      setStatusMsg("Repeat the pattern now!");
    }, nextSeq.length * 550 + 320);
  };

  const handleMemoryTile = (tileId: number) => {
    if (seqPlaying || seq.length === 0) return;
    setFlashIdx(tileId);
    setTimeout(() => setFlashIdx(null), 180);

    if (tileId !== seq[userStep]) {
      setSeqPlaying(true);
      setStatusMsg("Oops! Wrong tile.");
      setTimeout(() => onComplete("learn", false), 550);
      return;
    }

    const nextStep = userStep + 1;
    setUserStep(nextStep);
    if (nextStep >= seq.length) {
      setSeqPlaying(true);
      setStatusMsg("Sharp memory! Pattern mastered!");
      setTimeout(() => onComplete("learn", true), 550);
    }
  };

  // RPS keyboard shortcuts
  useEffect(() => {
    if (mode !== "rps") return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "r" || k === "p" || k === "s") handleRps(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#090d18]/75 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-sky-300/35 bg-[#1b2438] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CleanedSpriteImg src={petSprite} alt={petName} className="h-12 w-12" />
            <div>
              <h2 className="text-xl font-semibold text-white">Training Lab</h2>
              <p className="text-xs text-slate-300">{statusMsg}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap"
          >
            Close
          </button>
        </div>

        {mode === "menu" && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMode("rps");
                setStatusMsg("Choose Rock, Paper, or Scissors (or R / P / S)");
              }}
              className="rounded-xl border border-sky-400/35 bg-[#253350] p-4 text-left transition-colors hover:bg-[#2f4166]"
            >
              <div className="text-sm font-semibold text-white">Rock / Paper / Scissors</div>
              <div className="mt-1 text-xs text-slate-300">Raises Learning · Quick duel</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setTttBoard(Array(9).fill(""));
                setTttLocked(false);
                setMode("ttt");
                setStatusMsg("Your turn: click a square");
              }}
              className="rounded-xl border border-sky-400/35 bg-[#253350] p-4 text-left transition-colors hover:bg-[#2f4166]"
            >
              <div className="text-sm font-semibold text-white">Tic-Tac-Toe</div>
              <div className="mt-1 text-xs text-slate-300">Raises Learning · Strategy board</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("jump");
                setStatusMsg("Press SPACE or click canvas to jump (3 hurdles)");
              }}
              className="rounded-xl border border-amber-400/35 bg-[#253350] p-4 text-left transition-colors hover:bg-[#2f4166]"
            >
              <div className="text-sm font-semibold text-white">Jump Obstacles</div>
              <div className="mt-1 text-xs text-slate-300">Raises Speed · Hurdle sprint</div>
            </button>

            <button
              type="button"
              onClick={startMemory}
              className="rounded-xl border border-emerald-400/35 bg-[#253350] p-4 text-left transition-colors hover:bg-[#2f4166]"
            >
              <div className="text-sm font-semibold text-white">Memory Pattern</div>
              <div className="mt-1 text-xs text-slate-300">Raises Learning · 4-tile recall</div>
            </button>
          </div>
        )}

        {mode === "rps" && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {(
              [
                ["r", "Rock (R)"],
                ["p", "Paper (P)"],
                ["s", "Scissors (S)"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => handleRps(k)}
                className="rounded-xl border border-sky-400/50 bg-[#2a3b5c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#374d78] whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === "ttt" && (
          <div className="mt-5 flex justify-center">
            <div className="grid grid-cols-3 gap-2">
              {tttBoard.map((cell, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleTttClick(idx)}
                  className="flex h-20 w-20 items-center justify-center rounded-xl border border-sky-400/40 bg-[#243451] text-3xl font-bold hover:bg-[#31466d]"
                >
                  <span className={cell === "X" ? "text-amber-300" : "text-sky-300"}>
                    {cell}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "jump" && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <canvas
              ref={jumpCanvasRef}
              width={540}
              height={220}
              onClick={() => jumpRef.current?.triggerJump()}
              className="w-full cursor-pointer rounded-xl border border-slate-600"
            />
            <button
              type="button"
              onClick={() => jumpRef.current?.triggerJump()}
              className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-6 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/30"
            >
              Jump (Space)
            </button>
          </div>
        )}

        {mode === "memory" && (
          <div className="mt-5 grid grid-cols-2 gap-3 max-w-xs mx-auto">
            {MEMORY_TILES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleMemoryTile(t.id)}
                className={`h-20 rounded-xl border border-white/25 text-sm font-semibold text-white transition-transform active:scale-95 ${
                  flashIdx === t.id ? `${t.activeColor} scale-105 text-slate-900` : t.color
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
