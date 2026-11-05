// Sanity checks on the built site (run after `npm run build`): every page is in the sitemap, and robots.txt
// points to it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = "dist";
const fail = (msg) => { console.error(`check-dist: ${msg}`); process.exitCode = 1; };

const pages = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === "index.html") pages.push("/" + relative(dist, dir).split("\\").join("/"));
  }
};
walk(dist);

const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
for (const p of pages) {
  const want = p.endsWith("/") ? p : p + "/";
  if (!locs.includes(want)) fail(`${want} missing from sitemap.xml`);
}

const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!/^Sitemap: https:\/\/\S+\/sitemap\.xml$/m.test(robots)) fail("robots.txt has no Sitemap line");

if (!process.exitCode) console.log(`check-dist: ${pages.length} pages, all in sitemap.xml`);
