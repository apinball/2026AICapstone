"""
개인정보 비식별화 (PII Redaction)
인터뷰 인사이트:
  - "이름, 주소 등 식별 정보를 제거하는 익명화 절차를 철저하게"
  - 슈퍼바이저 보고서 작성 시 수동 비식별화 작업 (현재 30분~2시간 소요)

LLM 기반 — 문맥 인식이 가능해 룰 기반보다 정확.
배치 처리로 LLM 호출 횟수 최소화.
"""

import json
from llm.base import LLMProvider


REDACTION_PROMPT = """당신은 개인정보 비식별화 전문가입니다.
아래 상담 대화 발화 목록에서 개인 식별 정보를 다음 토큰으로 치환하세요.

[치환 토큰]
- 사람 이름 → 본인을 지칭하면 [내담자], 가족이면 [가족], 그 외 제3자는 [지인]
- 학교명/대학명 → [학교]
- 회사명/직장 → [직장]
- 지명/주소 → [지명]
- 전화번호 → [전화번호]
- 이메일 → [이메일]
- 구체적인 생년월일 → [날짜]

[Few-shot 예시]
입력:
1. [상담사] 김지우님, 안녕하세요.
2. [내담자] 네, 안녕하세요.
3. [내담자] 저번에 말씀드린 그 한성대 동기 박서연이랑 또 싸웠어요.
4. [내담자] 엄마는 그냥 무시하라고만 하시고요.
5. [상담사] 박서연 씨 말고 다른 분과는 괜찮으세요?
6. [내담자] 네, 그건 괜찮아요. 강남에 있는 카페에서 자주 만나요.
출력:
{
  "redacted": [
    "[내담자]님, 안녕하세요.",
    "네, 안녕하세요.",
    "저번에 말씀드린 그 [학교] 동기 [지인]이랑 또 싸웠어요.",
    "엄마는 그냥 무시하라고만 하시고요.",
    "[지인] 씨 말고 다른 분과는 괜찮으세요?",
    "네, 그건 괜찮아요. [지명]에 있는 카페에서 자주 만나요."
  ]
}

[입력 형식]
번호. [화자] 발화
...

[출력 형식 — 반드시 valid JSON]
{
  "redacted": [
    "1번 발화의 비식별화 버전",
    "2번 발화의 비식별화 버전",
    ...
  ]
}

[주의사항]
- 발화 순서와 개수를 입력과 정확히 동일하게 유지
- 식별 정보가 없으면 원본 그대로
- 일반 호칭(어머니, 엄마, 아빠, 친구, 동기 등)은 그대로 둠 — 이름이 명시될 때만 치환
- 같은 사람을 여러 번 언급해도 동일한 토큰 사용 (이름 ≠ 다른 사람)
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


class RedactionPipeline:
    def __init__(self, llm: LLMProvider, batch_size: int = 20):
        self.llm = llm
        self.batch_size = batch_size

    async def _redact_batch(self, batch: list[dict], offset: int) -> list[str] | None:
        prompt_input = "\n".join(
            f"{offset + i + 1}. [{'상담사' if s.get('speaker') == 'counselor' else '내담자'}] {s.get('text', '')}"
            for i, s in enumerate(batch)
        )
        try:
            response = await self.llm.call(REDACTION_PROMPT, prompt_input, max_tokens=2000)
        except Exception as e:
            print(f"[Redaction] Batch {offset} LLM call failed: {e}")
            return None
        try:
            parsed = json.loads(_strip_code_fence(response))
            redacted = parsed.get("redacted", [])
            if not isinstance(redacted, list) or len(redacted) != len(batch):
                print(f"[Redaction] Batch {offset} length mismatch: got {len(redacted)} vs expected {len(batch)}")
                return None
            return [str(t) for t in redacted]
        except json.JSONDecodeError as e:
            print(f"[Redaction] Batch {offset} JSON parse failed: {e}")
            return None

    async def redact(self, segments: list[dict]) -> list[str]:
        """
        Returns: 입력 segments와 동일 길이의 redacted text 리스트.
                 실패한 배치는 원본 텍스트를 그대로 반환.
        """
        if not segments:
            return []

        results: list[str] = [s.get("text", "") for s in segments]

        for offset in range(0, len(segments), self.batch_size):
            batch = segments[offset : offset + self.batch_size]
            redacted = await self._redact_batch(batch, offset)
            if redacted is not None:
                for i, text in enumerate(redacted):
                    results[offset + i] = text

        return results
