"""
Main game loop, pet rendering (procedural Digimon-like sprite),
simple reaction minigame for training, and overall orchestration.
"""

from __future__ import annotations
import math
import random
import sys
import time
from typing import Optional, Tuple

import pygame

from .config import (
    WINDOW_WIDTH, WINDOW_HEIGHT, FPS, TITLE, BG_COLOR,
    CRITICAL, LOW
)
from .pet import Pet
from .ui import UI
from .sounds import SoundManager


class Minigame:
    """Very simple reaction / timing game the pet can learn."""

    def __init__(self):
        self.active = False
        self.phase = "wait"          # wait -> show -> result
        self.timer = 0.0
        self.target_time = 0.0
        self.player_reacted = False
        self.success = False
        self.message = ""

    def start(self, learning_level: float):
        self.active = True
        self.phase = "wait"
        self.timer = 0.0
        # Higher learning = slightly more predictable / easier window
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
            # Window of opportunity ~0.55s, slightly wider with learning
            window = 0.55
            if self.timer > window:
                self.phase = "result"
                self.success = False
                self.message = "Too slow..."
                self.active = False

    def react(self):
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

        self.pet = Pet.load()
        self.ui = UI()
        self.sounds = SoundManager()
        self.minigame = Minigame()

        self.last_low_warning = 0.0
        self.font_debug = pygame.font.SysFont("Consolas", 14)

    # ------------------------------------------------------------------
    # Drawing the pet (procedural simple Digimon-like creature)
    # ------------------------------------------------------------------
    def _draw_pet(self, surface: pygame.Surface):
        x, y = int(self.pet.x), int(self.pet.y)
        mood = self.pet.state.mood
        frame = self.pet.frame
        facing = self.pet.facing_right

        # Body color shifts slightly with mood
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
            body = (255, 190, 70)  # classic Agumon-ish orange-yellow

        # Simple bobbing when walking
        bob = 0
        if abs(self.pet.vx) > 0.1 or abs(self.pet.vy) > 0.1:
            bob = int(math.sin(frame * 1.2) * 3)

        cy = y + bob

        # Shadow
        pygame.draw.ellipse(surface, (20, 22, 30), (x - 28, y + 28, 56, 14))

        # Legs (simple)
        leg_offset = 6 if frame % 2 == 0 else -6
        if abs(self.pet.vx) > 0.1:
            pygame.draw.rect(surface, (40, 40, 50), (x - 18, cy + 18, 10, 16), border_radius=3)
            pygame.draw.rect(surface, (40, 40, 50), (x + 8, cy + 18, 10, 16), border_radius=3)
        else:
            pygame.draw.rect(surface, (40, 40, 50), (x - 16, cy + 20, 10, 14), border_radius=3)
            pygame.draw.rect(surface, (40, 40, 50), (x + 6, cy + 20, 10, 14), border_radius=3)

        # Body (rounded rectangle / oval)
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
        eye_dx = 8 if facing else -8
        eye_y = head_y - 2
        # White
        pygame.draw.circle(surface, (250, 250, 250), (x - 9, eye_y), 6)
        pygame.draw.circle(surface, (250, 250, 250), (x + 9, eye_y), 6)
        # Pupils
        pupil_off = 2 if facing else -2
        pygame.draw.circle(surface, (30, 30, 40), (x - 9 + pupil_off, eye_y), 3)
        pygame.draw.circle(surface, (30, 30, 40), (x + 9 + pupil_off, eye_y), 3)

        # Mouth depending on mood
        if mood == "happy":
            pygame.draw.arc(surface, (40, 40, 50), (x - 10, head_y + 4, 20, 14), 3.6, 6.0, 2)
        elif mood == "sad" or mood == "sick":
            pygame.draw.arc(surface, (40, 40, 50), (x - 10, head_y + 10, 20, 12), 0.4, 2.8, 2)
        else:
            pygame.draw.line(surface, (40, 40, 50), (x - 7, head_y + 10), (x + 7, head_y + 10), 2)

        # Little arms
        arm_y = cy - 5
        if facing:
            pygame.draw.line(surface, body, (x + 24, arm_y), (x + 36, arm_y + 8), 5)
            pygame.draw.line(surface, body, (x - 24, arm_y), (x - 34, arm_y + 4), 5)
        else:
            pygame.draw.line(surface, body, (x - 24, arm_y), (x - 36, arm_y + 8), 5)
            pygame.draw.line(surface, body, (x + 24, arm_y), (x + 34, arm_y + 4), 5)

        # Sleeping indicator
        if self.pet.state.is_sleeping:
            z_font = pygame.font.SysFont("Segoe UI", 18, bold=True)
            z = z_font.render("Zzz", True, (180, 200, 255))
            surface.blit(z, (x + 20, head_y - 30))

    # ------------------------------------------------------------------
    # Main loop helpers
    # ------------------------------------------------------------------
    def _check_low_needs(self):
        now = time.time()
        if now - self.last_low_warning < 12.0:
            return
        s = self.pet.state
        if s.hunger < CRITICAL or s.cleanliness < CRITICAL or s.energy < CRITICAL or s.happiness < CRITICAL:
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
        elif key == "toilet":
            msg = self.pet.toilet()
            if "clean" in msg.lower():
                self.sounds.play("clean")
        elif key == "play":
            msg = self.pet.play()
            if "fun" in msg.lower():
                self.sounds.play("play")
        elif key == "sleep":
            msg = self.pet.sleep()
            if "Zzz" in msg:
                self.sounds.play("sleep")
        elif key == "medicine":
            msg = self.pet.medicine()
            if "better" in msg.lower():
                self.sounds.play("med")
        elif key == "train":
            if self.pet.can_act() and self.pet.state.stamina >= 20 and self.pet.state.energy >= 25:
                self.minigame.start(self.pet.state.learning)
                self.ui.set_message("Training! Wait for the signal...")
                return
            else:
                msg = self.pet.train(success=False)  # will return the reason

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

    # ------------------------------------------------------------------
    # Main run loop
    # ------------------------------------------------------------------
    def run(self):
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0

            # Events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE or event.key == pygame.K_q:
                        self.running = False
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
                        action = self.ui.handle_click(event.pos)
                        if action:
                            self._handle_action(action)

            # Update
            mouse = pygame.mouse.get_pos()
            self.ui.handle_hover(mouse)
            self.ui.update(dt)
            self.pet.update(dt)
            self.minigame.update(dt)

            # If minigame just ended by timeout
            if not self.minigame.active and self.minigame.phase == "result" and self.minigame.message:
                # Already handled in react path; clear residual
                if not self.minigame.player_reacted and self.minigame.message.startswith("Too"):
                    self._finish_minigame()
                    self.minigame.message = ""  # prevent double

            self._check_low_needs()

            # Draw
            self.screen.fill(BG_COLOR)

            # Soft ground line
            pygame.draw.rect(self.screen, (40, 48, 65), (0, WINDOW_HEIGHT - 150, WINDOW_WIDTH, 150))

            self._draw_pet(self.screen)
            self.ui.draw_need_icon(self.screen, self.pet.x, self.pet.y, self.pet.need_icon)
            self.ui.draw_bars(self.screen, self.pet.get_status_summary())
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

            pygame.display.flip()

        # Cleanup
        self.pet.save()
        pygame.quit()
        sys.exit()
