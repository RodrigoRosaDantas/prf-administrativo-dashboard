(function () {
  "use strict";
  function setupViews() {
    const panels = Array.from(document.querySelectorAll("[data-view-panel]"));
    const links = Array.from(document.querySelectorAll("[data-view-link]"));
    if (!panels.length) return;

    function show(name, options) {
      const panel = panels.find(function (candidate) { return candidate.dataset.viewPanel === name; });
      if (!panel) return false;
      const settings = options || {};
      panels.forEach(function (candidate) { candidate.hidden = candidate !== panel; });
      links.forEach(function (link) {
        if (link.dataset.viewLink === name) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      document.body.dataset.currentView = name;
      if (settings.updateHash && window.location.hash !== "#" + name) {
        window.history.pushState({ view: name }, "", "#" + name);
      }
      if (settings.scroll) window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }

    links.forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        show(link.dataset.viewLink, { updateHash: true, scroll: true });
      });
    });
    window.addEventListener("popstate", function () {
      show(window.location.hash.slice(1) || "inicio", { scroll: true });
    });
    show(window.location.hash.slice(1) || "inicio");
    window.PRF_VIEWS = { show: function (name) { show(name, { updateHash: true, scroll: true }); } };
  }

  setupViews();

  const data = window.PRF_DATA;
  if (!data || !Array.isArray(data.modules)) return;

  const byCode = new Map(data.modules.map(function (module) { return [module.code, module]; }));
  const studySummary = document.getElementById("snapshot-study-summary");
  const studyNext = document.getElementById("snapshot-study-next");
  const materialSummary = document.getElementById("snapshot-materials-summary");
  const materialNext = document.getElementById("snapshot-materials-next");
  const questionSummary = document.getElementById("snapshot-questions-summary");
  const questionNext = document.getElementById("snapshot-questions-next");
  const projectStateStatus = document.getElementById("project-state-status");
  const editorialCopy = document.getElementById("editorial-state-copy");
  const nextButton = document.getElementById("next-material-link");
  const recordLink = document.getElementById("next-execution-link");
  let executionState = Object.assign({}, data.execution);
  let editorialState = Object.assign({}, data.editorial);

  function refreshModuleIndicators() {
    document.querySelectorAll("[data-module-code]").forEach(function (details) {
      const code = details.dataset.moduleCode;
      const index = data.modules.findIndex(function (module) { return module.code === code; });
      const editorialBadge = details.querySelector("[data-editorial-badge]");
      const studyBadge = details.querySelector("[data-study-badge]");
      const isCurrentStudy = code === executionState.next;
      details.classList.toggle("current-study", isCurrentStudy);
      if (isCurrentStudy) details.open = true;

      if (studyBadge) studyBadge.hidden = !isCurrentStudy;
      if (!editorialBadge || index < 0) return;
      editorialBadge.className = "";
      if (index < editorialState.completed) {
        editorialBadge.className = "badge-ready";
        editorialBadge.textContent = "material revalidado";
      } else if (editorialState.stage === "MATERIALS" && code === editorialState.next) {
        editorialBadge.className = "badge-editorial-next";
        editorialBadge.textContent = "próximo editorial";
      } else if (editorialState.stage === "QUESTIONS" && code === editorialState.next) {
        editorialBadge.className = "badge-editorial-next";
        editorialBadge.textContent = "próximas questões";
      } else if (editorialState.completed >= editorialState.total) {
        editorialBadge.textContent = "material revalidado";
      } else {
        editorialBadge.textContent = "revalidação editorial pendente";
      }
    });
  }

  function renderExecution(state) {
    const next = byCode.get(state.next);
    const total = Number(state.total || data.modules.length);
    const completed = Number(state.completed);
    const round = Number(state.round);
    if (!next || !Number.isInteger(completed) || completed < 0 || completed > total || total !== data.modules.length || !Number.isInteger(round) || round < 1) return false;
    executionState = {
      round: round,
      completed: completed,
      total: total,
      next: next.code,
      lastCompleted: byCode.has(state.lastCompleted) ? state.lastCompleted : null
    };

    const nextDay = document.getElementById("next-day");
    const nextCode = document.querySelector(".next-code");
    const nextTitle = document.getElementById("next-title");
    const nextScope = document.getElementById("next-scope");
    const studyComplete = document.getElementById("study-complete");
    const studyRound = document.getElementById("study-round");
    const progressBar = document.getElementById("study-progress-bar");
    const progressTrack = document.querySelector(".progress-track");
    if (nextDay) nextDay.textContent = next.cadence.toUpperCase();
    if (nextCode) nextCode.textContent = next.code.replace("PRFADM", "");
    if (nextTitle) nextTitle.textContent = next.subject;
    if (nextScope) nextScope.textContent = next.scope;
    if (studyComplete) studyComplete.textContent = String(completed);
    if (studyRound) studyRound.textContent = "Volta " + round + " · " + (executionState.lastCompleted || "nenhum bloco concluído");
    if (progressBar) progressBar.style.width = Math.round(completed / total * 100) + "%";
    if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(completed));
    if (studySummary) studySummary.textContent = "Volta " + round + " · " + completed + "/" + total;
    if (studyNext) studyNext.textContent = "Próximo: " + next.code;
    if (nextButton) {
      nextButton.href = "#leitura";
      nextButton.removeAttribute("target");
      nextButton.removeAttribute("rel");
      nextButton.replaceChildren(document.createTextNode("Estudar agora · " + next.code + " "));
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      nextButton.appendChild(arrow);
    }
    if (recordLink) recordLink.href = data.links.execution;
    const readerSelect = document.getElementById("reader-module");
    if (readerSelect && Array.from(readerSelect.options).some(function (option) { return option.value === next.code; })) {
      readerSelect.value = next.code;
    }
    refreshModuleIndicators();
    renderEditorialCopy();
    return true;
  }

  function renderEditorialCopy() {
    if (!editorialCopy) return;
    const study = "O estudo real está em Volta " + executionState.round + " · " + executionState.completed + "/" + data.modules.length + ", com próximo código " + executionState.next + ".";
    if (editorialState.stage === "MATERIALS") {
      editorialCopy.textContent = editorialState.completed + " materiais passaram pelo gate " + editorialState.gate + ". " + study + " As questões começam depois dos 33 materiais.";
    } else if (editorialState.stage === "COMPLETE") {
      editorialCopy.textContent = "Produção editorial concluída: " + editorialState.completed + "/" + editorialState.total + " materiais e " + editorialState.questionsCompleted + "/" + editorialState.questionsTotal + " blocos de questões prontos. " + study;
    } else {
      const nextStep = editorialState.next ? " Próxima etapa editorial: " + editorialState.next + "." : " A esteira editorial está concluída.";
      editorialCopy.textContent = "Materiais: " + editorialState.completed + "/" + editorialState.total + "; questões: " + editorialState.questionsCompleted + "/" + editorialState.questionsTotal + "." + nextStep + " " + study;
    }
  }

  function renderEditorial(state) {
    const stage = String(state.stage || "MATERIALS").toUpperCase();
    const completed = Number(state.materialsCompleted ?? state.completed);
    const total = Number(state.materialsTotal ?? state.total ?? data.modules.length);
    const questionsCompleted = Number(state.questionsCompleted || 0);
    const questionsTotal = Number(state.questionsTotal ?? state.total ?? data.modules.length);
    const next = state.next || null;
    const gate = state.gate || data.editorial.gate;
    if (!["MATERIALS", "QUESTIONS", "COMPLETE"].includes(stage) || !Number.isInteger(completed) || completed < 0 || completed > data.modules.length || total !== data.modules.length || !Number.isInteger(questionsCompleted) || questionsCompleted < 0 || questionsCompleted > questionsTotal || questionsTotal !== data.modules.length || (next && !byCode.has(next))) return false;

    editorialState = {
      stage: stage,
      completed: completed,
      total: total,
      questionsCompleted: questionsCompleted,
      questionsTotal: questionsTotal,
      next: next,
      gate: gate,
      status: state.editorialStatus || state.status || "READY"
    };
    if (materialSummary) materialSummary.textContent = completed + "/" + total + (stage === "COMPLETE" ? " materiais concluídos" : " materiais revalidados");
    if (materialNext) {
      if (stage === "MATERIALS") materialNext.textContent = "Próximo editorial: " + (next || "nenhum") + " · gate " + gate;
      else if (stage === "QUESTIONS") materialNext.textContent = "Próximas questões: " + (next || "nenhuma") + " · gate " + gate;
      else materialNext.textContent = "Esteira concluída · gate " + gate;
    }
    if (questionSummary) {
      const progress = questionsCompleted + "/" + questionsTotal;
      questionSummary.textContent = stage === "MATERIALS" && questionsCompleted === 0
        ? progress + " · ainda não iniciada"
        : progress + (stage === "COMPLETE" ? " concluídas" : " concluídas · " + (stage === "QUESTIONS" ? "em andamento" : "aguardando materiais"));
    }
    if (questionNext) {
      if (stage === "MATERIALS") questionNext.textContent = "Começa depois dos materiais 33/33";
      else if (stage === "QUESTIONS") questionNext.textContent = "Próximo bloco: " + (next || "nenhum");
      else questionNext.textContent = "Trilha de questões concluída";
    }
    refreshModuleIndicators();
    renderEditorialCopy();
    return true;
  }

  function formatStateDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
  }

  function updateState(projectState) {
    if (!projectStateStatus) return;
    const updated = [];
    const unavailable = [];
    if (projectState && projectState.execution && projectState.execution.status === "available") {
      if (renderExecution(projectState.execution)) updated.push("estudo");
      else unavailable.push("estudo");
    } else unavailable.push("estudo");
    if (projectState && projectState.editorial && projectState.editorial.status === "available") {
      if (renderEditorial(projectState.editorial)) updated.push("esteira editorial");
      else unavailable.push("esteira editorial");
    } else unavailable.push("esteira editorial");

    const syncedAt = formatStateDate(projectState && projectState.syncedAt);
    if (!updated.length) {
      projectStateStatus.dataset.state = "warning";
      projectStateStatus.textContent = "Estado do Notion indisponível nesta sincronização; exibindo os últimos valores salvos no site.";
      return;
    }
    projectStateStatus.dataset.state = unavailable.length ? "warning" : "ok";
    projectStateStatus.textContent = "Notion: " + updated.join(" e ") + " atualizado" + (updated.length > 1 ? "s" : "") + (syncedAt ? " em " + syncedAt : "") + (unavailable.length ? ". " + unavailable.join(" e ") + " indisponível; valor salvo mantido." : ".");
  }

  if (nextButton) {
    nextButton.addEventListener("click", function (event) {
      if (!executionState.next || !window.PRF_READER) return;
      event.preventDefault();
      window.PRF_READER.open(executionState.next, "material");
    });
  }
  if (recordLink) recordLink.href = data.links.execution;
  if (projectStateStatus) projectStateStatus.dataset.state = "pending";
  updateState(null);
  renderExecution(data.execution);
  renderEditorial(data.editorial);
  window.PRF_DASHBOARD = { updateState: updateState };

  const list = document.getElementById("rotation-list");
  list.replaceChildren();
  data.modules.forEach(function (module, index) {
    const item = document.createElement("li");
    item.className = "module-item";
    const details = document.createElement("details");
    details.className = "module-card";
    details.dataset.moduleCode = module.code;

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
    editorial.dataset.editorialBadge = "";
    meta.appendChild(editorial);

    const study = document.createElement("span");
    study.className = "badge-study";
    study.dataset.studyBadge = "";
    study.textContent = "próximo do estudo";
    study.hidden = true;
    meta.appendChild(study);
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
  refreshModuleIndicators();

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
