# DigiAI-Pet

**A web-based AI virtual pet** inspired by classic Tamagotchi needs systems and Digimon-style companions, migrated from the original Python + Pygame desktop app to React, TypeScript, and HTML5 Canvas.

Raise, care for, and train a Digimon-like creature that walks around your garden scene, climbs the garden tree, expresses needs through clear visual feedback, evolves across stages, and plays reaction/strategy minigames.

## Features

- **Six core needs / stats + Learning & Speed**
  - Hunger, Cleanliness (Toilet), Happiness (Play), Health, Energy (Sleep), Stamina, Learning, and Speed.
- **Card-style action interface**
  - Clear buttons for **Feed**, **Toilet**, **Play**, **Sleep**, **Medicine**, **Train**.
- **Autonomous movement & tree climbing**
  - Your pet walks around the garden scene, occasionally climbs and perches in the left-side tree, and reacts to low needs.
- **Evolution line**
  - Progress through **Puwamon** → **Luminamon** → **Solarmon** → **Aethelmon** as age, learning, and care actions grow.
- **Training Lab minigames**
  - **Rock / Paper / Scissors** and **Tic-Tac-Toe** to raise Learning.
  - **Jump Obstacles** to raise Speed.
- **Garden day/night scene**
  - Real-time daytime tint with a smiling sun (07:00–19:00) and darker nighttime lighting.
- **Save / Load**
  - Progress persists in browser `localStorage` via **Save**, **Save Game**, **Load Game**, and automatic save on exit/unload.
- **Thought bubbles & Web Audio tones**
  - Mood-reactive cloud bubbles and synthesized retro notification tones (toggle with `M`).

## Controls

| Action | How |
| --- | --- |
| Feed / Toilet / Play / Sleep / Medicine / Train | Click bottom action cards |
| Main Menu (Pause / Save / Load / Resume) | Opens on launch, or press `ESC` / `Q` |
| Save Progress | Click top-right **Save** or Main Menu **Save Game** |
| Toggle Sound | Press `M` |
| Rock / Paper / Scissors | Click buttons or press `R`, `P`, `S` |
| Jump Obstacles | Click canvas or press `SPACE` |

## Development

```bash
npm install
npm run dev
```

Runs on `http://0.0.0.0:3000`.
