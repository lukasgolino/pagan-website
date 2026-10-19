// <pagan-mesh src="demo/features/zombie.glb" ramp="demo/features/zombie.ramp.png" anim="walk" ambient="0.2" wrap="0.3">
// Draws a PAGAN .glb in the browser, as a 3D game would: the real file, its part nodes and its animation.
// Shading follows the same rule as PAGAN's Godot ramp shader: the sun's brightness (wrap lighting + ambient)
// picks a column of the ramp texture, so every pixel is a palette colour. No shadows here (the engine adds
// those). Rendered small and scaled up with whole pixels, like a low-res 3D game. Drag to turn and tilt it.

import { onTick, reducedMotion, whenVisible, withBase } from "./sprites";

type Doc = any;
type Mat = Float32Array; // 4x4, column-major
type Quat = [number, number, number, number];
type Vec3 = [number, number, number];

const VERTEX = `#version 300 es
in vec3 position; in vec3 normal; in vec2 uv;
uniform mat4 viewProjection; uniform mat4 model;
out vec3 vNormal; out vec2 vUv;
void main() {
  vNormal = mat3(model) * normal;
  vUv = uv;
  gl_Position = viewProjection * model * vec4(position, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vNormal; in vec2 vUv;
uniform sampler2D ramp; uniform vec3 sun; uniform float ambient; uniform float wrap; uniform bool twoSided;
out vec4 color;
void main() {
  float facing = dot(normalize(vNormal), sun);
  if (twoSided) facing = abs(facing);
  facing = max(0.0, (facing + wrap) / (1.0 + wrap));
  color = vec4(texture(ramp, vec2(clamp(ambient + (1.0 - ambient) * facing, 0.0, 0.9999), vUv.y)).rgb, 1.0);
}`;

function multiply(a: Mat, b: Mat): Mat {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  return out;
}

function compose(t: Vec3, q: Quat, s: Vec3): Mat {
  const [x, y, z, w] = q;
  const m = new Float32Array([
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
  return m;
}

function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d = Math.abs(d);
  if (d > 0.9995) return a.map((v, i) => v + (s * b[i] - v) * t) as Quat;
  const angle = Math.acos(d);
  const wa = Math.sin((1 - t) * angle) / Math.sin(angle);
  const wb = (s * Math.sin(t * angle)) / Math.sin(angle);
  return a.map((v, i) => v * wa + b[i] * wb) as Quat;
}

/** Orthographic camera looking at `target` from yaw/pitch (degrees), fitting a sphere of `radius`. */
function camera(target: Vec3, radius: number, yaw: number, pitch: number): Mat {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const back: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const upWorld: Vec3 = Math.abs(pitch) > 89 ? [0, 0, -1] : [0, 1, 0];
  const right = normalize(cross(upWorld, back));
  const up = cross(back, right);
  const eye = target.map((v, i) => v + back[i] * radius * 3) as Vec3;
  const view = new Float32Array([
    right[0], up[0], back[0], 0,
    right[1], up[1], back[1], 0,
    right[2], up[2], back[2], 0,
    -dot(right, eye), -dot(up, eye), -dot(back, eye), 1,
  ]);
  const s = 1 / (radius * 1.1);
  const near = radius, far = radius * 5;
  const projection = new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]);
  return multiply(projection, view);
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

async function loadGlb(url: string): Promise<{ doc: Doc; bin: ArrayBuffer }> {
  const buffer = await (await fetch(url)).arrayBuffer();
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binStart = 20 + jsonLength + 8;
  return { doc, bin: buffer.slice(binStart, binStart + view.getUint32(20 + jsonLength, true)) };
}

function accessor(doc: Doc, bin: ArrayBuffer, index: number): Float32Array | Uint16Array | Uint32Array | Uint8Array {
  const a = doc.accessors[index];
  const v = doc.bufferViews[a.bufferView];
  const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type] * a.count;
  const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const kind = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType as 5126];
  return new kind(bin, offset, n);
}

