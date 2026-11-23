"""Configuration constants for DigiAI-Pet."""

# Window
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 900
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
    "stamina": 0.18,  # significantly slower drain (was 0.4)
}

# Thresholds
CRITICAL = 25
LOW = 40
GOOD = 70

# Movement
PET_SPEED = 0.95
WALK_CHANCE = 0.004   # probability per frame to start walking

# Save file
SAVE_FILE = "digipet_save.json"
BACKGROUND_FILE = "assets/pet_background.png"

# Action cooldowns (seconds)
ACTION_COOLDOWN = 1.2

# Luminamon Evolution Line
EVOLUTION_LINE = [
    {
        "stage": 0,
        "level": "Level 1: In-Training",
        "name": "Puwamon",
        "attribute": "Vaccine",
        "type": "Slime",
        "sprite": "assets/puwamon.png",
        "min_age": 0.0,
        "min_learning": 0.0,
        "min_actions": 0,
    },
    {
        "stage": 1,
        "level": "Level 2: Rookie",
        "name": "Luminamon",
        "attribute": "Vaccine",
        "type": "Holy Beast",
        "sprite": "assets/luminamon.png",
        "min_age": 45.0,
        "min_learning": 18.0,
        "min_actions": 3,
    },
    {
        "stage": 2,
        "level": "Level 3: Champion",
        "name": "Solarmon",
        "attribute": "Vaccine",
        "type": "Holy Knight",
        "sprite": "assets/solarmon.png",
        "min_age": 150.0,
        "min_learning": 40.0,
        "min_actions": 7,
    },
    {
        "stage": 3,
        "level": "Level 4: Ultimate",
        "name": "Aethelmon",
        "attribute": "Vaccine",
        "type": "Archangel",
        "sprite": "assets/aethelmon.png",
        "min_age": 300.0,
        "min_learning": 70.0,
        "min_actions": 12,
    },
]
