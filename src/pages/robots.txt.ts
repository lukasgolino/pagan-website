// /robots.txt, generated from `site` + base so the Sitemap line always matches the sitemap's own URLs.
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap.xml", new URL(import.meta.env.BASE_URL, site)).href;
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`, { headers: { "Content-Type": "text/plain" } });
};
