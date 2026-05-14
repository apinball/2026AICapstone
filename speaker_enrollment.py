"""
speaker_enrollment.py — ML 기반 화자 분리 실험 스크립트
=========================================================
사용법:
  python speaker_enrollment.py \\
      --speaker_a 화자A.wav \\
      --speaker_b 화자B.wav \\
      --test 상담오디오.wav

동작 원리:
  1. 화자 A, B의 등록 발화에서 MFCC 특징 벡터 추출 → 평균 "목소리 지문" 생성
  2. 테스트 오디오를 짧은 세그먼트로 분할
  3. 각 세그먼트의 MFCC를 A, B 지문과 코사인 유사도 비교
  4. 더 유사한 화자로 분류

필요 라이브러리 (requirements.txt에 이미 있음):
  librosa, numpy, soundfile
"""

import argparse
import os
import sys

import librosa
import numpy as np
import soundfile as sf

# ── 설정 상수 ────────────────────────────────────────────────────────────────

SAMPLE_RATE = 16000          # 통일 샘플레이트
N_MFCC = 40                  # MFCC 계수 개수 (많을수록 세밀, 13~40 일반적)
HOP_LENGTH = 512             # STFT hop size
SEGMENT_DURATION = 1.5       # 테스트 오디오 분할 단위 (초)
MIN_SEGMENT_ENERGY = 0.001   # 묵음 세그먼트 필터링 임계값 (RMS)


# ── 유틸리티 함수 ─────────────────────────────────────────────────────────────

def load_audio(path: str) -> np.ndarray:
    """오디오 파일을 로드하고 모노 16kHz로 변환."""
    if not os.path.exists(path):
        print(f"[ERROR] 파일을 찾을 수 없습니다: {path}")
        sys.exit(1)

    audio, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    duration = len(audio) / SAMPLE_RATE
    print(f"  로드 완료: {path} ({duration:.1f}초, sr={SAMPLE_RATE})")
    return audio


def extract_mfcc(audio: np.ndarray) -> np.ndarray:
    """
    오디오에서 MFCC 특징 벡터를 추출.
    반환: shape (N_MFCC,) — 시간 축 평균값 (mean pooling)
    """
    mfcc = librosa.feature.mfcc(
        y=audio,
        sr=SAMPLE_RATE,
        n_mfcc=N_MFCC,
        hop_length=HOP_LENGTH,
    )
    # Delta (1차 미분) — 시간적 변화 정보 추가
    delta = librosa.feature.delta(mfcc)

    # MFCC + Delta 결합 후 시간 축 평균 → 고정 길이 벡터
    combined = np.concatenate([mfcc, delta], axis=0)  # (N_MFCC*2, T)
    return np.mean(combined, axis=1)                   # (N_MFCC*2,)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """두 벡터의 코사인 유사도 계산 (−1 ~ 1, 높을수록 유사)."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def is_silence(audio_segment: np.ndarray) -> bool:
    """RMS 에너지 기반 묵음 감지."""
    rms = np.sqrt(np.mean(audio_segment ** 2))
    return rms < MIN_SEGMENT_ENERGY


# ── 핵심 클래스 ───────────────────────────────────────────────────────────────

