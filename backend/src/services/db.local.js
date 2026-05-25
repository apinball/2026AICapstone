/**
 * DynamoDB 로컬 대체 — JSON 파일에 저장
 * USE_LOCAL=true 일 때 사용
 */

import fs from "fs/promises";
import path from "path";

const DB_PATH = path.resolve("local-storage/db.json");

async function readDB() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDB(data) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

export async function saveSession(item) {
  const db = await readDB();
  db[item.sessionId] = item;
  await writeDB(db);
}

export async function getSession(sessionId) {
  const db = await readDB();
  return db[sessionId] ?? null;
}

export async function listSessions() {
  const db = await readDB();
  return Object.values(db);
}

export async function updateSessionResult(sessionId, analysisResult) {
  const db = await readDB();
  if (!db[sessionId]) return;
  db[sessionId].status = "completed";
  db[sessionId].analysisResult = analysisResult;
  db[sessionId].completedAt = new Date().toISOString();
  await writeDB(db);
}

export async function saveRuptureEvents(sessionId, ruptureEvents) {
  const db = await readDB();
  if (!db[sessionId]) return;
  db[sessionId].ruptureEvents = ruptureEvents;
  db[sessionId].ruptureAnalyzedAt = new Date().toISOString();
  await writeDB(db);
}

export async function saveSummary(sessionId, summary) {
  const db = await readDB();
  if (!db[sessionId]) return;
  db[sessionId].summary = summary;
  db[sessionId].summaryGeneratedAt = new Date().toISOString();
  await writeDB(db);
}

export async function saveRedactedSegments(sessionId, redactedTexts) {
  const db = await readDB();
  if (!db[sessionId]) return;
  db[sessionId].redactedSegments = redactedTexts;
  db[sessionId].redactedAt = new Date().toISOString();
  await writeDB(db);
}

/**
 * 작업별 진행 상태 저장 (rupture / summary / redaction)
 * @param {string} kind - "rupture" | "summary" | "redaction"
 * @param {string} status - "processing" | "completed" | "error"
 */
/**
 * 사용자가 수동으로 화자 라벨을 정정.
 * @param {string[]} speakers - segments 인덱스별 새 speaker (counselor|client). undefined는 변경 안 함.
 */
export async function updateSegmentSpeakers(sessionId, speakers) {
  const db = await readDB();
  const session = db[sessionId];
  if (!session?.analysisResult?.segments) return;

  session.analysisResult.segments.forEach((seg, i) => {
    if (speakers[i]) seg.speaker = speakers[i];
  });

  // 상담사 발화 비율 재계산
  const segs = session.analysisResult.segments;
  const total = segs.reduce((s, x) => s + (x.end - x.start), 0) || 1;
  const counselorTime = segs
    .filter((x) => x.speaker === "counselor")
    .reduce((s, x) => s + (x.end - x.start), 0);
  session.analysisResult.counselor_talk_ratio = counselorTime / total;

  await writeDB(db);
}

/**
 * 발화별 메모 저장/수정/삭제. text가 빈 문자열이면 삭제.
 */
export async function setSegmentNote(sessionId, segmentIdx, text) {
  const db = await readDB();
  const session = db[sessionId];
  if (!session) return;
  if (!session.notes) session.notes = {};
  if (text && text.trim()) {
    session.notes[segmentIdx] = { text: text.trim(), updatedAt: new Date().toISOString() };
  } else {
    delete session.notes[segmentIdx];
  }
  await writeDB(db);
}

/**
 * 발화 북마크 토글
 */
export async function toggleBookmark(sessionId, segmentIdx) {
  const db = await readDB();
  const session = db[sessionId];
  if (!session) return false;
  if (!session.bookmarks) session.bookmarks = [];
  const idx = session.bookmarks.indexOf(segmentIdx);
  if (idx >= 0) {
    session.bookmarks.splice(idx, 1);
    await writeDB(db);
    return false;
  }
  session.bookmarks.push(segmentIdx);
  session.bookmarks.sort((a, b) => a - b);
  await writeDB(db);
  return true;
}

export async function setJobStatus(sessionId, kind, status, errorMessage = null) {
  const db = await readDB();
  if (!db[sessionId]) return;
  if (!db[sessionId].jobStatus) db[sessionId].jobStatus = {};
  db[sessionId].jobStatus[kind] = { status, error: errorMessage, updatedAt: new Date().toISOString() };
  await writeDB(db);
}

export async function markSessionError(sessionId, errorMessage) {
  const db = await readDB();
  if (!db[sessionId]) return;
  db[sessionId].status = "error";
  db[sessionId].error = errorMessage;
  await writeDB(db);
}

export async function deleteSession(sessionId) {
  const db = await readDB();
  delete db[sessionId];
  await writeDB(db);
}