interface Part {
  node: number;
  draws: { vao: WebGLVertexArrayObject; count: number; type: number; twoSided: boolean }[];
}

class PaganMesh extends HTMLElement {
  private stop: (() => void) | null = null;

  async connectedCallback(): Promise<void> {
    const canvas = document.createElement("canvas");
    const size = Number(this.getAttribute("size") ?? 160);
    canvas.width = canvas.height = size;
    canvas.className = "px";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", this.getAttribute("label") ?? "A PAGAN mesh, drawn in your browser");
    this.replaceChildren(canvas);
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      this.textContent = "This browser has no WebGL 2, so the mesh can't be drawn here.";
      return;
    }
    const [{ doc, bin }, rampImage] = await Promise.all([
      loadGlb(withBase(this.getAttribute("src")!)),
      new Promise<HTMLImageElement>((ok, fail) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = fail;
        img.src = withBase(this.getAttribute("ramp")!);
      }),
    ]);

    const program = gl.createProgram()!;
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    gl.useProgram(program);
    const where = (name: string) => gl.getUniformLocation(program, name);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rampImage);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);

    // Every node with a mesh becomes vertex arrays; the bounds frame the camera.
    const parts: Part[] = [];
    let low: Vec3 = [Infinity, Infinity, Infinity];
    let high: Vec3 = [-Infinity, -Infinity, -Infinity];
    doc.nodes.forEach((node: any, index: number) => {
      if (node.mesh === undefined) return;
      const part: Part = { node: index, draws: [] };
      for (const prim of doc.meshes[node.mesh].primitives) {
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        for (const [name, size] of [["POSITION", 3], ["NORMAL", 3], ["TEXCOORD_0", 2]] as const) {
          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, accessor(doc, bin, prim.attributes[name]), gl.STATIC_DRAW);
          const location = gl.getAttribLocation(program, { POSITION: "position", NORMAL: "normal", TEXCOORD_0: "uv" }[name]);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        }
        const indices = accessor(doc, bin, prim.indices);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        const type = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        const twoSided = !!doc.materials?.[prim.material]?.extras?.pagan_two_sided;
        part.draws.push({ vao, count: indices.length, type, twoSided });
      }
      parts.push(part);
    });
    gl.bindVertexArray(null);

    // Rest pose: each node's translation/rotation/scale and visibility (KHR_node_visibility).
    const rest = doc.nodes.map((n: any) => ({
      t: (n.translation ?? [0, 0, 0]) as Vec3,
      r: (n.rotation ?? [0, 0, 0, 1]) as Quat,
      s: (n.scale ?? [1, 1, 1]) as Vec3,
      visible: n.extensions?.KHR_node_visibility?.visible ?? true,
    }));
    const parents = new Map<number, number>();
    doc.nodes.forEach((n: any, i: number) => (n.children ?? []).forEach((c: number) => parents.set(c, i)));
    const wanted = this.getAttribute("anim");
    const animation = doc.animations?.find((a: any) => (a.extras?.pagan_name ?? a.name) === wanted);
    const channels = (animation?.channels ?? []).map((c: any) => {
      const sampler = animation.samplers[c.sampler];
      const pointer: string | undefined = c.target.extensions?.KHR_animation_pointer?.pointer;
      return {
        node: pointer ? Number(pointer.split("/")[2]) : c.target.node,
        path: pointer ? "visible" : c.target.path,
        times: accessor(doc, bin, sampler.input),
        values: accessor(doc, bin, sampler.output),
        linear: sampler.interpolation === "LINEAR",
      };
    });
    const duration = Math.max(0, ...channels.map((c: any) => c.times[c.times.length - 1]));

    const pose = (time: number) => {
      const state = rest.map((r: any) => ({ ...r }));
      for (const c of channels) {
        const width = c.path === "rotation" ? 4 : c.path === "visible" ? 1 : 3;
        let k = 0;
        while (k + 1 < c.times.length && c.times[k + 1] <= time) k++;
        const at = (i: number): number[] => Array.from(c.values.slice(i * width, i * width + width) as ArrayLike<number>);
        let value: number[] = at(k);
        if (c.linear && k + 1 < c.times.length) {
          const t = (time - c.times[k]) / (c.times[k + 1] - c.times[k]);
          value = c.path === "rotation" ? slerp(value as Quat, at(k + 1) as Quat, t) : value.map((v: number, i: number) => v + (at(k + 1)[i] - v) * t);
        }
        if (c.path === "visible") state[c.node].visible = value[0] > 0;
        else if (c.path === "translation") state[c.node].t = value as Vec3;
        else if (c.path === "rotation") state[c.node].r = value as Quat;
      }
      const world = new Map<number, Mat>();
      const shown = (i: number): boolean => state[i].visible && (!parents.has(i) || shown(parents.get(i)!));
      const matrix = (i: number): Mat => {
        if (!world.has(i)) {
          const local = compose(state[i].t, state[i].r, state[i].s);
          world.set(i, parents.has(i) ? multiply(matrix(parents.get(i)!), local) : local);
        }
        return world.get(i)!;
      };
      return { shown, matrix };
    };

    // Bounds of the rest pose in model space (each primitive's local bounds moved by its node).
    const restPose = pose(0);
    for (const part of parts) {
      const m = restPose.matrix(part.node);
      for (const prim of doc.meshes[doc.nodes[part.node].mesh].primitives) {
        const { min, max } = doc.accessors[prim.attributes.POSITION];
        for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
          const p: Vec3 = [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]) as Vec3;
          low = low.map((v, i) => Math.min(v, p[i])) as Vec3;
          high = high.map((v, i) => Math.max(v, p[i])) as Vec3;
        }
      }
    }
    const centre: Vec3 = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
    const radius = Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]) / 2;
    let yaw = 35;
    let pitch = Number(this.getAttribute("pitch") ?? 20);
    const still = reducedMotion();
    const started = performance.now();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.uniform1f(where("ambient"), Number(this.getAttribute("ambient") ?? 0.2));
    gl.uniform1f(where("wrap"), Number(this.getAttribute("wrap") ?? 0.3));
    gl.uniform1i(where("ramp"), 0);

    const draw = (now: number) => {
      const seconds = (now - started) / 1000;
      const sunYaw = still ? 0.8 : 0.8 + seconds * 0.35;  // the sun circles the model
      const sunUp = 0.75;
      gl.uniform3fv(where("sun"), normalize([Math.cos(sunYaw), sunUp, Math.sin(sunYaw)]));
      gl.uniformMatrix4fv(where("viewProjection"), false, camera(centre, radius, yaw, pitch));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const { shown, matrix } = pose(duration > 0 && !still ? seconds % duration : 0);
      for (const part of parts) {
        if (!shown(part.node)) continue;
        gl.uniformMatrix4fv(where("model"), false, matrix(part.node));
        for (const d of part.draws) {
          gl.uniform1i(where("twoSided"), d.twoSided ? 1 : 0);
          gl.bindVertexArray(d.vao);
          gl.drawElements(gl.TRIANGLES, d.count, d.type, 0);
        }
      }
    };
    draw(performance.now());

    // Drag to turn (left/right) and tilt (up/down, including from below).
    let dragging: { x: number; y: number } | null = null;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      dragging = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      yaw -= (e.clientX - dragging.x) * 0.6;
      pitch = Math.max(-80, Math.min(89.9, pitch + (e.clientY - dragging.y) * 0.4));
      dragging = { x: e.clientX, y: e.clientY };
      if (still) draw(performance.now());
    });
    canvas.addEventListener("pointerup", () => (dragging = null));
    if (!still) whenVisible(this, () => (this.stop ??= onTick(draw)), () => (this.stop?.(), (this.stop = null)));
  }

  disconnectedCallback(): void {
    this.stop?.();
    this.stop = null;
  }
}

customElements.define("pagan-mesh", PaganMesh);
