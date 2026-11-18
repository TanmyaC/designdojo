# Design Dojo speech server

Gives Alex a voice and lets candidates answer out loud, with open-source models you run yourself. No third-party voice service, and no per-use cost.

| Job | Model | License |
|---|---|---|
| Alex's voice (text → speech) | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Apache-2.0 |
| Candidate's answers (speech → text) | [Whisper](https://github.com/openai/whisper) via [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | MIT |

Only the Next.js server talks to this service; browsers never reach it directly. Audio is processed in memory and never stored.

## Run it

```bash
cd speech-server
SPEECH_API_KEY=$(openssl rand -hex 24) docker compose up -d --build
```

The first start downloads about 0.8 GB of models into a Docker volume, which takes a minute or two; later starts take seconds. Check it's ready:

```bash
curl http://127.0.0.1:8001/health
```

Then point the app at it in `.env.local`, and restart `npm run dev`:

```
SPEECH_URL=http://127.0.0.1:8001
SPEECH_API_KEY=<the same key>
```

Voice turns on by default in the interview room. Each person can switch it off, pick Alex's voice, and set how long a pause sends their answer, in **Settings → Voice**.

### Without Docker

Use Python 3.12; Kokoro doesn't support 3.13 yet.

```bash
cd speech-server
python3.12 -m venv .venv && . .venv/bin/activate
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0
pip install -r requirements.txt
SPEECH_API_KEY=dev uvicorn app:app --host 127.0.0.1 --port 8001
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SPEECH_API_KEY` | (none) | Shared secret; the app sends it as `X-Speech-Key`. Required by `docker compose`. |
| `WHISPER_MODEL` | `small.en` | Transcription model. `base.en` is faster and less accurate; `medium.en` or `large-v3-turbo` are more accurate and want a GPU. |
| `KOKORO_DEFAULT_VOICE` | `af_heart` | Alex's voice when the person hasn't picked one. See `GET /voices`. |
| `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE` | auto | Force `cpu`/`cuda` and e.g. `int8`/`float16`. |

## What to expect on CPU

Measured on a 4-core cloud CPU with the defaults:

- **Alex's voice:** about 3–4× faster than real time. A sentence is ready in under a second, and the app plays one sentence while fetching the next.
- **Transcription:** a 7–10 s answer takes 2–3 s. The browser sends each phrase as soon as you pause, so most of that happens while you're still talking. Your answer is sent about 3 s after you stop speaking.
- **Resources:** about 3 GB of RAM while running. The image is about 3 GB.

A GPU isn't needed for one person practising. For several people interviewing at once, use a bigger machine or a GPU: the server handles one speech job at a time per model.

## Deploying with the website

The browser only allows the microphone on `https://` pages (or `localhost`), which a hosted site like Vercel already has.

- **Same machine as the app:** keep the default `127.0.0.1:8001` binding and set `SPEECH_URL=http://127.0.0.1:8001`.
- **App hosted elsewhere (e.g. Vercel), speech server on a VM:** put the server behind HTTPS, for example with Caddy or nginx and a domain. Expose it only through that proxy, set a long random `SPEECH_API_KEY`, and set `SPEECH_URL=https://speech.yourdomain.com` on the app. Don't publish port 8001 directly.

## API

All routes except `/health` need the `X-Speech-Key` header.

| Route | In | Out |
|---|---|---|
| `GET /health` | | `{ok, tts, stt, device}` |
| `GET /voices` | | `{default, voices: [{id, label}]}` |
| `POST /tts` | JSON `{text, voice?, speed?}` (max 2,000 characters, speed 0.6–1.6) | `audio/wav`, 24 kHz mono |
| `POST /stt` | multipart `audio` (WAV, ideally 16 kHz mono, max 10 MB) and optional `prompt` | `{text, duration}` |

## Troubleshooting

- **Room says voice isn't available:** the app can't reach `SPEECH_URL`, or the keys differ. `curl $SPEECH_URL/health` from the app's machine.
- **Alex is silent after a page reload:** browsers block sound until you click; use the "Turn on Alex's voice" button in the room.
- **Microphone blocked:** allow it in the browser's site settings. Answers can always be typed.
- **Technical words misheard:** the server already hints Whisper with common system-design vocabulary (see `VOCAB` in `app.py`; add your own terms there), or use a larger `WHISPER_MODEL`.
