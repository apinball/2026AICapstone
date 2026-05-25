/**
 * DB 서비스 — USE_LOCAL 환경변수로 자동 전환
 *   USE_LOCAL=true  → 로컬 JSON 파일
 *   USE_LOCAL=false → AWS DynamoDB
 */

const useLocal = process.env.USE_LOCAL === "true";

const mod = useLocal
  ? await import("./db.local.js")
  : await import("./dynamodb.js");

export const saveSession = mod.saveSession;
export const getSession = mod.getSession;
export const listSessions = mod.listSessions;
export const updateSessionResult = mod.updateSessionResult;
export const markSessionError = mod.markSessionError;
export const deleteSession = mod.deleteSession;
export const saveRuptureEvents = mod.saveRuptureEvents;
export const saveSummary = mod.saveSummary;
export const saveRedactedSegments = mod.saveRedactedSegments;
export const setJobStatus = mod.setJobStatus;
export const updateSegmentSpeakers = mod.updateSegmentSpeakers;
export const setSegmentNote = mod.setSegmentNote;
export const toggleBookmark = mod.toggleBookmark;
