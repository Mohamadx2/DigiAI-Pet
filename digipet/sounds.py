"""
Simple sound manager for DigiAI-Pet.
Generates short notification beeps procedurally so the project works
out-of-the-box without external audio files. Optionally loads .wav
from assets/sounds/ if present.
"""

from __future__ import annotations
import os
import struct
import tempfile
import wave
from typing import Dict, Optional

import pygame


class SoundManager:
    def __init__(self):
        self.enabled = True
        self.sounds: Dict[str, pygame.mixer.Sound] = {}
        self._init_mixer()
        self._generate_or_load()

    def _init_mixer(self):
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(frequency=22050, size=-16, channels=1, buffer=512)
        except Exception:
            self.enabled = False

    def _generate_tone(self, frequency: float, duration: float = 0.15,
                       volume: float = 0.4, sample_rate: int = 22050) -> bytes:
        """Generate a simple sine-wave tone as raw 16-bit mono PCM."""
        import math
        n_samples = int(sample_rate * duration)
        buf = bytearray()
        for i in range(n_samples):
            t = i / sample_rate
            # Simple envelope to avoid clicks
            env = 1.0
            if i < sample_rate * 0.01:
                env = i / (sample_rate * 0.01)
            elif i > n_samples - sample_rate * 0.02:
                env = (n_samples - i) / (sample_rate * 0.02)
            sample = int(volume * 32767 * env * math.sin(2 * math.pi * frequency * t))
            buf += struct.pack("<h", max(-32767, min(32767, sample)))
        return bytes(buf)

    def _make_sound(self, frequency: float, duration: float = 0.12) -> Optional[pygame.mixer.Sound]:
        if not self.enabled:
            return None
        try:
            raw = self._generate_tone(frequency, duration)
            # Write temporary wav and load (most reliable across pygame versions)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                path = tmp.name
            with wave.open(path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(22050)
                wf.writeframes(raw)
            snd = pygame.mixer.Sound(path)
            try:
                os.unlink(path)
            except OSError:
                pass
            return snd
        except Exception:
            return None

    def _generate_or_load(self):
        """Create built-in notification sounds."""
        # Key events
        self.sounds["feed"] = self._make_sound(520, 0.12)
        self.sounds["clean"] = self._make_sound(440, 0.10)
        self.sounds["play"] = self._make_sound(660, 0.15)
        self.sounds["sleep"] = self._make_sound(280, 0.25)
        self.sounds["med"] = self._make_sound(380, 0.18)
        self.sounds["learn"] = self._make_sound(780, 0.20)
        self.sounds["sick"] = self._make_sound(180, 0.30)
        self.sounds["low"] = self._make_sound(220, 0.22)
        self.sounds["click"] = self._make_sound(700, 0.06)
        self.sounds["success"] = self._make_sound(880, 0.18)
        self.sounds["fail"] = self._make_sound(150, 0.25)

        # Optional external overrides
        assets_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds")
        if os.path.isdir(assets_dir):
            for name in list(self.sounds.keys()):
                path = os.path.join(assets_dir, f"{name}.wav")
                if os.path.isfile(path):
                    try:
                        self.sounds[name] = pygame.mixer.Sound(path)
                    except Exception:
                        pass

    def play(self, name: str):
        if not self.enabled:
            return
        snd = self.sounds.get(name)
        if snd:
            try:
                snd.play()
            except Exception:
                pass

    def toggle(self):
        self.enabled = not self.enabled
        return self.enabled
