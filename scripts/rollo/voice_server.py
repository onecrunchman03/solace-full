"""ROLLO'S CLONED VOICE — a small local server the agent asks for speech.

Chatterbox Turbo (MIT, ~3 GB of GPU) speaking in the voice Josh picked
(the Voice Design candidate "queens-1"). It lives in its own venv
(D:\\solace-ai\\voice-venv) because Chatterbox pins an old PyTorch and the
agent's Whisper must not share it. The agent starts this itself when
ROLLO_CLONE=1 and falls back to Kokoro whenever it is slow or down.

    POST /say   {"text": "...", "voice"?: "announcer"}  ->  raw 16-bit PCM, mono, 24 kHz

Rollo is the default voice. Any other voice is a reference recording named
<voice>.mp3 in D:/solace-ai/models/voices (the Derby announcer, "announcer"),
prepared the first time it is asked for and kept: one model, many voices.
    GET  /health                 ->  "ok" once the voice is loaded

Bound to 127.0.0.1 only: nothing off this PC can reach it.
"""

import json
import re
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    key, _, val = line.partition("=")
    if key in ("HF_TOKEN", "ROLLO_VOICE_REF", "ROLLO_CLONE_PORT", "ROLLO_VOICE_HALF") and not os.environ.get(key):
        os.environ[key] = val.strip()
os.environ.setdefault("HF_HOME", r"D:\solace-ai\models\hf")
os.environ.setdefault("TQDM_DISABLE", "1")
# The model is already on disk: never ask Hugging Face on start. Without this a
# Hugging Face outage (a 500 on Oct 13 2026) kept the voices from coming back.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
# Two voice servers share slopbot's 10 GB card with the ears. Fragments left
# by long lines were never handed back, so the first server grew from 2.9 to
# 4.9 GB over a day and the second then failed EVERY line out of memory
# (Oct 17 2026 — the announcer went silent). Expandable segments fragment
# less, and each line's cache is released when it is done.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import numpy as np  # noqa: E402
import torch  # noqa: E402
from chatterbox.tts_turbo import ChatterboxTurboTTS  # noqa: E402

PORT = int(os.environ.get("ROLLO_CLONE_PORT", "8781"))
REF = Path(os.environ.get("ROLLO_VOICE_REF", r"D:\solace-ai\models\rollo-voice\queens-1.mp3"))
MAX_CHARS = 400
VOICES = Path(os.environ.get("ROLLO_VOICES_DIR", r"D:\solace-ai\models\voices"))
VOICE_NAME = re.compile(r"^[a-z0-9-]{1,32}$")

if not REF.is_file():
    sys.exit(f"[voice] no reference recording at {REF}")
tts = ChatterboxTurboTTS.from_pretrained(device="cuda")
# ROLLO_VOICE_HALF=1: the speech model in 16-bit (bfloat16). Measured Oct 13
# 2026: 3.9 -> 2.8 GB held on the card, but ~25% slower to make a line (2.6x
# -> 2.0x real time). The sound generator stays 32-bit — the library breaks
# on it in 16-bit (a tensor-size mismatch). Off until Josh has heard it.
# Measured again on slopbot's 3080 the same night: 2.5x -> 2.0x real time,
# 4.6 -> 3.3 GB. It is a memory switch, not a speed one — leave it off unless
# the card is ever short of room.
HALF = os.environ.get("ROLLO_VOICE_HALF") == "1"
if HALF:
    tts.t3.to(torch.bfloat16)
tts.prepare_conditionals(str(REF))
conds = {"": tts.conds}  # "" = Rollo; the rest are prepared on first use
lock = threading.Lock()  # one line at a time on the GPU
# Out of memory this many lines running: quit, and the agent starts us again
# with a clean card (it restarts a voice server that exits).
OOM_LIMIT = 3
oom_run = 0
print(f"[voice] ready on 127.0.0.1:{PORT} ({torch.cuda.memory_allocated() / 2**30:.1f} GB)", flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):  # quiet: nothing said is logged
        pass

    def do_GET(self):
        if self.path != "/health":
            return self.send_error(404)
        self._send(b"ok", "text/plain")

    def do_POST(self):
        if self.path != "/say":
            return self.send_error(404)
        try:
            n = int(self.headers.get("content-length") or 0)
            body = json.loads(self.rfile.read(min(n, 8192)) or b"{}")
            text = str(body.get("text") or "").strip()[:MAX_CHARS]
            voice = str(body.get("voice") or "")
        except (ValueError, json.JSONDecodeError):
            return self.send_error(400)
        if not text or (voice and (not VOICE_NAME.match(voice) or not (VOICES / f"{voice}.mp3").is_file())):
            return self.send_error(400)
        global oom_run
        try:
            with lock:
                if voice not in conds:
                    tts.prepare_conditionals(str(VOICES / f"{voice}.mp3"))
                    conds[voice] = tts.conds
                tts.conds = conds[voice]
                # INFERENCE MODE (Oct 21 2026): Chatterbox runs the Perth
                # watermarker's net with gradient tracking on, and that kept
                # ~12 MB of host RAM per line forever — ~19 MB a line all in,
                # measured. On a busy day a server reached 27 GB, the box
                # thrashed and the OOM killer took it (Oct 19 05:05). Under
                # inference_mode the same calls stay flat. The watermark is
                # still applied.
                with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16, enabled=HALF):
                    wav = tts.generate(text)
                audio = wav.squeeze().detach().cpu().numpy()
                del wav
                torch.cuda.empty_cache()
                oom_run = 0
            pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        except Exception as e:  # noqa: BLE001
            oom = "out of memory" in str(e).lower()
            print("[voice] failed:", str(e)[:200], flush=True)
            torch.cuda.empty_cache()
            if oom:
                oom_run += 1
                if oom_run >= OOM_LIMIT:
                    print(f"[voice] out of memory {oom_run} lines running: restarting", flush=True)
                    self.send_error(500)
                    os._exit(3)
            return self.send_error(500)
        self._send(pcm, "application/octet-stream")

    def _send(self, body: bytes, ctype: str):
        self.send_response(200)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
