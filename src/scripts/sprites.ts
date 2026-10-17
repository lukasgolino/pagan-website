// Plays PAGAN build output in the browser: a sheet PNG plus its manifest.json entry (frame rects,
// animations, headings, variant swap tables): exactly the data a game engine gets.

export type Rect = [number, number, number, number];
export interface Animation {
  frames: string[];
  fps: number;
  loop: boolean;
}
export interface Variant {
  swap: Record<string, string>;
  swap_exact: boolean;
}
export interface Entry {
  kind: string;
  size: [number, number];
  pivot: [number, number];
  frames: Record<string, Rect>;
  animations: Record<string, Animation>;
  headings?: string[];
  variants?: Record<string, Variant>;
  description?: string;
}

export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const images = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not load ${url}`));
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const recolored = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();

/** The sheet with every colour in `swap` replaced: what a palette-swap shader does in a game. */
export function recolor(img: HTMLImageElement | HTMLCanvasElement, swap: Record<string, string>): HTMLCanvasElement {
  const key = JSON.stringify(swap);
  let cache = recolored.get(img);
  if (!cache) recolored.set(img, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const table = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(swap)) {
    const [r, g, b] = hexToRgb(from);
    table.set((r << 16) | (g << 8) | b, hexToRgb(to));
  }
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const t = table.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    if (t) [px[i], px[i + 1], px[i + 2]] = t;
  }
  ctx.putImageData(data, 0, 0);
  cache.set(key, c);
  return c;
}

/** One animated sprite: a sheet + manifest entry, a heading and an animation. */
export class Sprite {
  heading: string;
  animation: string | null;
  source: HTMLImageElement | HTMLCanvasElement;
  private started = 0;

  constructor(
    readonly entry: Entry,
    sheet: HTMLImageElement | HTMLCanvasElement,
    heading?: string,
    animation?: string | null,
  ) {
    this.source = sheet;
    this.heading = heading ?? entry.headings?.[0] ?? Object.keys(entry.frames)[0];
    this.animation = animation ?? null;
  }

  get headings(): string[] {
    return this.entry.headings ?? [];
  }

  /** The manifest animation for the current heading, e.g. walk_se (or the static heading "se"). */
  get current(): Animation | undefined {
    const a = this.entry.animations;
    if (this.animation) {
      const name = this.entry.headings ? `${this.animation}_${this.heading}` : this.animation;
      if (a[name]) return a[name];
    }
    return a[this.heading] ?? Object.values(a)[0];
  }

  restart(now = performance.now()): void {
    this.started = now;
  }

  turn(steps: number): void {
    const hs = this.headings;
    if (!hs.length) return;
    const i = hs.indexOf(this.heading);
    this.heading = hs[(((i + steps) % hs.length) + hs.length) % hs.length];
  }

  frameAt(now: number, playing: boolean): string {
    const anim = this.current;
    if (!anim) return Object.keys(this.entry.frames)[0];
    if (!playing) return anim.frames[0];
    const n = anim.frames.length;
    let i = Math.floor(((now - this.started) / 1000) * anim.fps);
    if (!anim.loop) {
      const hold = Math.round(anim.fps); // one-shot: hold the last frame ~1s, then replay
      i = i % (n + hold);
      if (i >= n) i = n - 1;
    }
    return anim.frames[((i % n) + n) % n];
  }

  /** Draw with the pivot at (x, y) in canvas pixels, `scale` pixels per sprite pixel. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, now: number, playing: boolean): void {
    const [sx, sy, w, h] = this.entry.frames[this.frameAt(now, playing)];
    const [px, py] = this.entry.pivot;
    ctx.drawImage(this.source, sx, sy, w, h, Math.round(x - px * scale), Math.round(y - py * scale), w * scale, h * scale);
  }
}

type Tick = (now: number) => void;
const ticks = new Set<Tick>();
let running = false;

function loop(now: number): void {
  for (const t of ticks) t(now);
  if (ticks.size) requestAnimationFrame(loop);
  else running = false;
}

/** Register a draw callback on the shared animation loop; returns an unsubscribe function. */
export function onTick(t: Tick): () => void {
  ticks.add(t);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
  return () => ticks.delete(t);
}

/** Only animate while an element is on screen. */
export function whenVisible(el: Element, start: () => void, stop: () => void): void {
  if (!("IntersectionObserver" in window)) return start();
  new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? start : stop)();
  }).observe(el);
}

/** Drag (pointer) or arrow keys turn a sprite through its headings. */
export function makeTurnable(el: HTMLElement, sprite: () => Sprite | null, onTurn: () => void, pxPerStep = 18): void {
  let startX = 0;
  let acc = 0;
  let dragging = false;
  el.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    acc = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    const s = sprite();
    if (!dragging || !s) return;
    const steps = Math.trunc((e.clientX - startX) / pxPerStep) - acc;
    if (steps) {
      s.turn(-steps); // drag right = turn clockwise, as if spinning it with your hand
      acc += steps;
      onTurn();
    }
  });
  const end = () => {
    dragging = false;
    el.classList.remove("dragging");
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (e) => {
    const s = sprite();
    if (!s) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      s.turn(e.key === "ArrowLeft" ? 1 : -1);
      onTurn();
      e.preventDefault();
    }
  });
}

export function withBase(path: string): string {
  const base = (document.documentElement.dataset.base ?? "/").replace(/\/?$/, "/");
  return base + path.replace(/^\//, "");
}
