"""
CBT 워크시트 자동 생성 (Cognitive Behavioral Therapy Worksheet Generator)

감지된 인지왜곡에 대해 표준 CBT 양식의 사고 기록지(Thought Record)를 자동 생성.
- 자동적 사고 (Automatic Thought)
- 뒷받침 증거 (Supporting Evidence)
- 반박 증거 (Counter Evidence)
- 균형잡힌 사고 (Balanced Thought)
- 감정 변화 (Emotional Change)

이론적 배경: Aaron Beck의 Thought Record + David Burns의 Triple Column Technique
"""

import json
from llm.base import LLMProvider


WORKSHEET_PROMPT = """당신은 인지행동치료(CBT) 전문가입니다.
감지된 인지왜곡에 대해 Aaron Beck의 표준 사고기록지(Thought Record) 양식의 워크시트를 작성하세요.

[입력]
내담자 발화와 그 발화에서 감지된 인지왜곡 유형/근거.

[출력 형식 — 반드시 valid JSON]
{
  "worksheets": [
    {
      "based_on_segment": 발화 번호,
      "situation": "발화가 일어난 상황 추정 (1문장)",
      "automatic_thought": "자동적 사고 — 내담자 발화의 핵심 인지 (그대로 또는 핵심만)",
      "distortion_types": ["감지된 왜곡 유형"],
      "supporting_evidence": ["사고를 뒷받침할 수 있는 객관적 증거 1~3개"],
      "counter_evidence": ["사고를 반박할 수 있는 객관적 증거 1~3개"],
      "balanced_thought": "위 증거들을 종합한 더 균형잡힌 대안적 사고 (1~2문장)",
      "emotional_shift": "사고 변화 시 예상되는 감정 변화 (예: '불안 8/10 → 4/10')",
      "homework_suggestion": "다음 회기까지 시도할 행동 과제 1줄"
    }
  ]
}

[예시 입력]
발화: "이번 발표 망치면 다 끝나요. 동기들도 다 비웃을 거예요."
왜곡: catastrophizing, jumping_to_conclusions

[예시 출력]
{
  "worksheets": [
    {
      "based_on_segment": 12,
      "situation": "다가오는 발표를 앞두고 불안한 상황",
      "automatic_thought": "발표를 망치면 인생이 끝나고, 동기들이 나를 비웃을 것이다",
      "distortion_types": ["catastrophizing", "jumping_to_conclusions"],
      "supporting_evidence": [
        "발표는 학점에 일정 비중 반영됨",
        "과거에 발표 중 떨었던 경험이 있어 자신감이 낮음"
      ],
      "counter_evidence": [
        "한 번의 발표 실수가 전체 학점/졸업/취업을 결정하지 않는다",
        "동기들도 자신의 발표에 더 신경 쓰고 있어 남의 실수를 오래 기억하지 않는다",
        "과거에 잘 끝낸 발표 경험도 여러 번 있었다"
      ],
      "balanced_thought": "발표가 완벽하지 않을 수 있고 그래도 괜찮다. 한 번의 결과로 내 가치가 결정되지 않으며, 동기들도 내 실수보다 자기 발표를 더 신경 쓴다.",
      "emotional_shift": "불안 8/10 → 5/10, 자기효능감 3/10 → 5/10",
      "homework_suggestion": "발표 전날 균형잡힌 사고를 3번 소리내어 읽고, 발표 후 실제 동기들의 반응을 객관적으로 기록해보기"
    }
  ]
}

[주의사항]
- 증거는 객관적이고 구체적으로 (감정/추측 X)
- 균형잡힌 사고는 부정도 긍정도 아닌 현실적인 톤
- 한국 문화/상담 맥락 고려
- 응답은 JSON 객체 하나만, 마크다운 코드블록 없이"""


def _strip_code_fence(text: str) -> str:
    s = text.strip()
    if s.startswith("```json"):
        s = s[len("```json"):].strip()
    elif s.startswith("```"):
        s = s[len("```"):].strip()
    if s.endswith("```"):
        s = s[:-3].strip()
    return s


class CBTWorksheetPipeline:
    def __init__(self, llm: LLMProvider, max_worksheets: int = 5):
        self.llm = llm
        self.max_worksheets = max_worksheets

    async def generate(
        self,
        segments: list[dict],
        distortions: list[dict],
    ) -> list[dict]:
        """
        강도 높은 top N 인지왜곡에 대해 워크시트 생성.
        """
        if not distortions or not segments:
            return []

        # 강도 내림차순으로 top N 선택
        top_distortions = sorted(distortions, key=lambda d: -d.get("intensity", 0))[: self.max_worksheets]

        worksheets: list[dict] = []
        for d in top_distortions:
            seg_idx = d.get("segment_idx", -1)
            if seg_idx < 0 or seg_idx >= len(segments):
                continue
            seg = segments[seg_idx]

            prompt_input = json.dumps(
                {
                    "segment_idx": seg_idx,
                    "text": seg.get("text", ""),
                    "distortion_types": d.get("distortion_types", []),
                    "explanation": d.get("explanation", ""),
                },
                ensure_ascii=False,
            )

            try:
                response = await self.llm.call(WORKSHEET_PROMPT, prompt_input, max_tokens=1200)
            except Exception as e:
                print(f"[CBT-Worksheet] LLM call failed for seg {seg_idx}: {e}")
                continue

            try:
                parsed = json.loads(_strip_code_fence(response))
                ws_list = parsed.get("worksheets", []) or []
                if ws_list:
                    worksheets.append(ws_list[0])
                    print(f"[CBT-Worksheet] Generated for segment {seg_idx}")
            except json.JSONDecodeError as e:
                print(f"[CBT-Worksheet] JSON parse failed: {e}")
                continue

        return worksheets
