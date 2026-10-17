// The scripted demo: a conversation tree whose every agent turn is a real PAGAN project build
// (public/demo/<scenario>/<step>.json, written by tools/build_site_assets.py).

import { escapeHtml, highlightDiff, highlightLine } from "./highlight";
import {
  Sprite,
  loadImage,
  makeTurnable,
  onTick,
  recolor,
  reducedMotion,
  whenVisible,
  withBase,
  type Entry,
} from "./sprites";

interface Choice {
  to: string;
  say: string;
}
interface Index {
  id: string;
  title: string;
  pitch: string;
  start: string;
  sea: string | null;
  actors: [number, number][] | null;
  steps: Record<string, { user: string; next: Choice[]; parents: string[] }>;
}
interface FileDiff {
  path: string;
  status: string;
  added: number;
  removed: number;
  diff: string;
}
interface Finding {
  rule: string;
  severity: string;
  message: string;
  path: string;
  line: number | null;
}
interface Step {
  scenario: string;
  id: string;
  agent: string;
  ran: string[];
  show: {
    asset: string;
    animation?: string;
    heading: string;
    changes?: string;
    rotate?: boolean;
    teams?: boolean;
    horde?: boolean;
    compare?: boolean;
  };
  lint: { errors: number; warnings: number; findings: Finding[] };
  diffs: Record<string, FileDiff[]>;
  manifest: Entry & Record<string, unknown>;
  files: { path: string; bytes: number }[];
  godot: { path: string; excerpt: string };
  sheet: string;
  changes: string | null;
  ground: string | null;
  status: string;
  next: Choice[];
}

const stepCache = new Map<string, Promise<Step>>();
function loadStep(scenario: string, id: string): Promise<Step> {
  const key = `${scenario}/${id}`;
  let p = stepCache.get(key);
  if (!p) {
    p = fetch(withBase(`demo/${key}.json`)).then((r) => {
      if (!r.ok) throw new Error(`${key}: ${r.status}`);
      return r.json() as Promise<Step>;
    });
    stepCache.set(key, p);
  }
  return p;
}

const SCALE = 4;
const TEAM_ORDER = ["red", "blue", "green", "gold"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function animationNames(entry: Entry): string[] {
  const hs = entry.headings ?? [];
  const names = new Set<string>();
  for (const name of Object.keys(entry.animations)) {
    if (hs.includes(name)) continue;
    const h = hs.find((x) => name.endsWith(`_${x}`));
    if (h) names.add(name.slice(0, -(h.length + 1)));
  }
  return [...names];
}

/** The manifest entry, shortened for reading: a few frame rects and animations, the rest counted. */
function manifestExcerpt(name: string, entry: Record<string, unknown>): string {
  const short: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (k === "description") continue;
    if ((k === "frames" || k === "animations") && v && typeof v === "object") {
      const items = Object.entries(v as Record<string, unknown>);
      const head = Object.fromEntries(items.slice(0, 2));
      if (items.length > 2) head["…"] = `${items.length - 2} more`;
      short[k] = head;
    } else if (k === "variants" && v && typeof v === "object") {
      const items = Object.entries(v as Record<string, Record<string, unknown>>);
      const out: Record<string, unknown> = {};
      for (const [vn, vv] of items.slice(0, 2)) out[vn] = { sheet: vv.sheet, swap: vv.swap, swap_exact: vv.swap_exact };
      if (items.length > 2) out["…"] = `${items.length - 2} more`;
      short[k] = out;
    } else short[k] = v;
  }
  const json = JSON.stringify({ [name]: short }, null, 1)
    .replace(/\[\n\s*([^\[\]{}]*?)\n\s*\]/g, (_, inner: string) => `[${inner.replace(/\s*\n\s*/g, " ")}]`);
  return json;
}

// --- the art viewer of one agent turn ------------------------------------------------------------

