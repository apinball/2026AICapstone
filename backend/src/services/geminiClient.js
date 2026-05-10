/**
 * Google Gemini API 호출 래퍼 — stateless
 * Claude의 동일한 인터페이스를 노출 (callClaude → callGemini)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const client = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * @param {object} args
 * @param {string} args.system
 * @param {string} args.userText
 * @param {string} [args.model]
 * @param {number} [args.maxTokens=1024]
 * @returns {Promise<string>}
 */
export async function callGemini({ system, userText, model = DEFAULT_MODEL, maxTokens = 1024 }) {
  if (!client) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  const generativeModel = client.getGenerativeModel({
    model,
    systemInstruction: system,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3,
    },
  });

  const result = await generativeModel.generateContent(userText);
  return result.response.text();
}

export function isGeminiConfigured() {
  return client !== null;
}
