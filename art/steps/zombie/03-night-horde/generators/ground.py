"""Graveyard ground tiles: night grass in three seamless variations and a bare grave-dirt tile.
Run from the project folder: python generators/ground.py"""

from pagan import api

GRASS = ["k", "l", "m", "n"]
EARTH = ["g", "h", "i", "j"]


def grass(seed: int) -> api.Canvas:
    c = api.Canvas(16, 16)
    for y in range(16):
        for x in range(16):
            n = api.periodic_noise(x, y, 16, seed)
            t = 0.45 + 0.35 * n + 0.25 * (api.hash01(x, y, seed) - 0.5)
            c.put(x, y, api.ramp_pick(GRASS[:3], t))
    # blades: a light tip over a dark root, lit from the top-left
    for i in range(7):
        x, y = int(api.hash01(i, 1, seed) * 15), int(api.hash01(i, 2, seed) * 14) + 1
        c.put(x, y, "n")
        c.put(x, (y + 1) % 16, "k")
    return c


def dirt(seed: int) -> api.Canvas:
    c = api.Canvas(16, 16)
    for y in range(16):
        for x in range(16):
            n = api.periodic_noise(x, y, 16, seed)
            t = 0.4 + 0.3 * n + 0.3 * (api.hash01(x, y, seed) - 0.5)
            c.put(x, y, api.ramp_pick(EARTH[:3], t))
    for i in range(4):  # pebbles: a lit top over a shadow
        x, y = int(api.hash01(i, 5, seed) * 14), int(api.hash01(i, 6, seed) * 14) + 1
        c.put(x, y, "j")
        c.put(x + 1, y, "j")
        c.put(x, y + 1, "g")
        c.put(x + 1, y + 1, "g")
    return c


tiles = {"grass": grass(1), "grass_b": grass(2), "grass_c": grass(3), "dirt": dirt(4)}
for tile in tiles.values():
    tile.pair_orphans()
api.write(
    "tiles/graveyard.tiles.yaml",
    api.tileset_yaml(
        "graveyard",
        (16, 16),
        tiles,
        columns=4,
        description="Night graveyard ground: three seamless grass tiles and bare grave dirt.",
        status="draft",
        style_version=1,
        tags=["terrain"],
    ),
)
