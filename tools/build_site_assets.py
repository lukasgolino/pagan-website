#!/usr/bin/env python3
"""Build the website's demo data from the PAGAN projects in art/.

Every step of the scripted demo is a real PAGAN project (art/steps/<scenario>/<step>/). This script lints
and builds each one with PAGAN exactly as a game would (into a throwaway `game/` folder next to a copy of
the project), then writes what the page shows:

  public/demo/<scenario>/index.json          the conversation tree (who says what, which replies lead where)
  public/demo/<scenario>/<step>.json         one agent turn: reply, commands, source diffs, lint, manifest, files
  public/demo/<scenario>/<step>/*.png        the built sheets (the game's own files) and a few PAGAN previews
  public/demo/features.json                  data for the feature sections (lint before/after, the zombie as a mesh)
  public/demo/features/zombie.glb (+ ramp)   the zombie as a 3D-game mesh, drawn in the browser with the ramp rule
  public/brand/                              the logo and icon (themselves PAGAN sprites, art/brand)
  src/content/docs/                          reference.md, SKILL.md and CHANGELOG.md from the PAGAN checkout

The site can't show art PAGAN doesn't produce. Output is deterministic, so re-runs don't churn; `--check`
rebuilds into a temporary folder and fails if anything differs from the committed files.

Usage:  python tools/build_site_assets.py [--check] [--pagan-repo PATH]
"""

from __future__ import annotations

import argparse
import difflib
import filecmp
import json
import os
import shutil
import subprocess
import sys
import tempfile
from importlib import metadata
from pathlib import Path
from typing import Any

import yaml
from PIL import Image

from pagan import api
from pagan.preview import change_image
from pagan.render import frame_image, save_png
from pagan.views import orbit_views

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art"
SOURCE_SUFFIXES = {".yaml", ".toml", ".md", ".py"}
SKIP_DIRS = {"previews", ".pagan-cache", "build", "__pycache__"}
GODOT_PROJECT = 'config_version=5\n\n[application]\n\nconfig/name="game"\n'


# --- running PAGAN -------------------------------------------------------------------------------


def pagan(args: list[str], cwd: Path) -> dict[str, Any]:
    """Run a PAGAN command with --json, the same interface an agent uses."""
    proc = subprocess.run(
        [sys.executable, "-m", "pagan", *args, "--json"], cwd=cwd, capture_output=True, text=True, check=False
    )
    try:
        result: dict[str, Any] = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise SystemExit(f"pagan {' '.join(args)} in {cwd} failed:\n{proc.stdout}\n{proc.stderr}") from None
    return result


def copy_project(src: Path, dst: Path) -> None:
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(*SKIP_DIRS))


