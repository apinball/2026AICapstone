/**
 * Claude API 호출 래퍼 — stateless
 * 옵션 B(스트리밍)로 전환 시에도 그대로 재사용 가능.
 */

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

/**
 * @param {object} args
 * @param {string} args.system            — 시스템 프롬프트
 * @param {string} args.userText          — 사용자 메시지 (단일 턴)
 * @param {string} [args.model]           — 모델 ID
 * @param {number} [args.maxTokens=1024]
 * @returns {Promise<string>}             — Claude의 텍스트 응답
 */
export async function callClaude({ system, userText, model = DEFAULT_MODEL, maxTokens = 1024 }) {
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userText }],
  });
  return response.content[0].text;
}

export function isClaudeConfigured() {
  return client !== null;
}
