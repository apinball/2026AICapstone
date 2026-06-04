"""
인지왜곡 자동 탐지 (Cognitive Distortion Detection)
이론적 배경: Aaron Beck의 인지치료(CT) + David Burns 11가지 왜곡 분류

내담자 발화에서 인지왜곡 패턴을 식별하고 임상적 강도를 평가.
상담사가 CBT 개입을 적용할 수 있도록 권장 개입 기법도 함께 제시.
"""

import json
from llm.base import LLMProvider


BATCH_SIZE = 10
MIN_INTENSITY = 5  # 5 이상만 임상적으로 의미있는 왜곡으로 간주

DISTORTION_TYPES = {
    "all_or_nothing": "흑백사고 — 모 아니면 도, 완벽 아니면 실패",
    "overgeneralization": "과잉일반화 — 한 사건으로 전체 단정",
    "mental_filter": "정신적 필터링 — 부정적 측면만 선택적으로 주목",
    "disqualifying_positive": "긍정 무시 — 긍정 경험을 우연/예외로 평가절하",
    "jumping_to_conclusions": "결론 도약 — 근거 없이 결론 (독심술/점치기 포함)",
    "catastrophizing": "재앙화 — 최악의 결과 확신",
    "minimization": "축소화 — 자기 강점/타인 결점 작게 봄",
    "emotional_reasoning": "감정적 추론 — 감정을 사실로 동일시",
    "should_statements": "당위적 사고 — '반드시/절대' 규칙 강요",
    "labeling": "낙인찍기 — 자신/타인 단정적 명칭 (나는 실패자)",
    "personalization": "개인화 — 자기 책임 아닌 일을 자기 탓",
}


