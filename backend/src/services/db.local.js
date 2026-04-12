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

export async function deleteSession(sessionId) {
  const db = await readDB();
  delete db[sessionId];
  await writeDB(db);
}
