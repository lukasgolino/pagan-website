// <pagan-sprite step="ship/03-sixteen" heading="se" anim="sail" variant="blue" scale="2" turn all>
// Draws one asset of a demo step from its built sheet + manifest entry. `all` lays out every heading,
// `turn` makes it draggable, `variant` recolours from the manifest's swap table.

import { Sprite, loadImage, makeTurnable, onTick, recolor, reducedMotion, whenVisible, withBase, type Entry } from "./sprites";

const steps = new Map<string, Promise<{ manifest: Entry; sheet: string; scenario: string }>>();
function step(id: string) {
  let p = steps.get(id);
  if (!p) {
    p = fetch(withBase(`demo/${id}.json`)).then((r) => r.json());
    steps.set(id, p);
  }
  return p;
}

class PaganSprite extends HTMLElement {
  private stop: (() => void) | null = null;

  async connectedCallback(): Promise<void> {
    const data = await step(this.getAttribute("step")!);
    const entry = data.manifest;
    let sheet: HTMLImageElement | HTMLCanvasElement = await loadImage(withBase(`demo/${data.scenario}/${data.sheet}`));
    const variant = this.getAttribute("variant");
    const swap = variant ? entry.variants?.[variant]?.swap : null;
    if (swap && Object.keys(swap).length) sheet = recolor(sheet, swap);
    const scale = Number(this.getAttribute("scale") ?? 2);
    const anim = this.getAttribute("anim");
    const headings = this.hasAttribute("all") ? entry.headings ?? [] : [this.getAttribute("heading") ?? entry.headings?.[0] ?? ""];
    const cols = Number(this.getAttribute("cols") ?? headings.length);
    const [w, h] = entry.size;
    const pad = Number(this.getAttribute("pad") ?? 0);
    const canvas = document.createElement("canvas");
    canvas.className = "px";
    canvas.width = cols * (w + pad) * scale;
    canvas.height = Math.ceil(headings.length / cols) * (h + pad) * scale;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", this.getAttribute("label") ?? (entry.description ?? "").replace(/\s+/g, " "));
    this.replaceChildren(canvas);
    const sprites = headings.map((hd) => new Sprite(entry, sheet, hd, anim));
    const ctx = canvas.getContext("2d")!;
    const playing = !!anim && !reducedMotion();
    const draw = (now: number) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sprites.forEach((s, i) => {
        const x = (i % cols) * (w + pad) + pad / 2 + entry.pivot[0];
        const y = Math.floor(i / cols) * (h + pad) + pad / 2 + entry.pivot[1];
        s.draw(ctx, x * scale, y * scale, scale, now, playing);
      });
    };
    draw(performance.now());
    if (this.hasAttribute("turn")) {
      this.tabIndex = 0;
      makeTurnable(this, () => sprites[0], () => draw(performance.now()), 14);
    }
    if (playing)
      whenVisible(
        this,
        () => (this.stop ??= onTick(draw)),
        () => {
          this.stop?.();
          this.stop = null;
        },
      );
  }

  disconnectedCallback(): void {
    this.stop?.();
  }
}

if (!customElements.get("pagan-sprite")) customElements.define("pagan-sprite", PaganSprite);
