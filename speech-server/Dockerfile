# Design Dojo speech server: Kokoro (text-to-speech) + faster-whisper (speech-to-text), CPU build.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/models

# No system packages needed: espeak-ng (Kokoro's fallback for unknown words) ships inside the espeakng-loader
# pip package, and libsndfile (WAV reading and writing) inside the soundfile wheel.
WORKDIR /app
# CPU-only PyTorch is about 200 MB instead of several GB for the CUDA build.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py .

# Models download into /models on first start; mount a volume there so restarts don't download again.
VOLUME ["/models"]
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s \
  CMD python -c "import urllib.request,json,sys; sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8001/health'))['ok'] else 1)"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
