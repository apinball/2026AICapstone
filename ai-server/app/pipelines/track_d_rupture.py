"""
Track D — 치료 동맹 균열 (Alliance Rupture) 감지
이론: Safran & Muran (2000, 2011) — Withdrawal / Confrontation rupture

Stateless 설계 — 옵션 B(스트리밍) 전환 시에도 동일 함수 사용 가능.
"""

import json
from typing import Any

from llm.base import LLMProvider


WINDOW_SIZE = 15
STEP = 10               # 호출 횟수 절반 감소 (긴 오디오 시연 안정성)
MIN_INTENSITY = 7

SYSTEM_PROMPT = """당신은 심리상담 전문가이자 치료 동맹 분석 시스템입니다.
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
   - "선생님 말이 잘 와닿지 않아요"
   - 이전 상담 내용 부정 또는 번복
   - 감정적 어조 상승, 짜증/한숨
   - 상담 방식 자체에 대한 불만

[Few-shot 예시]

예시 1 — Withdrawal 강도 8:
대화:
1. [상담사] 지난주에 어떻게 지내셨어요?
2. [내담자] 그냥요.
3. [상담사] 잠은 좀 주무셨어요?
4. [내담자] 뭐... 비슷해요.
5. [상담사] 무슨 생각이 가장 많이 드세요?
6. [내담자] 모르겠어요.
판정: {"rupture_type": "withdrawal", "intensity": 8, "evidence": ["2,4,6번 발화 모두 1~2단어로 매우 짧음", "감정/구체 정보 회피", "표면적 답변 반복"], "recommendation": "지금 이 자리가 어떻게 느껴지는지 직접 물어보세요"}

예시 2 — Confrontation 강도 7:
대화:
1. [상담사] 그럴 때마다 자존감이 떨어지신 것 같네요.
2. [내담자] 자존감이요? 그게 정확히 뭔지 모르겠어요.
3. [내담자] 그냥 선생님이 다 정해놓고 말씀하시는 것 같아요.
판정: {"rupture_type": "confrontation", "intensity": 7, "evidence": ["2번에서 상담사 해석에 의문 제기", "3번에서 상담사 개입 방식 자체에 불만"], "recommendation": "해석을 한 발 물러서고, 내담자가 직접 어떻게 느끼는지 다시 물어보세요"}

예시 3 — None (rupture 없음):
대화:
1. [상담사] 그때 어떤 마음이 드셨어요?
2. [내담자] 좀 외롭다는 생각이 들었어요. 다 저만 빼고 잘 살고 있는 것 같아서요.
3. [상담사] 외로움을 그렇게 표현해 주셔서 감사해요.
4. [내담자] 네, 처음 말해보네요 이런 얘기.
판정: {"rupture_type": "none", "intensity": 2, "evidence": ["내담자가 자기 개방하고 있음", "감정 언어 풍부"], "recommendation": ""}

[출력 형식 — 반드시 valid JSON]
{
  "rupture_type": "withdrawal" | "confrontation" | "none",
  "intensity": 0~10 정수,
  "intensity_reasoning": "왜 이 강도인지 (신호 개수, 빈도, 시간 흐름 등) — 1~2문장",
  "evidence": ["근거가 된 발화 번호와 이유 (2~3개)"],
  "recommendation": "상담사를 위한 repair 방향 1줄"
}

[주의사항]
- 단일 발화가 아닌 전체 흐름으로 판단하세요
- 강도 7 이상일 때만 의미있는 알림으로 처리됩니다
- 한국 문화적 맥락 고려: "괜찮아요"는 실제로 괜찮지 않을 수 있음
- 응답은 JSON 객체 하나만, 마크다운 코드블록 없이 출력하세요"""


def _format_window(window: list[dict], start_idx: int) -> str:
    lines = []
    for i, seg in enumerate(window):
        speaker = "상담사" if seg.get("speaker") == "counselor" else "내담자"
        lines.append(f"{start_idx + i + 1}. [{speaker}] {seg.get('text', '')}")
    return "\n".join(lines)


def _strip_code_fence(text: str) -> str:
    s = text.strip()
    if s.startswith("```json"):
        s = s[len("```json"):].strip()
    elif s.startswith("```"):
        s = s[len("```"):].strip()
    if s.endswith("```"):
        s = s[:-3].strip()
    return s


class RupturePipeline:
    def __init__(self, llm: LLMProvider):
        self.llm = llm

    async def _analyze_window(self, window: list[dict], start_idx: int) -> dict | None:
        conversation = _format_window(window, start_idx)
        try:
            response = await self.llm.call(SYSTEM_PROMPT, conversation, max_tokens=512)
        except Exception as e:
            print(f"[TrackD] Window {start_idx} LLM call failed: {e}")
            return None
        try:
            return json.loads(_strip_code_fence(response))
        except json.JSONDecodeError as e:
            print(f"[TrackD] Window {start_idx} JSON parse failed: {e} | raw: {response[:200]}")
            return None

    async def detect(
        self,
        segments: list[dict],
        window_size: int = WINDOW_SIZE,
        step: int = STEP,
        min_intensity: int = MIN_INTENSITY,
    ) -> list[dict]:
        if not segments or len(segments) < window_size:
            print(f"[TrackD] Skipped — segments({len(segments) if segments else 0}) < window({window_size})")
            return []

        events: list[dict] = []
        for i in range(0, len(segments) - window_size + 1, step):
            window = segments[i : i + window_size]
            result = await self._analyze_window(window, i)
            if result is None:
                continue

            rupture_type = result.get("rupture_type", "none")
            intensity = result.get("intensity", 0)
            if rupture_type == "none" or not isinstance(intensity, (int, float)) or intensity < min_intensity:
                continue

            events.append(
                {
                    "rupture_type": rupture_type,
                    "intensity": int(intensity),
                    "intensity_reasoning": result.get("intensity_reasoning", "") or "",
                    "evidence": result.get("evidence", []) or [],
                    "recommendation": result.get("recommendation", "") or "",
                    "window_start_idx": i,
                    "window_end_idx": i + window_size - 1,
                    "window_start_time": float(window[0].get("start", 0)),
                    "window_end_time": float(window[-1].get("end", 0)),
                }
            )
            print(
                f"[TrackD] Detected {rupture_type} (intensity={intensity}) at segments {i}~{i + window_size - 1}"
            )

        return self._merge_consecutive(events)

    @staticmethod
    def _merge_consecutive(events: list[dict]) -> list[dict]:
        if not events:
            return []
        merged = [events[0]]
        for cur in events[1:]:
            last = merged[-1]
            if (
                cur["rupture_type"] == last["rupture_type"]
                and cur["window_start_idx"] <= last["window_end_idx"]
            ):
                last["window_end_idx"] = max(last["window_end_idx"], cur["window_end_idx"])
                last["window_end_time"] = max(last["window_end_time"], cur["window_end_time"])
                last["intensity"] = max(last["intensity"], cur["intensity"])
                last["evidence"] = list({*last["evidence"], *cur["evidence"]})
            else:
                merged.append(cur)
        return merged
