/**
 * AI 서버(FastAPI) 호출 클라이언트
 * 분석 완료 후 DB 결과 저장까지 처리.
 */

import { updateSessionResult, markSessionError, saveRuptureEvents } from "./db.js";
import { detectRuptures } from "./ruptureService.js";
import { isLLMConfigured } from "./llmClient.js";

const AI_SERVER_URL = process.env.AI_SERVER_URL || "http://ai-server:8000";

/**
 * @param {string} sessionId
 * @param {Buffer} audioBuffer
 * @param {string} fileName
 */
export async function triggerAnalysis(sessionId, audioBuffer, fileName) {
  console.log(`[aiClient] Triggering analysis for session ${sessionId}`);

  try {
    // 네이티브 FormData + Blob (Node 20+) — boundary 자동 처리
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("file", blob, fileName);

    const url = `${AI_SERVER_URL}/analyze?session_id=${encodeURIComponent(sessionId)}`;
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI server error ${response.status}: ${text}`);
    }

    const result = await response.json();
    await updateSessionResult(sessionId, result);
    console.log(`[aiClient] Analysis complete for session ${sessionId}`);

    // Rupture 감지 (선택적, 실패해도 분석 결과는 유지)
    if (process.env.ENABLE_RUPTURE_DETECTION === "true" && isLLMConfigured()) {
      runRuptureDetection(sessionId, result.segments).catch((err) =>
        console.warn(`[aiClient] Rupture detection failed: ${err.message}`)
      );
    }

    return result;
  } catch (err) {
    console.error(`[aiClient] Analysis failed for session ${sessionId}: ${err.message}`);
    await markSessionError(sessionId, err.message);
    throw err;
  }
}

/**
 * AI 분석 결과의 segments에 대해 rupture 감지를 비동기 실행.
 * 백엔드 메인 응답 흐름과 분리되어 있어 실패해도 사용자에게 영향 없음.
 */
export async function runRuptureDetection(sessionId, segments) {
  console.log(`[rupture] Starting detection for session ${sessionId} (${segments?.length ?? 0} segments)`);
  const events = await detectRuptures(segments);
  await saveRuptureEvents(sessionId, events);
  console.log(`[rupture] Saved ${events.length} events for session ${sessionId}`);
  return events;
}
