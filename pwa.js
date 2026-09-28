(function () {
  "use strict";

  const installButton = document.getElementById("install-app-button");
  const installStatus = document.getElementById("pwa-install-status");
  const installSteps = document.getElementById("install-steps");
  let deferredPrompt = null;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  if (standalone && installStatus) {
    installStatus.textContent = "O PRF ADM já está instalado. O último material carregado pode ser aberto mesmo sem conexão.";
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    if (installButton) installButton.hidden = false;
    if (installStatus) installStatus.textContent = "Instalação direta disponível: toque em Instalar app.";
  });

  if (installButton) {
    installButton.addEventListener("click", async function () {
      if (!deferredPrompt) {
        if (installSteps) installSteps.open = true;
        return;
      }
      installButton.disabled = true;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      installButton.hidden = true;
      installButton.disabled = false;
      if (installStatus) {
        installStatus.textContent = choice.outcome === "accepted"
          ? "Instalação solicitada. O PRF ADM aparecerá na tela inicial do Android."
          : "Instalação não concluída. Você pode tentar pelo menu ⋮ do Chrome.";
      }
    });
  }

  window.addEventListener("appinstalled", function () {
    if (installButton) installButton.hidden = true;
    if (installStatus) installStatus.textContent = "PRF ADM instalado. Você já pode abrir pelo ícone na tela inicial.";
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        if (installStatus) installStatus.textContent = "Instale pelo menu ⋮ do Chrome. O modo offline ficará disponível depois que o cache for configurado.";
      });
    });
  }
})();
