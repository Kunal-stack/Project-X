import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(projectRoot, "dist");

const staticFiles = ["index.html", "styles.css", "app.js"];
const optionalStaticFiles = ["favicon.ico", "robots.txt"];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const file of staticFiles) {
  copyFileSync(resolve(projectRoot, file), resolve(distDir, file));
}

for (const file of optionalStaticFiles) {
  const sourcePath = resolve(projectRoot, file);

  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, resolve(distDir, file));
  }
}

writeFileSync(
  resolve(distDir, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`
);

console.log("Built Cloudflare Pages static assets into dist/.");
