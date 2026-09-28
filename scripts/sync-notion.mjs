import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const OUTPUT_PATH = resolve(REPO_ROOT, "content/prf-notion.json");
const NOTION_VERSION = "2026-03-11";
const PAGE_SIZE = 100;
const MAX_DEPTH = 12;
const MAX_BLOCKS = 30000;
const REQUEST_INTERVAL_MS = 360;
const token = process.env.NOTION_TOKEN;

if (!token) {
  throw new Error("Configure NOTION_TOKEN como Actions Secret antes de executar a sincronização.");
}

const dataSource = await readProjectData();
let requestQueue = Promise.resolve();
let lastRequestAt = 0;
let fetchedBlockCount = 0;
const visitedParents = new Set();

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

function toUuid(value) {
  const hex = String(value || "").replace(/[^a-f\d]/gi, "").toLowerCase();
  if (!/^[a-f\d]{32}$/.test(hex)) throw new Error("ID de página Notion inválido no projeto.");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function idFromNotionUrl(value) {
  const match = String(value || "").match(/([a-f\d]{32})(?:[?#]|$)/i);
  if (!match) throw new Error("Não foi possível identificar o ID da página Notion.");
  return toUuid(match[1]);
}

async function readProjectData() {
  const source = await readFile(resolve(REPO_ROOT, "data.js"), "utf8");
  const match = source.match(/window\.PRF_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error("data.js não contém o objeto PRF_DATA esperado.");
  const data = JSON.parse(match[1]);
  if (!Array.isArray(data.modules) || data.modules.length !== 33) {
    throw new Error("A sincronização foi interrompida: a roda deve conter 33 códigos PRFADM.");
  }
  return data;
}

function apiRequest(path, options = {}) {
  const run = requestQueue.then(async () => {
    const wait = REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`https://api.notion.com/v1${path}`, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;

      const retryable = [429, 500, 502, 503, 504, 529].includes(response.status);
      if (retryable && attempt < 5) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 900 * (2 ** attempt));
        continue;
      }
      const code = payload.code ? ` ${payload.code}` : "";
      throw new Error(`Notion API respondeu HTTP ${response.status}${code} em ${path}. Confira o token, as permissões e o compartilhamento da página com a integração.`);
    }
    throw new Error(`Notion API não respondeu após as tentativas permitidas em ${path}.`);
  });
  requestQueue = run.then(() => undefined, () => undefined);
  return run;
}

function normalizeRichText(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    text: item.plain_text || item.text?.content || item.equation?.expression || "",
    url: item.href || item.text?.link?.url || null,
    annotations: {
      bold: Boolean(item.annotations?.bold),
      italic: Boolean(item.annotations?.italic),
      strikethrough: Boolean(item.annotations?.strikethrough),
      underline: Boolean(item.annotations?.underline),
      code: Boolean(item.annotations?.code)
    }
  }));
}

function normalizeBlock(block) {
  const type = block.type;
  const value = block[type] || {};
  const normalized = {
    id: block.id,
    type,
    rich_text: normalizeRichText(value.rich_text),
    children: [],
    has_children: Boolean(block.has_children)
  };

  if (value.title) normalized.title = typeof value.title === "string" ? value.title : normalizeRichText(value.title).map(part => part.text).join("");
  if (value.checked !== undefined) normalized.checked = Boolean(value.checked);
  if (value.language) normalized.language = String(value.language);
  if (value.expression) normalized.expression = String(value.expression);
  if (value.icon?.type === "emoji") normalized.icon = String(value.icon.emoji);
  if (value.has_column_header !== undefined) normalized.has_column_header = Boolean(value.has_column_header);
  if (Array.isArray(value.cells)) normalized.cells = value.cells.map(normalizeRichText);
  if (Array.isArray(value.caption)) normalized.caption = normalizeRichText(value.caption);

  if (type === "child_page") {
    normalized.title = String(value.title || "Página vinculada");
    normalized.notion_url = `https://app.notion.com/p/${block.id.replace(/-/g, "")}`;
  } else if (type === "link_to_page") {
    normalized.notion_url = value.page_id ? `https://app.notion.com/p/${String(value.page_id).replace(/-/g, "")}` : null;
  } else if (["bookmark", "embed", "link_preview"].includes(type)) {
    normalized.url = typeof value.url === "string" ? value.url : null;
  } else if (["image", "video", "pdf", "file", "audio"].includes(type)) {
    // Notion-hosted file URLs expire. Keep only external, durable links.
    normalized.url = value.external?.url || null;
  }

  return normalized;
}

