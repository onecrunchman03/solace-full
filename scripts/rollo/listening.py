"""HOW ROLLO KNOWS YOU'RE TALKING — a speech detector and the thing that cuts
the stream into utterances. Pure (numpy + onnxruntime), so test_listening.py
can drive it with real speech and no LiveKit.

The first cut was a loudness gate: anything over a level was speech, 0.8s
under it ended the sentence. A loud room, a keyboard or a breath started an
utterance, a quiet talker never did, and he couldn't be interrupted at all —
he stopped listening while he spoke. Silero (the VAD faster-whisper already
ships) tells a voice from noise; the segmenter waits a short beat for the end
of a sentence, keeps a little audio from before the start so the first
syllable isn't clipped, and says "barge" when somebody talks over him.
"""

from __future__ import annotations

import os
from collections import deque

import numpy as np

RATE = 16_000
CHUNK = 512  # Silero's window at 16 kHz (32 ms)
CTX = 64  # and the context it wants in front of each window


def load_vad():
    """Silero v6, from faster-whisper's own assets (no download)."""
    import onnxruntime
    from faster_whisper.vad import get_assets_path

    opts = onnxruntime.SessionOptions()
    opts.inter_op_num_threads = 1
    opts.intra_op_num_threads = 1
    opts.log_severity_level = 4
    return onnxruntime.InferenceSession(os.path.join(get_assets_path(), "silero_vad_v6.onnx"),
                                        providers=["CPUExecutionProvider"], sess_options=opts)


class StreamVAD:
    """Silero run a window at a time with its state carried over — faster-
    whisper's wrapper starts from zero on every call, which is right for a file
    and wrong for a live mic. One per speaker; the session is shared."""

    def __init__(self, session):
        self.session = session
        self.reset()

    def reset(self):
        self.h = np.zeros((1, 1, 128), dtype=np.float32)
        self.c = np.zeros((1, 1, 128), dtype=np.float32)
        self.ctx = np.zeros(CTX, dtype=np.float32)
        self.pending = np.zeros(0, dtype=np.float32)

    def feed(self, pcm: np.ndarray) -> list[tuple[np.ndarray, float]]:
        """Audio in (any length, float32 at 16 kHz) → (window, speech probability)
        for every whole window it completes."""
        self.pending = np.concatenate([self.pending, pcm.astype(np.float32)])
        out = []
        while len(self.pending) >= CHUNK:
            win, self.pending = self.pending[:CHUNK], self.pending[CHUNK:]
            x = np.concatenate([self.ctx, win])[None, :]
            prob, self.h, self.c = self.session.run(None, {"input": x, "h": self.h, "c": self.c})
            self.ctx = win[-CTX:]
            out.append((win, float(np.ravel(prob)[0])))
        return out


class Segmenter:
    """(window, probability) → events: ("utterance", audio) when somebody has
    finished a sentence, ("barge", audio) once when they start talking over
    him — with what was caught so far, so the agent can check it's really
    somebody else and not his own voice coming back through a speaker."""

    def __init__(self, *, on=0.5, off=0.35, start_s=0.12, end_s=0.55, min_s=0.4, max_s=15.0,
                 preroll_s=0.3, barge_s=0.3, floor_rms=0.004):
        self.on, self.off = on, off
        self.start_s, self.end_s, self.min_s, self.max_s = start_s, end_s, min_s, max_s
        self.barge_s, self.floor_rms = barge_s, floor_rms
        self.dur = CHUNK / RATE
        self.preroll: deque = deque(maxlen=max(1, round(preroll_s / self.dur)))
        self.reset()

    def reset(self):
        self.talking = False
        self.barged = False
        self.buf: list[np.ndarray] = []
        self.pend: list[np.ndarray] = []
        self.run = self.speech = self.silence = self.total = 0.0
        self.preroll.clear()

    def push(self, win: np.ndarray, prob: float, rollo_speaking: bool) -> list[tuple]:
        rms = float(np.sqrt(np.mean(win * win))) if len(win) else 0.0
        voiced = prob >= self.on and rms >= self.floor_rms
        events: list[tuple] = []
        if not self.talking:
            if voiced:
                self.run += self.dur
                self.pend.append(win)
                if self.run >= self.start_s:
                    self.talking = True
                    self.buf = list(self.preroll) + self.pend
                    self.speech, self.silence, self.total = self.run, 0.0, len(self.buf) * self.dur
                    self.pend = []
                    self.preroll.clear()
            else:
                for w in self.pend:
                    self.preroll.append(w)
                self.pend, self.run = [], 0.0
                self.preroll.append(win)
        else:
            self.buf.append(win)
            self.total += self.dur
            if voiced:
                self.speech += self.dur
            if prob < self.off:
                self.silence += self.dur
            else:
                self.silence = 0.0
            if self.silence >= self.end_s or self.total >= self.max_s:
                if self.speech >= self.min_s:
                    events.append(("utterance", np.concatenate(self.buf)))
                self.reset()
                return events
        if self.talking and rollo_speaking and not self.barged and self.speech >= self.barge_s:
            self.barged = True
            events.append(("barge", np.concatenate(self.buf)))
        return events