interface ViewerOptions {
  step: Step;
  index: Index;
  parent: Step | null;
}

async function viewer({ step, index, parent }: ViewerOptions): Promise<HTMLElement> {
  const show = step.show;
  const entry = step.manifest;
  const box = el("div", "viewer");
  const sheet = await loadImage(withBase(`demo/${step.scenario}/${step.sheet}`));
  const ground = step.ground ? await loadImage(withBase(`demo/${step.scenario}/${step.ground}`)) : null;
  const variants = entry.variants ?? {};
  const teamNames = TEAM_ORDER.filter((t) => t in variants);
  const hordeNames = Object.keys(variants);

  const main = new Sprite(entry, sheet, show.heading, show.animation ?? null);
  const width = ground ? ground.width : entry.size[0] + 40;
  const height = ground ? ground.height : entry.size[1] + 8;
  const describe = (entry.description ?? show.asset).replace(/\s+/g, " ");

  // actors: one featured sprite, or the horde spread over the graveyard
  const actors: { sprite: Sprite; x: number; y: number }[] = [];
  if (ground && index.actors) {
    if (show.horde) {
      const heads = ["s", "se", "sw"];
      index.actors.forEach(([x, y], i) => {
        const v = variants[hordeNames[(i * 4 + 1) % hordeNames.length]];
        const s = new Sprite(entry, v ? recolor(sheet, v.swap) : sheet, heads[i % 3], show.animation ?? null);
        actors.push({ sprite: s, x, y });
      });
      actors[0].sprite = main;
    } else {
      const [x, y] = index.actors[0];
      actors.push({ sprite: main, x, y });
    }
  } else {
    actors.push({ sprite: main, x: width / 2, y: entry.pivot[1] + 4 });
  }

  // before/after: the parent step's art under a slider
  let before: { sprites: { sprite: Sprite; x: number; y: number }[]; ground: HTMLImageElement | null } | null = null;
  if (show.compare && parent) {
    const pSheet = await loadImage(withBase(`demo/${parent.scenario}/${parent.sheet}`));
    const pGround = parent.ground ? await loadImage(withBase(`demo/${parent.scenario}/${parent.ground}`)) : null;
    const pv = parent.manifest.variants ?? {};
    before = {
      ground: pGround,
      sprites: actors.map((a, i) => {
        let src: HTMLImageElement | HTMLCanvasElement = pSheet;
        if (show.horde && i > 0) {
          const v = pv[hordeNames[(i * 4 + 1) % hordeNames.length]];
          if (v) src = recolor(pSheet, v.swap);
        }
        return { sprite: new Sprite(parent.manifest, src, a.sprite.heading, a.sprite.animation), x: a.x, y: a.y };
      }),
    };
  }

  const stage = el("div", "stage");
  if (!ground) stage.style.background = index.sea ?? "transparent";
  stage.setAttribute("role", "img");
  stage.setAttribute("aria-label", describe);
  const canvas = el("canvas", "px");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  stage.append(canvas);
  let beforeCanvas: HTMLCanvasElement | null = null;
  let slider: HTMLInputElement | null = null;
  if (before) {
    beforeCanvas = el("canvas", "px before");
    beforeCanvas.width = canvas.width;
    beforeCanvas.height = canvas.height;
    stage.append(beforeCanvas);
    stage.append(el("span", "tag left", "before"), el("span", "tag right", "after"));
    slider = el("input", "slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "50";
    slider.setAttribute("aria-label", "Compare before and after");
    stage.append(slider);
  }
  box.append(stage);

  // team colours: the same frames, recoloured from the manifest's swap tables
  const teamCanvases: { canvas: HTMLCanvasElement; sprite: Sprite }[] = [];
  if (show.teams && teamNames.length) {
    const row = el("div", "teams");
    for (const t of teamNames) {
      const v = variants[t];
      const c = el("canvas", "px");
      c.width = entry.size[0] * 2;
      c.height = entry.size[1] * 2;
      const fig = el("figure");
      fig.append(c, el("figcaption", "", t));
      row.append(fig);
      const src = v.swap && Object.keys(v.swap).length ? recolor(sheet, v.swap) : sheet;
      teamCanvases.push({ canvas: c, sprite: new Sprite(entry, src, main.heading, main.animation) });
    }
    box.append(row);
    box.append(el("p", "note", "Recoloured in your browser from each variant's <code>swap</code> table in manifest.json."));
  }

  // the whole horde: 9 variants side by side
  if (show.horde && hordeNames.length) {
    const row = el("div", "horde");
    for (const name of hordeNames) {
      const c = el("canvas", "px");
      c.width = entry.size[0] * 2;
      c.height = entry.size[1] * 2;
      const fig = el("figure");
      fig.append(c, el("figcaption", "", name.replace("+", " + ")));
      row.append(fig);
      teamCanvases.push({ canvas: c, sprite: new Sprite(entry, recolor(sheet, variants[name].swap), "s", show.animation ?? null) });
    }
    box.append(row);
  }

  // controls: heading, animation, play
  const controls = el("div", "controls");
  const left = el("button", "", "◀");
  left.type = "button";
  left.setAttribute("aria-label", "Turn left");
  const right = el("button", "", "▶");
  right.type = "button";
  right.setAttribute("aria-label", "Turn right");
  const label = el("span", "heading");
  const hasHeadings = (entry.headings?.length ?? 0) > 1;
  if (hasHeadings) controls.append(left, label, right);
  const anims = animationNames(entry);
  const animButtons: HTMLButtonElement[] = [];
  if (anims.length) {
    const group = el("div", "anims");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Animation");
    for (const a of [null, ...anims]) {
      const b = el("button", "", a ?? "still");
      b.type = "button";
      b.addEventListener("click", () => {
        for (const s of allSprites()) {
          s.animation = a;
          s.restart();
        }
        sync();
      });
      animButtons.push(b);
      group.append(b);
    }
    controls.append(group);
  }
  let playing = !reducedMotion();
  const play = el("button", "playbtn");
  play.type = "button";
  controls.append(play);
  box.append(controls);

  const allSprites = () => [
    ...actors.map((a) => a.sprite),
    ...(before?.sprites.map((a) => a.sprite) ?? []),
    ...teamCanvases.map((t) => t.sprite),
  ];
  const sync = () => {
    label.textContent = `${main.heading} · ${entry.headings?.indexOf(main.heading)! + 1}/${entry.headings?.length}`;
    animButtons.forEach((b, i) => b.setAttribute("aria-pressed", String((i === 0 ? null : anims[i - 1]) === main.animation)));
    play.textContent = playing ? "❚❚ pause" : "▶ play";
  };
  const turn = (n: number) => {
    main.turn(n);
    // the horde keeps its own headings; everything else turns with the featured sprite
    const followers = show.horde ? [before?.sprites[0]?.sprite] : allSprites();
    for (const s of followers) if (s) s.heading = main.heading;
    sync();
    draw(performance.now());
  };
  left.addEventListener("click", () => turn(1));
  right.addEventListener("click", () => turn(-1));
  play.addEventListener("click", () => {
    playing = !playing;
    sync();
    draw(performance.now());
  });
  if (hasHeadings) {
    stage.tabIndex = 0;
    stage.classList.add("turnable");
    makeTurnable(stage, () => main, () => turn(0));
  }
  if (slider && beforeCanvas) {
    const clip = () => (beforeCanvas!.style.clipPath = `inset(0 ${100 - Number(slider!.value)}% 0 0)`);
    slider.addEventListener("input", clip);
    slider.addEventListener("pointerdown", (e) => e.stopPropagation());
    clip();
  }

  const ctx = canvas.getContext("2d")!;
  const bctx = beforeCanvas?.getContext("2d") ?? null;
  const paint = (
    c: CanvasRenderingContext2D,
    g: HTMLImageElement | null,
    list: { sprite: Sprite; x: number; y: number }[],
    now: number,
  ) => {
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (g) c.drawImage(g, 0, 0, g.width * SCALE, g.height * SCALE);
    for (const a of [...list].sort((p, q) => p.y - q.y)) a.sprite.draw(c, a.x * SCALE, a.y * SCALE, SCALE, now, playing);
  };
  function draw(now: number) {
    paint(ctx, ground, actors, now);
    if (bctx && before) paint(bctx, before.ground, before.sprites, now);
    for (const t of teamCanvases) {
      const c = t.canvas.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, t.canvas.width, t.canvas.height);
      t.sprite.draw(c, t.sprite.entry.pivot[0] * 2, t.sprite.entry.pivot[1] * 2, 2, now, playing);
    }
  }
  sync();
  draw(performance.now());
  let stop: (() => void) | null = null;
  whenVisible(
    box,
    () => (stop ??= onTick(draw)),
    () => {
      stop?.();
      stop = null;
    },
  );

  if (step.changes) {
    const fig = el("figure", "changes");
    const img = el("img", "px checker");
    img.src = withBase(`demo/${step.scenario}/${step.changes}`);
    img.alt = `PAGAN's changes row for the ${show.changes} animation: each frame dimmed, changed pixels in magenta.`;
    img.loading = "lazy";
    img.addEventListener("load", () => {
      img.width = img.naturalWidth * 2;
      img.height = img.naturalHeight * 2;
    });
    fig.append(
      img,
      el(
        "figcaption",
        "",
        `What changes between frames of <code>${show.changes}_${show.heading}</code>: magenta = changed, cyan = removed. Everything else stays on exactly the same pixels.`,
      ),
    );
    box.append(fig);
  }
  return box;
}

