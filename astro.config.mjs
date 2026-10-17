// @ts-check
import { defineConfig } from "astro/config";

// SITE_URL / SITE_BASE come from the deploy workflow (GitHub Pages project sites live under /<repo>/).
export default defineConfig({
  site: process.env.SITE_URL || "https://lukasgolino.github.io",
  base: process.env.SITE_BASE || "/",
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
