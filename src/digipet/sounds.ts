const TONE_MAP: Record<string, { frequency: number; duration: number }> = {
  feed: { frequency: 520, duration: 0.13 },
  clean: { frequency: 440, duration: 0.11 },
  play: { frequency: 660, duration: 0.16 },
  sleep: { frequency: 260, duration: 0.28 },
  med: { frequency: 380, duration: 0.18 },
  learn: { frequency: 780, duration: 0.2 },
  sick: { frequency: 170, duration: 0.32 },
  low: { frequency: 210, duration: 0.24 },
  click: { frequency: 720, duration: 0.055 },
  success: { frequency: 880, duration: 0.18 },
  fail: { frequency: 140, duration: 0.26 },
  angry: { frequency: 165, duration: 0.18 },
  scared: { frequency: 920, duration: 0.12 },
  wonder: { frequency: 587.33, duration: 0.15 },
};

export class SoundManager {
  enabled = true;
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        this.enabled = false;
        return null;
      }
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  unlock(): void {
    this.getContext();
  }

  private playToneAt(
    ctx: AudioContext,
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = "sine",
    vol = 0.2
  ): void {
    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const attack = 0.01;
    const release = Math.min(0.03, duration * 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.setValueAtTime(vol, Math.max(now + attack, now + duration - release));
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.015);
  }

  play(name: string): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      if (name === "purr") {
        this.playToneAt(ctx, 392, 0.0, 0.09, "sine", 0.16);
        this.playToneAt(ctx, 523.25, 0.07, 0.12, "sine", 0.18);
        return;
      }
      if (name === "thunder") {
        this.playToneAt(ctx, 95, 0.0, 0.35, "triangle", 0.18);
        return;
      }
      if (name === "hatch") {
        this.playToneAt(ctx, 523.25, 0.0, 0.11, "triangle", 0.22);
        this.playToneAt(ctx, 659.25, 0.09, 0.11, "triangle", 0.22);
        this.playToneAt(ctx, 783.99, 0.18, 0.12, "triangle", 0.24);
        this.playToneAt(ctx, 1046.5, 0.28, 0.24, "sine", 0.24);
        return;
      }
      if (name === "evolve") {
        const notes = [440, 554.37, 659.25, 880, 1108.73];
        notes.forEach((n, i) => this.playToneAt(ctx, n, i * 0.08, 0.14, "triangle", 0.22));
        return;
      }
      const tone = TONE_MAP[name];
      if (!tone) return;
      this.playToneAt(ctx, tone.frequency, 0, tone.duration, "sine", 0.22);
    } catch {
      // Ignore audio errors
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}
