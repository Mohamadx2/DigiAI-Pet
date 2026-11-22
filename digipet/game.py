

"""
Main game loop, pet rendering (Luminamon evolution line sprites / procedural art),
simple reaction minigame for training, and overall orchestration.
"""

from __future__ import annotations
import math
import os
import random
import sys
import time
from typing import Dict, Optional

import pygame

from .config import (
    WINDOW_WIDTH, WINDOW_HEIGHT, FPS, TITLE, BG_COLOR,
    CRITICAL, EVOLUTION_LINE
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
        self.evolution_effect_timer = 0.0
        self.font_debug = pygame.font.SysFont("Consolas", 14)
        self.font_badge = pygame.font.SysFont("Segoe UI", 13, bold=True)
        self.sprites: Dict[int, Optional[pygame.Surface]] = self._load_stage_sprites()

    # ------------------------------------------------------------------
    # Optional sprite loading (falls back to procedural art per stage)
    # ------------------------------------------------------------------
    def _load_stage_sprites(self) -> Dict[int, Optional[pygame.Surface]]:
        loaded: Dict[int, Optional[pygame.Surface]] = {}
        target_sizes = {0: (78, 78), 1: (100, 100), 2: (124, 124), 3: (148, 148)}
        for info in EVOLUTION_LINE:
            stage = info["stage"]
            path = info.get("sprite", "")
            if path and os.path.exists(path):
                try:
                    img = pygame.image.load(path).convert_alpha()
                    img = pygame.transform.smoothscale(img, target_sizes.get(stage, (100, 100)))
                    loaded[stage] = img
                    continue
                except Exception:
                    pass
            loaded[stage] = None
        return loaded

    def _tint_for_mood(self, base: tuple[int, int, int], mood: str) -> tuple[int, int, int]:
        r, g, b = base
        if mood == "sick":
            return (max(0, r - 45), min(255, g + 15), max(0, b - 25))
        if mood == "tired":
            return (max(0, r - 35), max(0, g - 30), max(0, b - 20))
        if mood == "hungry":
            return (r, max(0, g - 25), max(0, b - 25))
        if mood == "sad":
            return (max(0, r - 25), max(0, g - 25), min(255, b + 15))
        return base

    def _draw_eyes_and_mouth(
        self,
        surface: pygame.Surface,
        ex_left: int,
        ex_right: int,
        ey: int,
        mouth_x: int,
        mouth_y: int,
        mood: str,
        facing: bool,
        iris_color: tuple[int, int, int] = (40, 40, 55),
    ):
        pupil_off = 2 if facing else -2
        if self.pet.state.is_sleeping:
            pygame.draw.arc(surface, (40, 40, 55), (ex_left - 5, ey - 2, 10, 6), 3.3, 6.1, 2)
            pygame.draw.arc(surface, (40, 40, 55), (ex_right - 5, ey - 2, 10, 6), 3.3, 6.1, 2)
        else:
            for ex in (ex_left, ex_right):
                pygame.draw.circle(surface, (252, 252, 255), (ex, ey), 5)
                pygame.draw.circle(surface, iris_color, (ex + pupil_off, ey), 3)
                pygame.draw.circle(surface, (255, 255, 255), (ex + pupil_off - 1, ey - 1), 1)

        if mood == "happy":
            pygame.draw.arc(surface, (50, 40, 50), (mouth_x - 8, mouth_y - 4, 16, 10), 3.5, 6.0, 2)
        elif mood in ("sad", "sick"):
            pygame.draw.arc(surface, (50, 40, 50), (mouth_x - 8, mouth_y + 2, 16, 10), 0.4, 2.8, 2)
        else:
            pygame.draw.line(surface, (50, 40, 50), (mouth_x - 5, mouth_y + 2), (mouth_x + 5, mouth_y + 2), 2)

    # ------------------------------------------------------------------
    # Stage-specific character drawing (Luminamon Evolution Line)
    # ------------------------------------------------------------------
    def _draw_puwamon(self, surface: pygame.Surface, x: int, y: int, bob: int, mood: str, facing: bool):
        """Level 1: In-Training - Puwamon (Vaccine / Slime)."""
        t = pygame.time.get_ticks() / 1000.0
        float_y = y + bob - 4 + int(math.sin(t * 3.5) * 3)
        wing_flap = int(math.sin(t * 7.0) * 4)

        body_col = self._tint_for_mood((255, 236, 175), mood)
        wing_col = self._tint_for_mood((255, 245, 205), mood)
        outline = (65, 55, 45)

        # Shadow
        pygame.draw.ellipse(surface, (20, 22, 30), (x - 24, y + 26, 48, 12))

        # Little wings
        left_wing = [(x - 22, float_y - 2), (x - 42, float_y - 18 + wing_flap), (x - 34, float_y + 4)]
        right_wing = [(x + 22, float_y - 2), (x + 42, float_y - 18 + wing_flap), (x + 34, float_y + 4)]
        pygame.draw.polygon(surface, wing_col, left_wing)
        pygame.draw.polygon(surface, outline, left_wing, 2)
        pygame.draw.polygon(surface, wing_col, right_wing)
        pygame.draw.polygon(surface, outline, right_wing, 2)

        # Round slime body
        body_rect = pygame.Rect(x - 26, float_y - 22, 52, 46)
        pygame.draw.ellipse(surface, body_col, body_rect)
        pygame.draw.ellipse(surface, outline, body_rect, 2)

        # Top curl / tuft
        tuft = [(x - 6, float_y - 20), (x + (4 if facing else -4), float_y - 34), (x + 6, float_y - 20)]
        pygame.draw.polygon(surface, body_col, tuft)
        pygame.draw.lines(surface, outline, False, tuft, 2)

        # Rosy cheeks
        pygame.draw.ellipse(surface, (255, 165, 165), (x - 19, float_y + 1, 9, 5))
        pygame.draw.ellipse(surface, (255, 165, 165), (x + 10, float_y + 1, 9, 5))

        shift = 3 if facing else -3
        self._draw_eyes_and_mouth(surface, x - 9 + shift, x + 9 + shift, float_y - 4, x + shift, float_y + 5, mood, facing)

    def _draw_luminamon(self, surface: pygame.Surface, x: int, y: int, bob: int, mood: str, facing: bool):
        """Level 2: Rookie - Luminamon (Vaccine / Holy Beast)."""
        t = pygame.time.get_ticks() / 1000.0
        cy = y + bob
        d = 1 if facing else -1

        fur = self._tint_for_mood((165, 242, 238), mood)
        ruff = self._tint_for_mood((215, 252, 250), mood)
        pastel = (235, 185, 245)
        outline = (45, 70, 85)

        # Shadow
        pygame.draw.ellipse(surface, (20, 22, 30), (x - 32, y + 28, 64, 14))

        # Winged starry tail behind body
        tail_x = x - d * 24
        tail_pts = [
            (tail_x, cy + 4),
            (tail_x - d * 26, cy - 22 + int(math.sin(t * 4) * 3)),
            (tail_x - d * 18, cy + 8),
        ]
        pygame.draw.polygon(surface, pastel, tail_pts)
        pygame.draw.polygon(surface, outline, tail_pts, 2)

        # Paws
        step = 3 if (self.pet.frame % 2 == 1 and abs(self.pet.vx) > 0.1) else 0
        for px, py_off in [(x - 16, step), (x - 4, -step), (x + 8, step), (x + 18, -step)]:
            pygame.draw.ellipse(surface, fur, (px - 5, cy + 16 + py_off, 10, 14))
            pygame.draw.ellipse(surface, outline, (px - 5, cy + 16 + py_off, 10, 14), 2)

        # Body + fluffy chest
        body_rect = pygame.Rect(x - 24, cy - 10, 48, 32)
        pygame.draw.ellipse(surface, fur, body_rect)
        pygame.draw.ellipse(surface, outline, body_rect, 2)
        pygame.draw.ellipse(surface, ruff, (x + d * 4 - 12, cy - 8, 24, 22))

        # Head + large ears
        hx, hy = x + d * 8, cy - 26
        for ear_side in (-1, 1):
            ear = [
                (hx + ear_side * 10, hy - 12),
                (hx + ear_side * 24, hy - 42),
                (hx + ear_side * 2, hy - 20),
            ]
            pygame.draw.polygon(surface, fur, ear)
            pygame.draw.polygon(surface, outline, ear, 2)
            inner = [
                (hx + ear_side * 10, hy - 15),
                (hx + ear_side * 20, hy - 35),
                (hx + ear_side * 5, hy - 20),
            ]
            pygame.draw.polygon(surface, pastel, inner)

        pygame.draw.circle(surface, fur, (hx, hy), 20)
        pygame.draw.circle(surface, outline, (hx, hy), 20, 2)

        # Sparkles
        for i in range(3):
            ang = t * 2.2 + i * 2.1
            sx = int(x + math.cos(ang) * 38)
            sy = int(cy - 18 + math.sin(ang) * 20)
            pygame.draw.circle(surface, (255, 245, 160), (sx, sy), 2)

        self._draw_eyes_and_mouth(
            surface, hx - 8, hx + 8, hy - 2, hx + d * 2, hy + 8,
            mood, facing, iris_color=(70, 130, 220),
        )

    def _draw_solarmon(self, surface: pygame.Surface, x: int, y: int, bob: int, mood: str, facing: bool):
        """Level 3: Champion - Solarmon (Vaccine / Holy Knight)."""
        t = pygame.time.get_ticks() / 1000.0
        cy = y + bob
        d = 1 if facing else -1

        armor = self._tint_for_mood((242, 242, 250), mood)
        gold = self._tint_for_mood((245, 195, 65), mood)
        flame = (255, 125, 35)
        flame_core = (255, 225, 95)
        outline = (50, 45, 55)

        # Shadow
        pygame.draw.ellipse(surface, (20, 22, 30), (x - 38, y + 32, 76, 15))

        # Blazing tail
        tx = x - d * 30
        flicker = int(math.sin(t * 8.0) * 4)
        pygame.draw.line(surface, gold, (tx, cy), (tx - d * 20, cy - 16), 4)
        pygame.draw.circle(surface, flame, (tx - d * 24, cy - 20 + flicker), 10)
        pygame.draw.circle(surface, flame_core, (tx - d * 24, cy - 20 + flicker), 5)

        # Armored legs
        step = 4 if (self.pet.frame % 2 == 1 and abs(self.pet.vx) > 0.1) else 0
        for lx, off in [(x - 20, step), (x - 6, -step), (x + 10, step), (x + 22, -step)]:
            pygame.draw.rect(surface, armor, (lx - 5, cy + 12 + off, 10, 22), border_radius=3)
            pygame.draw.rect(surface, gold, (lx - 6, cy + 26 + off, 12, 8), border_radius=2)
            pygame.draw.rect(surface, outline, (lx - 5, cy + 12 + off, 10, 22), 2, border_radius=3)

        # Armored torso + sun emblem
        torso = pygame.Rect(x - 30, cy - 12, 60, 32)
        pygame.draw.ellipse(surface, armor, torso)
        pygame.draw.ellipse(surface, outline, torso, 2)
        pygame.draw.circle(surface, gold, (x + d * 8, cy + 2), 9)
        pygame.draw.circle(surface, flame_core, (x + d * 8, cy + 2), 4)

        # Fiery mane
        hx, hy = x + d * 18, cy - 22
        for i in range(7):
            ang = -2.4 + i * 0.8
            mx = hx + int(math.cos(ang) * (24 + (i % 2) * 5))
            my = hy + int(math.sin(ang) * (24 + (i % 2) * 5)) + (flicker // 2)
            pygame.draw.circle(surface, flame, (mx, my), 9)
        pygame.draw.circle(surface, flame_core, (hx, hy), 20)

        # Lion helmet head
        pygame.draw.circle(surface, armor, (hx, hy), 16)
        pygame.draw.circle(surface, outline, (hx, hy), 16, 2)
        # Golden crest
        crest = [(hx - 4, hy - 14), (hx + d * 2, hy - 28), (hx + 6, hy - 14)]
        pygame.draw.polygon(surface, gold, crest)
        pygame.draw.polygon(surface, outline, crest, 2)

        self._draw_eyes_and_mouth(
            surface, hx - 6, hx + 6, hy - 2, hx + d * 2, hy + 7,
            mood, facing, iris_color=(230, 120, 30),
        )

    def _draw_aethelmon(self, surface: pygame.Surface, x: int, y: int, bob: int, mood: str, facing: bool):
        """Level 4: Ultimate - Aethelmon (Vaccine / Archangel)."""
        t = pygame.time.get_ticks() / 1000.0
        cy = y + bob - 10
        d = 1 if facing else -1
        wing_beat = int(math.sin(t * 4.5) * 4)

        armor = self._tint_for_mood((245, 247, 255), mood)
        gold = self._tint_for_mood((245, 200, 75), mood)
        wing_col = (238, 242, 255)
        cape_col = (85, 65, 110)
        outline = (50, 50, 70)

        # Holy magic circle beneath feet
        pygame.draw.ellipse(surface, (90, 180, 255), (x - 42, y + 26, 84, 18), 2)
        pygame.draw.ellipse(surface, (20, 22, 30), (x - 32, y + 30, 64, 12))

        # Large angel wings (3 tiers per side)
        for side in (-1, 1):
            upper = [(x + side * 10, cy - 18), (x + side * 62, cy - 58 + wing_beat), (x + side * 48, cy - 16)]
            lower = [(x + side * 12, cy - 6), (x + side * 52, cy - 18 + wing_beat), (x + side * 34, cy + 12)]
            pygame.draw.polygon(surface, wing_col, upper)
            pygame.draw.polygon(surface, outline, upper, 2)
            pygame.draw.polygon(surface, wing_col, lower)
            pygame.draw.polygon(surface, outline, lower, 2)

        # Halo behind head
        hx, hy = x, cy - 42
        pygame.draw.circle(surface, gold, (hx, hy), 26, 2)

        # Flowing archangel cape
        cape = [(x - 16, cy - 16), (x + 16, cy - 16), (x + 34, cy + 38), (x - 34, cy + 38)]
        pygame.draw.polygon(surface, cape_col, cape)
        pygame.draw.polygon(surface, outline, cape, 2)

        # Greaves / legs
        step = 3 if (self.pet.frame % 2 == 1 and abs(self.pet.vx) > 0.1) else 0
        pygame.draw.rect(surface, armor, (x - 14, cy + 14 + step, 10, 26), border_radius=3)
        pygame.draw.rect(surface, armor, (x + 4, cy + 14 - step, 10, 26), border_radius=3)
        pygame.draw.rect(surface, gold, (x - 15, cy + 30 + step, 12, 10), border_radius=2)
        pygame.draw.rect(surface, gold, (x + 3, cy + 30 - step, 12, 10), border_radius=2)

        # Armored chest + shoulder pauldrons
        chest = pygame.Rect(x - 18, cy - 22, 36, 40)
        pygame.draw.rect(surface, armor, chest, border_radius=8)
        pygame.draw.rect(surface, outline, chest, 2, border_radius=8)
        pygame.draw.circle(surface, (110, 220, 255), (x, cy - 6), 5)
        pygame.draw.circle(surface, gold, (x, cy - 6), 7, 2)
        pygame.draw.circle(surface, gold, (x - 20, cy - 16), 9)
        pygame.draw.circle(surface, gold, (x + 20, cy - 16), 9)

        # Staff held on facing side
        sx = x + d * 28
        pygame.draw.line(surface, armor, (sx, cy + 34), (sx, cy - 50), 3)
        pygame.draw.circle(surface, gold, (sx, cy - 54), 8)
        pygame.draw.circle(surface, (140, 235, 255), (sx, cy - 54), 4)

        # Winged helmet head
        pygame.draw.circle(surface, armor, (hx, hy), 15)
        pygame.draw.circle(surface, outline, (hx, hy), 15, 2)
        pygame.draw.polygon(surface, gold, [(hx - 12, hy - 8), (hx - 24, hy - 24), (hx - 6, hy - 14)])
        pygame.draw.polygon(surface, gold, [(hx + 12, hy - 8), (hx + 24, hy - 24), (hx + 6, hy - 14)])

        self._draw_eyes_and_mouth(
            surface, hx - 6, hx + 6, hy - 1, hx, hy + 7,
            mood, facing, iris_color=(90, 195, 255),
        )

    # ------------------------------------------------------------------
    # Drawing the pet (sprite image if provided, else stage-based art)
    # ------------------------------------------------------------------
    def _draw_pet(self, surface: pygame.Surface):
        x, y = int(self.pet.x), int(self.pet.y)
        mood = self.pet.state.mood
        frame = self.pet.frame
        facing = self.pet.facing_right
        stage = self.pet.state.evolution_stage

        bob = 0
        if abs(self.pet.vx) > 0.1 or abs(self.pet.vy) > 0.1:
            bob = int(math.sin(frame * 1.2) * 3)

        # Evolution sparkle burst
        if self.evolution_effect_timer > 0:
            radius = int((2.5 - self.evolution_effect_timer) * 42) + 24
            pygame.draw.circle(surface, (255, 230, 120), (x, y - 10), radius, 3)
            pygame.draw.circle(surface, (140, 230, 255), (x, y - 10), max(8, radius - 14), 2)

        sprite = self.sprites.get(stage)
        if sprite is not None:
            pygame.draw.ellipse(surface, (20, 22, 30), (x - 32, y + 28, 64, 14))
            img = sprite if facing else pygame.transform.flip(sprite, True, False)
            rect = img.get_rect(center=(x, y + bob - 10))
            surface.blit(img, rect)
        elif stage == 0:
            self._draw_puwamon(surface, x, y, bob, mood, facing)
        elif stage == 1:
            self._draw_luminamon(surface, x, y, bob, mood, facing)
        elif stage == 2:
            self._draw_solarmon(surface, x, y, bob, mood, facing)
        else:
            self._draw_aethelmon(surface, x, y, bob, mood, facing)

        # Sleeping indicator
        if self.pet.state.is_sleeping:
            z_font = pygame.font.SysFont("Segoe UI", 18, bold=True)
            z = z_font.render("Zzz", True, (180, 200, 255))
            surface.blit(z, (x + 24, y - 62))

        # Evolution stage / attribute / type label below pet
        info = self.pet.get_evolution_info()
        badge = f"{info['level']} | {info['attribute']} | {info['type']}"
        txt = self.font_badge.render(badge, True, (190, 210, 235))
        surface.blit(txt, txt.get_rect(center=(x, y + 48)))

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
            self.evolution_effect_timer = max(0.0, self.evolution_effect_timer - dt)

            evolved = self.pet.consume_evolution_event()
            if evolved:
                self.evolution_effect_timer = 2.5
                self.sounds.play("success")
                self.sounds.play("learn")
                self.ui.set_message(f"Evolved into {evolved['name']}! ({evolved['level']})")

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