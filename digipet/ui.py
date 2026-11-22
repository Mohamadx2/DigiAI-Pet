"""
UI helpers: status bars, action cards, need icons, text rendering.
"""

from __future__ import annotations
from typing import Dict, List, Tuple, Optional

import pygame

from .config import (
    WINDOW_WIDTH, WINDOW_HEIGHT,
    PANEL_COLOR, CARD_COLOR, CARD_HOVER, TEXT_COLOR, ACCENT,
    HUNGER_COLOR, CLEAN_COLOR, HAPPY_COLOR, ENERGY_COLOR,
    HEALTH_COLOR, STAMINA_COLOR, LEARN_COLOR, CRITICAL, LOW
)


class ActionCard:
    def __init__(self, label: str, key: str, rect: pygame.Rect, color: Tuple[int, int, int]):
        self.label = label
        self.key = key
        self.rect = rect
        self.base_color = color
        self.hovered = False

    def draw(self, surface: pygame.Surface, font: pygame.font.Font):
        color = CARD_HOVER if self.hovered else CARD_COLOR
        pygame.draw.rect(surface, color, self.rect, border_radius=12)
        pygame.draw.rect(surface, self.base_color, self.rect, width=3, border_radius=12)
        text = font.render(self.label, True, TEXT_COLOR)
        text_rect = text.get_rect(center=self.rect.center)
        surface.blit(text, text_rect)


class UI:
    def __init__(self):
        pygame.font.init()
        self.font_lg = pygame.font.SysFont("Segoe UI", 26, bold=True)
        self.font_md = pygame.font.SysFont("Segoe UI", 20)
        self.font_sm = pygame.font.SysFont("Segoe UI", 16)
        self.font_xs = pygame.font.SysFont("Segoe UI", 14)

        # Action cards at the bottom
        card_w, card_h = 130, 58
        gap = 14
        total_w = 6 * card_w + 5 * gap
        start_x = (WINDOW_WIDTH - total_w) // 2
        y = WINDOW_HEIGHT - 85

        self.cards: List[ActionCard] = [
            ActionCard("Feed", "feed", pygame.Rect(start_x + 0*(card_w+gap), y, card_w, card_h), HUNGER_COLOR),
            ActionCard("Toilet", "toilet", pygame.Rect(start_x + 1*(card_w+gap), y, card_w, card_h), CLEAN_COLOR),
            ActionCard("Play", "play", pygame.Rect(start_x + 2*(card_w+gap), y, card_w, card_h), HAPPY_COLOR),
            ActionCard("Sleep", "sleep", pygame.Rect(start_x + 3*(card_w+gap), y, card_w, card_h), ENERGY_COLOR),
            ActionCard("Medicine", "medicine", pygame.Rect(start_x + 4*(card_w+gap), y, card_w, card_h), HEALTH_COLOR),
            ActionCard("Train", "train", pygame.Rect(start_x + 5*(card_w+gap), y, card_w, card_h), LEARN_COLOR),
        ]

        self.message: str = ""
        self.message_timer: float = 0.0

    def set_message(self, text: str, duration: float = 2.5):
        self.message = text
        self.message_timer = duration

    def update(self, dt: float):
        self.message_timer = max(0.0, self.message_timer - dt)

    def handle_hover(self, mouse_pos: Tuple[int, int]):
        for card in self.cards:
            card.hovered = card.rect.collidepoint(mouse_pos)

    def handle_click(self, mouse_pos: Tuple[int, int]) -> Optional[str]:
        for card in self.cards:
            if card.rect.collidepoint(mouse_pos):
                return card.key
        return None

    def draw_bars(self, surface: pygame.Surface, stats: Dict[str, float]):
        """Top status panel with colored bars."""
        panel = pygame.Rect(10, 10, WINDOW_WIDTH - 20, 110)
        pygame.draw.rect(surface, PANEL_COLOR, panel, border_radius=10)

        bar_data = [
            ("Hunger", stats["hunger"], HUNGER_COLOR),
            ("Clean", stats["cleanliness"], CLEAN_COLOR),
            ("Happy", stats["happiness"], HAPPY_COLOR),
            ("Energy", stats["energy"], ENERGY_COLOR),
            ("Health", stats["health"], HEALTH_COLOR),
            ("Stamina", stats["stamina"], STAMINA_COLOR),
            ("Learn", stats["learning"], LEARN_COLOR),
        ]

        x0 = 25
        y0 = 22
        bar_w = 95
        bar_h = 14
        gap_x = 18

        for i, (label, value, color) in enumerate(bar_data):
            col = i % 4
            row = i // 4
            x = x0 + col * (bar_w + gap_x + 40)
            y = y0 + row * 42

            # Label
            txt = self.font_xs.render(label, True, TEXT_COLOR)
            surface.blit(txt, (x, y))

            # Background bar
            bg_rect = pygame.Rect(x, y + 18, bar_w, bar_h)
            pygame.draw.rect(surface, (25, 28, 40), bg_rect, border_radius=4)

            # Fill
            fill_w = int(bar_w * max(0.0, min(1.0, value / 100.0)))
            if fill_w > 0:
                fill_rect = pygame.Rect(x, y + 18, fill_w, bar_h)
                # Dim if critical
                c = color if value > CRITICAL else (min(255, color[0]+40), max(0, color[1]-30), max(0, color[2]-30))
                pygame.draw.rect(surface, c, fill_rect, border_radius=4)

            # Value text
            val_txt = self.font_xs.render(f"{int(value)}", True, TEXT_COLOR)
            surface.blit(val_txt, (x + bar_w + 6, y + 16))

    def draw_cards(self, surface: pygame.Surface):
        for card in self.cards:
            card.draw(surface, self.font_md)

    def draw_message(self, surface: pygame.Surface):
        if self.message_timer > 0 and self.message:
            txt = self.font_md.render(self.message, True, ACCENT)
            rect = txt.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT - 120))
            # Soft background
            bg = rect.inflate(24, 12)
            s = pygame.Surface((bg.w, bg.h), pygame.SRCALPHA)
            s.fill((20, 25, 40, 180))
            surface.blit(s, bg.topleft)
            surface.blit(txt, rect)

    def draw_need_icon(self, surface: pygame.Surface, pet_x: float, pet_y: float, icon: Optional[str]):
        if not icon:
            return
        # Simple emoji-style text icons above the pet
        mapping = {
            "feed": "🍖",
            "clean": "🛁",
            "play": "🎾",
            "sleep": "💤",
            "med": "💊",
            "learn": "📚",
            "sick": "🤒",
            "low": "❗",
        }
        symbol = mapping.get(icon, "?")
        # Use a larger font for visibility
        try:
            font = pygame.font.SysFont("Segoe UI Emoji", 28)
        except Exception:
            font = self.font_lg
        txt = font.render(symbol, True, TEXT_COLOR)
        rect = txt.get_rect(center=(int(pet_x), int(pet_y) - 55))
        surface.blit(txt, rect)

    def draw_pet_name(self, surface: pygame.Surface, name: str, mood: str):
        mood_colors = {
            "happy": HAPPY_COLOR,
            "sad": (180, 140, 200),
            "tired": ENERGY_COLOR,
            "hungry": HUNGER_COLOR,
            "sick": HEALTH_COLOR,
            "neutral": TEXT_COLOR,
        }
        color = mood_colors.get(mood, TEXT_COLOR)
        txt = self.font_sm.render(f"{name}  [{mood}]", True, color)
        surface.blit(txt, (20, WINDOW_HEIGHT - 130))