// --- the "what the agent wrote" / "what your game gets" panels ----------------------------------

function wrotePanel(step: Step, parent: string | null): HTMLElement {
  const d = el("details", "more");
  const diffs = step.diffs[parent ?? ""] ?? Object.values(step.diffs)[0] ?? [];
  const lint = step.lint;
  const lintLine =
    `pagan lint: ${lint.errors} error${lint.errors === 1 ? "" : "s"}, ${lint.warnings} warning${lint.warnings === 1 ? "" : "s"}`;
  d.append(el("summary", "", `What the agent wrote <span>${diffs.length} file${diffs.length === 1 ? "" : "s"} · ${lintLine}</span>`));
  const body = el("div", "more-body");
  body.append(el("h4", "", "Commands it ran"));
  body.append(el("pre", "code", `<code>${step.ran.map((c) => `<span class="t-punc">$</span> ${escapeHtml(c)}`).join("\n")}</code>`));
  body.append(el("h4", "", parent ? "Source changes" : "Source files"));
  for (const f of diffs) {
    const fd = el("details", "file");
    if (f.path.startsWith("models/") || f.path.startsWith("sprites/")) fd.open = true;
    fd.append(
      el(
        "summary",
        "",
        `<code>${escapeHtml(f.path)}</code> <span class="st ${f.status}">${f.status}</span> <span class="n"><b class="a">+${f.added}</b> <b class="r">−${f.removed}</b></span>`,
      ),
    );
    fd.append(el("pre", "code diff", `<code>${highlightDiff(f.diff)}</code>`));
    body.append(fd);
  }
  body.append(el("h4", "", "Lint"));
  const lintText = lint.findings.length
    ? lint.findings.map((x) => `${x.path}: ${x.severity} ${x.rule}: ${x.message}`).join("\n")
    : `${lintLine}`;
  body.append(el("pre", "code", `<code>${escapeHtml(lintText)}</code>`));
  d.append(body);
  return d;
}

