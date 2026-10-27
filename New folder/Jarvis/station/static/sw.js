/* Caches the app shell so it opens instantly. Live data (/api) always comes from the PC. */
const CACHE = "jarvis-station-v12";
const SHELL = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Notifications from Jarvis (arrive even when the app is closed)
self.addEventListener("push", (e) => {
  let msg = { title: "Jarvis", body: "", url: "/", tag: "jarvis" };
  try { msg = { ...msg, ...e.data.json() }; } catch { if (e.data) msg.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body, tag: msg.tag, renotify: true, icon: "/icon-192.png", badge: "/icon-192.png",
    vibrate: [80, 40, 80], data: { url: msg.url },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Android Share menu → Jarvis: park what was shared, then open the app to send it to the PC
  if (e.request.method === "POST" && url.pathname === "/share") {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll("files").filter((f) => f && f.size !== undefined);
      await caches.delete("share-inbox");
      const inbox = await caches.open("share-inbox");
      await inbox.put("/share-inbox/meta", new Response(JSON.stringify({
        title: form.get("title") || "", text: form.get("text") || "", url: form.get("url") || "", files: files.length,
      })));
      await Promise.all(files.map((f, i) => inbox.put(`/share-inbox/file/${i}`, new Response(f, {
        headers: { "Content-Type": f.type || "application/octet-stream", "X-Name": encodeURIComponent(f.name || `shared-${i}`) },
      }))));
      return Response.redirect("/?share=1", 303);
    })());
    return;
  }
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // Network first (so updates land), cache as fallback
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});
