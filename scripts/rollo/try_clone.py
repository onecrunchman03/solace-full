"""Rollo's cloned voice, tried before it is wired in: Chatterbox Turbo speaking
in the voice of the Voice Design pick (voice-previews/queens-1.mp3). Prints how
long each line takes and how much GPU it holds, and writes the clips beside the
reference for Josh to listen to. Run with the voice venv:

    D:/solace-ai/voice-venv/Scripts/python.exe -I scripts/rollo/try_clone.py
"""

import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
for line in (HERE.parent.parent / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("HF_TOKEN=") and not os.environ.get("HF_TOKEN"):
        os.environ["HF_TOKEN"] = line.split("=", 1)[1].strip()
os.environ.setdefault("HF_HOME", r"D:\solace-ai\models\hf")

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
from chatterbox.tts_turbo import ChatterboxTurboTTS  # noqa: E402

REF = HERE / "voice-previews" / "queens-1.mp3"
OUT = HERE / "voice-previews"
LINES = [
    "Hey, hey! Look who it is. You got fifty silver you could spot me? I'm good for it.",
    "Seven, seven, seven! Pay me! That's what I'm talkin' about, baby!",
    "Whoa, whoa, put that thing down, pal. We're friends here, right?",
    "Ah, fuggedaboutit. That horse was a bum anyway.",
]

t0 = time.time()
tts = ChatterboxTurboTTS.from_pretrained(device="cuda")
print(f"loaded in {time.time() - t0:.1f}s, GPU {torch.cuda.memory_allocated() / 2**30:.2f} GB")
t0 = time.time()
tts.prepare_conditionals(str(REF))
print(f"voice prepared in {time.time() - t0:.1f}s")

for i, text in enumerate(LINES, 1):
    t0 = time.time()
    wav = tts.generate(text)
    took = time.time() - t0
    audio = wav.squeeze().detach().cpu().numpy().astype(np.float32)
    secs = len(audio) / tts.sr
    sf.write(OUT / f"rollo-clone-{i}.wav", audio, tts.sr)
    print(f"line {i}: {secs:.1f}s of speech in {took:.2f}s ({secs / took:.1f}x realtime)")
print(f"peak GPU {torch.cuda.max_memory_allocated() / 2**30:.2f} GB")
sys.exit(0)