async function listAllChildren(parentId, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error("A página contém uma hierarquia de blocos além do limite seguro de sincronização.");
  const normalizedParent = toUuid(parentId);
  if (visitedParents.has(normalizedParent)) return [];
  visitedParents.add(normalizedParent);

  const blocks = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (cursor) query.set("start_cursor", cursor);
    const response = await apiRequest(`/blocks/${normalizedParent}/children?${query.toString()}`);
    if (!Array.isArray(response.results)) throw new Error("A API do Notion retornou uma lista de blocos inválida.");
    for (const rawBlock of response.results) {
      fetchedBlockCount += 1;
      if (fetchedBlockCount > MAX_BLOCKS) throw new Error("A sincronização ultrapassou o limite de blocos configurado; nada foi publicado.");
      const block = normalizeBlock(rawBlock);
      const isChildPage = rawBlock.type === "child_page";
      if (rawBlock.type !== "child_database" && (rawBlock.has_children || isChildPage)) {
        block.children = await listAllChildren(rawBlock.id, depth + 1);
      }
      blocks.push(block);
    }
    cursor = response.has_more ? response.next_cursor : null;
    if (response.has_more && !cursor) throw new Error("A API do Notion indicou mais resultados sem cursor de paginação.");
  } while (cursor);

  return blocks;
}

function plainTextFromBlocks(blocks) {
  const lines = [];
  for (const block of blocks || []) {
    const parts = [];
    if (block.title) parts.push(String(block.title));
    if (Array.isArray(block.rich_text)) {
      for (const part of block.rich_text) if (part.text) parts.push(part.text);
    }
    if (Array.isArray(block.cells)) {
      for (const cell of block.cells) {
        for (const part of cell || []) if (part.text) parts.push(part.text);
      }
    }
    if (parts.length) lines.push(parts.join(""));
    if (block.children?.length) lines.push(plainTextFromBlocks(block.children));
  }
  return lines.filter(Boolean).join("\n");
}

function requiredMatch(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error("Não foi possível interpretar " + label + " no Notion.");
  return match;
}

function parseExecutionState(blocks) {
  const text = plainTextFromBlocks(blocks);
  const round = Number(requiredMatch(text, /Volta atual:\s*(?:Volta\s*)?(\d+)/i, "a volta atual")[1]);
  const progress = requiredMatch(text, /Progresso:\s*(\d+)\s*\/\s*(\d+)/i, "o progresso real");
  const completed = Number(progress[1]);
  const total = Number(progress[2]);
  const nextMatch = requiredMatch(text, /Próximo:\s*(PRFADM\d{2}|nenhum)/i, "a próxima sessão");
  const lastMatch = requiredMatch(text, /Último concluído:\s*(PRFADM\d{2}|nenhum)/i, "a última sessão concluída");
  const next = /^nenhum$/i.test(nextMatch[1]) ? null : nextMatch[1].toUpperCase();
  const lastCompleted = /^nenhum$/i.test(lastMatch[1]) ? null : lastMatch[1].toUpperCase();
  const moduleCodes = new Set(dataSource.modules.map(module => module.code));

  if (!Number.isInteger(round) || round < 1 || !Number.isInteger(completed) || completed < 0 || completed > total || total !== dataSource.modules.length) {
    throw new Error("O progresso real do Notion está fora dos limites esperados.");
  }
  if ((next && !moduleCodes.has(next)) || (lastCompleted && !moduleCodes.has(lastCompleted))) {
    throw new Error("O Notion indica um código PRFADM que não existe na roda.");
  }
  return { round, completed, total, next, lastCompleted };
}

