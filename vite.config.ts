import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { buildManifest, DEV_SITE_URL, PROD_SITE_URL } from "./manifest.config.ts";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/** Serves manifest.json in dev and writes it into dist/ on build. */
function owlbearManifest(siteUrl: string): Plugin {
  const json = () => JSON.stringify(buildManifest(siteUrl, pkg.version), null, 2);
  return {
    name: "owlbear-manifest",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/manifest.json") return next();
        res.setHeader("Content-Type", "application/json");
        res.end(json());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.json", source: json() });
    },
  };
}

export default defineConfig(({ command }) => {
  const siteUrl = process.env.SITE_URL ?? (command === "build" ? PROD_SITE_URL : DEV_SITE_URL);
  return {
    base: new URL(siteUrl).pathname,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [react(), owlbearManifest(siteUrl)],
    // Owlbear loads the dev site in an iframe, so the dev server must allow its origin.
    server: { port: 5173, strictPort: true, cors: { origin: "https://www.owlbear.rodeo" } },
    test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"] },
  };
});