SYSTEM_PROMPT = """당신은 인지치료(Cognitive Therapy) 전문가입니다.
Aaron Beck과 David Burns의 인지왜곡 이론을 기반으로 내담자 발화에서 인지왜곡 패턴을 식별하세요.

[11가지 인지왜곡 유형]
1. all_or_nothing (흑백사고): "완벽하지 않으면 실패다"
2. overgeneralization (과잉일반화): "한 번 차였으니 평생 연애 못할 거다"
3. mental_filter (정신적 필터링): "칭찬은 안 들리고 비판만 떠올라요"
4. disqualifying_positive (긍정 무시): "그건 그냥 운이 좋았을 뿐이에요"
5. jumping_to_conclusions (결론 도약): "그 사람이 분명 저를 한심하게 봤을 거예요" (독심술/점치기)
6. catastrophizing (재앙화): "이번 시험 망치면 인생이 끝나요"
7. minimization (축소화): "내 단점은 크고 장점은 별거 아니에요"
8. emotional_reasoning (감정적 추론): "불안하니까 진짜 위험한 상황이에요"
9. should_statements (당위적 사고): "남자는 절대 울면 안 돼요"
10. labeling (낙인찍기): "저는 그냥 실패자예요"
11. personalization (개인화): "엄마가 우울한 건 다 제 탓이에요"

[Few-shot 예시]

발화: "이번 발표 망치면 다 끝나요. 동기들도 다 비웃을 거고 교수님도 저를 한심하게 보실 거예요."
판정:
{
  "segment_idx": 0,
  "distortion_types": ["catastrophizing", "jumping_to_conclusions"],
  "intensity": 8,
  "explanation": "발표 실패를 인생 종말로 확대(재앙화), 타인의 평가를 근거 없이 단정(독심술)",
  "suggested_intervention": "증거 검토 기법: '동기들이 정말 비웃은 객관적 증거가 있나요? 발표가 인생의 전부인가요?'"
}

발화: "그 칭찬은 그냥 인사치레예요. 진짜 잘했으면 다른 사람들이 더 칭찬했겠죠."
판정:
{
  "segment_idx": 0,
  "distortion_types": ["disqualifying_positive", "mental_filter"],
  "intensity": 7,
  "explanation": "긍정적 피드백을 인사치레로 평가절하, 부정적 가능성에만 집중",
  "suggested_intervention": "긍정 일지 작성: 일주일간 받은 칭찬을 모두 기록하고 진정성 여부를 객관적으로 평가하기"
}

발화: "엄마가 화내신 건 다 제가 못나서 그래요. 제가 더 잘했으면 안 그러셨을 거예요."
판정:
{
  "segment_idx": 0,
  "distortion_types": ["personalization", "should_statements"],
  "intensity": 8,
  "explanation": "엄마의 감정을 자기 책임으로 전적 귀인(개인화), '내가 더 잘했어야'라는 당위적 사고",
  "suggested_intervention": "책임 파이 차트: 엄마의 감정에 영향을 줄 수 있는 모든 요인(직장, 건강, 인간관계 등)을 나열하고 본인 책임 비중을 시각화"
}

발화: "그냥 평소처럼 점심 먹고 왔어요."
판정:
{
  "segment_idx": 0,
  "distortion_types": [],
  "intensity": 0,
  "explanation": "특별한 인지왜곡 없음 - 사실 기술",
  "suggested_intervention": ""
}

[출력 형식 — 반드시 valid JSON 배열]
{
  "distortions": [
    {
      "segment_idx": 정수,
      "distortion_types": ["유형1", "유형2"],
      "intensity": 0~10 정수,
      "intensity_reasoning": "왜 이 강도인지 (왜곡 신호의 명시성, 자기 신념과의 결합 정도 등) — 1문장",
      "explanation": "왜 그 유형으로 판단했는지 발화의 어떤 부분을 근거로 했는지 1~2문장",
      "suggested_intervention": "상담사가 적용할 수 있는 CBT 개입 기법 1줄 (구체적으로)"
    }
  ]
}

[주의사항]
- 내담자 발화에서만 탐지 (상담사 발화는 무시)
- 인지왜곡이 없으면 distortions 배열에서 제외
- 강도 5 이상일 때만 임상적으로 의미있음
- 단일 발화가 너무 짧거나 사실 기술뿐이면 왜곡 없음으로 처리
- distortion_types는 위 11개 영문 키만 사용
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


class CognitiveDistortionPipeline:
    def __init__(self, llm: LLMProvider, batch_size: int = BATCH_SIZE):
        self.llm = llm
        self.batch_size = batch_size

    async def _analyze_batch(self, batch: list[tuple[int, dict]]) -> list[dict]:
        """batch: [(original_segment_idx, segment_dict), ...]"""
        prompt_input = "\n".join(
            f"{orig_idx}. {seg.get('text', '')}"
            for orig_idx, seg in batch
        )

        try:
            response = await self.llm.call(SYSTEM_PROMPT, prompt_input, max_tokens=1500)
        except Exception as e:
            print(f"[CBT] Batch LLM call failed: {e}")
            return []

        try:
            parsed = json.loads(_strip_code_fence(response))
            return parsed.get("distortions", []) or []
        except json.JSONDecodeError as e:
            print(f"[CBT] JSON parse failed: {e} | raw: {response[:200]}")
            return []

    async def detect(
        self,
        segments: list[dict],
        min_intensity: int = MIN_INTENSITY,
    ) -> list[dict]:
        """
        내담자 발화에서 인지왜곡 탐지.
        Returns: [{segment_idx, distortion_types, intensity, explanation, suggested_intervention}, ...]
        """
        if not segments:
            return []

        # 내담자 발화만 추출
        client_segments = [
            (i, s) for i, s in enumerate(segments)
            if s.get("speaker") == "client" and s.get("text", "").strip()
        ]
        print(f"[CBT] Analyzing {len(client_segments)} client utterances")

        results: list[dict] = []
        for offset in range(0, len(client_segments), self.batch_size):
            batch = client_segments[offset : offset + self.batch_size]
            distortions = await self._analyze_batch(batch)
            for d in distortions:
                intensity = d.get("intensity", 0)
                if not isinstance(intensity, (int, float)) or intensity < min_intensity:
                    continue
                if not d.get("distortion_types"):
                    continue
                results.append({
                    "segment_idx": int(d.get("segment_idx", -1)),
                    "distortion_types": d.get("distortion_types", []),
                    "intensity": int(intensity),
                    "intensity_reasoning": d.get("intensity_reasoning", ""),
                    "explanation": d.get("explanation", ""),
                    "suggested_intervention": d.get("suggested_intervention", ""),
                })
                print(f"[CBT] Detected {d.get('distortion_types')} (intensity={intensity}) at seg {d.get('segment_idx')}")

        return results
