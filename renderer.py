"""Sprite loading, checkerboard cleanup, and rendering for DigiAI-Pet."""

from __future__ import annotations
import math
import os
from typing import Dict, List, Optional, Tuple
import pygame

from .config import EVOLUTION_LINE, TEXT_COLOR


class PetRenderer:
    def __init__(self, sheet_path: Optional[str] = None, sprite_size: Tuple[int, int] = (128, 128)):
        self.sprite_size = sprite_size
        self.sheet_path = sheet_path
        self.stage_frames: Dict[int, List[pygame.Surface]] = {}
        self._load_all_stages()

    def _remove_checkerboard(self, surf: pygame.Surface) -> pygame.Surface:
        """Remove common two-tone gray checkerboard pixels if image lacks alpha."""
        surf = surf.convert_alpha()
        w, h = surf.get_size()
        px = pygame.PixelArray(surf)
        # Sample border pixels to detect baked-in checkerboard grays
        candidates = set()
        for x in range(0, w, 8):
            for y in (0, 12, h - 1):
                c = surf.unmap_rgb(px[x, y])
                if abs(c.r - c.g) <= 6 and abs(c.g - c.b) <= 6 and 45 <= c.r <= 135:
                    candidates.add((c.r, c.g, c.b))

        for x in range(w):
            for y in range(h):
                c = surf.unmap_rgb(px[x, y])
                if c.a > 0 and abs(c.r - c.g) <= 5 and abs(c.g - c.b) <= 5:
                    for cr, cg, cb in candidates:
                        if abs(c.r - cr) <= 8 and abs(c.g - cg) <= 8 and abs(c.b - cb) <= 8:
                            px[x, y] = (0, 0, 0, 0)
                            break
        del px
        return surf

    def _slice_from_sheet(self, stage_idx: int, num_stages: int = 6) -> Optional[pygame.Surface]:
        """Fallback: slice a stage column from a combined horizontal sprite sheet."""
        if not self.sheet_path or not os.path.exists(self.sheet_path):
            return None
        sheet = self._remove_checkerboard(pygame.image.load(self.sheet_path))
        sw, sh = sheet.get_size()
        col_w = sw // num_stages
        # Main/idle row sits in the upper-middle band below the header labels
        crop_rect = pygame.Rect(stage_idx * col_w, int(sh * 0.14), col_w, int(sh * 0.24))
        sub = sheet.subsurface(crop_rect).copy()
        # Trim empty transparent margins
        bbox = sub.get_bounding_rect()
        if bbox.width > 0 and bbox.height > 0:
            sub = sub.subsurface(bbox).copy()
        return pygame.transform.smoothscale(sub, self.sprite_size)

    def _load_all_stages(self):
        for info in EVOLUTION_LINE:
            stage = info["stage"]
            sprite_path = info.get("sprite")
            base_surf: Optional[pygame.Surface] = None

            if sprite_path and os.path.exists(sprite_path):
                loaded = self._remove_checkerboard(pygame.image.load(sprite_path))
                base_surf = pygame.transform.smoothscale(loaded, self.sprite_size)
            else:
                base_surf = self._slice_from_sheet(stage, num_stages=len(EVOLUTION_LINE))

            if base_surf is None:
                # Last-resort placeholder circle if neither individual file nor sheet exists
                base_surf = pygame.Surface(self.sprite_size, pygame.SRCALPHA)
                pygame.draw.circle(
                    base_surf,
                    (235, 120, 35),
                    (self.sprite_size[0] // 2, self.sprite_size[1] // 2),
                    self.sprite_size[0] // 3,
                )

            # Build 4 subtle animation frames (bob/squash-stretch) from the base sprite
            frames: List[pygame.Surface] = []
            w, h = self.sprite_size
            for i in range(4):
                bob = int(math.sin(i * math.pi / 2) * 4)
                scale_y = 1.0 + math.cos(i * math.pi / 2) * 0.04
                scaled = pygame.transform.smoothscale(base_surf, (w, max(1, int(h * scale_y))))
                canvas = pygame.Surface((w, h), pygame.SRCALPHA)
                y_offset = (h - scaled.get_height()) + bob
                canvas.blit(scaled, (0, y_offset))
                frames.append(canvas)

            self.stage_frames[stage] = frames

    def draw_pet(self, screen: pygame.Surface, pet, font: Optional[pygame.font.Font] = None):
        stage = pet.state.evolution_stage
        frames = self.stage_frames.get(stage)
        if not frames:
            return

        frame_idx = pet.frame % len(frames)
        sprite = frames[frame_idx]

        # Flip horizontally when facing left (except Stage 0 Egg)
        if stage > 0 and not pet.facing_right:
            sprite = pygame.transform.flip(sprite, True, False)

        # Tilt gently during Stage 0 egg wobble
        if stage == 0:
            angle = math.sin(pet.state.age_seconds * 4.0) * 10.0
            sprite = pygame.transform.rotozoom(sprite, angle, 1.0)

        rect = sprite.get_rect(center=(int(pet.x), int(pet.y)))
        screen.blit(sprite, rect)

        if font:
            label = f"{pet.state.name} (Gen {pet.state.generation})"
            text_surf = font.render(label, True, TEXT_COLOR)
            text_rect = text_surf.get_rect(midtop=(rect.centerx, rect.bottom + 4))
            screen.blit(text_surf, text_rect)