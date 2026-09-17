// SERVICE WORKER — ORGANIZADOR FINANCEIRO
// Versão: v0.5
//
// Este service worker existe principalmente para permitir que o
// navegador ofereça "Adicionar à tela inicial" (requisito técnico
// do PWA). Ele NÃO armazena os dados financeiros — esses continuam
// vindo sempre do Google Sheets, nunca de cache local.
//
// Faz apenas cache dos arquivos estáticos da interface (HTML, CSS, JS),
// para o app abrir mais rápido e funcionar minimamente offline
// (mostrando a tela, mesmo que sem conseguir buscar dados novos).

const NOME_CACHE = "organizador-financeiro-v0-5";

const ARQUIVOS_ESTATICOS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

self.addEventListener("install", function (evento) {
  evento.waitUntil(
    caches.open(NOME_CACHE).then(function (cache) {
      return cache.addAll(ARQUIVOS_ESTATICOS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomesCache) {
      return Promise.all(
        nomesCache
          .filter(function (nome) { return nome !== NOME_CACHE; })
          .map(function (nome) { return caches.delete(nome); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (evento) {
  const url = new URL(evento.request.url);

  // Nunca faz cache de chamadas à API (Google Apps Script) —
  // os dados financeiros sempre precisam vir do servidor, ao vivo.
  if (url.hostname.indexOf("script.google.com") !== -1) {
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then(function (respostaCache) {
      return respostaCache || fetch(evento.request);
    })
  );
});