def build_step(step_dir: Path, work: Path) -> tuple[Path, dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Copy a step into work/art next to an empty Godot project work/game, lint and build it there."""
    art = work / "art"
    copy_project(step_dir, art)
    (work / "game").mkdir(parents=True)
    (work / "game" / "project.godot").write_text(GODOT_PROJECT)
    lint = pagan(["lint"], art)
    build = pagan(["build"], art)
    if not build.get("ok"):
        raise SystemExit(f"pagan build failed for {step_dir}: {json.dumps(build, indent=1)}")
    manifest = json.loads((work / "game" / "assets" / "generated" / "manifest.json").read_text())
    return art, lint, build, manifest


# --- sources and diffs ---------------------------------------------------------------------------


def sources(step_dir: Path) -> dict[str, str]:
    out = {}
    for path in sorted(step_dir.rglob("*")):
        rel = path.relative_to(step_dir)
        if path.is_file() and path.suffix in SOURCE_SUFFIXES and not (set(rel.parts) & SKIP_DIRS):
            out[rel.as_posix()] = path.read_text(encoding="utf-8")
    return out


def file_order(path: str) -> tuple[int, str]:
    """Assets first, then palettes, generators, settings, docs: what a reader cares about most."""
    rank = {"models": 0, "sprites": 0, "tiles": 1, "palettes": 2, "generators": 3}.get(path.split("/")[0], 4)
    if path == "pagan.toml":
        rank = 5
    if path.endswith(".md"):
        rank = 6
    return rank, path


def diff(before: dict[str, str], after: dict[str, str]) -> list[dict[str, Any]]:
    changes = []
    for path in sorted(set(before) | set(after), key=file_order):
        a, b = before.get(path), after.get(path)
        if a == b:
            continue
        status = "added" if a is None else "removed" if b is None else "modified"
        lines = list(
            difflib.unified_diff(
                (a or "").splitlines(), (b or "").splitlines(), f"a/{path}", f"b/{path}", n=3, lineterm=""
            )
        )
        added = sum(1 for line in lines if line.startswith("+") and not line.startswith("+++"))
        removed = sum(1 for line in lines if line.startswith("-") and not line.startswith("---"))
        changes.append(
            {"path": path, "status": status, "added": added, "removed": removed, "diff": "\n".join(lines[2:])}
        )
    return changes


# --- images --------------------------------------------------------------------------------------


def changes_strip(asset: Any, animation: str, gap: int = 2) -> Image.Image:
    """PAGAN's "changes" row for one animation: each frame dimmed, with the pixels that changed since
    the previous frame in magenta (cyan = removed). The preview sheet shows the same row."""
    frames = asset.animations[animation].frames
    pairs = list(zip(frames, frames[1:] + frames[:1]))
    w, h = asset.size
    out = Image.new("RGBA", (len(pairs) * (w + gap) - gap, h), (0, 0, 0, 0))
    for i, (a, b) in enumerate(pairs):
        out.alpha_composite(change_image(asset, a, b), (i * (w + gap), 0))
    return out


def ground(project_dir: Path, scene: dict[str, Any]) -> Image.Image:
    """The scenario's ground: PAGAN tiles laid out with api.compose, props drawn at their pivots."""
    project = api.open_project(project_dir)
    tileset = api.load(project_dir / "tiles" / f"{scene['tileset']}.tiles.yaml", project)
    image = api.compose(tileset, scene["layout"])
    for prop in scene.get("props", []):
        asset = api.load(project_dir / "models" / f"{prop['asset']}.model.yaml", project)
        frame = frame_image(asset, prop["frame"])
        px, py = asset.pivot
        image.alpha_composite(frame, (round(prop["at"][0] - px), round(prop["at"][1] - py)))
    return image


def palettes(project_dir: Path) -> dict[str, Any]:
    project = api.open_project(project_dir)
    out = {}
    for path in sorted((project_dir / "palettes").glob("*.pal.yaml")):
        name = path.name.removesuffix(".pal.yaml")
        pal = api.palette(name, project)
        out[name] = {
            "colors": [{"key": k, "hex": c.hex, "name": c.name} for k, c in pal.colors.items()],
            "ramps": {r: list(keys) for r, keys in pal.ramps.items()},
        }
    return out


# --- one step ------------------------------------------------------------------------------------


def godot_excerpt(path: Path) -> str:
    """The resource's head, its first atlas region and the start of its animation list."""
    text = path.read_text().splitlines()
    start = text.index("[resource]")
    keep = text[:8] + ["..."] + text[start : start + 9] + ["..."]
    return "\n".join(keep) + f"\n({len(text)} lines in all)"


def step_data(
    scenario: dict[str, Any], step_id: str, parents: list[str], out: Path, work: Path
) -> dict[str, Any]:
    sid = scenario["id"]
    step = scenario["steps"][step_id]
    step_dir = ART / "steps" / sid / step_id
    art, lint, build, manifest = build_step(step_dir, work / step_id)
    game = work / step_id / "game"
    generated = game / "assets" / "generated"
    show = step["show"]
    project = api.open_project(art)
    asset = api.load(next(art.glob(f"*/{show['asset']}.*.yaml")), project)

    images = out / step_id
    images.mkdir(parents=True)
    entry = manifest["assets"][show["asset"]]
    # the base sheet exactly as the game gets it; variants are recoloured in the browser from `swap`
    for name, other in manifest["assets"].items():  # every base sheet (the gallery uses the others)
        sheet = generated / other["sheet"].removeprefix("res://assets/generated/")
        shutil.copyfile(sheet, images / f"{name}.png")
    if show.get("changes"):
        save_png(changes_strip(asset, f"{show['changes']}_{show['heading']}"), images / "changes.png")
    if "scene" in scenario:
        save_png(ground(art, scenario["scene"]), images / "ground.png")

    files = [
        {"path": p.relative_to(game).as_posix(), "bytes": p.stat().st_size}
        for p in sorted(generated.rglob("*"))
        if p.is_file()
    ]
    tres = generated / entry["godot_sprite_frames"].removeprefix("res://assets/generated/")
    src = sources(step_dir)
    return {
        "scenario": sid,
        "id": step_id,
        "agent": " ".join(step["agent"].split()),
        "ran": step.get("ran", []),
        "show": show,
        "lint": {"errors": lint["errors"], "warnings": lint["warnings"], "findings": lint["findings"]},
        "build": {"written": len(build["written"]), "warnings": build["warnings"]},
        "diffs": {p: diff(sources(ART / "steps" / sid / p), src) for p in parents} or {"": diff({}, src)},
        "manifest": entry,
        "files": files,
        "godot": {"path": tres.relative_to(game).as_posix(), "excerpt": godot_excerpt(tres)},
        "palettes": palettes(art),
        "sheet": f"{step_id}/{show['asset']}.png",
        "changes": f"{step_id}/changes.png" if show.get("changes") else None,
        "ground": f"{step_id}/ground.png" if "scene" in scenario else None,
        "status": asset.status,
    }


def scenario_data(path: Path, out_root: Path, work: Path) -> dict[str, Any]:
    scenario = yaml.safe_load(path.read_text())
    sid = scenario["id"]
    out = out_root / sid
    out.mkdir(parents=True)
    steps = scenario["steps"]
    parents: dict[str, list[str]] = {s: [] for s in steps}
    choices: dict[str, list[dict[str, str]]] = {}
    for s, step in steps.items():
        choices[s] = []
        for n in step.get("next", []):
            to, say = (n, steps[n]["user"]) if isinstance(n, str) else (n["to"], n["say"])
            parents[to].append(s)
            choices[s].append({"to": to, "say": say})
    for s in steps:
        data = step_data(scenario, s, parents[s], out, work / sid)
        data["next"] = choices[s]
        write_json(out / f"{s}.json", data)
    index = {
        "id": sid,
        "title": scenario["title"],
        "pitch": scenario["pitch"],
        "start": scenario["start"],
        "sea": scenario.get("sea"),
        "actors": scenario.get("scene", {}).get("actors"),
        "steps": {s: {"user": steps[s]["user"], "next": choices[s], "parents": parents[s]} for s in steps},
    }
    write_json(out / "index.json", index)
    return index


# --- feature sections, brand, docs ---------------------------------------------------------------


def features(out_root: Path, work: Path) -> None:
    """Lint before/after: the zombie's first 5-frame attack (W007) next to the 9-frame one that shipped."""
    data: dict[str, Any] = {}
    for key, step_dir in {"before": ART / "steps/features/attack-v1", "after": ART / "steps/zombie/02-attack"}.items():
        art, lint, _, _ = build_step(step_dir, work / "features" / key)
        project = api.open_project(art)
        asset = api.load(art / "models/zombie.model.yaml", project)
        anim = "attack_se"
        images = out_root / "features"
        images.mkdir(parents=True, exist_ok=True)
        frames = asset.animations[anim].frames
        w, h = asset.size
        strip = Image.new("RGBA", (len(frames) * (w + 2) - 2, h), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            strip.alpha_composite(frame_image(asset, f), (i * (w + 2), 0))
        save_png(strip, images / f"attack-{key}.png")
        save_png(changes_strip(asset, anim), images / f"attack-{key}-changes.png")
        mine = [f for f in lint["findings"] if f["rule"] == "W007" and anim in f.get("where", "")]
        data[key] = {
            "frames": len(frames),
            "fps": asset.animations[anim].fps,
            "size": list(asset.size),
            "strip": f"features/attack-{key}.png",
            "changes": f"features/attack-{key}-changes.png",
            "warnings": lint["warnings"],
            "findings": mine,
        }
    data["mesh"] = mesh_feature(out_root, work)
    write_json(out_root / "features.json", data)


def mesh_feature(out_root: Path, work: Path) -> dict[str, Any]:
    """The zombie built as a mesh for a 3D game (art/steps/features/mesh): its .glb and ramp texture exactly as
    the game gets them, PAGAN's orbit views (every heading, from below to straight down) and the manifest's
    `mesh` entry. The browser draws the .glb with the same brightness -> ramp step rule as PAGAN's shader."""
    step_dir = ART / "steps/features/mesh"
    art, _, _, manifest = build_step(step_dir, work / "features" / "mesh")
    generated = work / "features" / "mesh" / "game" / "assets" / "generated"
    mesh = manifest["assets"]["zombie"]["mesh"]
    images = out_root / "features"
    images.mkdir(parents=True, exist_ok=True)
    for key, name in (("glb", "zombie.glb"), ("ramp", "zombie.ramp.png")):
        shutil.copyfile(generated / mesh[key].removeprefix("res://assets/generated/"), images / name)
    project = api.open_project(art)
    asset = api.load(art / "models/zombie.model.yaml", project)
    rows = orbit_views(asset, project.config.camera.scale)
    cell = max(max(v.image.size) for _, views in rows for v in views)
    gap = 4
    sheet = Image.new("RGBA", (8 * (cell + gap) - gap, len(rows) * (cell + gap) - gap), (0, 0, 0, 0))
    for r, (_, views) in enumerate(rows):
        for c, view in enumerate(views):
            sheet.alpha_composite(view.image, (c * (cell + gap), r * (cell + gap)))
    save_png(sheet, images / "zombie-orbit.png")
    source = (step_dir / "models/zombie.model.yaml").read_text()
    rig = source[source.index("rig:") : source.index("\nanimations:")].rstrip()
    light = project.config.light
    return {
        "glb": "features/zombie.glb",
        "ramp": "features/zombie.ramp.png",
        "orbit": "features/zombie-orbit.png",
        "orbit_rows": [label for label, _ in rows],
        "orbit_size": [sheet.width, sheet.height],
        "rig": rig,
        "light": {"ambient": light.ambient, "wrap": light.wrap},
        "manifest": {
            k: mesh[k] for k in ("voxel_size", "shading", "triangles", "bounds", "root", "animation_order")
        }
        | {
            "parts": {p: {"node": v["node"], "meta": v["meta"]} for p, v in mesh["parts"].items() if v["meta"]},
            "animations": {a: {k: v[k] for k in ("fps", "loop", "frames")} for a, v in mesh["animations"].items()},
        },
        "files": sorted(p.relative_to(generated).as_posix() for p in (generated / "models").iterdir() if p.is_file()),
    }


def brand(public: Path, work: Path) -> None:
    art = work / "brand"
    copy_project(ART / "brand", art)
    out = public / "brand"
    out.mkdir(parents=True)
    project = api.open_project(art)
    for name, scales in {"logo": (1, 4), "mark": (1, 2, 4, 12)}.items():
        image = frame_image(api.load(art / "sprites" / f"{name}.sprite.yaml", project), "main")
        for s in scales:
            save_png(image.resize((image.width * s, image.height * s), Image.Resampling.NEAREST), out / f"{name}@{s}x.png")


def og_images(public: Path) -> None:
    """Link-preview images (1200x630): the logo over the demo's own art, upscaled with whole pixels."""
    out = public / "og"
    out.mkdir(parents=True)
    bg = (19, 18, 27, 255)

    def frame(step: str, asset: str, name: str, variant: str | None = None) -> Image.Image:
        project = api.open_project(ART / "steps" / step)
        a = api.load(next((ART / "steps" / step).glob(f"*/{asset}.*.yaml")), project)
        return frame_image(a, name, variant)

    def card(name: str, ground: Image.Image | None, sprites: list[tuple[Image.Image, int, int]], scale: int) -> None:
        image = Image.new("RGBA", (1200, 630), bg)
        if ground is not None:
            g = ground.resize((ground.width * scale, ground.height * scale), Image.Resampling.NEAREST)
            image.alpha_composite(g, (1200 - g.width, 630 - g.height))
        for sprite, x, y in sprites:
            image.alpha_composite(sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST), (x, y))
        brand = api.open_project(ART / "brand")
        logo = frame_image(api.load(ART / "brand/sprites/logo.sprite.yaml", brand), "main")
        image.alpha_composite(logo.resize((logo.width * 6, logo.height * 6), Image.Resampling.NEAREST), (56, 48))
        save_png(image, out / f"{name}.png")

    ship = [frame("ship/04-teams", "ship", "se", v) for v in (None, "blue", "green", "gold")]
    zombie = frame("zombie/02-horde", "zombie", "s")
    card("pagan", None, [(ship[1], 560, 120), (ship[0], 760, 300), (zombie, 120, 300), (frame("zombie/02-horde", "zombie", "se", "ash+flannel"), 300, 330)], 3)
    card("ship", None, [(s, 40 + i * 280, 250) for i, s in enumerate(ship)], 3)
    graveyard = ground(ART / "steps/zombie/03-night-horde", yaml.safe_load((ART / "scenarios/zombie.yaml").read_text())["scene"])
    card("zombie", graveyard, [(frame("zombie/03-night-horde", "zombie", h, v), x, 250) for h, v, x in (("se", "green+rag", 640), ("s", "pallid+scrubs", 860))], 5)


def docs(content: Path, pagan_repo: Path | None) -> None:
    """One source of truth: the reference and workflow ship inside the pagan package; the changelog
    comes from a PAGAN checkout (pass --pagan-repo or set PAGAN_REPO)."""
    out = content / "docs"
    out.mkdir(parents=True)
    skill = Path(api.__file__).parent / "skill"
    shutil.copyfile(skill / "reference.md", out / "reference.md")
    workflow = (skill / "SKILL.md").read_text(encoding="utf-8").replace("](reference.md)", "](../reference/)")
    (out / "workflow.md").write_text(workflow, encoding="utf-8")
    if pagan_repo is None or not (pagan_repo / "CHANGELOG.md").is_file():
        raise SystemExit("CHANGELOG.md not found: pass --pagan-repo <PAGAN checkout> or set PAGAN_REPO")
    shutil.copyfile(pagan_repo / "CHANGELOG.md", out / "changelog.md")
    write_json(out / "meta.json", {"pagan": metadata.version("pagan")})


# --- main ----------------------------------------------------------------------------------------


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def generate(public: Path, content: Path, pagan_repo: Path | None) -> list[dict[str, Any]]:
    with tempfile.TemporaryDirectory(prefix="pagan-site-") as tmp:
        work = Path(tmp)
        demo = public / "demo"
        paths = sorted((ART / "scenarios").glob("*.yaml"), key=lambda p: (yaml.safe_load(p.read_text())["order"], p.name))
        scenarios = [scenario_data(p, demo, work) for p in paths]
        write_json(demo / "scenarios.json", [{"id": s["id"], "title": s["title"], "pitch": s["pitch"]} for s in scenarios])
        features(demo, work)
        brand(public, work)
        og_images(public)
        docs(content, pagan_repo)
    return scenarios


def same_pixels(a: Path, b: Path) -> bool:
    """PNGs compare by decoded pixels: zlib builds may compress the same image differently."""
    with Image.open(a) as ia, Image.open(b) as ib:
        return ia.size == ib.size and ia.convert("RGBA").tobytes() == ib.convert("RGBA").tobytes()


def same_tree(a: Path, b: Path) -> list[str]:
    cmp = filecmp.dircmp(a, b)
    problems = [f"{a / n}: only in one" for n in cmp.left_only + cmp.right_only]
    problems += [
        str(b / n) for n in cmp.diff_files if not (n.endswith(".png") and same_pixels(a / n, b / n))
    ]
    for sub in cmp.common_dirs:
        problems += same_tree(a / sub, b / sub)
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="fail if the committed output is out of date")
    parser.add_argument("--pagan-repo", type=Path, default=os.environ.get("PAGAN_REPO"))
    args = parser.parse_args()
    pagan_repo = Path(args.pagan_repo).resolve() if args.pagan_repo else None
    targets = {
        "demo": ROOT / "public" / "demo",
        "brand": ROOT / "public" / "brand",
        "og": ROOT / "public" / "og",
        "docs": ROOT / "src" / "content" / "docs",
    }
    with tempfile.TemporaryDirectory(prefix="pagan-site-out-") as tmp:
        public, content = Path(tmp) / "public", Path(tmp) / "content"
        scenarios = generate(public, content, pagan_repo)
        fresh = {"demo": public / "demo", "brand": public / "brand", "og": public / "og", "docs": content / "docs"}
        if args.check:
            problems = [p for k in targets for p in same_tree(fresh[k], targets[k])] if all(
                t.is_dir() for t in targets.values()
            ) else ["committed output missing"]
            if problems:
                print("Site assets are out of date; run python tools/build_site_assets.py", *problems, sep="\n  ")
                raise SystemExit(1)
            print("Site assets are up to date.")
            return
        for key, target in targets.items():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(fresh[key], target)
    steps = sum(len(s["steps"]) for s in scenarios)
    print(f"Built {len(scenarios)} scenarios, {steps} steps with pagan {metadata.version('pagan')}.")


if __name__ == "__main__":
    main()
