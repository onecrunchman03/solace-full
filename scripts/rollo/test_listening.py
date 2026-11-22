"""Drives listening.py with REAL speech (Kokoro's, resampled to 16 kHz) instead
of trusting it. Run with the agent's venv:

    D:/solace-ai/rollo-venv/Scripts/python.exe -I scripts/rollo/test_listening.py

Not in `npm run checks` — it needs the voice models on this machine.
"""

import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from listening import RATE, Segmenter, StreamVAD, load_vad  # noqa: E402

MODELS = Path(os.environ.get("ROLLO_MODELS", r"D:\solace-ai\models"))
passed = failed = 0


def ok(cond, label):
    global passed, failed
    print(("  + " if cond else "  x ") + label)
    if cond:
        passed += 1
    else:
        failed += 1


def speech(text):
    from kokoro_onnx import Kokoro
    k = Kokoro(str(MODELS / "kokoro" / "kokoro-v1.0.onnx"), str(MODELS / "kokoro" / "voices-v1.0.bin"))
    s, rate = k.create(text, voice="am_michael", speed=1.05, lang="en-us")
    idx = np.linspace(0, len(s) - 1, int(len(s) * RATE / rate))
    return np.interp(idx, np.arange(len(s)), s).astype(np.float32) * 0.6


def run(stream, speaking=lambda t: False):
    """Feed it the way LiveKit does (10 ms frames); return events with times."""
    vad, seg = StreamVAD(load_vad()), Segmenter()
    events, t = [], 0.0
    for i in range(0, len(stream), 160):
        for win, prob in vad.feed(stream[i:i + 160]):
            for ev in seg.push(win, prob, speaking(t)):
                events.append((t, ev))
        t += 160 / RATE
    return events


rng = np.random.default_rng(7)
sil = lambda s: (rng.standard_normal(int(s * RATE)) * 0.002).astype(np.float32)  # noqa: E731
a = speech("Hey Rollo, how are the slots treating you tonight?")
b = speech("You want to put fifty on the horse?")
print(f"speech: {len(a) / RATE:.2f}s and {len(b) / RATE:.2f}s")

print("TWO SENTENCES")
ev = run(np.concatenate([sil(1.0), a, sil(1.2), b, sil(1.0)]))
utt = [(t, e[1]) for t, e in ev if e[0] == "utterance"]
ok(len(utt) == 2, f"two sentences with a pause between are two utterances ({len(utt)})")
if len(utt) == 2:
    ok(abs(len(utt[0][1]) / RATE - len(a) / RATE) < 1.0, f"the first holds the whole sentence ({len(utt[0][1]) / RATE:.2f}s vs {len(a) / RATE:.2f}s)")
    end_a = 1.0 + len(a) / RATE
    ok(utt[0][0] - end_a < 0.9, f"it's handed over soon after they stop ({utt[0][0] - end_a:.2f}s after the last word)")
    lead = np.abs(utt[0][1][: int(0.1 * RATE)]).max()
    ok(lead < 0.05, "it starts a beat BEFORE the first word (the pre-roll), so nothing is clipped")

print("NOISE")
noise = (rng.standard_normal(int(4 * RATE)) * 0.03).astype(np.float32)
clicks = np.zeros(int(4 * RATE), dtype=np.float32)
clicks[:: RATE // 3] = 0.8
ev = run(np.concatenate([noise, clicks, sil(1.0)]))
ok(not [e for _, e in ev if e[0] == "utterance"], "loud hiss and keyboard clicks are not speech")

print("TALKING OVER HIM")
start = 1.0
ev = run(np.concatenate([sil(start), a, sil(1.0)]), speaking=lambda t: True)
barges = [t for t, e in ev if e[0] == "barge"]
ok(len(barges) == 1, f"talking over him raises ONE barge ({len(barges)})")
if barges:
    ok(barges[0] - start < 0.8, f"...within a breath of the first word ({barges[0] - start:.2f}s)")
ok(any(e[0] == "utterance" for _, e in ev), "...and what they said is still heard")
ev = run(np.concatenate([sil(start), a, sil(1.0)]))
ok(not any(e[0] == "barge" for _, e in ev), "no barge when he isn't talking")

print(f"\n{passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
