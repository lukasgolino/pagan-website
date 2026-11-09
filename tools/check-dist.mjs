// Sanity checks on the built site (run after `npm run build`, with the same SITE_URL / SITE_BASE): the sitemap
// lists exactly the built pages, robots.txt points to the sitemap,
// and every page loads the analytics beacon.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = "dist";
const base = new URL((process.env.SITE_BASE || "/").replace(/\/?$/, "/"), process.env.SITE_URL || "https://pagan.top");
const fail = (msg) => { console.error(`check-dist: ${msg}`); process.exitCode = 1; };

const built = new Set();
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === "index.html") {
      const rel = relative(dist, dir).split("\\").join("/");
      built.add(new URL(rel ? rel + "/" : "", base).href);
    }
  }
};
walk(dist);
built.delete(new URL("404/", base).href);

const listed = new Set([...readFileSync(join(dist, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
for (const u of built) if (!listed.has(u)) fail(`${u} is built but missing from sitemap.xml`);
for (const u of listed) if (!built.has(u)) fail(`${u} is in sitemap.xml but no page was built for it`);

const want = `Sitemap: ${new URL("sitemap.xml", base).href}`;
if (!readFileSync(join(dist, "robots.txt"), "utf8").split("\n").includes(want)) fail(`robots.txt lacks "${want}"`);

// Every page carries the analytics beacon (a page built outside Base.astro would silently go uncounted).
const beacon = /static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*data-cf-beacon="[^"]*75c1d9f249eb4579bcd782b10cf7a8f0/;
const umami = /cloud\.umami\.is\/script\.js"[^>]*data-website-id="6c3ba9da-9af9-49a9-a575-90c9cace445c"/;
for (const u of built) {
  const file = join(dist, new URL(u).pathname.slice(base.pathname.length), "index.html");
  const html = readFileSync(file, "utf8");
  if (!html.match(beacon)) fail(`${u} has no analytics beacon`);
  if (!html.match(umami)) fail(`${u} has no Umami tag`);
}

if (!process.exitCode) console.log(`check-dist: ${built.size} pages, sitemap.xml and robots.txt match`);
