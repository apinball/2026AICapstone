"""
02_feature_audio.py
───────────────────
각 발화 세그먼트에서 오디오 피처를 추출합니다.

추출 피처:
  [전통 핸드크래프트]
  - MFCC (40개) + delta + delta-delta → 120차원
  - Pitch (F0) 통계: mean, std, min, max, range
  - Energy (RMS) 통계
  - Zero Crossing Rate 통계
  - Spectral Centroid / Rolloff / Bandwidth 통계
  - Chroma features (12차원)
  → 합계 ~200차원 핸드크래프트 벡터

  [딥러닝 임베딩]
  - Wav2Vec2 (kresnik/wav2vec2-large-xlsr-korean) → 768차원

출력: outputs/features_audio.pkl (pandas DataFrame)

사용법:
  python 02_feature_audio.py
"""

import json
import pickle
from pathlib import Path

import librosa
import numpy as np
import pandas as pd
import torch
from tqdm import tqdm

from config import (OUTPUT_DIR, SAMPLE_RATE, N_MFCC,
                    HOP_LENGTH, N_FFT, WAV2VEC_MODEL)

TRANSCRIPT_JSON = OUTPUT_DIR / "transcripts.json"
OUT_PKL         = OUTPUT_DIR / "features_audio.pkl"


# ──────────────────────────────────────────────────────────────
# 핸드크래프트 피처
# ──────────────────────────────────────────────────────────────
def _stat(arr: np.ndarray) -> dict:
    """1D 배열에서 통계 피처 추출."""
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {"mean": 0., "std": 0., "min": 0., "max": 0., "range": 0.}
    return {
        "mean":  float(np.mean(arr)),
        "std":   float(np.std(arr)),
        "min":   float(np.min(arr)),
        "max":   float(np.max(arr)),
        "range": float(np.max(arr) - np.min(arr)),
    }


def extract_handcraft(y: np.ndarray, sr: int) -> np.ndarray:
    """
    오디오 신호 y → 핸드크래프트 피처 벡터 반환.
    모든 통계량 flatten → 1D numpy array
    """
    feat = []

    # ── MFCC (40) + delta + delta-delta ────────────────────
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC,
                                  n_fft=N_FFT, hop_length=HOP_LENGTH)
    mfcc_d  = librosa.feature.delta(mfcc)
    mfcc_dd = librosa.feature.delta(mfcc, order=2)
    for coef_matrix in [mfcc, mfcc_d, mfcc_dd]:
        for i in range(coef_matrix.shape[0]):
            s = _stat(coef_matrix[i])
            feat.extend([s["mean"], s["std"], s["min"], s["max"]])
    # → 40 × 3 × 4 = 480차원 (모든 계수 × delta × {mean,std,min,max})
    # 논문 실험에선 mean+std만 쓰는 경우도 많으므로 쉽게 수정 가능

    # ── Pitch (F0) ─────────────────────────────────────────
    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr, hop_length=HOP_LENGTH
    )
    f0_voiced = f0[voiced_flag] if voiced_flag is not None else f0
    f0_voiced = f0_voiced[np.isfinite(f0_voiced)]
    if f0_voiced.size == 0:
        feat.extend([0.] * 5)
    else:
        s = _stat(f0_voiced)
        feat.extend([s["mean"], s["std"], s["min"], s["max"], s["range"]])

    # 유성음 비율
    voiced_ratio = float(voiced_flag.sum() / max(len(voiced_flag), 1)) \
        if voiced_flag is not None else 0.
    feat.append(voiced_ratio)

    # ── Energy (RMS) ────────────────────────────────────────
    rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]
    s = _stat(rms)
    feat.extend([s["mean"], s["std"], s["max"]])

    # ── Zero Crossing Rate ─────────────────────────────────
    zcr = librosa.feature.zero_crossing_rate(y=y, hop_length=HOP_LENGTH)[0]
    s = _stat(zcr)
    feat.extend([s["mean"], s["std"]])

    # ── Spectral features ──────────────────────────────────
    sc  = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=HOP_LENGTH)[0]
    sb  = librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=HOP_LENGTH)[0]
    sr_ = librosa.feature.spectral_rolloff(y=y, sr=sr, hop_length=HOP_LENGTH)[0]
    sf_ = librosa.feature.spectral_flatness(y=y, hop_length=HOP_LENGTH)[0]
    for arr in [sc, sb, sr_, sf_]:
        s = _stat(arr)
        feat.extend([s["mean"], s["std"]])

    # ── Chroma ─────────────────────────────────────────────
    chroma = librosa.feature.chroma_stft(y=y, sr=sr,
                                          n_fft=N_FFT, hop_length=HOP_LENGTH)
    for i in range(chroma.shape[0]):
        feat.append(float(np.mean(chroma[i])))

    # ── Mel-spectrogram 통계 (128 mel bins) ───────────────
    mel = librosa.feature.melspectrogram(y=y, sr=sr,
                                          n_fft=N_FFT, hop_length=HOP_LENGTH)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    feat.append(float(np.mean(mel_db)))
    feat.append(float(np.std(mel_db)))

    return np.array(feat, dtype=np.float32)


