# Style bible

The rules that make this project's art look like itself. Agents read this before drawing anything
and check their previews against it. Replace every **TODO** with a decision; the suggested defaults
are a reasonable starting point.

Rules that can be checked mechanically belong in `pagan.toml` too (see `[lint]`).

These are **pixel-art** defaults (outline, painted light, shading ramps). For flat / vector-like arcade
art, they don't apply: start from the flat template instead (`pagan init --style flat`).

## 1. Palette

- Palette file: `palettes/grave.pal.yaml` (32 colors)
- Ramp intent — what each ramp is for:
  - `stone`: outlines, headstones, hair; `flesh`: zombie skin; `denim`/`rag`: clothes; `earth`/`grass`: ground; `blood`: wounds, mouths (sparingly)

## 2. Scale

- Base sprite / tile size: 16×16 tiles
- Character height: about 40 px (3D models, 1 px per voxel)
- Target base resolution and integer scale: 480×270, ×4

## 3. Outlines

- Style: 1 px dark outline (`0`) on characters and props; none on tiles
- Selective outline: no

## 4. Light

- Light direction: top-left (the moon)
- Highlights on edges facing the light; the darkest ramp step on the far side.

## 5. Shading

- Ramp steps per material: 3-4
- No pillow shading (shading that just follows the outline inward from all sides).
- Dithering: never

## 6. Proportions

- Head-to-body ratio: about 1:3, heads slightly big so faces read
- Detail level: readable at 1× scale; if a detail is a single isolated pixel, drop it.

## 7. Animation

- Default fps: 6 (zombies are slow)
- Frame counts: walk 6, attack 4-5
- Squash and stretch: no; parts move by whole voxels

## 8. Do / Don't

Do:
- Use `mirror: horizontal` for symmetric subjects.
- Keep silhouettes readable as a solid shape.
- Keep the moon light cold; warm colours only for blood.

Don't:
- Flip lit art vertically (`flip: vertical`): the highlights end up on the wrong side. Horizontal flips
  are fine for symmetric-ish lighting; for strict top-left light, draw or render each direction.
- Let anything jump between animation frames: the anchor (feet) and unchanged parts must stay on exactly
  the same pixels. Check the preview's "changes" rows; lint W007 flags large frame-to-frame churn.
- Use colors outside the palette.
- Leave orphan pixels (single pixels with no neighbours).

## 9. Reference sprites

The approved sprites that define the look. Compare every new asset against these in preview.

- `models/zombie.model.yaml`

## Changelog

Each look change that means existing art should be revisited gets a version (`pagan style bump "note"`
bumps `style_version` in pagan.toml and adds an entry here, newest first). Assets made under an older
version get lint warning W006 until they're reviewed and stamped (`pagan mark --current <asset>`).
Palette edits and `[light]`/`[camera]` changes need no bump for 3D models (they re-render automatically);
bump when 2D sprites need redrawing to match.

- v1: initial style
