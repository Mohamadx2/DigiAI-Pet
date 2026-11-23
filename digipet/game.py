"""
Main game loop for DigiAI-Pet.
Includes procedural pet rendering, reaction minigame,
MIDI background music support, rebirth loop feedback,
and visual action feedback:
  - Feed  → food circles that fly toward the pet
  - Toilet → short loading overlay with animated dots
  - Sleep → slowly growing "Zzzzzz" text
Also shows current date and a persistent Exit button that saves.
"""

from __future__ import annotations
import math
import os
import random
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import pygame

from .config import (
    WINDOW_WIDTH, WINDOW_HEIGHT, FPS, TITLE, BG_COLOR,
    BACKGROUND_FILE, CRITICAL, LOW, HUNGER_COLOR, CLEAN_COLOR, ENERGY_COLOR,
    EVOLUTION_LINE
)
from .pet import Pet
from .ui import UI
from .sounds import SoundManager


class FoodParticle:
    """A simple circle that moves toward the pet (feeding animation)."""
    def __init__(self, start: Tuple[float, float], target: Tuple[float, float]):
        self.x, self.y = start
        self.tx, self.ty = target
        self.speed = random.uniform(3.8, 5.5)
        self.radius = random.randint(7, 12)
        self.color = random.choice([
            (255, 180, 80),
            (255, 140, 60),
            (255, 210, 100),
            (240, 120, 50),
        ])
        self.alive = True
        self.life = 1.4

    def update(self, dt: float):
        self.life -= dt
        if self.life <= 0:
            self.alive = False
            return
        dx = self.tx - self.x
        dy = self.ty - self.y
        dist = math.hypot(dx, dy)
        if dist < 12:
            self.alive = False
            return
        self.x += (dx / dist) * self.speed
        self.y += (dy / dist) * self.speed

    def draw(self, surface: pygame.Surface):
        if not self.alive:
            return
        alpha = max(40, int(255 * (self.life / 1.4)))
        s = pygame.Surface((self.radius * 2 + 4, self.radius * 2 + 4), pygame.SRCALPHA)
        pygame.draw.circle(s, (*self.color, alpha), (self.radius + 2, self.radius + 2), self.radius)
        pygame.draw.circle(s, (255, 255, 220, alpha), (self.radius + 2, self.radius + 2), max(2, self.radius // 3))
        surface.blit(s, (int(self.x - self.radius - 2), int(self.y - self.radius - 2)))


class ActionOverlay:
    """Handles short visual sequences for Toilet and Sleep."""
    def __init__(self):
        self.active = False
        self.kind: Optional[str] = None   # "toilet" | "sleep"
        self.timer = 0.0
        self.duration = 0.0
        self.dots = 0
        self.z_count = 1

    def start_toilet(self):
        self.active = True
        self.kind = "toilet"
        self.timer = 0.0
        self.duration = 1.8
        self.dots = 0

    def start_sleep(self):
        self.active = True
        self.kind = "sleep"
        self.timer = 0.0
        self.duration = 2.6
        self.z_count = 1

    def update(self, dt: float):
        if not self.active:
            return
        self.timer += dt
        if self.kind == "toilet":
            # Cycle dots every 0.35 s → .  ..  ...
            self.dots = int(self.timer / 0.35) % 4
        elif self.kind == "sleep":
            # Slowly grow the Z string
            self.z_count = 1 + int(self.timer * 2.2)
            self.z_count = min(8, self.z_count)

        if self.timer >= self.duration:
            self.active = False
            self.kind = None

    def draw(self, surface: pygame.Surface, font_lg, font_md):
        if not self.active:
            return
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
        overlay.fill((12, 16, 28, 170))
        surface.blit(overlay, (0, 0))

        cx, cy = WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2

        if self.kind == "toilet":
            dots = "." * self.dots
            text = f"Cleaning{dots}"
            rendered = font_lg.render(text, True, (160, 220, 255))
            rect = rendered.get_rect(center=(cx, cy))
            surface.blit(rendered, rect)
            sub = font_md.render("Please wait a moment", True, (180, 200, 220))
            surface.blit(sub, sub.get_rect(center=(cx, cy + 42)))

        elif self.kind == "sleep":
            z_str = "Z" * self.z_count
            rendered = font_lg.render(z_str, True, (180, 210, 255))
            rect = rendered.get_rect(center=(cx, cy - 10))
            surface.blit(rendered, rect)
            sub = font_md.render("Sleeping... recovering energy", True, (160, 190, 230))
            surface.blit(sub, sub.get_rect(center=(cx, cy + 40)))


class Minigame:
    """Simple reaction / timing game used by the Train action."""
    def __init__(self):
        self.active = False
        self.phase = "wait"          # wait → show → result
        self.timer = 0.0
        self.target_time = 0.0
        self.player_reacted = False
        self.success = False
        self.message = ""

    def start(self, learning_level: float):
        self.active = True
        self.phase = "wait"
        self.timer = 0.0
        base = 1.4 - (learning_level / 200.0)
        self.target_time = random.uniform(0.9, max(1.1, base + 0.8))
        self.player_reacted = False
        self.success = False
        self.message = "Get ready..."

    def update(self, dt: float):
        if not self.active:
            return
        self.timer += dt
        if self.phase == "wait":
            if self.timer >= self.target_time:
                self.phase = "show"
                self.timer = 0.0
                self.message = "NOW!  (SPACE or Click)"
        elif self.phase == "show":
            window = 0.55
            if self.timer > window:
                self.phase = "result"
                self.success = False
                self.message = "Too slow..."
                self.active = False

    def react(self) -> bool:
        if not self.active or self.phase != "show":
            return False
        self.player_reacted = True
        self.success = True
        self.phase = "result"
        self.message = "Perfect timing!"
        self.active = False
        return True


class TrainingGame:
    """Small self-contained games used to train intelligence or speed."""
    def __init__(self):
        self.active = False
        self.mode: Optional[str] = None
        self.message = ""
        self.success = False
        self.board = [""] * 9
        self.obstacle_x = 0.0
        self.jump_timer = 0.0
        self.score = 0

    def start(self, mode: str):
        self.active = True
        self.mode = mode
        self.message = {
            "rps": "Choose R, P, or S",
            "ttt": "Your turn: click a square",
            "jump": "Press SPACE or click to jump",
        }[mode]
        self.success = False
        self.board = [""] * 9
        self.obstacle_x = 930.0
        self.jump_timer = 0.0
        self.score = 0

    def choose_rps(self, choice: str):
        if not self.active or self.mode != "rps":
            return
        computer = random.choice("rps")
        wins = {"r": "s", "p": "r", "s": "p"}
        self.success = choice != computer and wins[choice] == computer
        self.message = f"You: {choice.upper()}  Pet: {computer.upper()} — " + ("You win!" if self.success else "Try again!")
        self.active = False

    def choose_ttt(self, index: int):
        if not self.active or self.mode != "ttt" or not 0 <= index < 9 or self.board[index]:
            return
        self.board[index] = "X"
        if self._winner("X"):
            self.success, self.message, self.active = True, "Great strategy! You win!", False
            return
        free = [i for i, cell in enumerate(self.board) if not cell]
        if not free:
            self.success, self.message, self.active = False, "A draw — try again!", False
            return
        self.board[random.choice(free)] = "O"
        if self._winner("O"):
            self.success, self.message, self.active = False, "The pet wins this round!", False
        elif not any(not cell for cell in self.board):
            self.success, self.message, self.active = False, "A draw — try again!", False

    def _winner(self, mark: str) -> bool:
        return any(all(self.board[i] == mark for i in line) for line in (
            (0, 1, 2), (3, 4, 5), (6, 7, 8),
            (0, 3, 6), (1, 4, 7), (2, 5, 8),
            (0, 4, 8), (2, 4, 6),
        ))

    def jump(self):
        if self.active and self.mode == "jump" and self.jump_timer <= 0:
            self.jump_timer = 0.72

    def update(self, dt: float):
        if not self.active or self.mode != "jump":
            return
        self.jump_timer = max(0.0, self.jump_timer - dt)
        if self.obstacle_x < 100:
            if self.jump_timer <= 0:
                self.success, self.message, self.active = False, "Bonk! Jump a little later.", False
                return
            self.score += 1
            self.obstacle_x = 930.0
            self.message = f"Nice! Obstacles cleared: {self.score}"
            if self.score >= 3:
                self.success, self.message, self.active = True, "Speed course cleared!", False
        self.obstacle_x -= 330 * dt


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption(TITLE)
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        self.clock = pygame.time.Clock()
        self.running = True
        self.menu_open = True

        self.pet = Pet.load()
        self.ui = UI()
        self.sounds = SoundManager()
        self.midi_playing = False
        self._start_midi_music()

        self.minigame = Minigame()
        self.training = TrainingGame()
        self.training_menu = False
        self.overlay = ActionOverlay()
        self.food_particles: List[FoodParticle] = []
        self.stage_sprites: Dict[int, pygame.Surface] = self._load_stage_sprites()
        self.background = self._load_background()
        self.thought_text = ""
        self.thought_timer = 0.0
        self.next_thought_timer = 1.5

        self.last_low_warning = 0.0
        self.font_lg = pygame.font.SysFont("Segoe UI", 36, bold=True)
        self.font_md = pygame.font.SysFont("Segoe UI", 22)

    # ------------------------------------------------------------------
    # MIDI / Retro Audio Helpers
    # ------------------------------------------------------------------
    def _find_midi_file(self) -> Optional[str]:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        assets_dir = os.path.join(project_root, "assets")
        preferred = os.path.join(assets_dir, "pumkinmon_theme.mid")
        if os.path.isfile(preferred):
            return preferred
        if os.path.isdir(assets_dir):
            for fname in sorted(os.listdir(assets_dir)):
                if fname.lower().endswith((".mid", ".midi")):
                    return os.path.join(assets_dir, fname)
        return None

    def _start_midi_music(self, volume: float = 0.22):
        if not pygame.mixer.get_init():
            return
        midi_path = self._find_midi_file()
        if not midi_path:
            return
        try:
            pygame.mixer.music.load(midi_path)
            pygame.mixer.music.set_volume(volume)
            pygame.mixer.music.play(loops=-1)
            self.midi_playing = True
        except pygame.error:
            self.midi_playing = False

    def _toggle_midi(self) -> str:
        if not pygame.mixer.get_init():
            return "Audio mixer unavailable"
        if self.midi_playing:
            pygame.mixer.music.stop()
            self.midi_playing = False
            return "MIDI Music OFF"
        self._start_midi_music()
        return "MIDI Music ON" if self.midi_playing else "No .mid file in assets/"

    def _load_background(self) -> Optional[pygame.Surface]:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        path = os.path.join(project_root, BACKGROUND_FILE)
        try:
            image = pygame.image.load(path).convert()
            return pygame.transform.smoothscale(image, (WINDOW_WIDTH, WINDOW_HEIGHT))
        except (pygame.error, OSError):
            return None

    def _draw_scene(self):
        if self.background is not None:
            self.screen.blit(self.background, (0, 0))
        else:
            self.screen.fill(BG_COLOR)
        hour = datetime.now().hour
        is_daytime = 7 <= hour < 19
        shade = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
        if is_daytime:
            shade.fill((255, 221, 125, 22))
        else:
            shade.fill((10, 22, 62, 125))
        self.screen.blit(shade, (0, 0))
        # Climbable tree (simple stylized tree the pet can perch on)
        self._draw_tree()
        return is_daytime

    def _draw_tree(self):
        """Draw a climbable tree on the left side of the garden."""
        tx = 180
        base_y = 560
        # Trunk
        trunk_color = (92, 64, 40)
        pygame.draw.rect(self.screen, trunk_color, (tx - 14, base_y - 160, 28, 160), border_radius=4)
        pygame.draw.rect(self.screen, (70, 48, 30), (tx - 14, base_y - 160, 28, 160), width=2, border_radius=4)
        # Foliage layers
        foliage = [
            ((tx, base_y - 200), 70, (40, 110, 55)),
            ((tx - 25, base_y - 175), 55, (45, 130, 60)),
            ((tx + 25, base_y - 175), 55, (35, 100, 50)),
            ((tx, base_y - 230), 48, (50, 140, 65)),
        ]
        for (cx, cy), r, col in foliage:
            pygame.draw.circle(self.screen, col, (cx, cy), r)
            pygame.draw.circle(self.screen, (30, 80, 40), (cx, cy), r, width=2)
        # Small highlight
        pygame.draw.circle(self.screen, (90, 180, 100), (tx - 18, base_y - 215), 12)

    def _draw_smiling_sun(self):
        """Draw a small friendly sun above the pet during real-time daytime."""
        if not (7 <= datetime.now().hour < 19):
            return
        cx, cy = int(self.pet.x) + 48, max(155, int(self.pet.y) - 120)
        for angle in range(0, 360, 45):
            dx = int(math.cos(math.radians(angle)) * 24)
            dy = int(math.sin(math.radians(angle)) * 24)
            pygame.draw.line(self.screen, (255, 226, 116), (cx + dx // 2, cy + dy // 2), (cx + dx, cy + dy), 3)
        pygame.draw.circle(self.screen, (255, 215, 92), (cx, cy), 18)
        pygame.draw.circle(self.screen, (74, 58, 54), (cx - 6, cy - 4), 2)
        pygame.draw.circle(self.screen, (74, 58, 54), (cx + 6, cy - 4), 2)
        pygame.draw.arc(self.screen, (74, 58, 54), (cx - 8, cy, 16, 12), 3.5, 5.9, 2)

    def _pick_thought(self) -> str:
        """Choose an idea that reflects the pet's current mood or needs."""
        state = self.pet.state
        if state.is_sleeping or state.energy < CRITICAL:
            pool = [
                "hmm feeling eepy!!", "five more minutes... zzz",
                "my paws need a tiny nap", "dreaming of fluffy clouds",
            ]
        elif state.hunger < CRITICAL:
            pool = [
                "mhhm hungery :o", "is that a snack I smell?",
                "my tummy is doing a drum solo", "one tiny treat, please?",
            ]
        elif state.happiness < LOW:
            pool = [
                "let's play :-D", "could use a cuddle...",
                "where did all the fun go?", "boop my nose?",
            ]
        else:
            pool = [
                "let's play :-D", "I wonder what's over there?",
                "sparkles!! so many sparkles!!", "I am a very clever little pet",
                "zoomies loading...", "did I just see a butterfly?",
                "my wings feel extra floofy today", "boop!",
                "I shall conquer the sofa", "being cute is hard work",
                "I have important pet business", "what if the moon is pudding?",
                "*happy tiny noises*",
            ]
        return random.choice(pool)

    def _update_thought(self, dt: float):
        """Show short random ideas at varied intervals above the pet."""
        if self.thought_timer > 0.0:
            self.thought_timer = max(0.0, self.thought_timer - dt)
            return
        self.next_thought_timer = max(0.0, self.next_thought_timer - dt)
        if self.next_thought_timer <= 0.0:
            self.thought_text = self._pick_thought()
            self.thought_timer = random.uniform(3.2, 5.0)
            self.next_thought_timer = random.uniform(4.0, 8.0)

    # ------------------------------------------------------------------
    # Pet assets and rendering
    # ------------------------------------------------------------------
    def _load_stage_sprites(self) -> Dict[int, pygame.Surface]:
        """Load evolution sprites without depending on the process cwd.

        Missing or invalid optional assets are non-fatal; the vector pet below
        remains available as a fallback for older or partial installations.
        """
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sprites: Dict[int, pygame.Surface] = {}
        for stage in EVOLUTION_LINE:
            path = os.path.join(project_root, stage.get("sprite", ""))
            if not os.path.isfile(path):
                continue
            try:
                sprite = pygame.image.load(path).convert_alpha()
                max_size = 150
                if sprite.get_width() > max_size or sprite.get_height() > max_size:
                    scale = min(max_size / sprite.get_width(), max_size / sprite.get_height())
                    size = (
                        max(1, int(sprite.get_width() * scale)),
                        max(1, int(sprite.get_height() * scale)),
                    )
                    sprite = pygame.transform.smoothscale(sprite, size)
                sprites[stage["stage"]] = sprite
            except (pygame.error, OSError):
                continue
        return sprites

    def _draw_stage_sprite(self, surface: pygame.Surface) -> bool:
        sprite = self.stage_sprites.get(self.pet.state.evolution_stage)
        if sprite is None:
            return False
        if not self.pet.facing_right:
            sprite = pygame.transform.flip(sprite, True, False)
        rect = sprite.get_rect(center=(int(self.pet.x), int(self.pet.y - 8)))
        surface.blit(sprite, rect)
        return True

    # Procedural fallback (simple Digimon-like silhouette)
    def _draw_pet(self, surface: pygame.Surface):
        if self._draw_stage_sprite(surface):
            return
        x, y = int(self.pet.x), int(self.pet.y)
        mood = self.pet.state.mood
        frame = self.pet.frame
        facing = self.pet.facing_right

        if mood == "happy":
            body = (255, 200, 80)
        elif mood == "sick":
            body = (180, 200, 140)
        elif mood == "tired":
            body = (200, 180, 100)
        elif mood == "hungry":
            body = (230, 170, 70)
        elif mood == "sad":
            body = (210, 160, 90)
        else:
            body = (255, 190, 70)

        bob = 0
        if abs(self.pet.vx) > 0.1 or abs(self.pet.vy) > 0.1:
            bob = int(math.sin(frame * 1.2) * 3)
        cy = y + bob

        # Shadow
        pygame.draw.ellipse(surface, (20, 22, 30), (x - 28, y + 28, 56, 14))

        # Body
        body_rect = pygame.Rect(x - 26, cy - 20, 52, 48)
        pygame.draw.ellipse(surface, body, body_rect)
        pygame.draw.ellipse(surface, (30, 30, 40), body_rect, width=2)

        # Belly
        belly = pygame.Rect(x - 14, cy - 2, 28, 22)
        pygame.draw.ellipse(surface, (255, 240, 180), belly)

        # Head
        head_y = cy - 38
        pygame.draw.circle(surface, body, (x, head_y), 22)
        pygame.draw.circle(surface, (30, 30, 40), (x, head_y), 22, width=2)

        # Eyes
        eye_y = head_y - 2
        pygame.draw.circle(surface, (250, 250, 250), (x - 9, eye_y), 6)
        pygame.draw.circle(surface, (250, 250, 250), (x + 9, eye_y), 6)
        pupil_off = 2 if facing else -2
        pygame.draw.circle(surface, (30, 30, 40), (x - 9 + pupil_off, eye_y), 3)
        pygame.draw.circle(surface, (30, 30, 40), (x + 9 + pupil_off, eye_y), 3)

        # Mouth
        if mood == "happy":
            pygame.draw.arc(surface, (40, 40, 50), (x - 10, head_y + 4, 20, 14), 3.6, 6.0, 2)
        elif mood in ("sad", "sick"):
            pygame.draw.arc(surface, (40, 40, 50), (x - 10, head_y + 10, 20, 12), 0.4, 2.8, 2)
        else:
            pygame.draw.line(surface, (40, 40, 50), (x - 7, head_y + 10), (x + 7, head_y + 10), 2)

        # Arms
        arm_y = cy - 5
        if facing:
            pygame.draw.line(surface, body, (x + 24, arm_y), (x + 36, arm_y + 8), 5)
            pygame.draw.line(surface, body, (x - 24, arm_y), (x - 34, arm_y + 4), 5)
        else:
            pygame.draw.line(surface, body, (x - 24, arm_y), (x - 36, arm_y + 8), 5)
            pygame.draw.line(surface, body, (x + 24, arm_y), (x + 34, arm_y + 4), 5)

        # Sleeping indicator (extra visual when sleeping)
        if self.pet.state.is_sleeping and not self.overlay.active:
            z_font = pygame.font.SysFont("Segoe UI", 18, bold=True)
            z = z_font.render("Zzz", True, (180, 200, 255))
            surface.blit(z, (x + 20, head_y - 30))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _spawn_food(self):
        """Create several food circles that fly toward the pet."""
        for _ in range(7):
            side = random.choice(["top", "left", "right"])
            if side == "top":
                sx = random.uniform(80, WINDOW_WIDTH - 80)
                sy = random.uniform(40, 120)
            elif side == "left":
                sx = random.uniform(20, 80)
                sy = random.uniform(150, WINDOW_HEIGHT - 150)
            else:
                sx = random.uniform(WINDOW_WIDTH - 80, WINDOW_WIDTH - 20)
                sy = random.uniform(150, WINDOW_HEIGHT - 150)
            self.food_particles.append(FoodParticle((sx, sy), (self.pet.x, self.pet.y - 10)))

    def _check_low_needs(self):
        now = time.time()
        if now - self.last_low_warning < 8.0:
            return
        s = self.pet.state
        if s.hunger < CRITICAL or s.cleanliness < CRITICAL or s.happiness < CRITICAL or s.energy < CRITICAL:
            self.sounds.play("low")
            self.last_low_warning = now
            if s.hunger < CRITICAL:
                self.pet.need_icon = "feed"
            elif s.cleanliness < CRITICAL:
                self.pet.need_icon = "clean"
            elif s.happiness < CRITICAL:
                self.pet.need_icon = "play"
            elif s.energy < CRITICAL:
                self.pet.need_icon = "sleep"
            self.pet.need_icon_timer = 3.0

    def _handle_action(self, action: str):
        if action == "feed":
            msg = self.pet.feed()
            self.ui.set_message(msg)
            if "Yummy" in msg:
                self._spawn_food()
                self.sounds.play("feed")
        elif action == "toilet":
            msg = self.pet.toilet()
            self.ui.set_message(msg)
            if "clean" in msg.lower():
                self.overlay.start_toilet()
                self.sounds.play("clean")
        elif action == "play":
            msg = self.pet.play()
            self.ui.set_message(msg)
            if "fun" in msg.lower():
                self.sounds.play("play")
        elif action == "sleep":
            msg = self.pet.sleep()
            self.ui.set_message(msg)
            if "Zzz" in msg:
                self.overlay.start_sleep()
                self.sounds.play("sleep")
        elif action == "medicine":
            msg = self.pet.medicine()
            self.ui.set_message(msg)
            if "better" in msg.lower():
                self.sounds.play("med")
        elif action == "train":
            if self.pet.can_act():
                self.training_menu = True
            else:
                self.ui.set_message("Wait a moment...")

    def _finish_training(self):
        if self.training.mode == "jump":
            msg = self.pet.train_speed(success=self.training.success)
        else:
            msg = self.pet.train(success=self.training.success)
        self.ui.set_message(msg)
        self.sounds.play("success" if self.training.success else "fail")
        self.training_menu = False

    def _handle_training_key(self, key):
        if not self.training.active:
            return
        if self.training.mode == "rps":
            mapping = {pygame.K_r: "r", pygame.K_p: "p", pygame.K_s: "s"}
            if key in mapping:
                self.training.choose_rps(mapping[key])
                self._finish_training()
        elif self.training.mode == "jump" and key == pygame.K_SPACE:
            self.training.jump()

    def _handle_training_click(self, pos):
        if self.training_menu:
            panel = pygame.Rect(WINDOW_WIDTH // 2 - 330, WINDOW_HEIGHT // 2 - 180, 660, 360)
            buttons = [
                ("rps", pygame.Rect(panel.left + 70, panel.top + 135, 160, 60)),
                ("ttt", pygame.Rect(panel.left + 250, panel.top + 135, 160, 60)),
                ("jump", pygame.Rect(panel.left + 430, panel.top + 135, 160, 60)),
            ]
            for mode, rect in buttons:
                if rect.collidepoint(pos):
                    self.training.start(mode)
                    self.training_menu = False
                    return True
            return False
        if not self.training.active:
            return False
        if self.training.mode == "rps":
            choices = {
                "r": pygame.Rect(WINDOW_WIDTH // 2 - 220, WINDOW_HEIGHT // 2 + 10, 120, 54),
                "p": pygame.Rect(WINDOW_WIDTH // 2 - 60, WINDOW_HEIGHT // 2 + 10, 120, 54),
                "s": pygame.Rect(WINDOW_WIDTH // 2 + 100, WINDOW_HEIGHT // 2 + 10, 120, 54),
            }
            for choice, rect in choices.items():
                if rect.collidepoint(pos):
                    self.training.choose_rps(choice)
                    self._finish_training()
                    return True
        elif self.training.mode == "ttt":
            board_rect = pygame.Rect(WINDOW_WIDTH // 2 - 135, WINDOW_HEIGHT // 2 - 120, 270, 270)
            if board_rect.collidepoint(pos):
                cell_x = (pos[0] - board_rect.left) // 90
                cell_y = (pos[1] - board_rect.top) // 90
                self.training.choose_ttt(cell_y * 3 + cell_x)
                if not self.training.active:
                    self._finish_training()
                return True
        elif self.training.mode == "jump":
            self.training.jump()
            return True
        return False

    def _draw_training(self):
        if not self.training_menu and not self.training.active:
            return
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
        overlay.fill((12, 18, 32, 185))
        self.screen.blit(overlay, (0, 0))
        panel = pygame.Rect(WINDOW_WIDTH // 2 - 330, WINDOW_HEIGHT // 2 - 180, 660, 360)
        pygame.draw.rect(self.screen, (30, 44, 70), panel, border_radius=22)
        pygame.draw.rect(self.screen, (145, 220, 255), panel, 3, border_radius=22)
        title = self.font_lg.render("Training Lab", True, (240, 250, 255))
        self.screen.blit(title, title.get_rect(center=(panel.centerx, panel.top + 42)))
        if self.training_menu:
            sub = self.font_md.render("Choose a game to build intelligence or speed", True, (190, 214, 235))
            self.screen.blit(sub, sub.get_rect(center=(panel.centerx, panel.top + 88)))
            buttons = [
                ("Rock / Paper / Scissors", pygame.Rect(panel.left + 70, panel.top + 135, 160, 60)),
                ("Tic-Tac-Toe", pygame.Rect(panel.left + 250, panel.top + 135, 160, 60)),
                ("Jump Obstacles", pygame.Rect(panel.left + 430, panel.top + 135, 160, 60)),
            ]
            for label, rect in buttons:
                pygame.draw.rect(self.screen, (52, 76, 106), rect, border_radius=12)
                pygame.draw.rect(self.screen, (130, 210, 255), rect, 2, border_radius=12)
                text = self.ui.font_sm.render(label, True, (240, 248, 255))
                self.screen.blit(text, text.get_rect(center=rect.center))
            return
        message = self.training.message
        text = self.font_md.render(message, True, (255, 231, 143))
        self.screen.blit(text, text.get_rect(center=(panel.centerx, panel.top + 88)))
        if self.training.mode == "rps":
            for label, key, x in (("Rock", "R", -220), ("Paper", "P", -60), ("Scissors", "S", 100)):
                rect = pygame.Rect(panel.centerx + x, panel.top + 175, 120, 54)
                pygame.draw.rect(self.screen, (52, 76, 106), rect, border_radius=10)
                pygame.draw.rect(self.screen, (130, 210, 255), rect, 2, border_radius=10)
                rendered = self.ui.font_sm.render(f"{label} ({key})", True, (240, 248, 255))
                self.screen.blit(rendered, rendered.get_rect(center=rect.center))
        elif self.training.mode == "ttt":
            rect = pygame.Rect(panel.centerx - 135, panel.top + 115, 270, 270)
            for i, mark in enumerate(self.training.board):
                cell = pygame.Rect(rect.left + (i % 3) * 90, rect.top + (i // 3) * 90, 90, 90)
                pygame.draw.rect(self.screen, (48, 68, 95), cell)
                pygame.draw.rect(self.screen, (145, 220, 255), cell, 2)
                if mark:
                    rendered = self.font_lg.render(mark, True, (255, 231, 143) if mark == "X" else (181, 220, 255))
                    self.screen.blit(rendered, rendered.get_rect(center=cell.center))
        elif self.training.mode == "jump":
            ground_y = panel.centery + 40
            pygame.draw.rect(self.screen, (80, 120, 90), (panel.left + 40, ground_y, panel.width - 80, 18))
            player_y = ground_y - 28 - (38 if self.training.jump_timer > 0 else 0)
            pygame.draw.circle(self.screen, (255, 200, 80), (panel.left + 120, player_y), 18)
            ox = int(self.training.obstacle_x)
            if panel.left + 40 < ox < panel.right - 40:
                pygame.draw.rect(self.screen, (200, 80, 80), (ox, ground_y - 40, 28, 40))

    def _finish_minigame(self):
        success = self.minigame.success
        msg = self.pet.train(success=success)
        self.ui.set_message(msg)
        if success:
            self.sounds.play("success")
            self.sounds.play("learn")
        else:
            self.sounds.play("fail")

    def _safe_exit(self):
        """Save and quit cleanly."""
        self.pet.save()
        if pygame.mixer.get_init():
            pygame.mixer.music.stop()
        pygame.quit()
        sys.exit()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------
    def run(self):
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0

            # ---------- Events ----------
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self._safe_exit()
                elif event.type == pygame.KEYDOWN:
                    if self.training.active:
                        self._handle_training_key(event.key)
                    elif self.training_menu and event.key == pygame.K_ESCAPE:
                        self.training_menu = False
                    elif event.key in (pygame.K_ESCAPE, pygame.K_q):
                        if self.menu_open:
                            self.menu_open = False
                        else:
                            self.menu_open = True
                    elif event.key == pygame.K_m:
                        enabled = self.sounds.toggle()
                        self.ui.set_message("Sound " + ("ON" if enabled else "OFF"))
                    elif event.key == pygame.K_F5:
                        self.ui.set_message(self._toggle_midi())
                    elif event.key == pygame.K_SPACE:
                        if self.minigame.active:
                            self.minigame.react()
                            self._finish_minigame()
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if self.training_menu or self.training.active:
                        self._handle_training_click(event.pos)
                    elif self.minigame.active and self.minigame.phase == "show":
                        self.minigame.react()
                        self._finish_minigame()
                    else:
                        action = self.ui.handle_click(event.pos, menu_open=self.menu_open)
                        if action == "exit" or action == "menu_quit":
                            self._safe_exit()
                        elif action == "menu_resume":
                            self.menu_open = False
                        elif action == "menu_save" or action == "save_progress":
                            self.pet.save()
                            self.ui.set_message("Progress saved!")
                        elif action == "menu_load":
                            self.pet = Pet.load()
                            self.ui.set_message("Game loaded!")
                        elif action and not self.menu_open:
                            self._handle_action(action)

            if self.menu_open:
                # Keep drawing the menu but pause simulation
                self.ui.handle_hover(pygame.mouse.get_pos())
                self._draw_scene()
                pygame.draw.rect(self.screen, (40, 48, 65),
                                 (0, WINDOW_HEIGHT - 148, WINDOW_WIDTH, 148))
                self._draw_pet(self.screen)
                self.ui.draw_bars(self.screen, self.pet.get_status_summary())
                self.ui.draw_date(self.screen)
                self.ui.draw_save_button(self.screen)
                self.ui.draw_exit_button(self.screen)
                self.ui.draw_cards(self.screen)
                self.ui.draw_main_menu(self.screen)
                pygame.display.flip()
                continue

            # ---------- Update ----------
            if not self.overlay.active and not self.training.active and not self.minigame.active:
                self.pet.update(dt)
                self._update_thought(dt)
                self._check_low_needs()

            self.overlay.update(dt)
            self.minigame.update(dt)
            self.training.update(dt)
            self.ui.update(dt)

            # Food particles
            still_alive = []
            for p in self.food_particles:
                p.update(dt)
                if p.alive:
                    still_alive.append(p)
            self.food_particles = still_alive

            # Evolution / rebirth feedback
            evo = self.pet.consume_evolution_event()
            if evo:
                self.ui.set_message(f"Evolved into {evo['name']}!")
                self.sounds.play("learn")

            if hasattr(self.pet, "consume_rebirth_event"):
                rebirth = self.pet.consume_rebirth_event()
                if rebirth:
                    self.ui.set_message(
                        f"Reborn as {rebirth['new_name']} (Gen {rebirth['generation']})!"
                    )
                    self.sounds.play("success")

            # ---------- Draw ----------
            self._draw_scene()
            pygame.draw.rect(self.screen, (40, 48, 65),
                             (0, WINDOW_HEIGHT - 148, WINDOW_WIDTH, 148))

            self._draw_pet(self.screen)
            self._draw_smiling_sun()
            self.ui.draw_thought_bubble(self.screen, self.pet.x, self.pet.y, self.thought_text)

            # Food particles (drawn on top of pet)
            for p in self.food_particles:
                p.draw(self.screen)

            self.ui.draw_need_icon(self.screen, self.pet.x, self.pet.y, self.pet.need_icon)
            self.ui.draw_bars(self.screen, self.pet.get_status_summary())
            self.ui.draw_date(self.screen)
            self.ui.draw_save_button(self.screen)
            self.ui.draw_exit_button(self.screen)
            self.ui.draw_cards(self.screen)
            self.ui.draw_message(self.screen)
            self.ui.draw_pet_name(self.screen, self.pet.state.name, self.pet.state.mood)

            # Minigame overlay
            if self.minigame.active or (self.minigame.phase == "result" and self.minigame.message):
                overlay = pygame.Surface((WINDOW_WIDTH, 80), pygame.SRCALPHA)
                overlay.fill((15, 20, 35, 210))
                self.screen.blit(overlay, (0, WINDOW_HEIGHT // 2 - 40))
                msg = self.minigame.message
                font = pygame.font.SysFont("Segoe UI", 28, bold=True)
                txt = font.render(msg, True, (255, 230, 120))
                rect = txt.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2))
                self.screen.blit(txt, rect)

            # Toilet / Sleep visual sequences
            self.overlay.draw(self.screen, self.font_lg, self.font_md)
            self._draw_training()

            if self.menu_open:
                self.ui.draw_main_menu(self.screen)

            pygame.display.flip()

        # Final save on any exit path
        self.pet.save()
        pygame.quit()
        sys.exit()
