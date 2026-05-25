"""
LLM 기반 상담 내용 요약 — 슈퍼바이저 보고서용
인터뷰 인사이트 반영:
  - 50분 상담 → 보고서 2시간 작성 부담 해소
  - 비식별화 (이름/소속을 토큰으로 치환)
"""

import json
from llm.base import LLMProvider


SUMMARY_PROMPT = """당신은 심리상담 전문가입니다.
아래 상담 대화를 분석하여 슈퍼바이저 보고용 요약을 작성하세요.

[출력 형식 — 반드시 valid JSON]
{
  "headline": "이번 회기를 한 줄로 요약 (50자 이내)",
  "main_topics": ["다뤄진 주요 주제 3~5개"],
  "client_issues": ["내담자가 호소한 문제 2~4개"],
  "counselor_approach": "상담사의 개입 방식과 강점/한계 (2~3문장)",
  "emotional_flow": "내담자의 정서 흐름과 변화 (2~3문장)",
  "action_items": ["다음 회기 권장사항 또는 후속 작업 2~3개"]
}

[예시]
입력: "[내담자] 요즘 잠을 못 자요. 동기들 다 취업 준비하는데 저만 뒤처지는 것 같아서. ..."
출력:
{
  "headline": "타인 비교로 인한 불안과 수면 장애를 호소함",
  "main_topics": ["진로/취업 불안", "수면 장애", "자기 비교"],
  "client_issues": ["동기들과의 비교로 인한 상대적 박탈감", "잠들기 어려움 — 잡생각 반복", "자존감 저하"],
  "counselor_approach": "상담사는 감정 반영 기법을 통해 라포 형성에 집중함. 다만 후반부에 닫힌 질문이 다소 많아 탐색 깊이가 제한됨.",
  "emotional_flow": "초반에는 위축된 어조로 회피했으나, 중반 이후 자기 개방이 늘면서 감정 표현이 풍부해졌음. 종결부에서는 안정감을 되찾는 양상.",
  "action_items": ["인지 재구조화 — '비교'에서 '나의 페이스'로 초점 전환 시도", "수면 위생 점검 (취침 전 스마트폰 사용 등)", "다음 회기에 진로 탐색 척도 활용 고려"]
}

[주의사항]
- 비식별화: 이름/소속 등 식별 정보는 [내담자]/[가족]/[학교]/[지명] 같은 토큰으로 치환하세요
- 한국 상담 맥락 고려: "괜찮아요"가 실제 괜찮음을 뜻하지 않을 수 있음
- 객관적이고 임상적인 어투 유지 (구어체 X)
- 상담사가 슈퍼바이저에게 보고할 수 있을 정도의 전문성
- JSON 객체 하나만 출력, 마크다운 코드블록 없이"""


def _strip_code_fence(text: str) -> str:
    s = text.strip()
    if s.startswith("```json"):
        s = s[len("```json"):].strip()
    elif s.startswith("```"):
        s = s[len("```"):].strip()
    if s.endswith("```"):
        s = s[:-3].strip()
    return s


class SummaryPipeline:
    def __init__(self, llm: LLMProvider):
        self.llm = llm

    async def summarize(self, segments: list[dict]) -> dict:
        if not segments:
            return {
                "headline": "",
                "main_topics": [],
                "client_issues": [],
                "counselor_approach": "",
                "emotional_flow": "",
                "action_items": [],
            }

        conversation = "\n".join(
            f"[{'상담사' if s.get('speaker') == 'counselor' else '내담자'}] {s.get('text', '')}"
            for s in segments
        )

        response = await self.llm.call(SUMMARY_PROMPT, conversation, max_tokens=1500)
        cleaned = _strip_code_fence(response)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"[Summary] JSON parse failed: {e} | raw: {response[:300]}")
            raise
