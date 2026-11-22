"""Configuration constants for DigiAI-Pet."""

# Window
WINDOW_WIDTH = 900
WINDOW_HEIGHT = 650
FPS = 60
TITLE = "DigiAI-Pet"

# Colors (soft Digimon / retro palette)
BG_COLOR = (30, 35, 50)
PANEL_COLOR = (45, 52, 70)
CARD_COLOR = (60, 70, 95)
CARD_HOVER = (80, 95, 130)
TEXT_COLOR = (230, 235, 245)
ACCENT = (100, 200, 255)
HUNGER_COLOR = (255, 160, 80)
CLEAN_COLOR = (120, 200, 255)
HAPPY_COLOR = (255, 220, 100)
ENERGY_COLOR = (160, 220, 120)
HEALTH_COLOR = (255, 100, 120)
STAMINA_COLOR = (180, 140, 255)
LEARN_COLOR = (140, 255, 200)

# Pet stats decay rates (per second at normal speed)
DECAY = {
    "hunger": 0.8,
    "cleanliness": 0.6,
    "happiness": 0.7,
    "energy": 0.5,
    "health": 0.15,   # slower, rises when neglected
    "stamina": 0.4,
}

# Thresholds
CRITICAL = 25
LOW = 40
GOOD = 70

# Movement
PET_SPEED = 1.8
WALK_CHANCE = 0.008   # probability per frame to start walking

# Save file
SAVE_FILE = "digipet_save.json"

# Action cooldowns (seconds)
ACTION_COOLDOWN = 1.2