class SpeakerEnroller:
    """
    화자 등록(enrollment)과 식별(identification)을 담당하는 클래스.

    ML 원리:
      - 각 화자의 등록 발화에서 여러 프레임의 MFCC를 추출
      - 프레임 평균을 "화자 대표 벡터 (centroid)"로 저장
      - 테스트 세그먼트와의 코사인 유사도로 화자 결정
    """

    def __init__(self):
        self.speaker_profiles: dict[str, np.ndarray] = {}

    def enroll(self, speaker_name: str, audio_path: str) -> None:
        """
        화자 등록: 등록 발화에서 여러 윈도우를 추출하고 평균 지문 생성.
        짧은 발화 하나만 쓰는 것보다 윈도우 앙상블이 더 안정적.
        """
        print(f"\n[등록] 화자 '{speaker_name}' 등록 중...")
        audio = load_audio(audio_path)

        # 등록 발화를 0.5초 윈도우로 분할해 여러 MFCC 추출
        window_size = int(SAMPLE_RATE * 0.5)
        vectors = []

        for start in range(0, len(audio) - window_size, window_size // 2):
            window = audio[start: start + window_size]
            if not is_silence(window):
                vec = extract_mfcc(window)
                vectors.append(vec)

        if not vectors:
            print(f"  [경고] '{speaker_name}' 등록 발화에서 유효한 음성이 감지되지 않았습니다.")
            return

        # 모든 윈도우의 평균 → 대표 지문
        profile = np.mean(vectors, axis=0)
        self.speaker_profiles[speaker_name] = profile
        print(f"  완료: {len(vectors)}개 윈도우에서 지문 생성 (벡터 크기: {profile.shape[0]})")

    def identify(self, audio_segment: np.ndarray) -> tuple[str, float, dict]:
        """
        오디오 세그먼트가 어떤 등록 화자인지 식별.

        반환:
          - 화자 이름 (str)
          - 확신도 (float, 0~1)
          - 전체 화자별 유사도 dict
        """
        if not self.speaker_profiles:
            return "unknown", 0.0, {}

        if is_silence(audio_segment):
            return "silence", 0.0, {}

        seg_vector = extract_mfcc(audio_segment)

        similarities = {}
        for name, profile in self.speaker_profiles.items():
            sim = cosine_similarity(seg_vector, profile)
            similarities[name] = sim

        # 가장 유사한 화자 선택
        best_speaker = max(similarities, key=similarities.get)
        best_score = similarities[best_speaker]

        # 확신도: 1위와 2위의 차이가 클수록 확신도 높음
        scores = sorted(similarities.values(), reverse=True)
        if len(scores) >= 2:
            confidence = (scores[0] - scores[1] + 1) / 2  # 0~1 정규화
        else:
            confidence = (best_score + 1) / 2

        return best_speaker, round(confidence, 4), similarities

    def diarize(self, audio_path: str) -> list[dict]:
        """
        테스트 오디오 전체를 세그먼트로 분할하고 화자를 식별.

        반환: [{"start": float, "end": float, "speaker": str, "confidence": float}, ...]
        """
        print(f"\n[분석] 화자 분리 진행 중: {audio_path}")
        audio = load_audio(audio_path)

        segment_size = int(SAMPLE_RATE * SEGMENT_DURATION)
        results = []

        total_segments = (len(audio) - 1) // segment_size + 1
        print(f"  총 {total_segments}개 세그먼트 분석 ({SEGMENT_DURATION}초 단위)...")

        for i, start in enumerate(range(0, len(audio), segment_size)):
            end = min(start + segment_size, len(audio))
            segment = audio[start:end]

            start_sec = start / SAMPLE_RATE
            end_sec = end / SAMPLE_RATE

            speaker, confidence, similarities = self.identify(segment)

            results.append({
                "start": round(start_sec, 2),
                "end": round(end_sec, 2),
                "speaker": speaker,
                "confidence": confidence,
                "similarities": {k: round(v, 4) for k, v in similarities.items()},
            })

        return results


# ── 결과 출력 ────────────────────────────────────────────────────────────────

def print_results(results: list[dict], speaker_a: str, speaker_b: str) -> None:
    """분석 결과를 보기 좋게 출력."""

    print("\n" + "=" * 60)
    print("  화자 분리 결과")
    print("=" * 60)
    print(f"  {'시작':>6}  {'종료':>6}  {'화자':<12}  {'확신도':>6}  유사도 상세")
    print("-" * 60)

    speaker_durations: dict[str, float] = {}

    for seg in results:
        if seg["speaker"] == "silence":
            continue

        duration = seg["end"] - seg["start"]
        speaker_durations[seg["speaker"]] = (
            speaker_durations.get(seg["speaker"], 0.0) + duration
        )

        sim_str = "  ".join(
            f"{k}={v:+.3f}" for k, v in seg["similarities"].items()
        )
        print(
            f"  {seg['start']:>5.1f}s ~ {seg['end']:>5.1f}s  "
            f"{seg['speaker']:<12}  {seg['confidence']:>5.1%}  {sim_str}"
        )

    print("=" * 60)

    # 화자별 발화 비율
    total = sum(speaker_durations.values()) or 1
    print("\n  [발화 비율]")
    for name, dur in sorted(speaker_durations.items()):
        bar = "█" * int(dur / total * 30)
        print(f"  {name:<12} {dur:>5.1f}초  {bar} {dur/total:.1%}")

    # 성능 평가 안내
    print("\n  [성능 평가 팁]")
    print("  - 확신도가 낮은 구간(< 60%)은 경계 발화일 가능성이 높음")
    print("  - 실제 라벨과 비교하려면 --label 옵션 추가 예정")
    print("=" * 60)


def evaluate_accuracy(results: list[dict], label_path: str) -> None:
    """
    정답 라벨 파일이 있을 경우 정확도 계산.
    라벨 파일 형식 (CSV):
      start,end,speaker
      0.0,1.5,speaker_a
      1.5,3.0,speaker_b
      ...
    """
    import csv

    labels = []
    with open(label_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            labels.append({
                "start": float(row["start"]),
                "end": float(row["end"]),
                "speaker": row["speaker"].strip(),
            })

    correct = 0
    total = 0

    for seg in results:
        if seg["speaker"] in ("silence", "unknown"):
            continue

        seg_mid = (seg["start"] + seg["end"]) / 2

        # 세그먼트 중간 시점이 속하는 정답 구간 찾기
        gt_speaker = None
        for label in labels:
            if label["start"] <= seg_mid < label["end"]:
                gt_speaker = label["speaker"]
                break

        if gt_speaker is None:
            continue

        total += 1
        if seg["speaker"] == gt_speaker:
            correct += 1

    if total == 0:
        print("\n  [정확도] 비교 가능한 구간 없음")
        return

    accuracy = correct / total
    print(f"\n  [정확도] {correct}/{total} = {accuracy:.1%}")


# ── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="ML 기반 화자 분리 실험 — Speaker Enrollment & Diarization",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  # 기본 실행
  python speaker_enrollment.py --speaker_a a.wav --speaker_b b.wav --test test.wav

  # 화자 이름 지정
  python speaker_enrollment.py --speaker_a a.wav --speaker_b b.wav --test test.wav \\
      --name_a 상담사 --name_b 내담자

  # 정확도 평가 (라벨 파일 있을 때)
  python speaker_enrollment.py --speaker_a a.wav --speaker_b b.wav --test test.wav \\
      --label labels.csv
        """,
    )
    parser.add_argument("--speaker_a", required=True, help="화자 A 등록 발화 파일 (.wav/.mp3 등)")
    parser.add_argument("--speaker_b", required=True, help="화자 B 등록 발화 파일 (.wav/.mp3 등)")
    parser.add_argument("--test",      required=False, default=None, help="분석할 상담 오디오 파일")
    parser.add_argument("--name_a",    default="speaker_a", help="화자 A 이름 (기본: speaker_a)")
    parser.add_argument("--name_b",    default="speaker_b", help="화자 B 이름 (기본: speaker_b)")
    parser.add_argument("--label",     default=None,        help="정답 라벨 CSV 파일 (선택)")
    parser.add_argument("--segment",   type=float, default=1.5,
                        help="세그먼트 길이 초 (기본: 1.5)")

    args = parser.parse_args()

    # 세그먼트 길이 반영
    global SEGMENT_DURATION
    SEGMENT_DURATION = args.segment

    print("=" * 60)
    print("  ML 기반 화자 분리 실험")
    print("  방식: MFCC + Delta → 코사인 유사도")
    print("=" * 60)

    # 1. 화자 등록
    enroller = SpeakerEnroller()
    enroller.enroll(args.name_a, args.speaker_a)
    enroller.enroll(args.name_b, args.speaker_b)

    if len(enroller.speaker_profiles) < 2:
        print("[ERROR] 화자 등록에 실패했습니다. 오디오 파일을 확인하세요.")
        sys.exit(1)

    # 2. 화자 분리
    if not args.test:
        print("\n[완료] 화자 등록만 완료. --test 파일을 추가하면 분리 분석을 진행합니다.")
        return
    results = enroller.diarize(args.test)

    # 3. 결과 출력
    print_results(results, args.name_a, args.name_b)

    # 4. 정확도 평가 (라벨 있을 때)
    if args.label:
        evaluate_accuracy(results, args.label)

    print("\n완료!")


if __name__ == "__main__":
    main()
