#!/usr/bin/env python3
"""
DigiAI-Pet - Entry point
Windows desktop Digimon-style AI virtual pet.
"""

from digipet.game import Game

def main():
    game = Game()
    game.run()

if __name__ == "__main__":
    main()
