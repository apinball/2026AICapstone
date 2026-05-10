/**
 * LLM Provider 추상화 — LLM_PROVIDER 환경변수로 선택
 *   "claude" → Anthropic Claude
 *   "gemini" → Google Gemini (무료 tier)
 *   "ollama" → 로컬 Ollama (호스트에서 ollama serve 필요)
 *
 * 모든 LLM 호출은 이 모듈을 통해서만 — provider 교체가 단일 지점에서 가능.
 */

const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

let _callLLM;
let _isLLMConfigured;
let _providerName;

if (provider === "claude") {
  const mod = await import("./claudeClient.js");
  _callLLM = mod.callClaude;
  _isLLMConfigured = mod.isClaudeConfigured;
  _providerName = "claude";
} else if (provider === "gemini") {
  const mod = await import("./geminiClient.js");
  _callLLM = mod.callGemini;
  _isLLMConfigured = mod.isGeminiConfigured;
  _providerName = "gemini";
} else if (provider === "ollama") {
  const mod = await import("./ollamaClient.js");
  _callLLM = mod.callOllama;
  _isLLMConfigured = mod.isOllamaConfigured;
  _providerName = "ollama";
} else {
  throw new Error(`Unsupported LLM_PROVIDER: ${provider} (use "claude", "gemini", or "ollama")`);
}

console.log(`[llmClient] Using provider: ${_providerName}`);

export const callLLM = _callLLM;
export const isLLMConfigured = _isLLMConfigured;
export const providerName = _providerName;
