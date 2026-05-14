"""
03_feature_text.py
──────────────────
STT 텍스트에서 텍스트 피처를 추출합니다.

추출 피처:
  [전통 NLP]
  - TF-IDF 벡터 (vocab 5000, char/word ngram)
  - 감성사전 기반 점수 (KNU 한국어 감성사전)
  - 언어 통계: 문장 길이, 부정어 수, 감탄사 수 등

  [사전학습 임베딩]
  - KoBERT/KR-ELECTRA → [CLS] 768차원 임베딩
  - Fine-tuning용 input_ids + attention_mask 반환

출력: outputs/features_text.pkl (pandas DataFrame에 컬럼 추가)

사용법:
  python 03_feature_text.py
"""

import json
import pickle
import re
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from tqdm import tqdm

from config import (OUTPUT_DIR, KOBERT_MODEL, MAX_SEQ_LEN, LABEL2ID)

TRANSCRIPT_JSON  = OUTPUT_DIR / "transcripts.json"
AUDIO_FEAT_PKL   = OUTPUT_DIR / "features_audio.pkl"
OUT_PKL          = OUTPUT_DIR / "features_text.pkl"


# ──────────────────────────────────────────────────────────────
# 감성사전 (KNU 한국어 감성사전 간이 버전)
# ──────────────────────────────────────────────────────────────
# 실제 연구에서는 KNU 감성사전 파일을 다운로드해 사용합니다.
# 여기서는 간이 사전을 내장하고, 실제 파일이 있으면 그것을 로드합니다.
KNU_POSITIVE = {
    "좋아", "좋다", "좋은", "기쁘다", "행복", "훌륭", "완벽", "최고",
    "감사", "사랑", "즐거", "아름답", "멋지", "신나", "희망", "만족",
    "긍정", "웃음", "기대", "편안", "성공", "잘", "훌륭하다"
}
KNU_NEGATIVE = {
    "나쁘다", "싫다", "슬프다", "화난다", "짜증", "힘들", "어렵다",
    "실망", "걱정", "두렵다", "무섭다", "불안", "실패", "최악", "형편없",
    "못", "안", "없다", "부족", "문제", "고통", "슬픔", "분노", "후회"
}
NEGATION_WORDS = {"안", "못", "아니", "없", "모르", "안되", "불"}


