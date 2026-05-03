# NVIDIA CUDA 베이스 이미지 (PyTorch 2.7 + CUDA 12.8 — Blackwell/RTX 50 시리즈 지원)
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 시스템 패키지 (Python 3.10, ffmpeg, librosa 의존성)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3.10-dev \
    python3-pip \
    ffmpeg \
    libsndfile1 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3

# pip 업그레이드 + setuptools<81 핀 (openai-whisper 빌드 호환 — pkg_resources 필요)
RUN pip install --upgrade pip "setuptools<81" wheel

# 빌드 격리 환경에서도 setuptools<81 강제 (openai-whisper sdist 빌드용)
RUN echo "setuptools<81" > /tmp/pip-constraints.txt
ENV PIP_CONSTRAINT=/tmp/pip-constraints.txt

# PyTorch + torchaudio nightly (CUDA 12.8) — RTX 50 시리즈 / Blackwell sm_120 커널 포함
# torchaudio는 pyannote-audio 의존성으로 필요
RUN pip install --pre torch torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128

# Whisper 의존성을 미리 따로 설치 (whisper가 torch 재설치 못하게 차단)
RUN pip install numba tqdm more-itertools tiktoken

# Whisper만 --no-deps 로 설치
RUN pip install --no-deps openai-whisper==20240930

# 나머지 requirements (whisper 줄 제외)
COPY requirements.txt .
RUN grep -v '^openai-whisper' requirements.txt > /tmp/req-no-whisper.txt && \
    pip install -r /tmp/req-no-whisper.txt && \
    python -c "import torch; print('FINAL torch:', torch.__version__); print('archs:', torch.cuda.get_arch_list())"

COPY app/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