function gamePanel(step: Step): HTMLElement {
  const d = el("details", "more");
  const total = step.files.reduce((n, f) => n + f.bytes, 0);
  d.append(el("summary", "", `What your game gets <span>${step.files.length} files · ${kb(total)}</span>`));
  const body = el("div", "more-body");
  body.append(el("h4", "", "Files written by <code>pagan build</code>"));
  body.append(
    el(
      "pre",
      "code",
      `<code>${step.files.map((f) => `${escapeHtml(f.path.padEnd(48))} <span class="t-com">${kb(f.bytes)}</span>`).join("\n")}</code>`,
    ),
  );
  body.append(el("h4", "", "<code>manifest.json</code>: the contract with any engine (shortened)"));
  body.append(el("pre", "code", `<code>${manifestExcerpt(step.show.asset, step.manifest).split("\n").map(highlightLine).join("\n")}</code>`));
  body.append(el("h4", "", `Godot: <code>${escapeHtml(step.godot.path)}</code> (excerpt)`));
  body.append(el("pre", "code", `<code>${escapeHtml(step.godot.excerpt)}</code>`));
  d.append(body);
  return d;
}

// --- the conversation ----------------------------------------------------------------------------

export function mountDemo(root: HTMLElement): void {
  const indices: Index[] = JSON.parse(root.dataset.indices!);
  const log = root.querySelector(".log") as HTMLElement;
  const choices = root.querySelector(".choices") as HTMLElement;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>(".tabs button")];
  let index = indices[0];
  let run = 0;

  const bubble = (who: "you" | "agent", html: string) => {
    const m = el("div", `msg ${who}`);
    m.append(el("span", "who", who === "you" ? "You" : "Agent"));
    const b = el("div", "body", html);
    m.append(b);
    log.append(m);
    return b;
  };

  const showChoices = (step: Step) => {
    choices.replaceChildren();
    const list = step.next.length
      ? step.next.map((c) => ({ label: c.say, act: () => say(c.say, c.to, step) }))
      : [
          ...indices
            .filter((i) => i.id !== index.id)
            .map((i) => ({ label: `Try the ${i.title.toLowerCase()} →`, act: () => start(i) })),
          { label: "Start over", act: () => start(index) },
        ];
    for (const c of list) {
      const b = el("button", "choice", escapeHtml(c.label));
      b.type = "button";
      b.addEventListener("click", c.act);
      choices.append(b);
    }
  };

  const agentTurn = async (id: string, parent: Step | null, my: number, scroll: boolean) => {
    choices.replaceChildren(el("span", "typing", "Agent is working…"));
    const step = await loadStep(index.id, id);
    if (my !== run) return;
    const parentStep = parent && index.steps[id].parents.includes(parent.id) ? parent : null;
    const body = bubble("agent", "");
    body.append(el("p", "", escapeHtml(step.agent).replace(/`([^`]+)`/g, "<code>$1</code>")));
    body.append(await viewer({ step, index, parent: parentStep }));
    if (my !== run) return;
    body.append(wrotePanel(step, parentStep?.id ?? null), gamePanel(step));
    showChoices(step);
    if (scroll) (body.parentElement!.previousElementSibling ?? body.parentElement!).scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const say = (text: string, to: string, from: Step) => {
    bubble("you", escapeHtml(text));
    void agentTurn(to, from, run, true);
  };

  const start = (i: Index, scroll = true) => {
    index = i;
    run++;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.id === i.id)));
    log.replaceChildren();
    bubble("you", escapeHtml(i.steps[i.start].user));
    void agentTurn(i.start, null, run, scroll);
  };

  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      const i = indices.find((x) => x.id === t.dataset.id);
      if (i) start(i);
    }),
  );

  // build the first turn once the demo scrolls near, so the page loads light
  let started = false;
  const kick = () => {
    if (!started) {
      started = true;
      start(index, false);
    }
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          kick();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(root);
  } else kick();
}
