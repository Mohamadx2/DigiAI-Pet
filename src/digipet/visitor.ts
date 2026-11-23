import type { WeatherKind } from "./weather";

export type VisitorPhase = "away" | "entering" | "wandering" | "greeting" | "leaving";

export interface VisitorUpdateEvent {
  entered?: boolean;
  greeted?: boolean;
  left?: boolean;
}

const ENTRY_EXITS: Array<{ x: number; z: number }> = [
  { x: 12.5, z: -3.8 },
  { x: -12.2, z: 3.4 },
  { x: 9.8, z: -9.5 },
  { x: -10.5, z: -8.8 },
  { x: 11.4, z: 6.2 },
];

const VISITOR_THOUGHTS = [
  "just passing through~",
  "cozy garden you got here!",
  "my Holy Ring is shining!",
  "love the breeze today!",
];

export class VisitorController {
  phase: VisitorPhase = "away";
  worldX = 12.5;
  worldZ = -3.8;
  targetX = 2.4;
  targetZ = -1.2;
  yaw = -Math.PI * 0.5;
  walkCycle = 0;
  speed = 0;
  visibility = 0;

  // Schedule first visit quickly (~6s) so user sees the visitor stroll in, then 22-42s randomly
  nextVisitTimer = 6.0;
  visitRemaining = 0;
  pauseTimer = 0;
  waveTimer = 0;
  hasGreetedThisVisit = false;

  bubbleText = "";
  bubbleTimer = 0;

  isVisible(): boolean {
    return this.phase !== "away" || this.visibility > 0.02;
  }

  private pickInnerWaypoint(): { x: number; z: number } {
    const spots = [
      { x: 2.2, z: 1.4 },
      { x: -2.4, z: 1.8 },
      { x: 1.8, z: -2.5 },
      { x: -2.0, z: -1.8 },
      { x: 0.4, z: 3.2 },
      { x: 3.2, z: -0.4 },
    ];
    return spots[Math.floor(Math.random() * spots.length)];
  }

  spawnVisitNow(): VisitorUpdateEvent {
    const entry = ENTRY_EXITS[Math.floor(Math.random() * ENTRY_EXITS.length)];
    const inner = this.pickInnerWaypoint();
    this.phase = "entering";
    this.worldX = entry.x;
    this.worldZ = entry.z;
    this.targetX = inner.x;
    this.targetZ = inner.z;
    this.visitRemaining = 18 + Math.random() * 11;
    this.pauseTimer = 0;
    this.waveTimer = 0;
    this.hasGreetedThisVisit = false;
    this.bubbleText = "visiting the garden!";
    this.bubbleTimer = 3.2;
    return { entered: true };
  }

  onClicked(): string {
    if (this.phase === "away") return "";
    this.waveTimer = 2.6;
    if (this.phase === "wandering") {
      this.phase = "greeting";
      this.pauseTimer = 2.4;
    }
    this.bubbleText = "meow~ hello friend!";
    this.bubbleTimer = 3.0;
    return "Tailmon visitor waves hello!";
  }

  update(
    dt: number,
    petX: number,
    petZ: number,
    weather: WeatherKind
  ): VisitorUpdateEvent {
    const ev: VisitorUpdateEvent = {};

    if (this.bubbleTimer > 0) {
      this.bubbleTimer = Math.max(0, this.bubbleTimer - dt);
      if (this.bubbleTimer <= 0) this.bubbleText = "";
    }

    if (this.waveTimer > 0) {
      this.waveTimer = Math.max(0, this.waveTimer - dt);
    }

    if (this.phase === "away") {
      this.visibility = Math.max(0, this.visibility - dt * 2.5);
      this.nextVisitTimer -= dt;
      if (this.nextVisitTimer <= 0) {
        return this.spawnVisitNow();
      }
      return ev;
    }

    // Fade/scale visibility in while entering, out near perimeter while leaving
    const distFromCenter = Math.hypot(this.worldX, this.worldZ);
    if (this.phase === "leaving" && distFromCenter > 9.5) {
      const fade = Math.max(0, 1 - (distFromCenter - 9.5) / 3.5);
      this.visibility = Math.min(this.visibility, fade);
    } else {
      this.visibility = Math.min(1, this.visibility + dt * 1.8);
    }

    if (this.phase === "greeting") {
      this.speed = 0;
      // Face toward player's pet while greeting
      const desiredYaw = Math.atan2(petX - this.worldX, petZ - this.worldZ);
      let diff = desiredYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 6);

      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0) {
        this.phase = "wandering";
        const nextSpot = this.pickInnerWaypoint();
        this.targetX = nextSpot.x;
        this.targetZ = nextSpot.z;
      }
      return ev;
    }

    if (this.phase === "wandering") {
      this.visitRemaining -= dt;
      if (this.visitRemaining <= 0) {
        const exit = ENTRY_EXITS[Math.floor(Math.random() * ENTRY_EXITS.length)];
        this.phase = "leaving";
        this.targetX = exit.x;
        this.targetZ = exit.z;
        this.bubbleText = "time to go, bye~";
        this.bubbleTimer = 3.2;
        return ev;
      }

      if (this.pauseTimer > 0) {
        this.speed = 0;
        this.pauseTimer -= dt;
        if (this.pauseTimer <= 0) {
          const nextSpot = this.pickInnerWaypoint();
          this.targetX = nextSpot.x;
          this.targetZ = nextSpot.z;
          if (Math.random() < 0.45) {
            this.bubbleText =
              weather === "rain"
                ? "pitter-patter rain!"
                : weather === "snow"
                ? "fluffy snow!!"
                : VISITOR_THOUGHTS[Math.floor(Math.random() * VISITOR_THOUGHTS.length)];
            this.bubbleTimer = 3.0;
          }
        }
        return ev;
      }
    }

    // Walk toward targetX, targetZ
    const dx = this.targetX - this.worldX;
    const dz = this.targetZ - this.worldZ;
    const dist = Math.hypot(dx, dz);
    const moveSpeed = this.phase === "leaving" ? 2.0 : 1.55;

    if (dist < 0.35) {
      if (this.phase === "entering") {
        this.phase = "wandering";
        this.pauseTimer = 0.9;
      } else if (this.phase === "wandering") {
        // Check if close enough to greet the player's Digimon once
        const petDist = Math.hypot(petX - this.worldX, petZ - this.worldZ);
        if (!this.hasGreetedThisVisit && petDist < 6.5) {
          this.hasGreetedThisVisit = true;
          this.phase = "greeting";
          this.pauseTimer = 2.6;
          this.waveTimer = 2.6;
          this.bubbleText = "hey there, buddy!";
          this.bubbleTimer = 2.8;
          ev.greeted = true;
        } else {
          this.pauseTimer = 1.2 + Math.random() * 1.8;
        }
      } else if (this.phase === "leaving") {
        this.phase = "away";
        this.visibility = 0;
        this.speed = 0;
        this.nextVisitTimer = 22 + Math.random() * 20;
        ev.left = true;
      }
    } else {
      const vx = (dx / dist) * moveSpeed;
      const vz = (dz / dist) * moveSpeed;
      this.worldX += vx * dt;
      this.worldZ += vz * dt;
      this.speed = moveSpeed;
      this.walkCycle += dt * moveSpeed * 4.8;

      const desiredYaw = Math.atan2(vx, vz);
      let diff = desiredYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 8);
    }

    return ev;
  }
}
