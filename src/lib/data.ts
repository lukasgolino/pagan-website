// Build-time access to the demo data written by tools/build_site_assets.py.
import { readFileSync } from "node:fs";

// astro build/dev run from the site root; module URLs move when the build bundles this file
const root = process.cwd().replace(/\/?$/, "/");

export function readJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(root + path, "utf-8")) as T;
}

export function readText(path: string): string {
  return readFileSync(root + path, "utf-8");
}

export const step = (scenario: string, id: string) => readJson(`public/demo/${scenario}/${id}.json`);
export const scenarios = () => readJson<{ id: string; title: string; pitch: string }[]>("public/demo/scenarios.json");
export const asset = (url: string) => import.meta.env.BASE_URL.replace(/\/?$/, "/") + url.replace(/^\//, "");
