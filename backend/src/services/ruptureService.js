/**
 * 치료 동맹 균열 (Alliance Rupture) 감지
 * 이론: Safran & Muran (2000, 2011) — Withdrawal / Confrontation rupture
 *
 * Stateless 설계:
 *   - 입력: segments 배열 (또는 부분 window)
 *   - 출력: rupture_events 배열
 *   - 옵션 A(전체 분석) / 옵션 B(스트리밍 청크) 모두 동일 함수 사용 가능
 */

import { callLLM } from "./llmClient.js";

const WINDOW_SIZE = 15;     // sliding window 발화 수 (~3-5분)
const STEP = 5;             // window 이동 간격 (오버랩 10개)
const MIN_INTENSITY = 7;    // 알림 임계값 (오탐 방지)

const SYSTEM_PROMPT = `당신은 심리상담 전문가이자 치료 동맹 분석 시스템입니다.
Safran & Muran의 Alliance Rupture 이론을 기반으로 아래 상담 대화를 분석하세요.

[Rupture 유형]
1. Withdrawal (철수형): 내담자가 관계에서 거리를 두는 패턴
   - 응답 길이가 급격히 짧아짐
   - "모르겠어요", "그냥요", "뭐..." 증가
   - 추상적이고 표면적인 답변으로 전환
   - 상담사 질문을 다른 주제로 전환
   - 과도한 동의 반복 ("네, 맞아요, 맞아요")
   - 감정 단어 사용 빈도 감소

2. Confrontation (대립형): 내담자가 불만을 직접적으로 표출
   - 상담사 개입에 직접 의문 제기
   - "그게 정확히 무슨 의미예요?"
   - "그런 말은 정확히 잘 맞는 것 같아요"
   - 이전 상담 내용 부정 또는 번복
   - 감정적 어조 상승
   - 상담 방식 자체에 대한 불만

[출력 형식 — 반드시 valid JSON]
{
  "rupture_type": "withdrawal" | "confrontation" | "none",
  "intensity": 0~10 정수,
  "evidence": ["근거가 된 발화 번호와 이유 (2~3개)"],
  "recommendation": "상담사를 위한 repair 방향 1줄"
}

[주의사항]
- 단일 발화가 아닌 전체 흐름으로 판단하세요
- 강도 7 이상일 때만 의미있는 알림으로 처리됩니다
- 한국 문화적 맥락 고려: "괜찮아요"는 실제로 괜찮지 않을 수 있음
- 응답은 JSON 객체 하나만, 마크다운 코드블록 없이 출력하세요`;

/**
 * 단일 window에 대한 rupture 분석.
 * @param {Array} window — segments slice [{speaker, text, ...}]
 * @returns {Promise<object|null>}
 */
async function analyzeWindow(window, windowStartIdx) {
  const conversationText = window
    .map((s, i) => {
      const speaker = s.speaker === "counselor" ? "상담사" : "내담자";
      return `${windowStartIdx + i + 1}. [${speaker}] ${s.text}`;
    })
    .join("\n");

  const responseText = await callLLM({
    system: SYSTEM_PROMPT,
    userText: conversationText,
    maxTokens: 512,
  });

  // LLM이 가끔 ```json ... ``` 으로 감싸는 경우 대비
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  return JSON.parse(cleaned);
}

/**
 * 전체 segments에 sliding window를 적용해 rupture 이벤트 추출.
 *
 * @param {Array} segments — [{speaker, text, start, end, ...}]
 * @param {object} [options]
 * @param {number} [options.windowSize=WINDOW_SIZE]
 * @param {number} [options.step=STEP]
 * @param {number} [options.minIntensity=MIN_INTENSITY]
 * @returns {Promise<Array>} rupture_events
 */
export async function detectRuptures(segments, options = {}) {
  const windowSize = options.windowSize ?? WINDOW_SIZE;
  const step = options.step ?? STEP;
  const minIntensity = options.minIntensity ?? MIN_INTENSITY;

  if (!segments || segments.length < windowSize) {
    console.log(`[rupture] Skipped — segments(${segments?.length ?? 0}) < window(${windowSize})`);
    return [];
  }

  const events = [];

  for (let i = 0; i + windowSize <= segments.length; i += step) {
    const window = segments.slice(i, i + windowSize);
    try {
      const result = await analyzeWindow(window, i);
      if (
        result.rupture_type !== "none" &&
        typeof result.intensity === "number" &&
        result.intensity >= minIntensity
      ) {
        events.push({
          rupture_type: result.rupture_type,
          intensity: result.intensity,
          evidence: result.evidence ?? [],
          recommendation: result.recommendation ?? "",
          window_start_idx: i,
          window_end_idx: i + windowSize - 1,
          window_start_time: window[0].start,
          window_end_time: window[window.length - 1].end,
        });
        console.log(
          `[rupture] Detected ${result.rupture_type} (intensity=${result.intensity}) at segments ${i}~${i + windowSize - 1}`
        );
      }
    } catch (err) {
      console.warn(`[rupture] Window ${i} analysis failed: ${err.message}`);
    }
  }

  // 연속된 동일 유형 이벤트는 병합 (오탐 방지 — "연속 2회 이상 감지" 정책)
  return mergeConsecutiveEvents(events);
}

function mergeConsecutiveEvents(events) {
  if (events.length === 0) return [];
  const merged = [events[0]];
  for (let i = 1; i < events.length; i++) {
    const last = merged[merged.length - 1];
    const cur = events[i];
    // 같은 유형 + window 겹침
    if (
      cur.rupture_type === last.rupture_type &&
      cur.window_start_idx <= last.window_end_idx
    ) {
      last.window_end_idx = Math.max(last.window_end_idx, cur.window_end_idx);
      last.window_end_time = Math.max(last.window_end_time, cur.window_end_time);
      last.intensity = Math.max(last.intensity, cur.intensity);
      last.evidence = [...new Set([...last.evidence, ...cur.evidence])];
    } else {
      merged.push(cur);
    }
  }
  return merged;
}
