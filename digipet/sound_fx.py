"""Procedural retro chiptune sound effects and MIDI music controller."""

from __future__ import annotations
import os
from typing import Dict, List, Optional, Sequence, Tuple
import numpy as np
import pygame


class SoundManager:
    def __init__(self, sample_rate: int = 44100, sfx_volume: float = 0.35, music_volume: float = 0.25):
        self.sample_rate = sample_rate
        self.sfx_volume = sfx_volume
        self.music_volume = music_volume
        self.enabled = False
        self.sounds: Dict[str, pygame.mixer.Sound] = {}

        if not pygame.mixer.get_init():
            try:
                pygame.mixer.init(frequency=sample_rate, size=-16, channels=2, buffer=512)
            except pygame.error:
                return

        self.enabled = True
        self._build_retro_bank()

    def _tone_segment(
        self,
        freq_start: float,
        freq_end: float,
        duration: float,
        wave: str = "square",
        volume: float = 0.4,
    ) -> np.ndarray:
        """Generate a mono float32 waveform segment with linear frequency glide and fade-out."""
        n_samples = max(1, int(self.sample_rate * duration))
        t = np.linspace(0.0, duration, n_samples, endpoint=False, dtype=np.float32)

        if abs(freq_end - freq_start) < 1e-3:
            phase = 2.0 * np.pi * freq_start * t
        else:
            # Linear frequency sweep instantaneous phase
            k = (freq_end - freq_start) / max(duration, 1e-6)
            phase = 2.0 * np.pi * (freq_start * t + 0.5 * k * (t ** 2))

        if wave == "square":
            raw = np.sign(np.sin(phase)).astype(np.float32)
        elif wave == "triangle":
            raw = (2.0 / np.pi) * np.arcsin(np.sin(phase)).astype(np.float32)
        elif wave == "noise":
            rng = np.random.default_rng(42)
            raw = rng.uniform(-1.0, 1.0, size=n_samples).astype(np.float32)
        else:
            raw = np.sin(phase).astype(np.float32)

        # Short attack/release envelope to avoid clicks
        env = np.ones(n_samples, dtype=np.float32)
        fade_len = min(n_samples // 4, int(self.sample_rate * 0.012))
        if fade_len > 0:
            env[:fade_len] = np.linspace(0.0, 1.0, fade_len, dtype=np.float32)
            env[-fade_len:] = np.linspace(1.0, 0.0, fade_len, dtype=np.float32)

        return raw * env * volume

    def _sequence_to_sound(self, segments: Sequence[np.ndarray]) -> pygame.mixer.Sound:
        mono = np.concatenate(list(segments))
        pcm = np.clip(mono * 32767.0, -32768, 32767).astype(np.int16)
        _, _, mixer_channels = pygame.mixer.get_init()
        if mixer_channels == 2:
            stereo = np.repeat(pcm.reshape(-1, 1), 2, axis=1)
        else:
            stereo = pcm
        snd = pygame.mixer.Sound(buffer=stereo.tobytes())
        snd.set_volume(self.sfx_volume)
        return snd

    def _build_retro_bank(self):
        # Notification / UI chime
        self.sounds["notify"] = self._sequence_to_sound([
            self._tone_segment(880, 880, 0.07, "square", 0.3),
            self._tone_segment(1174.66, 1174.66, 0.11, "square", 0.3),
        ])

        # Feed / crunch
        self.sounds["feed"] = self._sequence_to_sound([
            self._tone_segment(260, 420, 0.07, "square", 0.35),
            self._tone_segment(340, 520, 0.08, "square", 0.35),
        ])

        # Clean / sparkle
        self.sounds["clean"] = self._sequence_to_sound([
            self._tone_segment(660, 990, 0.08, "triangle", 0.4),
            self._tone_segment(990, 1320, 0.10, "triangle", 0.4),
        ])

        # Play / cheerful jump
        self.sounds["play"] = self._sequence_to_sound([
            self._tone_segment(330, 660, 0.12, "square", 0.35),
        ])

        # Sick / alert buzz
        self.sounds["sick"] = self._sequence_to_sound([
            self._tone_segment(220, 185, 0.14, "sawtooth" if False else "square", 0.35),
            self._tone_segment(185, 140, 0.18, "square", 0.35),
        ])

        # Evolution ascending arpeggio
        evo_notes = [523.25, 659.25, 783.99, 1046.50]
        self.sounds["evolve"] = self._sequence_to_sound([
            self._tone_segment(n, n * 1.02, 0.10, "square", 0.4) for n in evo_notes
        ])

        # Rebirth loop mystical sweep + chime
        rebirth_notes = [392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51]
        self.sounds["rebirth"] = self._sequence_to_sound(
            [self._tone_segment(n, n, 0.08, "triangle", 0.45) for n in rebirth_notes]
            + [self._tone_segment(1567.98, 1046.50, 0.25, "sine", 0.4)]
        )

    def play_sfx(self, name: str):
        if not self.enabled:
            return
        snd = self.sounds.get(name)
        if snd:
            snd.play()

    # ------------------------------------------------------------------
    # MIDI Background Music Playback
    # ------------------------------------------------------------------
    def play_midi(self, midi_path: str, loops: int = -1):
        """Load and play a .mid file via pygame.mixer.music (-1 = loop forever)."""
        if not self.enabled or not os.path.exists(midi_path):
            return False
        try:
            pygame.mixer.music.load(midi_path)
            pygame.mixer.music.set_volume(self.music_volume)
            pygame.mixer.music.play(loops=loops)
            return True
        except pygame.error:
            return False

    def stop_music(self):
        if self.enabled:
            pygame.mixer.music.fadeout(500)

    def set_music_volume(self, volume: float):
        self.music_volume = max(0.0, min(1.0, volume))
        if self.enabled:
            pygame.mixer.music.set_volume(self.music_volume)