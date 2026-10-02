import { readFile, writeFile } from "node:fs/promises";

const SNAPSHOT = new URL("../content/prf-notion.json", import.meta.url);
const OUTPUT = new URL("../central-status.json", import.meta.url);

const raw = JSON.parse(await readFile(SNAPSHOT, "utf8"));
const syncedAt = typeof raw.syncedAt === "string" ? raw.syncedAt : new Date().toISOString();
const execution = raw?.projectState?.execution || { status: "unavailable" };
const editorial = raw?.projectState?.editorial || { status: "unavailable" };
const executionAvailable = execution.status === "available";
const editorialAvailable = editorial.status === "available";

const alerts = [];
if (!executionAvailable) alerts.push("Estado de execução do Notion indisponível no último snapshot sanitizado.");
if (editorialAvailable && editorial.editorialStatus === "BLOCKED") alerts.push("Esteira editorial PRFADM está bloqueada no checkpoint do Notion.");

const state = {
  phase: "Roda contínua PRF Administrativo",
  cycle: executionAvailable ? `Volta ${execution.round}` : "PRFADM01–PRFADM33",
  currentUnit: executionAvailable ? execution.lastCompleted : null,
  nextAction: executionAvailable && execution.next ? `${execution.next} — próxima sessão confirmada na execução do Notion` : null,
  nextActionKind: executionAvailable && execution.next ? "operational" : "manual",
  alerts
};

// Before the first completed session, no D7/D20 review can be due.
// Once the cycle starts, keep the count unknown until Notion publishes it.
const lastStudiedAt =
  executionAvailable && typeof execution.lastStudiedAt === "string" && execution.lastStudiedAt
    ? execution.lastStudiedAt
    : null;
const timeCredits =
  executionAvailable && execution.lastCompleted && lastStudiedAt
    ? [{
        id: `prf-adm:study:${execution.lastCompleted}:${lastStudiedAt.slice(0, 10)}`,
        date: lastStudiedAt.slice(0, 10),
        kind: "study",
        unit: execution.lastCompleted,
        trail: "Roda PRFADM",
        minutes: 60,
        sourceRef: "content/prf-notion.json#projectState.execution",
      }]
    : [];

const reviewsDue =
  executionAvailable && Number.isInteger(execution.reviewsDue) && execution.reviewsDue >= 0
    ? execution.reviewsDue
    : executionAvailable && execution.completed === 0
      ? 0
      : null;

const study = {
  evidence: executionAvailable ? "confirmed" : "unavailable",
  sourceRef: "content/prf-notion.json#projectState.execution",
  updatedAt: syncedAt,
  trail: "Roda PRFADM",
  lastCompletedUnit: executionAvailable ? execution.lastCompleted : null,
  nextUnit: executionAvailable ? execution.next : null,
  lastStudiedAt,
  questionsDone: null,
  correct: null,
  errors: null,
  doubts: null,
  accuracy: null,
  reviewsDue,
  nextReviewAt: null,
  activeErrors: null,
  completedSessions: executionAvailable ? execution.completed : null,
  totalSessions: executionAvailable ? execution.total : 33,
  timeCredits,
  notes: editorialAvailable ? [
    `Materiais: ${editorial.materialsCompleted}/${editorial.materialsTotal}`,
    `Questões editoriais: ${editorial.questionsCompleted}/${editorial.questionsTotal}`,
    `Gate editorial: ${editorial.gate}`
  ] : []
};

const contract = {
  schemaVersion: 1,
  projectId: "prf-adm",
  publishedAt: syncedAt.slice(0, 10),
  source: {
    kind: "public-project-state",
    ref: "content/prf-notion.json#projectState",
    status: executionAvailable ? "synced" : "partial",
    updatedAt: syncedAt
  },
  state,
  study
};

await writeFile(OUTPUT, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
console.log(`central-status.json atualizado: execução=${execution.status}; editorial=${editorial.status}.`);
