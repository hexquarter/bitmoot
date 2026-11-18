import { writeFileSync } from "node:fs";

/**
 * GitHub Pages serves this file for unknown paths. It preserves the requested
 * deep link in sessionStorage and sends the browser to the app root, where
 * src/main.tsx restores the original URL before React Router mounts.
 */
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.BASE_PATH ?? (repo ? `/${repo}/` : "/");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BitMoot</title>
    <script>
      try {
        sessionStorage.setItem(
          "bitmoot:redirect",
          location.pathname + location.search + location.hash,
        );
      } catch (error) {}
      location.replace(${JSON.stringify(base)});
    </script>
  </head>
  <body>
    <noscript><a href="${base}">Open BitMoot</a></noscript>
  </body>
</html>
`;

writeFileSync(new URL("../dist/404.html", import.meta.url), html);
console.log(`Generated dist/404.html with base ${base}`);
