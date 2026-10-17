"""The PAGAN wordmark and the speech-bubble mark, drawn on a 5x7 pixel font.
Run from the project folder: python generators/logo.py"""

from pagan import api

GLYPHS = {
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
}
EMBER = ["4", "5", "6", "7"]  # bottom (dark) -> top (light): lit from above


def wordmark(text: str, cell: int) -> api.Canvas:
    """Each font pixel is a cell x cell block, shaded top-light to bottom-dark."""
    width = len(text) * 7 * cell - 2 * cell + 2
    height = 7 * cell + 2
    c = api.Canvas(width, height)
    for i, ch in enumerate(text):
        for gy, row in enumerate(GLYPHS[ch]):
            for gx, bit in enumerate(row):
                if bit == "#":
                    for y in range(cell):
                        t = 1 - (gy * cell + y) / (7 * cell - 1)
                        key = api.ramp_pick(EMBER, t)
                        c.rect(1 + (i * 7 + gx) * cell, 1 + gy * cell + y, 1 + (i * 7 + gx + 1) * cell - 1, 1 + gy * cell + y, key)
    return c


def mark() -> api.Canvas:
    """A speech bubble holding a 2x2 pixel checker: "your agent speaks pixels"."""
    c = api.Canvas(16, 16)
    c.rect(2, 2, 13, 10, "9")
    c.rect(3, 1, 12, 1, "9")
    c.rect(3, 11, 12, 11, "9")
    c.rect(1, 3, 1, 9, "9")
    c.rect(14, 3, 14, 9, "8")
    c.rect(3, 11, 12, 11, "8")
    c.rect(4, 12, 6, 12, "8")
    c.rect(4, 13, 4, 13, "8")
    c.rect(3, 1, 12, 1, "a")
    c.rect(1, 3, 1, 4, "a")
    for y in range(4, 10, 2):
        for x in range(4, 12, 2):
            if (x + y) // 2 % 2 == 0:
                c.rect(x, y, x + 1, y + 1, "6")
            else:
                c.rect(x, y, x + 1, y + 1, "5")
    return c


api.write(
    "sprites/logo.sprite.yaml",
    api.sprite_yaml(
        "logo",
        (len("PAGAN") * 7 * 2 - 4 + 2, 7 * 2 + 2),
        {"main": wordmark("PAGAN", 2)},
        description="The PAGAN wordmark: a 5x7 pixel font at 2x, ember gradient, dark outline.",
        outline="auto",
        status="draft",
        style_version=1,
        tags=["brand"],
    ),
)
api.write(
    "sprites/mark.sprite.yaml",
    api.sprite_yaml(
        "mark",
        (16, 16),
        {"main": mark()},
        description="Site icon: a teal speech bubble holding warm pixels (you speak, your agent speaks PAGAN).",
        outline="auto",
        status="draft",
        style_version=1,
        tags=["brand"],
    ),
)
