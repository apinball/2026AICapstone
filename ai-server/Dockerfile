# GPU가 있으면 nvidia/cuda 베이스, 없으면 python:3.11-slim 으로 교체
FROM python:3.11-slim

WORKDIR /app

# 시스템 패키지 (librosa, soundfile 의존성 포함)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

COPY app/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
