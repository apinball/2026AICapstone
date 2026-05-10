/**
 * Ollama 로컬 LLM 호출 래퍼 — stateless
 * 호스트에서 `ollama serve`가 떠 있어야 함 (기본 포트 11434).
 * 컨테이너에서 호스트 접근: http://host.docker.internal:11434 (Docker Desktop 자동 지원)
 */

const baseUrl = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:14b";

/**
 * @param {object} args
 * @param {string} args.system
 * @param {string} args.userText
 * @param {string} [args.model]
 * @param {number} [args.maxTokens=1024]
 * @returns {Promise<string>}
 */
export async function callOllama({ system, userText, model = DEFAULT_MODEL, maxTokens = 1024 }) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      format: "json",      // JSON 출력 강제 (Ollama 0.1.30+)
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.message?.content ?? "";
}

export function isOllamaConfigured() {
  // 호스트에서 ollama serve 동작 여부는 실제 호출 시점에 확인됨
  return true;
}