def get_handcraft_feature_names() -> list[str]:
    """핸드크래프트 피처 이름 목록 (디버깅/논문용)."""
    names = []
    for delta_name in ["mfcc", "mfcc_d", "mfcc_dd"]:
        for i in range(N_MFCC):
            for stat in ["mean", "std", "min", "max"]:
                names.append(f"{delta_name}_{i}_{stat}")
    for s in ["mean", "std", "min", "max", "range"]:
        names.append(f"f0_{s}")
    names.append("voiced_ratio")
    for s in ["mean", "std", "max"]:
        names.append(f"rms_{s}")
    for s in ["mean", "std"]:
        names.append(f"zcr_{s}")
    for feat_name in ["sc", "sb", "sr", "sf"]:
        for s in ["mean", "std"]:
            names.append(f"{feat_name}_{s}")
    for i in range(12):
        names.append(f"chroma_{i}")
    names.extend(["mel_mean", "mel_std"])
    return names


# ──────────────────────────────────────────────────────────────
# Wav2Vec2 임베딩
# ──────────────────────────────────────────────────────────────
class Wav2Vec2Embedder:
    """Wav2Vec2로 오디오 세그먼트를 768차원 벡터로 임베딩."""

    def __init__(self):
        from transformers import Wav2Vec2Processor, Wav2Vec2Model
        print(f"Wav2Vec2 로딩: {WAV2VEC_MODEL}")
        self.device    = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = Wav2Vec2Processor.from_pretrained(WAV2VEC_MODEL)
        self.model     = Wav2Vec2Model.from_pretrained(WAV2VEC_MODEL).to(self.device)
        self.model.eval()

    @torch.no_grad()
    def embed(self, y: np.ndarray, sr: int) -> np.ndarray:
        """오디오 → 768차원 평균 풀링 벡터."""
        if sr != SAMPLE_RATE:
            import librosa as _lb
            y = _lb.resample(y, orig_sr=sr, target_sr=SAMPLE_RATE)

        inputs = self.processor(
            y, sampling_rate=SAMPLE_RATE,
            return_tensors="pt", padding=True
        ).to(self.device)

        outputs = self.model(**inputs)
        # (1, T, 768) → (768,) mean pooling
        embedding = outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy()
        return embedding.astype(np.float32)


# ──────────────────────────────────────────────────────────────
# 전체 피처 추출 파이프라인
# ──────────────────────────────────────────────────────────────
def extract_all_audio_features(use_wav2vec: bool = True) -> pd.DataFrame:
    """
    transcripts.json의 모든 세그먼트에 대해 오디오 피처를 추출합니다.

    반환 DataFrame 컬럼:
      - segment_id, speaker, start, end, text, label
      - feat_handcraft: np.ndarray (핸드크래프트 피처)
      - feat_wav2vec2:  np.ndarray (Wav2Vec2 임베딩, use_wav2vec=True일 때)
    """
    assert TRANSCRIPT_JSON.exists(), \
        f"먼저 01_diarization.py를 실행하세요: {TRANSCRIPT_JSON}"

    with open(TRANSCRIPT_JSON, encoding="utf-8") as f:
        records = json.load(f)

    # Wav2Vec2 모델 초기화
    embedder = Wav2Vec2Embedder() if use_wav2vec else None

    rows = []
    failed = 0

    for rec in tqdm(records, desc="오디오 피처 추출"):
        seg_path = Path(rec["audio_path"])
        if not seg_path.exists():
            print(f"[WARN] 세그먼트 파일 없음: {seg_path}")
            failed += 1
            continue

        try:
            y, sr = librosa.load(str(seg_path), sr=SAMPLE_RATE, mono=True)
            y, _  = librosa.effects.trim(y, top_db=20)   # 묵음 제거

            row = {
                "segment_id":    rec["segment_id"],
                "speaker":       rec["speaker"],
                "start":         rec["start"],
                "end":           rec["end"],
                "duration":      rec.get("duration", rec["end"] - rec["start"]),
                "text":          rec["text"],
                "label":         rec.get("label"),
                "audio_path":    str(seg_path),
                "feat_handcraft": extract_handcraft(y, sr),
            }

            if embedder is not None:
                row["feat_wav2vec2"] = embedder.embed(y, sr)

            rows.append(row)

        except Exception as e:
            print(f"[ERROR] {seg_path.name}: {e}")
            failed += 1

    print(f"\n✓ 오디오 피처 추출 완료: {len(rows)}개 (실패: {failed}개)")
    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--no_wav2vec", action="store_true",
                        help="Wav2Vec2 임베딩 건너뜀 (빠른 실험용)")
    args = parser.parse_args()

    df = extract_all_audio_features(use_wav2vec=not args.no_wav2vec)

    with open(OUT_PKL, "wb") as f:
        pickle.dump(df, f)
    print(f"저장 완료: {OUT_PKL}  (shape: {df.shape})")

    # 피처 차원 요약
    if "feat_handcraft" in df and len(df) > 0:
        print(f"  핸드크래프트 피처 차원: {df['feat_handcraft'].iloc[0].shape[0]}")
    if "feat_wav2vec2" in df and len(df) > 0:
        print(f"  Wav2Vec2 피처 차원:     {df['feat_wav2vec2'].iloc[0].shape[0]}")

    # 레이블 분포
    if "label" in df:
        print("\n[레이블 분포]")
        print(df["label"].value_counts())


if __name__ == "__main__":
    main()