def load_knu_dict(dict_path: Path = None) -> tuple[set, set]:
    """KNU 감성사전 로드 (파일이 있으면). 없으면 내장 사전 반환."""
    if dict_path and dict_path.exists():
        pos, neg = set(), set()
        with open(dict_path, encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 2:
                    word, score = parts[0], parts[1]
                    try:
                        score = int(score)
                        if score > 0:
                            pos.add(word)
                        elif score < 0:
                            neg.add(word)
                    except ValueError:
                        pass
        return pos, neg
    return KNU_POSITIVE, KNU_NEGATIVE


POS_WORDS, NEG_WORDS = load_knu_dict(
    Path("data/knu_sentiment_lexicon.txt")
)


# ──────────────────────────────────────────────────────────────
# 전통 NLP 피처
# ──────────────────────────────────────────────────────────────
def extract_linguistic(text: str) -> np.ndarray:
    """
    규칙/통계 기반 언어 피처 → 1D numpy array

    Features (16차원):
      0  char_count          : 전체 문자 수
      1  word_count          : 어절 수
      2  avg_word_len        : 평균 어절 길이
      3  pos_word_count      : 긍정어 수
      4  neg_word_count      : 부정어 수
      5  negation_count      : 부정어 수
      6  exclamation_count   : 감탄사/느낌표 수
      7  question_count      : 의문 표현 수
      8  sentiment_ratio     : (pos - neg) / (pos + neg + 1)
      9  has_negation_before_pos : 부정어 + 긍정어 패턴
      10 repeat_char_ratio   : 반복 문자 비율 (ㅋㅋ, ㅠㅠ 등)
      11 uppercase_ratio     : 영문 대문자 비율
      12 punct_density       : 구두점 밀도
      13 avg_sent_len        : 평균 문장 길이
      14 sent_count          : 문장 수
      15 syllable_density    : 한글 음절 밀도
    """
    if not text or not text.strip():
        return np.zeros(16, dtype=np.float32)

    words = text.split()
    chars = list(text)
    n_char = max(len(text), 1)
    n_word = max(len(words), 1)

    # 긍정/부정어 카운트
    pos_cnt = sum(any(pw in w for pw in POS_WORDS) for w in words)
    neg_cnt = sum(any(nw in w for nw in NEG_WORDS) for w in words)
    neg_mod = sum(any(nm in w for nm in NEGATION_WORDS) for w in words)

    # 감탄/의문
    excl = text.count("!") + text.count("ㅋ") + text.count("ㅎ")
    ques = text.count("?") + text.count("요?") + text.count("나요")

    # 감성 비율
    sent_ratio = (pos_cnt - neg_cnt) / (pos_cnt + neg_cnt + 1)

    # 부정어 + 긍정어 패턴 (이웃 어절)
    has_neg_before_pos = 0
    for i, w in enumerate(words[:-1]):
        if any(nm in w for nm in NEGATION_WORDS):
            next_w = words[i + 1]
            if any(pw in next_w for pw in POS_WORDS):
                has_neg_before_pos = 1
                break

    # 반복 문자 (ㅋ, ㅠ, ㅏ 등 연속 2회 이상)
    repeat_matches = re.findall(r"(.)\1+", text)
    repeat_ratio = sum(len(m) for m in repeat_matches) / n_char

    # 대문자 비율
    uppercase_ratio = sum(1 for c in text if c.isupper()) / n_char

    # 구두점 밀도
    punct_density = sum(1 for c in chars
                        if c in ".,!?;:\"'()[]{}") / n_char

    # 문장 단위
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    sent_count = max(len(sentences), 1)
    avg_sent_len = n_char / sent_count

    # 한글 음절 밀도
    hangul_count = sum(1 for c in text if "\uAC00" <= c <= "\uD7A3")
    syllable_density = hangul_count / n_char

    avg_word_len = sum(len(w) for w in words) / n_word

    feat = np.array([
        n_char, n_word, avg_word_len,
        pos_cnt, neg_cnt, neg_mod,
        excl, ques, sent_ratio,
        has_neg_before_pos,
        repeat_ratio, uppercase_ratio, punct_density,
        avg_sent_len, sent_count, syllable_density
    ], dtype=np.float32)

    return feat


# ──────────────────────────────────────────────────────────────
# TF-IDF 피처 (배치 전체에서 한번에 fit)
# ──────────────────────────────────────────────────────────────
def build_tfidf_features(texts: list[str], max_features: int = 3000):
    """
    TF-IDF 벡터화.
    - word 1~3gram + char 2~4gram 혼합
    반환: (sparse matrix or dense ndarray, fitted vectorizer)
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.pipeline import FeatureUnion

    word_vec = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        max_features=max_features // 2,
        sublinear_tf=True,
        min_df=2,
    )
    char_vec = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(2, 4),
        max_features=max_features // 2,
        sublinear_tf=True,
        min_df=2,
    )
    union = FeatureUnion([("word", word_vec), ("char", char_vec)])
    X = union.fit_transform(texts)
    return X.toarray().astype(np.float32), union


# ──────────────────────────────────────────────────────────────
# KoBERT / KR-ELECTRA 임베딩
# ──────────────────────────────────────────────────────────────
class KoBERTEmbedder:
    """
    KoBERT / KR-ELECTRA [CLS] 토큰 임베딩 추출.
    논문에서 fine-tuning과 feature 추출 두 모드 모두 지원.
    """

    def __init__(self, model_name: str = KOBERT_MODEL):
        from transformers import AutoTokenizer, AutoModel
        print(f"텍스트 모델 로딩: {model_name}")
        self.device    = "cuda" if torch.cuda.is_available() else "cpu"
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model     = AutoModel.from_pretrained(model_name).to(self.device)
        self.model.eval()

    @torch.no_grad()
    def embed(self, text: str) -> np.ndarray:
        """텍스트 → [CLS] 768차원 임베딩."""
        enc = self.tokenizer(
            text,
            max_length=MAX_SEQ_LEN,
            truncation=True,
            padding="max_length",
            return_tensors="pt"
        )
        enc = {k: v.to(self.device) for k, v in enc.items()}
        out = self.model(**enc)
        # [CLS] 토큰 (pooler_output 없으면 last_hidden_state[:,0,:])
        if hasattr(out, "pooler_output") and out.pooler_output is not None:
            cls_vec = out.pooler_output
        else:
            cls_vec = out.last_hidden_state[:, 0, :]
        return cls_vec.squeeze().cpu().numpy().astype(np.float32)

    def tokenize_for_finetuning(self, text: str) -> dict:
        """Fine-tuning용 토큰화 결과 반환."""
        enc = self.tokenizer(
            text,
            max_length=MAX_SEQ_LEN,
            truncation=True,
            padding="max_length",
            return_tensors="pt"
        )
        return {
            "input_ids":      enc["input_ids"].squeeze().numpy(),
            "attention_mask": enc["attention_mask"].squeeze().numpy(),
        }


# ──────────────────────────────────────────────────────────────
# 전체 텍스트 피처 파이프라인
# ──────────────────────────────────────────────────────────────
def extract_all_text_features(use_kobert: bool = True) -> pd.DataFrame:
    """
    오디오 피처 DataFrame에 텍스트 피처를 추가해 반환합니다.
    오디오 피처가 없으면 transcripts.json에서 직접 로드합니다.
    """
    # 기존 오디오 피처 로드 또는 json 로드
    if AUDIO_FEAT_PKL.exists():
        with open(AUDIO_FEAT_PKL, "rb") as f:
            df = pickle.load(f)
        print(f"오디오 피처 로드: {len(df)}개")
    else:
        print("[INFO] 오디오 피처 없음, transcripts.json에서 로드")
        with open(TRANSCRIPT_JSON, encoding="utf-8") as f:
            records = json.load(f)
        df = pd.DataFrame(records)

    texts = df["text"].fillna("").tolist()

    # ── 1. 언어 피처 ──────────────────────────────────────
    print("언어 피처 추출 중...")
    df["feat_linguistic"] = [extract_linguistic(t) for t in tqdm(texts)]

    # ── 2. TF-IDF ─────────────────────────────────────────
    print("TF-IDF 벡터화 중...")
    tfidf_matrix, tfidf_vec = build_tfidf_features(texts, max_features=3000)
    df["feat_tfidf"] = list(tfidf_matrix)

    # TF-IDF 벡터라이저 저장 (추론 시 재사용)
    import joblib
    joblib.dump(tfidf_vec, OUTPUT_DIR / "tfidf_vectorizer.joblib")

    # ── 3. KoBERT 임베딩 ──────────────────────────────────
    if use_kobert:
        embedder = KoBERTEmbedder()
        print("KoBERT/ELECTRA 임베딩 추출 중...")
        embeddings = []
        ft_tokens  = []
        for text in tqdm(texts):
            embeddings.append(embedder.embed(text))
            ft_tokens.append(embedder.tokenize_for_finetuning(text))
        df["feat_kobert"]        = embeddings
        df["kobert_input_ids"]   = [t["input_ids"] for t in ft_tokens]
        df["kobert_attn_mask"]   = [t["attention_mask"] for t in ft_tokens]

    # ── 4. label → int ────────────────────────────────────
    df["label_id"] = df["label"].map(LABEL2ID)

    print(f"\n✓ 텍스트 피처 추출 완료: {len(df)}개")
    return df


# ──────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--no_kobert", action="store_true",
                        help="KoBERT 임베딩 건너뜀 (빠른 실험용)")
    args = parser.parse_args()

    df = extract_all_text_features(use_kobert=not args.no_kobert)

    with open(OUT_PKL, "wb") as f:
        pickle.dump(df, f)
    print(f"저장 완료: {OUT_PKL}")

    # 피처 차원 확인
    for col, name in [
        ("feat_linguistic", "언어 피처"),
        ("feat_tfidf",      "TF-IDF"),
        ("feat_kobert",     "KoBERT"),
    ]:
        if col in df and len(df) > 0:
            try:
                dim = df[col].iloc[0].shape[0]
                print(f"  {name}: {dim}차원")
            except Exception:
                pass


if __name__ == "__main__":
    main()
