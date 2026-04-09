"""
Track C — 멀티모달 Late Fusion (텍스트 감성 + 음향 감정 결합)
  방식: 가중 평균 (Weighted Average)
    - acoustic_weight = 0.6  (음향이 반어법 등 표정/톤 정보 더 잘 반영)
    - text_weight    = 0.4
  감정 불일치 감지: 텍스트가 긍정인데 음향이 부정이면 "sarcasm" 플래그
"""

from typing import Tuple

EMOTION_TO_VALENCE = {
    "joy": 1.0,
    "surprise": 0.5,
    "neutral": 0.0,
    "sadness": -0.5,
    "fear": -0.7,
    "disgust": -0.8,
    "anger": -1.0,
    # RoBERTa 레이블
    "positive": 1.0,
    "negative": -1.0,
}

TEXT_WEIGHT = 0.4
ACOUSTIC_WEIGHT = 0.6
SARCASM_THRESHOLD = 1.2  # |text_valence - acoustic_valence| > 이 값이면 불일치


def _dominant_text_emotion(segments: list[dict]) -> Tuple[str, float]:
    """세그먼트 중 등장 빈도가 가장 높은 감정과 평균 점수 반환."""
    counts: dict[str, list[float]] = {}
    for seg in segments:
        e = seg.get("text_emotion", "neutral")
        s = seg.get("text_emotion_score", 0.5)
        counts.setdefault(e, []).append(s)

    if not counts:
        return "neutral", 0.5

    dominant = max(counts, key=lambda k: len(counts[k]))
    avg_score = sum(counts[dominant]) / len(counts[dominant])
    return dominant, round(avg_score, 4)


class FusionPipeline:
    def run(
        self,
        text_segments: list[dict],
        acoustic_emotion: str,
        acoustic_score: float,
    ) -> Tuple[str, float]:
        """
        Returns: (final_emotion: str, confidence: float)
        """
        text_emotion, text_score = _dominant_text_emotion(text_segments)

        text_valence = EMOTION_TO_VALENCE.get(text_emotion, 0.0)
        acoustic_valence = EMOTION_TO_VALENCE.get(acoustic_emotion, 0.0)

        # 불일치 감지 (반어/비꼬기)
        discord = abs(text_valence - acoustic_valence)
        if discord >= SARCASM_THRESHOLD:
            print(
                f"[TrackC] Modality discord detected! "
                f"text={text_emotion}({text_valence:.1f}), "
                f"acoustic={acoustic_emotion}({acoustic_valence:.1f}) → sarcasm"
            )
            return "sarcasm", round((text_score * TEXT_WEIGHT + acoustic_score * ACOUSTIC_WEIGHT), 4)

        # 가중 평균 발랑스
        fused_valence = text_valence * TEXT_WEIGHT + acoustic_valence * ACOUSTIC_WEIGHT
        fused_score = text_score * TEXT_WEIGHT + acoustic_score * ACOUSTIC_WEIGHT

        # 발랑스 → 감정 레이블 매핑
        final_emotion = _valence_to_label(fused_valence)

        print(
            f"[TrackC] text={text_emotion}, acoustic={acoustic_emotion} "
            f"→ fused={final_emotion} ({fused_score:.3f})"
        )
        return final_emotion, round(fused_score, 4)


def _valence_to_label(v: float) -> str:
    if v >= 0.7:
        return "joy"
    if v >= 0.2:
        return "surprise"
    if v >= -0.2:
        return "neutral"
    if v >= -0.6:
        return "sadness"
    if v >= -0.85:
        return "fear"
    return "anger"
