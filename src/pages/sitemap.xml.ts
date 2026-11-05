// /sitemap.xml: every page of the site, so search engines find the topic pages (nothing on the site links them).
import type { APIRoute } from "astro";

const pages = Object.keys(import.meta.glob("./**/index.astro"))
  .map((p) => p.replace(/^\.\//, "").replace(/index\.astro$/, ""))
  .sort();

export const GET: APIRoute = ({ site }) => {
  const base = new URL(import.meta.env.BASE_URL, site);
  const urls = pages.map((p) => `  <url><loc>${new URL(p, base).href}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml" },
  });
};
