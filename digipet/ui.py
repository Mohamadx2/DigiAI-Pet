"""
UI helpers: status bars, action cards, need icons, text rendering,
date display and Exit button.
"""

from __future__ import annotations
from datetime import datetime
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

        menu_w, menu_h = 180, 52
        menu_x = (WINDOW_WIDTH - menu_w) // 2
        self.menu_button_rects = {
            "save": pygame.Rect(menu_x, 182, menu_w, menu_h),
            "load": pygame.Rect(menu_x, 246, menu_w, menu_h),
            "resume": pygame.Rect(menu_x, 310, menu_w, menu_h),
            "quit": pygame.Rect(menu_x, 374, menu_w, menu_h),
        }
        self.menu_hovered: Optional[str] = None

        # Persistent Exit button (top-right)
        self.exit_rect = pygame.Rect(WINDOW_WIDTH - 110, 14, 90, 36)
        self.exit_hovered = False

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
        self.menu_hovered = next(
            (key for key, rect in self.menu_button_rects.items() if rect.collidepoint(mouse_pos)),
            None,
        )
        self.exit_hovered = self.exit_rect.collidepoint(mouse_pos)

    def handle_click(self, mouse_pos: Tuple[int, int], menu_open: bool = False) -> Optional[str]:
        # Exit button always active (even over menu for safety)
        if self.exit_rect.collidepoint(mouse_pos):
            return "exit"
        if menu_open:
            for key, rect in self.menu_button_rects.items():
                if rect.collidepoint(mouse_pos):
                    return f"menu_{key}"
            return None
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

    def draw_date(self, surface: pygame.Surface):
        """Show current date + time in the top-right area of the status panel."""
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M")
        txt = self.font_xs.render(f"{date_str}  {time_str}", True, (180, 200, 230))
        # Place just left of the Exit button
        surface.blit(txt, (WINDOW_WIDTH - 230, 22))

    def draw_exit_button(self, surface: pygame.Surface):
        color = (255, 120, 130) if self.exit_hovered else (70, 55, 70)
        border = (255, 160, 170) if self.exit_hovered else (200, 100, 110)
        pygame.draw.rect(surface, color, self.exit_rect, border_radius=8)
        pygame.draw.rect(surface, border, self.exit_rect, width=2, border_radius=8)
        label = self.font_sm.render("Exit", True, TEXT_COLOR)
        surface.blit(label, label.get_rect(center=self.exit_rect.center))

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

    def draw_thought_bubble(self, surface: pygame.Surface, pet_x: float, pet_y: float, text: str):
        """Draw a soft cloud thought bubble above the wandering pet."""
        if not text:
            return
        max_width = 245
        words = text.split()
        lines: List[str] = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if self.font_sm.size(candidate)[0] <= max_width - 26:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)

        line_h = 21
        bubble_w = min(max_width, max(self.font_sm.size(line)[0] for line in lines) + 26)
        bubble_h = len(lines) * line_h + 22
        bubble_x = max(12, min(WINDOW_WIDTH - bubble_w - 12, int(pet_x - bubble_w / 2)))
        bubble_y = max(132, int(pet_y) - 128 - bubble_h)

        shadow = pygame.Surface((bubble_w + 8, bubble_h + 8), pygame.SRCALPHA)
        pygame.draw.rect(shadow, (10, 14, 25, 100), shadow.get_rect(), border_radius=18)
        surface.blit(shadow, (bubble_x - 4, bubble_y + 5))

        bubble = pygame.Surface((bubble_w, bubble_h), pygame.SRCALPHA)
        pygame.draw.rect(bubble, (247, 250, 255, 238), bubble.get_rect(), border_radius=18)
        pygame.draw.rect(bubble, (124, 205, 242, 255), bubble.get_rect(), 2, border_radius=18)
        surface.blit(bubble, (bubble_x, bubble_y))

        tail = [
            (bubble_x + bubble_w // 2 - 10, bubble_y + bubble_h - 1),
            (bubble_x + bubble_w // 2 + 1, bubble_y + bubble_h + 13),
            (bubble_x + bubble_w // 2 + 13, bubble_y + bubble_h - 1),
        ]
        pygame.draw.polygon(surface, (247, 250, 255), tail)
        pygame.draw.polygon(surface, (124, 205, 242), tail, 2)
        pygame.draw.circle(surface, (247, 250, 255), (bubble_x + bubble_w // 2 + 25, bubble_y + bubble_h + 21), 5)
        pygame.draw.circle(surface, (124, 205, 242), (bubble_x + bubble_w // 2 + 25, bubble_y + bubble_h + 21), 5, 1)

        for i, line in enumerate(lines):
            rendered = self.font_sm.render(line, True, (45, 53, 77))
            rect = rendered.get_rect(center=(bubble_x + bubble_w // 2, bubble_y + 13 + i * line_h + line_h // 2))
            surface.blit(rendered, rect)

    def draw_main_menu(self, surface: pygame.Surface):
        """Draw the paused main menu over the current game scene."""
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
        overlay.fill((8, 12, 24, 190))
        surface.blit(overlay, (0, 0))

        panel = pygame.Rect(WINDOW_WIDTH // 2 - 245, 74, 490, 430)
        pygame.draw.rect(surface, (33, 42, 65), panel, border_radius=20)
        pygame.draw.rect(surface, ACCENT, panel, 3, border_radius=20)
        title = self.font_lg.render("DigiAI-Pet Main Menu", True, (240, 248, 255))
        surface.blit(title, title.get_rect(center=(panel.centerx, 108)))
        hint = self.font_sm.render("Your pet is paused while this menu is open", True, (181, 202, 224))
        surface.blit(hint, hint.get_rect(center=(panel.centerx, 143)))

        labels = {"save": "Save Game", "load": "Load Game", "resume": "Resume", "quit": "Exit Game"}
        colors = {"save": (110, 215, 170), "load": (120, 190, 255), "resume": (255, 220, 100), "quit": (255, 130, 145)}
        for key, rect in self.menu_button_rects.items():
            color = colors[key]
            fill = tuple(min(255, c + 18) for c in color) if self.menu_hovered == key else (51, 64, 91)
            pygame.draw.rect(surface, fill, rect, border_radius=12)
            pygame.draw.rect(surface, color, rect, 2, border_radius=12)
            label = self.font_md.render(labels[key], True, TEXT_COLOR)
            surface.blit(label, label.get_rect(center=rect.center))

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
