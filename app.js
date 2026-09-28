(function () {
  "use strict";
  const data = window.PRF_DATA;
  if (!data || !Array.isArray(data.modules)) return;

  const byCode = new Map(data.modules.map(function (module) { return [module.code, module]; }));
  const next = byCode.get(data.execution.next);
  if (next) {
    document.getElementById("next-day").textContent = next.cadence.toUpperCase();
    document.getElementById("next-title").textContent = next.subject;
    document.getElementById("next-scope").textContent = next.scope;
    const nextLink = document.getElementById("next-material-link");
    nextLink.href = "#leitura";
    nextLink.removeAttribute("target");
    nextLink.removeAttribute("rel");
    nextLink.textContent = "Ler " + next.code + " no site ";
    nextLink.addEventListener("click", function (event) {
      event.preventDefault();
      if (window.PRF_READER) window.PRF_READER.open(next.code, "material");
    });
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    nextLink.appendChild(arrow);
    document.getElementById("study-complete").textContent = String(data.execution.completed);
    document.getElementById("study-round").textContent = "Volta " + data.execution.round + " · " + (data.execution.lastCompleted || "nenhum bloco concluído");
    document.getElementById("study-progress-bar").style.width = Math.round(data.execution.completed / data.modules.length * 100) + "%";
    document.querySelector(".progress-track").setAttribute("aria-valuenow", String(data.execution.completed));
  }

  const list = document.getElementById("rotation-list");
  list.replaceChildren();
  data.modules.forEach(function (module, index) {
    const item = document.createElement("li");
    item.className = "module-item";
    const details = document.createElement("details");
    details.className = "module-card";
    if (module.code === data.execution.next) {
      details.classList.add("current-study");
      details.open = true;
    }

    const summary = document.createElement("summary");
    const code = document.createElement("span");
    code.className = "module-code";
    code.textContent = module.code;
    const info = document.createElement("span");
    const title = document.createElement("span");
    title.className = "module-title";
    title.textContent = module.subject;
    const meta = document.createElement("span");
    meta.className = "module-meta";
    const cadence = document.createElement("span");
    cadence.textContent = module.cadence;
    meta.appendChild(cadence);

    const editorial = document.createElement("span");
    if (index < data.editorial.completed) {
      editorial.className = "badge-ready";
      editorial.textContent = "material revalidado";
    } else if (module.code === data.editorial.next) {
      editorial.className = "badge-editorial-next";
      editorial.textContent = "próximo editorial";
    } else {
      editorial.textContent = "revalidação editorial pendente";
    }
    meta.appendChild(editorial);

    if (module.code === data.execution.next) {
      const study = document.createElement("span");
      study.className = "badge-study";
      study.textContent = "próximo do estudo";
      meta.appendChild(study);
    }
    info.append(title, meta);
    summary.append(code, info);

    const body = document.createElement("div");
    body.className = "module-details";
    const scope = document.createElement("p");
    scope.textContent = module.scope;
    const target = document.createElement("p");
    target.className = "fine-print";
    target.textContent = module.questionTarget === "proposta discursiva" ? "Questões previstas: proposta discursiva + checklist de estrutura." : "Bateria planejada: " + module.questionTarget + " itens.";
    const actions = document.createElement("div");
    actions.className = "module-actions";
    const readMaterial = document.createElement("button");
    readMaterial.type = "button";
    readMaterial.textContent = "Ler material no site";
    readMaterial.addEventListener("click", function () {
      if (window.PRF_READER) window.PRF_READER.open(module.code, "material");
    });
    actions.appendChild(readMaterial);

    const readQuestions = document.createElement("button");
    readQuestions.type = "button";
    readQuestions.className = "secondary";
    readQuestions.textContent = "Ler questões no site";
    readQuestions.addEventListener("click", function () {
      if (window.PRF_READER) window.PRF_READER.open(module.code, "questions");
    });
    actions.appendChild(readQuestions);

    if (module.notion) {
      const material = document.createElement("a");
      material.href = module.notion;
      material.target = "_blank";
      material.rel = "noreferrer";
      material.textContent = "Abrir material ↗";
      actions.appendChild(material);
    }
    const questions = document.createElement("a");
    questions.href = data.links.questions;
    questions.target = "_blank";
    questions.rel = "noreferrer";
    questions.className = "secondary";
    questions.textContent = "Ver meta de questões ↗";
    actions.appendChild(questions);
    body.append(scope, target, actions);
    details.append(summary, body);
    item.appendChild(details);
    list.appendChild(item);
  });

  const sourceList = document.getElementById("source-list");
  sourceList.replaceChildren();
  data.sources.forEach(function (source) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source.label + " ↗";
    sourceList.appendChild(link);
  });

  if (window.PRF_READER) window.PRF_READER.start(data);
})();
