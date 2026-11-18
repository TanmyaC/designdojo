"""Design Dojo speech server.

Two open-source models behind a tiny HTTP API, called only by the Next.js server:
  POST /tts  text -> WAV          Kokoro-82M (Apache-2.0)
  POST /stt  WAV  -> text         faster-whisper / Whisper (MIT)
Every route except /health needs the X-Speech-Key header to match SPEECH_API_KEY.
"""
import io
import logging
import os
import re
import threading
import time
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

log = logging.getLogger("speech")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

API_KEY = os.environ.get("SPEECH_API_KEY", "")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small.en")
DEFAULT_VOICE = os.environ.get("KOKORO_DEFAULT_VOICE", "af_heart")
MAX_TEXT = 2000
MAX_AUDIO_BYTES = 10 * 1024 * 1024
SAMPLE_RATE = 24000

# American English Kokoro voices (lang_code "a"), best-rated first.
VOICES = [
    {"id": "af_heart", "label": "Heart (female)"},
    {"id": "af_bella", "label": "Bella (female)"},
    {"id": "af_nicole", "label": "Nicole (female, soft)"},
    {"id": "af_sarah", "label": "Sarah (female)"},
    {"id": "am_michael", "label": "Michael (male)"},
    {"id": "am_fenrir", "label": "Fenrir (male)"},
    {"id": "am_puck", "label": "Puck (male)"},
    {"id": "am_echo", "label": "Echo (male)"},
    {"id": "am_eric", "label": "Eric (male)"},
    {"id": "am_liam", "label": "Liam (male)"},
]
VOICE_IDS = {v["id"] for v in VOICES}

# Words Whisper should expect in a system design interview.
VOCAB = ("System design interview. Redis, Kafka, Cassandra, DynamoDB, Postgres, MySQL, S3, CDN, gRPC, REST, WebSocket, "
         "sharding, partitioning, replication, quorum, idempotency, QPS, p99, SLO, SLA, CAP theorem, consistent hashing, "
         "load balancer, cache invalidation, write-ahead log, CRDT, pub/sub, rate limiter, back-of-the-envelope, "
         "read path, write path, hot path, fan-out, hot keys, single point of failure, leader election, failover.")


def _device():
    want = os.environ.get("WHISPER_DEVICE", "auto")
    if want != "auto":
        return want
    try:
        import ctranslate2
        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


DEVICE = _device()
COMPUTE = os.environ.get("WHISPER_COMPUTE_TYPE") or ("float16" if DEVICE == "cuda" else "int8")

# Models are loaded once; each sits behind a lock so concurrent requests take turns.
_tts, _stt = None, None
_tts_lock, _stt_lock = threading.Lock(), threading.Lock()


def load_models():
    global _tts, _stt
    t0 = time.time()
    from kokoro import KPipeline
    _tts = KPipeline(lang_code="a", device="cuda" if DEVICE == "cuda" else "cpu")  # weights: hexgrad/Kokoro-82M
    _tts.load_voice(DEFAULT_VOICE)
    log.info("Kokoro ready in %.1fs", time.time() - t0)
    t0 = time.time()
    from faster_whisper import WhisperModel
    _stt = WhisperModel(WHISPER_MODEL, device=DEVICE, compute_type=COMPUTE)
    log.info("Whisper %s ready on %s/%s in %.1fs", WHISPER_MODEL, DEVICE, COMPUTE, time.time() - t0)


@asynccontextmanager
async def lifespan(_app):
    if not API_KEY:
        log.warning("SPEECH_API_KEY is not set: the API is open. Set it for anything but local testing.")
    load_models()
    yield


app = FastAPI(title="Design Dojo speech server", docs_url=None, redoc_url=None, lifespan=lifespan)


def require_key(x_speech_key: str = Header(default="")):
    if API_KEY and x_speech_key != API_KEY:
        raise HTTPException(status_code=401, detail="Missing or wrong X-Speech-Key")


@app.get("/health")
def health():
    return {"ok": _tts is not None and _stt is not None, "tts": "kokoro-82m", "stt": WHISPER_MODEL, "device": DEVICE, "compute": COMPUTE}


@app.get("/voices", dependencies=[Depends(require_key)])
def voices():
    return {"default": DEFAULT_VOICE, "voices": VOICES}


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    voice: str | None = None
    speed: float = Field(default=1.0, ge=0.6, le=1.6)


@app.post("/tts", dependencies=[Depends(require_key)])
def tts(req: TTSRequest):
    voice = req.voice if req.voice in VOICE_IDS else DEFAULT_VOICE
    text = re.sub(r"\s+", " ", req.text).strip()
    t0 = time.time()
    chunks = []
    with _tts_lock:
        for result in _tts(text, voice=voice, speed=req.speed, split_pattern=r"\n+"):
            audio = result.audio
            if audio is not None:
                chunks.append(audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio))
    if not chunks:
        raise HTTPException(status_code=422, detail="Nothing to say")
    wav = np.concatenate(chunks).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, wav, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    log.info("tts %d chars -> %.1fs audio in %.2fs (%s)", len(text), len(wav) / SAMPLE_RATE, time.time() - t0, voice)
    return Response(content=buf.getvalue(), media_type="audio/wav")


def read_wav_16k(data: bytes) -> np.ndarray:
    """WAV (or FLAC/OGG) bytes -> mono float32 at 16 kHz, the format Whisper expects.
    Decoding here avoids faster-whisper's PyAV decoder, whose arguments break across PyAV releases."""
    try:
        audio, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    except Exception:
        raise HTTPException(status_code=415, detail="Send WAV audio (16 kHz mono preferred)")
    audio = audio.mean(axis=1)
    if sr != 16000:
        from math import gcd
        from scipy.signal import resample_poly
        g = gcd(sr, 16000)
        audio = resample_poly(audio, 16000 // g, sr // g).astype(np.float32)
    return audio


@app.post("/stt", dependencies=[Depends(require_key)])
def stt(audio: UploadFile = File(...), prompt: str = Form(default="")):
    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large")
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    t0 = time.time()
    hint = (VOCAB + " " + prompt[:300]).strip()
    with _stt_lock:
        segments, info = _stt.transcribe(read_wav_16k(data), language="en", beam_size=5, vad_filter=True,
                                         initial_prompt=hint, condition_on_previous_text=False)
        text = " ".join(s.text.strip() for s in segments).strip()
    log.info("stt %.1fs audio -> %d chars in %.2fs", info.duration, len(text), time.time() - t0)
    return {"text": text, "duration": round(info.duration, 2)}
