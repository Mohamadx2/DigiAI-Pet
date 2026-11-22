# DigiAI-Pet

**A Windows desktop AI virtual pet** inspired by classic Tamagotchi needs systems and Digimon-style companions.

Raise, care for, and train a Digimon-like creature that walks around your screen, expresses needs through clear visual feedback, and can learn simple reaction/memory games. Built with pure Python + Pygame for easy running on Windows.

![Python](https://img.shields.io/badge/Python-3.9%2B-blue)
![Pygame](https://img.shields.io/badge/Pygame-2.5%2B-green)
![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey)

## Features

- **Six core needs / stats**
  - Hunger
  - Cleanliness (Toilet)
  - Happiness / Fun (Play)
  - Energy (Sleep)
  - Health (Sickness risk)
  - Stamina (affects activity & training)

- **Card-style action interface**  
  Large, clear buttons for: **Feed**, **Toilet/Clean**, **Play**, **Sleep**, **Medicine**, **Train**.

- **Simple autonomous movement**  
  The pet walks around the play area, reacts to low needs, and shows different postures/animations based on mood and energy.

- **Learning / Intelligence system**  
  Play simple reaction or memory minigames with your pet. Repeated success raises a Learning score and can improve future performance ("the pet learns").

- **Sickness & care consequences**  
  Neglect leads to declining health. Medicine and good care restore it. Stamina gates intense activities.

- **Save / Load**  
  Progress is automatically saved. Resume exactly where you left off.

- **Optional notification sounds**  
  Short beeps and status sounds for low needs, feeding, level-up style events, and sickness. (Generated or loaded from `assets/sounds/`)

- **Clean modular architecture**  
  Easy to extend with more Digimon forms, evolution, additional minigames, or even local LLM chat later.

## Requirements

- Python 3.9 or higher
- Pygame 2.5+

```bash
pip install -r requirements.txt
```

## Quick Start (Windows)

```bash
git clone https://github.com/Mohamadx2/DigiAI-Pet.git
cd DigiAI-Pet
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

## Controls

| Action              | How                          |
|---------------------|------------------------------|
| Feed                | Click Feed card              |
| Clean / Toilet      | Click Toilet card            |
| Play                | Click Play card              |
| Sleep               | Click Sleep card             |
| Give Medicine       | Click Medicine card          |
| Train / Learn Game  | Click Train card             |
| Pause / Menu        | ESC                          |
| Quit                | Close window or Q            |

The pet will also show need icons above its head when a stat is critically low.

## Project Structure

```
DigiAI-Pet/
├── main.py                 # Entry point
├── requirements.txt
├── README.md
├── digipet/
│   ├── __init__.py
│   ├── config.py           # Constants, colors, timing
│   ├── pet.py              # Pet class, stats, AI behavior, save/load
│   ├── ui.py               # HUD, status bars, action cards
│   ├── game.py             # Main loop, movement, events, minigames
│   └── sounds.py           # Sound manager + simple tone generation
└── assets/
    └── sounds/             # Optional .wav files (auto-generated if missing)
```

## Extending the Project

Ideas already prepared in the architecture:
- Multiple Digimon species / sprites
- Evolution stages based on care quality + age + training
- More advanced minigames (pattern matching, simple battles)
- System tray mode (minimize to tray)
- Local LLM chat integration for true "AI pet" conversation

## License

MIT License – feel free to fork, modify, and share.

---

Made for fun and learning. Care for your digital companion well.
