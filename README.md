# PAGAN website

The website for [PAGAN](https://github.com/lukasgolino/PAGAN) (Pixel Art Grammar And Notation): one long
page (hero, scripted demo, features, comparison, install, gallery, FAQ), docs generated from PAGAN's own
files, and three short topic pages. Static Astro site, no backend, deployed to GitHub Pages.

**Every image on the site is real PAGAN output**, built from the PAGAN projects in `art/`.

## Layout

```
art/
  scenarios/<scenario>.yaml   the demo's conversation tree: user prompts, agent replies, commands, which replies lead where
  steps/<scenario>/<step>/    one real PAGAN project per agent turn (copied forward and edited, so each is a real diff)
  steps/features/attack-v1/   the zombie's first, lint-failing attack (shown in the "checks its own work" feature)
  brand/                      the logo and icon, themselves PAGAN sprites (generators/logo.py)
tools/build_site_assets.py    builds every step with PAGAN -> public/demo, public/brand, public/og, src/content/docs
public/demo/                  generated: step JSON (reply, diffs, lint, manifest, files) + built sheets
src/                          the Astro site (components/, scripts/ for the in-browser sprite player and demo)
```

## Commands

```sh
npm ci
npm run dev                  # http://localhost:4321
npm run build                # -> dist/

# after changing anything in art/ (needs Python 3.11+ and the pinned PAGAN release)
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python tools/build_site_assets.py --pagan-repo ../PAGAN   # a PAGAN checkout, for CHANGELOG.md
python tools/build_site_assets.py --pagan-repo ../PAGAN --check   # what CI runs
```

The asset build is deterministic: rerunning it changes nothing unless the art or PAGAN changed. Commit
`public/demo`, `public/brand`, `public/og` and `src/content/docs` with the art.

## Changing the demo

- A new turn: copy the previous step's folder, make the change the way an agent would (edit the source,
  `pagan lint`, `pagan preview`), add it to the scenario YAML (`next:` of the turn before), rebuild.
- `show:` in the scenario says what the turn displays: `asset`, `animation`, `heading`, `changes` (PAGAN's
  changes row), `rotate`, `teams` / `horde` (variants recoloured in the browser from the manifest's swap
  tables), `compare` (before/after slider against the previous turn).
- Upgrading PAGAN: bump the tag in `requirements.txt`, rebuild, look at the diff of `public/demo`.

## Art review

All demo art is `status: draft` until the owner approves it. Approve a state with
`pagan mark <asset> --status approved` in its step folder, then rebuild. The gallery says "draft" until then.

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main` (enable Pages
with "Source: GitHub Actions"). The base path comes from the Pages settings, so it works as a project page
(`/<repo>/`) or on a custom domain. `.github/workflows/assets.yml` rebuilds the art and fails if it's out of
date; it's manual-only while the PAGAN repo is private.
