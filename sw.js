"use strict";
const CACHE_NAME = "prf-adm-pwa-v3";
const BASE_URL = new URL("./", self.location.href);
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./reader.js?v=20260930-answer-disclosure-v1",
  "./app.js",
  "./app.js?v=20260929-questions-stage",
  "./pwa.js",
  "./pwa.js?v=20260929-questions-stage",
  "./manifest.webmanifest",
  "./icons/prf-adm-192.png",
  "./icons/prf-adm-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES.map(function (path) { return new URL(path, BASE_URL).href; }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const names = await caches.keys();
    await Promise.all(names.filter(function (name) {
      return name.startsWith("prf-adm-pwa-") && name !== CACHE_NAME;
    }).map(function (name) { return caches.delete(name); }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;

  event.respondWith((async function () {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone()).catch(function () {});
      }
      return response;
    } catch (_) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const home = await cache.match(new URL("./", BASE_URL).href)
          || await cache.match(new URL("./index.html", BASE_URL).href);
        if (home) return home;
      }
      return Response.error();
    }
  })());
});