function parseEditorialState(blocks) {
  const text = plainTextFromBlocks(blocks);
  const stageMatch = requiredMatch(text, /Stage:\s*(MATERIALS|QUESTIONS|COMPLETE)/i, "a etapa editorial");
  const activeMatch = requiredMatch(text, /Active:\s*(PRFADM\d{2}|none)/i, "o PRFADM editorial ativo");
  const nextMatch = requiredMatch(text, /Next:\s*(PRFADM\d{2}|none)/i, "o próximo PRFADM editorial");
  const materials = requiredMatch(text, /Materials complete:\s*(\d+)\s*\/\s*(\d+)/i, "o progresso dos materiais");
  const questions = requiredMatch(text, /Questions complete:\s*(\d+)\s*\/\s*(\d+)/i, "o progresso das questões");
  const statusMatch = requiredMatch(text, /Status:\s*(READY|BLOCKED|COMPLETE)/i, "o status editorial");
  const gateMatch = requiredMatch(text, /Quality gate:\s*([^\r\n]+)/i, "o gate de qualidade");
  const totalMaterials = Number(materials[2]);
  const totalQuestions = Number(questions[2]);
  const materialsCompleted = Number(materials[1]);
  const questionsCompleted = Number(questions[1]);
  const active = /^none$/i.test(activeMatch[1]) ? null : activeMatch[1].toUpperCase();
  const next = /^none$/i.test(nextMatch[1]) ? null : nextMatch[1].toUpperCase();
  const moduleCodes = new Set(dataSource.modules.map(module => module.code));

  if (stageMatch[1].toUpperCase() === "MATERIALS" && totalMaterials !== dataSource.modules.length) {
    throw new Error("O total de materiais do Notion não corresponde à roda PRFADM.");
  }
  if (totalQuestions !== dataSource.modules.length || materialsCompleted > totalMaterials || questionsCompleted > totalQuestions) {
    throw new Error("O progresso editorial do Notion está fora dos limites esperados.");
  }
  if ((active && !moduleCodes.has(active)) || (next && !moduleCodes.has(next))) {
    throw new Error("O checkpoint indica um código PRFADM que não existe na roda.");
  }

  return {
    stage: stageMatch[1].toUpperCase(),
    active,
    next,
    materialsCompleted,
    materialsTotal: totalMaterials,
    questionsCompleted,
    questionsTotal: totalQuestions,
    editorialStatus: statusMatch[1].toUpperCase(),
    gate: gateMatch[1].trim()
  };
}

async function optionalProjectState(url, label, parser) {
  try {
    const blocks = await listAllChildren(idFromNotionUrl(url));
    return { status: "available", ...parser(blocks) };
  } catch (_) {
    console.warn("Estado do Notion indisponível para " + label + "; a sincronização de materiais e questões continuará.");
    return { status: "unavailable" };
  }
}

function collectQuestionPages(blocks, pages = []) {
  for (const block of blocks || []) {
    if (block.type === "child_page") {
      const codeMatch = String(block.title || "").match(/PRFADM\d{2}/i);
      pages.push({
        id: block.id,
        code: codeMatch ? codeMatch[0].toUpperCase() : null,
        title: block.title || "Questões PRF",
        url: block.notion_url,
        blocks: block.children || []
      });
    }
    if (block.children?.length) collectQuestionPages(block.children, pages);
  }
  return pages;
}

const materials = [];
for (const module of dataSource.modules) {
  const pageId = idFromNotionUrl(module.notion);
  const blocks = await listAllChildren(pageId);
  materials.push({
    code: module.code,
    title: module.subject,
    url: module.notion,
    blocks
  });
}

const questionsPageId = idFromNotionUrl(dataSource.links.questions);
const questionGuide = await listAllChildren(questionsPageId);
const questionPages = collectQuestionPages(questionGuide);

const contentBlockCount = fetchedBlockCount;
const executionState = await optionalProjectState(dataSource.links.execution, "execução", parseExecutionState);
const editorialState = await optionalProjectState(dataSource.links.checkpoint, "esteira editorial", parseEditorialState);
const syncedAt = new Date().toISOString();

const output = {
  schemaVersion: 2,
  source: "Notion API",
  syncedAt,
  snapshotAsOf: dataSource.asOf,
  moduleCount: materials.length,
  contentBlockCount,
  materials,
  questionGuide,
  questionPages,
  projectState: {
    syncedAt,
    execution: executionState,
    editorial: editorialState
  }
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Sincronização concluída: ${materials.length} materiais; ${questionPages.length} páginas de questões; ${contentBlockCount} blocos de conteúdo; estado de estudo ${executionState.status}; esteira editorial ${editorialState.status}.`);
