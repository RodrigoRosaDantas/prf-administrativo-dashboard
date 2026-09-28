(function () {
  "use strict";

  const element = function (id) { return document.getElementById(id); };
  const select = element("reader-module");
  const content = element("reader-content");
  const status = element("reader-sync-status");
  const materialTab = element("reader-material-tab");
  const questionsTab = element("reader-questions-tab");
  const notionLink = element("reader-notion-link");
  let project = null;
  let snapshot = null;
  let mode = "material";

  if (!select || !content || !status || !materialTab || !questionsTab || !notionLink) return;

  function safeUrl(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value, window.location.href);
      return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  function appendRichText(parent, richText) {
    (richText || []).forEach(function (part) {
      let node = document.createTextNode(part.text || "");
      const href = safeUrl(part.url);
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        if (!href.startsWith("mailto:")) {
          link.target = "_blank";
          link.rel = "noreferrer";
        }
        link.appendChild(node);
        node = link;
      }
      const annotations = part.annotations || {};
      [["code", "code"], ["bold", "strong"], ["italic", "em"], ["strikethrough", "s"], ["underline", "u"]].forEach(function (pair) {
        if (!annotations[pair[0]]) return;
        const wrapper = document.createElement(pair[1]);
        wrapper.appendChild(node);
        node = wrapper;
      });
      parent.appendChild(node);
    });
  }

  function plainText(parts) {
    return (parts || []).map(function (part) { return part.text || ""; }).join("");
  }

  function addChildren(block, parent) {
    if (Array.isArray(block.children) && block.children.length) renderBlocks(block.children, parent);
  }

  function renderList(blocks, start, parent) {
    const firstType = blocks[start].type;
    const list = document.createElement(firstType === "numbered_list_item" ? "ol" : "ul");
    let index = start;
    while (index < blocks.length && blocks[index].type === firstType) {
      const item = document.createElement("li");
      appendRichText(item, blocks[index].rich_text);
      addChildren(blocks[index], item);
      list.appendChild(item);
      index += 1;
    }
    parent.appendChild(list);
    return index;
  }

  function renderTable(block, parent) {
    const table = document.createElement("table");
    (block.children || []).forEach(function (row, rowIndex) {
      const tr = document.createElement("tr");
      (row.cells || []).forEach(function (cell) {
        const cellElement = document.createElement(rowIndex === 0 && block.has_column_header ? "th" : "td");
        appendRichText(cellElement, cell);
        tr.appendChild(cellElement);
      });
      table.appendChild(tr);
    });
    parent.appendChild(table);
  }

  function renderBlock(block, parent) {
    const type = block.type;
    let node;
    if (type === "paragraph") node = document.createElement("p");
    else if (type === "heading_1") node = document.createElement("h2");
    else if (type === "heading_2") node = document.createElement("h3");
    else if (type === "heading_3") node = document.createElement("h4");
    else if (type === "heading_4") node = document.createElement("h5");
    else if (type === "quote") node = document.createElement("blockquote");
    else if (type === "callout") {
      node = document.createElement("aside");
      node.className = "reader-callout";
      if (block.icon) {
        const icon = document.createElement("span");
        icon.className = "reader-callout-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = block.icon;
        node.appendChild(icon);
      }
      const body = document.createElement("div");
      appendRichText(body, block.rich_text);
      node.appendChild(body);
      parent.appendChild(node);
      addChildren(block, node.lastElementChild);
      return;
    } else if (type === "to_do") {
      node = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.disabled = true;
      checkbox.checked = Boolean(block.checked);
      checkbox.setAttribute("aria-label", block.checked ? "Concluído no Notion" : "Pendente no Notion");
      node.appendChild(checkbox);
      appendRichText(node, block.rich_text);
      parent.appendChild(node);
      addChildren(block, node);
      return;
    } else if (type === "toggle") {
      node = document.createElement("details");
      const summary = document.createElement("summary");
      appendRichText(summary, block.rich_text);
      node.appendChild(summary);
      const body = document.createElement("div");
      addChildren(block, body);
      node.appendChild(body);
      parent.appendChild(node);
      return;
    } else if (type === "divider") {
      parent.appendChild(document.createElement("hr"));
      return;
    } else if (type === "code") {
      node = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = plainText(block.rich_text);
      if (block.language) code.dataset.language = block.language;
      node.appendChild(code);
      parent.appendChild(node);
      addChildren(block, parent);
      return;
    } else if (type === "table") {
      renderTable(block, parent);
      return;
    } else if (type === "child_page" || type === "link_to_page") {
      node = document.createElement("p");
      const anchor = document.createElement("a");
      const href = safeUrl(block.url) || safeUrl(block.notion_url);
      anchor.textContent = block.title || "Abrir página vinculada no Notion";
      if (href) {
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
      }
      node.appendChild(anchor);
    } else if (["bookmark", "embed", "link_preview"].includes(type)) {
      node = document.createElement("p");
      const href = safeUrl(block.url);
      if (href) {
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.textContent = plainText(block.caption) || block.url;
        node.appendChild(anchor);
      } else {
        node.textContent = plainText(block.caption) || "Link incorporado no Notion.";
      }
    } else if (["image", "video", "pdf", "file", "audio"].includes(type)) {
      node = document.createElement("p");
      const href = safeUrl(block.url);
      if (href) {
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.textContent = plainText(block.caption) || "Abrir arquivo ↗";
        node.appendChild(anchor);
      } else {
        node.textContent = plainText(block.caption) || "Arquivo mantido na página original do Notion.";
      }
    } else if (type === "equation") {
      node = document.createElement("p");
      const code = document.createElement("code");
      code.textContent = block.expression || plainText(block.rich_text);
      node.appendChild(code);
    } else {
      node = document.createElement("p");
      if (!node.textContent && block.title) node.textContent = block.title;
    }

    appendRichText(node, block.rich_text);
    parent.appendChild(node);
    addChildren(block, node);
  }

  function renderBlocks(blocks, parent) {
    let index = 0;
    while (index < blocks.length) {
      if (blocks[index].type === "bulleted_list_item" || blocks[index].type === "numbered_list_item") {
        index = renderList(blocks, index, parent);
      } else {
        renderBlock(blocks[index], parent);
        index += 1;
      }
    }
  }

  function setMode(nextMode) {
    mode = nextMode === "questions" ? "questions" : "material";
    materialTab.classList.toggle("is-active", mode === "material");
    questionsTab.classList.toggle("is-active", mode === "questions");
    materialTab.setAttribute("aria-pressed", String(mode === "material"));
    questionsTab.setAttribute("aria-pressed", String(mode === "questions"));
    renderCurrent();
  }

  function questionPagesFor(code) {
    if (!snapshot || !Array.isArray(snapshot.questionPages)) return [];
    return snapshot.questionPages.filter(function (page) { return page.code === code; });
  }

  function renderCurrent() {
    if (!project) return;
    const module = project.modules.find(function (item) { return item.code === select.value; });
    const synced = snapshot && Array.isArray(snapshot.materials) ? snapshot.materials.find(function (item) { return item.code === select.value; }) : null;
    content.replaceChildren();
    content.setAttribute("aria-busy", "false");
    notionLink.href = mode === "questions" ? project.links.questions : (module ? module.notion : project.links.materials);
    const documentNode = document.createElement("div");
    documentNode.className = "reader-document";

    if (mode === "material") {
      const blocks = synced && Array.isArray(synced.blocks) ? synced.blocks : [];
      if (!blocks.length) {
        const empty = document.createElement("p");
        empty.className = "reader-empty";
        const strong = document.createElement("strong");
        strong.textContent = "Este material ainda não chegou ao site.";
        empty.append(strong, document.createTextNode(snapshot && snapshot.syncedAt ? "A próxima sincronização vai trazer o conteúdo disponível no Notion." : "A integração com o Notion ainda precisa ser configurada para carregar as páginas completas."));
        documentNode.appendChild(empty);
      } else {
        const heading = document.createElement("h2");
        heading.textContent = synced.title || module.subject;
        documentNode.appendChild(heading);
        renderBlocks(blocks, documentNode);
      }
    } else {
      const sets = questionPagesFor(select.value);
      if (sets.length) {
        sets.forEach(function (page) {
          const heading = document.createElement("h2");
          heading.textContent = page.title;
          documentNode.appendChild(heading);
          renderBlocks(page.blocks || [], documentNode);
        });
      } else {
        const notice = document.createElement("div");
        notice.className = "reader-question-notice";
        const strong = document.createElement("strong");
        strong.textContent = "A bateria deste código ainda não está publicada.";
        const detail = document.createElement("span");
        detail.textContent = project.editorial && project.editorial.questionsCompleted === 0
          ? "A trilha de questões está em 0/33 e só começa depois de os materiais chegarem a 33/33. O site não inventa questões nem respostas."
          : "Quando a página de questões deste PRFADM estiver no Notion, a sincronização vai trazê-la para cá.";
        notice.append(strong, detail);
        documentNode.appendChild(notice);
        if (snapshot && Array.isArray(snapshot.questionGuide) && snapshot.questionGuide.length) {
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "Ver metas e regras da trilha";
          details.appendChild(summary);
          const guide = document.createElement("div");
          renderBlocks(snapshot.questionGuide, guide);
          details.appendChild(guide);
          documentNode.appendChild(details);
        }
      }
    }
    content.appendChild(documentNode);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
  }

  async function start(data) {
    project = data;
    select.replaceChildren();
    project.modules.forEach(function (module) {
      const option = document.createElement("option");
      option.value = module.code;
      option.textContent = module.code + " · " + module.subject;
      select.appendChild(option);
    });
    select.value = project.execution.next;
    select.addEventListener("change", renderCurrent);
    materialTab.addEventListener("click", function () { setMode("material"); });
    questionsTab.addEventListener("click", function () { setMode("questions"); });
    try {
      const response = await fetch("./content/prf-notion.json", { cache: "no-store" });
      if (response.ok) snapshot = await response.json();
    } catch (_) {
      snapshot = null;
    }
    const materialCount = snapshot && Array.isArray(snapshot.materials) ? snapshot.materials.filter(function (item) { return Array.isArray(item.blocks) && item.blocks.length; }).length : 0;
    const questionCount = snapshot && Array.isArray(snapshot.questionPages) ? snapshot.questionPages.length : 0;
    const syncedAt = snapshot && formatDate(snapshot.syncedAt);
    const lastSync = element("sync-last-updated");
    if (lastSync) lastSync.textContent = syncedAt ? "Última sincronização: " + syncedAt : "Última sincronização indisponível";
    status.textContent = syncedAt
      ? "Sincronizado em " + syncedAt + " · " + materialCount + "/33 páginas com material · " + questionCount + " páginas de questões"
      : "Aguardando a conexão segura com o Notion.";
    renderCurrent();
  }

  function open(code, nextMode) {
    if (!project) return;
    select.value = code;
    setMode(nextMode);
    if (window.PRF_VIEWS) window.PRF_VIEWS.show("leitura");
    const section = element("leitura");
    if (section) window.requestAnimationFrame(function () {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  window.PRF_READER = { start: start, open: open };
})();
