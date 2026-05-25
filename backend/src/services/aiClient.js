/**
 * AI 서버(FastAPI) 호출 클라이언트.
 *
 * Rupture/Summary/Redaction은 callback 패턴 사용:
 *   백엔드 → AI 서버: callback_url 포함해서 트리거 (즉시 응답)
 *   AI 서버 → 백엔드: 처리 완료 후 callback URL로 결과 POST
 * 이로써 백엔드가 5분간 대기하지 않아 컨테이너 재시작에도 안전.
 */

import { updateSessionResult, markSessionError, getSession } from "./db.js";

const AI_SERVER_URL = process.env.AI_SERVER_URL || "http://ai-server:8000";
// AI 서버가 백엔드를 호출할 때 사용할 내부 URL (도커 네트워크 기준)
const SELF_INTERNAL_URL = process.env.SELF_INTERNAL_URL || "http://web:3000";

/**
 * @param {string} sessionId
 * @param {Buffer} audioBuffer
 * @param {string} fileName
 */
export async function triggerAnalysis(sessionId, audioBuffer, fileName) {
  console.log(`[aiClient] Triggering analysis for session ${sessionId}`);

  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("file", blob, fileName);

    const url = `${AI_SERVER_URL}/analyze?session_id=${encodeURIComponent(sessionId)}`;
    const response = await fetch(url, { method: "POST", body: formData });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI server error ${response.status}: ${text}`);
    }

    const result = await response.json();
    await updateSessionResult(sessionId, result);
    console.log(`[aiClient] Analysis complete for session ${sessionId}`);

    if (process.env.ENABLE_RUPTURE_DETECTION === "true") {
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
 * 공통: AI 서버에 callback URL 포함해서 비동기 트리거.
 * 응답을 기다리지 않고 즉시 반환.
 */
async function triggerAsyncJob(sessionId, segments, endpointPath, callbackPath) {
  if (!segments) {
    const session = await getSession(sessionId);
    segments = session?.analysisResult?.segments;
    if (!segments?.length) throw new Error("Session has no segments");
  }

  const callbackUrl = `${SELF_INTERNAL_URL}/api/internal/${callbackPath}`;
  console.log(`[aiClient] ${endpointPath} for session ${sessionId} (${segments.length} segments) → callback ${callbackUrl}`);

  const response = await fetch(`${AI_SERVER_URL}${endpointPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segments,
      callback_url: callbackUrl,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI server error ${response.status}: ${text}`);
  }

  // AI 서버는 즉시 빈 응답 반환. 실제 결과는 callback으로 도착.
  return { status: "started" };
}

export async function runRuptureDetection(sessionId, segments = null) {
  return triggerAsyncJob(sessionId, segments, "/analyze/rupture", "rupture-callback");
}

export async function runSummary(sessionId, segments = null) {
  return triggerAsyncJob(sessionId, segments, "/analyze/summary", "summary-callback");
}

export async function runRedaction(sessionId, segments = null) {
  return triggerAsyncJob(sessionId, segments, "/analyze/redaction", "redaction-callback");
}
