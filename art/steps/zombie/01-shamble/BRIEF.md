# Art brief

The long-term memory for this project's art: what the game is, what it needs, and decisions made along
the way. Agents read this (with STYLE.md) before making or changing any asset, and keep it up to date.
`pagan status` lists what exists; this file says what's *wanted* and why.

## The game

- **Title / working name:** Dead of Night (working title)
- **Genre and core loop:** top-down zombie survival; hold out in a graveyard until dawn
- **Perspective:** top-down-3/4 (top-down 3/4, seeing fronts and tops; `[camera] elevation` in pagan.toml)
- **Rendering style:** pixel art — see STYLE.md
- **Mood / references:** moonlit, cold and green; classic shambling zombies, not gore
- **Target resolution:** 480x270 scaled x4

## Characters and key assets

For each: what it is, how it looks, sizes, required directions/animations. Example:

- **Zombie** (`models/zombie.model.yaml`): hunched, arms reaching forward, 44x48, 8 headings, 6-frame shamble.
- **Graveyard ground** (`tiles/graveyard.tiles.yaml`, made by `generators/ground.py`) and a **gravestone** (`models/gravestone.model.yaml`).

## Asset wishlist

What's still needed, roughly in priority order. Move items to "Done" with the asset name when made.

- [ ] Zombie: attack animation
- [ ] Player character

## Done

- (awaiting review) zombie, graveyard, gravestone

## Decisions and feedback log

Dated notes on what the owner asked for and decided, so later assets stay consistent with it. Example:

- 2026-10-17: "Top-down zombie game, a zombie that shambles towards the player." Defaults used: pixel art,
  top-down 3/4, palette `grave`, 8 headings.
