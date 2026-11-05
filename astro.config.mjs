// @ts-check
import { defineConfig } from "astro/config";

// SITE_URL / SITE_BASE come from the deploy workflow (custom domain pagan.top, so the base is "/").
export default defineConfig({
  site: process.env.SITE_URL || "https://pagan.top",
  base: process.env.SITE_BASE || "/",
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
