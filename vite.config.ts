import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import path from "path";

// GitHub Pages serves project sites from /<repo>/, but a custom domain (a
// public/CNAME file) is served from /. Detect that automatically so no manual
// configuration is needed. BASE_PATH remains an explicit override.
const hasCustomDomain = existsSync(new URL("./public/CNAME", import.meta.url));
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.BASE_PATH || (hasCustomDomain ? "/" : repo ? `/${repo}/` : "/");

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
