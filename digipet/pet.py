

"""
Pet class – stats, needs, simple AI behavior, learning, evolution, save/load.
"""

from __future__ import annotations
import json
import os
import random
import time
from dataclasses import dataclass, asdict, field
from typing import Dict, Optional

from .config import DECAY, CRITICAL, LOW, GOOD, SAVE_FILE, EVOLUTION_LINE


@dataclass
class PetState:
    name: str = "Puwamon"
    evolution_stage: int = 0        # 0=Puwamon, 1=Luminamon, 2=Solarmon, 3=Aethelmon
    hunger: float = 80.0
    cleanliness: float = 85.0
    happiness: float = 75.0
    energy: float = 90.0
    health: float = 95.0
    stamina: float = 80.0
    learning: float = 10.0          # 0-100, rises with successful games
    speed: float = 10.0             # 0-100, rises with successful obstacle runs
    age_seconds: float = 0.0
    total_feedings: int = 0
    total_plays: int = 0
    total_trains: int = 0
    is_sick: bool = False
    is_sleeping: bool = False
    mood: str = "neutral"           # neutral, happy, sad, tired, hungry, sick
    last_update: float = field(default_factory=time.time)


class Pet:
    def __init__(self, state: Optional[PetState] = None):
        self.state = state or PetState()
        # Clamp stage to valid range and migrate legacy default name
        max_stage = len(EVOLUTION_LINE) - 1
        self.state.evolution_stage = max(0, min(max_stage, self.state.evolution_stage))
        if self.state.name == "Agumon-chan":
            self.state.name = EVOLUTION_LINE[self.state.evolution_stage]["name"]

        self.x = 450.0
        self.y = 320.0
        self.vx = 0.0
        self.vy = 0.0
        self.facing_right = True
        self.anim_timer = 0.0
        self.frame = 0
        self.target_x: Optional[float] = None
        self.target_y: Optional[float] = None
        self.action_cooldown = 0.0
        self.need_icon: Optional[str] = None
        self.need_icon_timer = 0.0
        self._pending_evolution: Optional[dict] = None

    # ------------------------------------------------------------------
    # Evolution helpers
    # ------------------------------------------------------------------
    def get_evolution_info(self) -> dict:
        idx = max(0, min(len(EVOLUTION_LINE) - 1, self.state.evolution_stage))
        return EVOLUTION_LINE[idx]

    def get_next_evolution_info(self) -> Optional[dict]:
        next_idx = self.state.evolution_stage + 1
        if next_idx < len(EVOLUTION_LINE):
            return EVOLUTION_LINE[next_idx]
        return None

    def check_evolution(self) -> Optional[dict]:
        """Evolve to the next stage when age, learning, care actions, and health allow."""
        if self.state.is_sick or self.state.health < 50.0:
            return None

        next_stage = self.get_next_evolution_info()
        if not next_stage:
            return None

        total_actions = (
            self.state.total_feedings
            + self.state.total_plays
            + self.state.total_trains
        )
        if (
            self.state.age_seconds >= next_stage["min_age"]
            and self.state.learning >= next_stage["min_learning"]
            and total_actions >= next_stage["min_actions"]
        ):
            self.state.evolution_stage = next_stage["stage"]
            self.state.name = next_stage["name"]
            self.state.happiness = min(100.0, self.state.happiness + 20.0)
            self.state.health = min(100.0, self.state.health + 15.0)
            self.state.stamina = min(100.0, self.state.stamina + 20.0)
            self.need_icon = "learn"
            self.need_icon_timer = 3.0
            self._pending_evolution = next_stage
            return next_stage
        return None

    def consume_evolution_event(self) -> Optional[dict]:
        event = self._pending_evolution
        self._pending_evolution = None
        return event

    # ------------------------------------------------------------------
    # Core update
    # ------------------------------------------------------------------
    def update(self, dt: float):
        self.state.age_seconds += dt
        self.action_cooldown = max(0.0, self.action_cooldown - dt)
        self.need_icon_timer = max(0.0, self.need_icon_timer - dt)
        if self.need_icon_timer <= 0:
            self.need_icon = None

        if self.state.is_sleeping:
            # Recover energy and a bit of health while sleeping
            self.state.energy = min(100.0, self.state.energy + 8.0 * dt)
            self.state.health = min(100.0, self.state.health + 1.5 * dt)
            self.state.stamina = min(100.0, self.state.stamina + 3.0 * dt)
            if self.state.energy >= 95.0:
                self.state.is_sleeping = False
                self._set_mood()
            return

        # Natural decay
        for key, rate in DECAY.items():
            if key == "health":
                # Health only decays when other needs are low or already sick
                if self.state.is_sick or self._any_critical():
                    val = getattr(self.state, key)
                    setattr(self.state, key, max(0.0, val - rate * dt))
            else:
                val = getattr(self.state, key)
                setattr(self.state, key, max(0.0, val - rate * dt))

        # Sickness logic
        if not self.state.is_sick and self._should_get_sick():
            self.state.is_sick = True
            self.need_icon = "sick"
            self.need_icon_timer = 4.0

        if self.state.is_sick:
            self.state.happiness = max(0.0, self.state.happiness - 1.2 * dt)
            self.state.stamina = max(0.0, self.state.stamina - 0.8 * dt)

        self.check_evolution()
        self._set_mood()
        self._update_movement(dt)
        self._update_animation(dt)

    def _any_critical(self) -> bool:
        return (self.state.hunger < CRITICAL or
                self.state.cleanliness < CRITICAL or
                self.state.happiness < CRITICAL or
                self.state.energy < CRITICAL)

    def _should_get_sick(self) -> bool:
        if self.state.health < 40:
            return random.random() < 0.002
        if self._any_critical():
            return random.random() < 0.0008
        return False

    def _set_mood(self):
        s = self.state
        if s.is_sick:
            s.mood = "sick"
        elif s.energy < CRITICAL:
            s.mood = "tired"
        elif s.hunger < CRITICAL:
            s.mood = "hungry"
        elif s.happiness < LOW:
            s.mood = "sad"
        elif s.happiness > GOOD and s.energy > GOOD:
            s.mood = "happy"
        else:
            s.mood = "neutral"

    # ------------------------------------------------------------------
    # Movement (simple autonomous walking)
    # ------------------------------------------------------------------
    def _update_movement(self, dt: float):
        from .config import PET_SPEED, WALK_CHANCE, WINDOW_WIDTH, WINDOW_HEIGHT

        if self.state.is_sleeping or self.state.is_sick:
            self.vx = self.vy = 0.0
            return

        # Occasionally pick a new target
        if self.target_x is None or random.random() < WALK_CHANCE:
            margin = 80
            self.target_x = random.uniform(margin, WINDOW_WIDTH - margin)
            self.target_y = random.uniform(180, WINDOW_HEIGHT - 140)

        if self.target_x is not None:
            dx = self.target_x - self.x
            dy = self.target_y - self.y
            dist = (dx * dx + dy * dy) ** 0.5
            if dist < 8:
                self.target_x = self.target_y = None
                self.vx = self.vy = 0.0
            else:
                self.vx = (dx / dist) * PET_SPEED
                self.vy = (dy / dist) * PET_SPEED
                self.facing_right = self.vx >= 0

        self.x += self.vx
        self.y += self.vy

        # Soft bounds
        self.x = max(60, min(WINDOW_WIDTH - 60, self.x))
        self.y = max(160, min(WINDOW_HEIGHT - 120, self.y))

    def _update_animation(self, dt: float):
        self.anim_timer += dt
        if self.anim_timer > 0.18:
            self.anim_timer = 0.0
            if abs(self.vx) > 0.1 or abs(self.vy) > 0.1:
                self.frame = (self.frame + 1) % 4
            else:
                self.frame = 0

    # ------------------------------------------------------------------
    # Actions (card interactions)
    # ------------------------------------------------------------------
    def can_act(self) -> bool:
        return self.action_cooldown <= 0 and not self.state.is_sleeping

    def feed(self) -> str:
        if not self.can_act():
            return "Wait a moment..."
        if self.state.hunger > 95:
            return "Already full!"
        self.state.hunger = min(100.0, self.state.hunger + 28)
        self.state.happiness = min(100.0, self.state.happiness + 6)
        self.state.stamina = min(100.0, self.state.stamina + 4)
        self.state.total_feedings += 1
        self.action_cooldown = 1.2
        self.need_icon = "feed"
        self.need_icon_timer = 2.0
        return "Yummy! *chomp*"

    def toilet(self) -> str:
        if not self.can_act():
            return "Wait a moment..."
        self.state.cleanliness = min(100.0, self.state.cleanliness + 35)
        self.state.happiness = min(100.0, self.state.happiness + 4)
        self.action_cooldown = 1.0
        self.need_icon = "clean"
        self.need_icon_timer = 2.0
        return "All clean!"

    def play(self) -> str:
        if not self.can_act():
            return "Wait a moment..."
        if self.state.energy < 20:
            return "Too tired to play..."
        if self.state.stamina < 15:
            return "Not enough stamina."
        self.state.happiness = min(100.0, self.state.happiness + 22)
        self.state.energy = max(0.0, self.state.energy - 12)
        self.state.stamina = max(0.0, self.state.stamina - 10)
        self.state.hunger = max(0.0, self.state.hunger - 5)
        self.state.total_plays += 1
        self.action_cooldown = 1.5
        self.need_icon = "play"
        self.need_icon_timer = 2.0
        return "So fun! *happy bounce*"

    def sleep(self) -> str:
        if self.state.is_sleeping:
            return "Already sleeping..."
        if self.state.energy > 85:
            return "Not sleepy yet."
        self.state.is_sleeping = True
        self.vx = self.vy = 0.0
        self.target_x = self.target_y = None
        self.need_icon = "sleep"
        self.need_icon_timer = 3.0
        return "Zzz..."

    def medicine(self) -> str:
        if not self.can_act():
            return "Wait a moment..."
        if not self.state.is_sick and self.state.health > 70:
            return "Feeling fine already."
        self.state.is_sick = False
        self.state.health = min(100.0, self.state.health + 40)
        self.state.happiness = min(100.0, self.state.happiness + 8)
        self.action_cooldown = 1.5
        self.need_icon = "med"
        self.need_icon_timer = 2.5
        return "Feeling better!"

    def train(self, success: bool = True) -> str:
        """Called after a minigame attempt."""
        if not self.can_act():
            return "Wait a moment..."
        if self.state.stamina < 20:
            return "Too exhausted to train."
        if self.state.energy < 25:
            return "Too tired."

        self.state.stamina = max(0.0, self.state.stamina - 15)
        self.state.energy = max(0.0, self.state.energy - 10)
        self.state.total_trains += 1
        self.action_cooldown = 2.0

        if success:
            gain = 4.0 + (self.state.learning / 40.0)  # better learning = slightly more gain
            self.state.learning = min(100.0, self.state.learning + gain)
            self.state.happiness = min(100.0, self.state.happiness + 10)
            self.need_icon = "learn"
            self.need_icon_timer = 2.5
            return f"Great training! Learning +{gain:.1f}"
        else:
            self.state.happiness = max(0.0, self.state.happiness - 3)
            return "Almost... try again!"

    def train_speed(self, success: bool = True) -> str:
        """Resolve the jumping-obstacle game and improve the pet's speed."""
        if not self.can_act():
            return "Wait a moment..."
        if self.state.stamina < 15:
            return "Too exhausted to run."
        if self.state.energy < 20:
            return "Too tired to jump."
        self.state.stamina = max(0.0, self.state.stamina - 12)
        self.state.energy = max(0.0, self.state.energy - 8)
        self.state.action_cooldown = 1.8
        if success:
            self.state.speed = min(100.0, self.state.speed + 5.0)
            self.state.happiness = min(100.0, self.state.happiness + 6)
            self.need_icon = "speed"
            self.need_icon_timer = 2.5
            return "Nice jump! Speed +5"
        self.state.happiness = max(0.0, self.state.happiness - 2)
        return "Bonk! Watch the obstacle!"

    # ------------------------------------------------------------------
    # Save / Load
    # ------------------------------------------------------------------
    def save(self, path: str = SAVE_FILE):
        data = asdict(self.state)
        data["x"] = self.x
        data["y"] = self.y
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load(cls, path: str = SAVE_FILE) -> "Pet":
        if not os.path.exists(path):
            return cls()
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Reconstruct state, ignoring unknown keys for forward compatibility
            known = {k: v for k, v in data.items() if k in PetState.__dataclass_fields__}
            state = PetState(**known)
            pet = cls(state)
            pet.x = data.get("x", 450.0)
            pet.y = data.get("y", 320.0)
            return pet
        except Exception:
            return cls()

    def get_status_summary(self) -> Dict[str, float]:
        return {
            "hunger": self.state.hunger,
            "cleanliness": self.state.cleanliness,
            "happiness": self.state.happiness,
            "energy": self.state.energy,
            "health": self.state.health,
            "stamina": self.state.stamina,
            "learning": self.state.learning,
            "speed": self.state.speed,
        }
