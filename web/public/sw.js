// Aboard service worker: offline app shell and push notifications.
const SHELL = "aboard-shell-v4";
const ASSETS = "aboard-assets-v4";

/** Cache the page and the scripts and styles it loads, so the offline shell is whole at once. */
async function cacheShell(res) {
  const html = await res.clone().text();
  await (await caches.open(SHELL)).put("/", res);
  const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const assets = await caches.open(ASSETS);
  const add = async (f) => (await assets.match(f)) || assets.add(f).catch(() => {});
  await Promise.all(files.map(add));
  // And the chunks the app loads later (the 3D world), so the globe works offline too.
  for (const js of files.filter((f) => f.endsWith(".js"))) {
    const code = await (await assets.match(js))?.text();
    const lazy = [...(code ?? "").matchAll(/import\([`"']\.\/([\w-]+\.js)[`"']\)/g)].map((m) => `/assets/${m[1]}`);
    await Promise.all(lazy.map(add));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch("/")
      .then((res) => (res.ok ? cacheShell(res) : undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;

  // Pages: network first, so deploys show up straight away; the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep the cached shell current (and finish writing it, even if the page moves on).
          if (res.ok) event.waitUntil(cacheShell(res.clone()));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Built assets have content hashes in their names, so a cached copy never goes stale.
  // (Earth textures are big and never change, so they're cached too.)
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/textures/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(ASSETS).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let msg = { title: "Aboard", body: "" };
  try {
    msg = event.data ? event.data.json() : msg;
  } catch {
    msg.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      renotify: !!msg.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: msg.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(target).then((w) => (w || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
