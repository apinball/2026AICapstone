"""
config.py
모든 경로, 하이퍼파라미터, 실험 설정을 한 곳에서 관리합니다.
"""
from pathlib import Path

# ── 경로 설정 ──────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
DATA_DIR   = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
MODEL_DIR  = BASE_DIR / "saved_models"

for d in [DATA_DIR, OUTPUT_DIR, MODEL_DIR]:
    d.mkdir(exist_ok=True)

# ── 오디오 설정 ────────────────────────────────────────────
SAMPLE_RATE   = 16_000          # Whisper 권장 샘플레이트
N_MFCC        = 40              # MFCC 계수 수
HOP_LENGTH    = 512
N_FFT         = 2048

# ── 발화자 분리 ────────────────────────────────────────────
NUM_SPEAKERS  = 2               # 녹음 파일 내 발화자 수
MIN_DURATION  = 0.5             # 최소 발화 길이 (초)

# ── STT 설정 ──────────────────────────────────────────────
WHISPER_MODEL = "large-v3"      # large-v3 | medium | small
LANGUAGE      = "ko"            # 한국어

# ── 감정 레이블 ────────────────────────────────────────────
LABELS        = ["부정", "중립", "긍정"]
LABEL2ID      = {l: i for i, l in enumerate(LABELS)}
ID2LABEL      = {i: l for i, l in enumerate(LABELS)}
NUM_CLASSES   = len(LABELS)

# ── 텍스트 모델 ────────────────────────────────────────────
KOBERT_MODEL  = "snunlp/KR-ELECTRA-discriminator"   # 또는 klue/roberta-base
MAX_SEQ_LEN   = 128

# ── Wav2Vec2 ──────────────────────────────────────────────
WAV2VEC_MODEL = "kresnik/wav2vec2-large-xlsr-korean"

# ── 학습 설정 ─────────────────────────────────────────────
TEST_SIZE     = 0.2
VAL_SIZE      = 0.1
RANDOM_SEED   = 42
CV_FOLDS      = 5               # 교차 검증 폴드 수
BATCH_SIZE    = 32
EPOCHS_DL     = 30              # 딥러닝 에폭

# ── 비교할 모델 목록 ───────────────────────────────────────
EXPERIMENT_MODELS = [
    # (모델명, 피처 유형)
    ("SVM",              "audio"),
    ("RandomForest",     "audio"),
    ("XGBoost",          "audio"),
    ("SVM",              "text"),
    ("RandomForest",     "text"),
    ("XGBoost",          "text"),
    ("SVM",              "fusion_early"),
    ("RandomForest",     "fusion_early"),
    ("XGBoost",          "fusion_early"),
    ("LSTM",             "audio"),
    ("CNN1D",            "audio"),
    ("KoBERT",           "text"),
    ("Wav2Vec2",         "audio"),
    ("Fusion_Late",      "fusion_late"),
    ("Fusion_Attention", "fusion_attention"),
]
