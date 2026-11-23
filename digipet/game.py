"""
Main game loop for DigiAI-Pet.
Includes procedural pet rendering, reaction minigame,
and visual action feedback:
  - Feed  → food circles that fly toward the pet
  - Toilet → short loading overlay with animated dots
  - Sleep → slowly growing "Zzzzzz" text
Also shows current date and a persistent Exit button that saves.
"""

from __future__ import annotations
import math
import random
import sys
import time
from typing import List, Optional, Tuple

import pygame

from .config import (
    WINDOW_WIDTH, WINDOW_HEIGHT, FPS, TITLE, BG_COLOR,
    CRITICAL, LOW, HUNGER_COLOR, CLEAN_COLOR, ENERGY_COLOR
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


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption(TITLE)
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        self.clock = pygame.time.Clock()
        self.running = True
        self.menu_open = False

        self.pet = Pet.load()
        self.ui = UI()
        self.sounds = SoundManager()
        self.minigame = Minigame()
        self.overlay = ActionOverlay()
        self.food_particles: List[FoodParticle] = []

        self.last_low_warning = 0.0
        self.font_lg = pygame.font.SysFont("Segoe UI", 36, bold=True)
        self.font_md = pygame.font.SysFont("Segoe UI", 22)

    # ------------------------------------------------------------------
    # Procedural pet drawing (simple Digimon-like silhouette)
    # ------------------------------------------------------------------
    def _draw_pet(self, surface: pygame.Surface):
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

        # Legs
        if abs(self.pet.vx) > 0.1:
            pygame.draw.rect(surface, (40, 40, 50), (x - 18, cy + 18, 10, 16), border_radius=3)
            pygame.draw.rect(surface, (40, 40, 50), (x + 8, cy + 18, 10, 16), border_radius=3)
        else:
            pygame.draw.rect(surface, (40, 40, 50), (x - 16, cy + 20, 10, 14), border_radius=3)
            pygame.draw.rect(surface, (40, 40, 50), (x + 6, cy + 20, 10, 14), border_radius=3)

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
            # Start from random positions around the edges / upper area
            side = random.choice(["top", "left", "right"])
            if side == "top":
                sx = random.uniform(80, WINDOW_WIDTH - 80)
                sy = random.uniform(40, 120)
            elif side == "left":
                sx = random.uniform(20, 80)
                sy = random.uniform(150, 400)
            else:
                sx = random.uniform(WINDOW_WIDTH - 80, WINDOW_WIDTH - 20)
                sy = random.uniform(150, 400)
            self.food_particles.append(
                FoodParticle((sx, sy), (self.pet.x, self.pet.y - 10))
            )

    def _check_low_needs(self):
        now = time.time()
        if now - self.last_low_warning < 12.0:
            return
        s = self.pet.state
        if (s.hunger < CRITICAL or s.cleanliness < CRITICAL or
                s.energy < CRITICAL or s.happiness < CRITICAL):
            self.sounds.play("low")
            self.pet.need_icon = "low"
            self.pet.need_icon_timer = 3.0
            self.last_low_warning = now
            self.ui.set_message("Your Digimon needs attention!")

    def _handle_action(self, key: str):
        self.sounds.play("click")
        msg = ""

        if key == "feed":
            msg = self.pet.feed()
            if "Yummy" in msg:
                self.sounds.play("feed")
                self._spawn_food()
        elif key == "toilet":
            msg = self.pet.toilet()
            if "clean" in msg.lower():
                self.sounds.play("clean")
                self.overlay.start_toilet()
        elif key == "play":
            msg = self.pet.play()
            if "fun" in msg.lower():
                self.sounds.play("play")
        elif key == "sleep":
            msg = self.pet.sleep()
            if "Zzz" in msg:
                self.sounds.play("sleep")
                self.overlay.start_sleep()
        elif key == "medicine":
            msg = self.pet.medicine()
            if "better" in msg.lower():
                self.sounds.play("med")
        elif key == "train":
            if (self.pet.can_act() and self.pet.state.stamina >= 20
                    and self.pet.state.energy >= 25):
                self.minigame.start(self.pet.state.learning)
                self.ui.set_message("Training! Wait for the signal...")
                return
            else:
                msg = self.pet.train(success=False)

        if msg:
            self.ui.set_message(msg)

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
        self.running = False

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
                    if event.key in (pygame.K_ESCAPE, pygame.K_q):
                        if self.menu_open:
                            self.menu_open = False
                        else:
                            self.menu_open = True
                    elif event.key == pygame.K_m:
                        enabled = self.sounds.toggle()
                        self.ui.set_message("Sound " + ("ON" if enabled else "OFF"))
                    elif event.key == pygame.K_SPACE:
                        if self.minigame.active:
                            self.minigame.react()
                            self._finish_minigame()
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if self.minigame.active and self.minigame.phase == "show":
                        self.minigame.react()
                        self._finish_minigame()
                    else:
                        action = self.ui.handle_click(event.pos, menu_open=self.menu_open)
                        if action == "exit" or action == "menu_quit":
                            self._safe_exit()
                        elif action == "menu_resume":
                            self.menu_open = False
                        elif action == "menu_save":
                            self.pet.save()
                            self.ui.set_message("Game saved!")
                            self.sounds.play("click")
                        elif action == "menu_load":
                            self.pet = Pet.load()
                            self.ui.set_message("Game loaded!")
                            self.sounds.play("click")
                        elif action and not self.menu_open and not self.overlay.active:
                            self._handle_action(action)

            # ---------- Update ----------
            mouse = pygame.mouse.get_pos()
            self.ui.handle_hover(mouse)
            self.ui.update(dt)

            if not self.menu_open:
                self.pet.update(dt)
                self.minigame.update(dt)
                self.overlay.update(dt)

                # Update food particles
                for p in self.food_particles[:]:
                    p.update(dt)
                    if not p.alive:
                        self.food_particles.remove(p)

                # Finish minigame on timeout
                if (not self.minigame.active and self.minigame.phase == "result"
                        and self.minigame.message.startswith("Too")):
                    self._finish_minigame()
                    self.minigame.message = ""

                self._check_low_needs()

                # Evolution feedback
                evo = self.pet.consume_evolution_event()
                if evo:
                    self.ui.set_message(f"Evolved into {evo['name']}!")
                    self.sounds.play("learn")

            # ---------- Draw ----------
            self.screen.fill(BG_COLOR)
            pygame.draw.rect(self.screen, (40, 48, 65),
                             (0, WINDOW_HEIGHT - 150, WINDOW_WIDTH, 150))

            self._draw_pet(self.screen)

            # Food particles (drawn on top of pet)
            for p in self.food_particles:
                p.draw(self.screen)

            self.ui.draw_need_icon(self.screen, self.pet.x, self.pet.y, self.pet.need_icon)
            self.ui.draw_bars(self.screen, self.pet.get_status_summary())
            self.ui.draw_date(self.screen)
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

            if self.menu_open:
                self.ui.draw_main_menu(self.screen)

            pygame.display.flip()

        # Final save on any exit path
        self.pet.save()
        pygame.quit()
        sys.exit()
