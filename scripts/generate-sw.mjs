import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const DIST = "dist";
const BASE = "/tracker-risparmi/";
const CACHE = "tracker-risparmi-static-v1";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const files = (await walk(DIST))
  .filter((f) => !f.endsWith(`${sep}sw.js`))
  .map((f) => BASE + relative(DIST, f).split(sep).join("/"));

if (!files.includes(BASE + "index.html")) files.unshift(BASE + "index.html");
if (!files.includes(BASE)) files.unshift(BASE);

const source = `const CACHE_NAME = ${JSON.stringify(CACHE)};
const APP_SHELL = ${JSON.stringify(files, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(BASE).then((r) => r || caches.match(BASE + "index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
`;

await writeFile(join(DIST, "sw.js"), source, "utf8");
console.log(`Generated sw.js with ${files.length} cached files`);
