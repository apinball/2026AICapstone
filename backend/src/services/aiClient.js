/**
 * AI 서버(FastAPI) 호출 클라이언트
 * 분석 완료 후 DynamoDB 결과 저장까지 처리.
 */

import FormData from "form-data";
import { Readable } from "stream";
import { updateSessionResult } from "./dynamodb.js";

const AI_SERVER_URL = process.env.AI_SERVER_URL || "http://ai-server:8000";

/**
 * @param {string} sessionId
 * @param {Buffer} audioBuffer
 * @param {string} fileName
 */
export async function triggerAnalysis(sessionId, audioBuffer, fileName) {
  console.log(`[aiClient] Triggering analysis for session ${sessionId}`);

  const formData = new FormData();
  formData.append("file", Readable.from(audioBuffer), {
    filename: fileName,
    contentType: "audio/mpeg",
  });

  const url = `${AI_SERVER_URL}/analyze?session_id=${encodeURIComponent(sessionId)}`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
    headers: formData.getHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI server error ${response.status}: ${text}`);
  }

  const result = await response.json();
  await updateSessionResult(sessionId, result);
  console.log(`[aiClient] Analysis complete for session ${sessionId}`);
  return result;
}
