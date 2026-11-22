"""THE FLOOR CAST'S VOICES — the agent that lets the casino floor's regulars
(Rollo, Duke, Tasha, Chase; src/npc/cast.ts) hear and speak.

Runs on the 3090 Ti PC (see README.md beside this file). It joins the casino's
LiveKit voice room once per regular — each identity is that regular's Solace
user id, so every player's client places each voice at its body — and hears
the room ONCE, for whoever stands near any of them:

    their mic  ->  voice detection  ->  Whisper (speech to text, GPU)
               ->  POST /api/npc/agent/hear  (Solace's brain decides the words)
               ->  Kokoro (text to speech)  ->  published into the room

What he says is decided by the SERVER (the same gate, facts and checks as
every other line the house says). This file only listens and speaks. Nothing
it hears is written to disk.

    D:\\solace-ai\\rollo-venv\\Scripts\\python.exe scripts\\rollo\\agent.py
"""

import asyncio
from collections import OrderedDict
import json
import os
import random
import re
import sys
import threading
import time
import urllib.request
from pathlib import Path

import numpy as np

# faster-whisper's CUDA libraries ship as pip wheels; Windows has to be told
# where their DLLs are before ctranslate2 loads.
_site = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
for sub in ("cublas", "cudnn", "cuda_nvrtc"):
    d = _site / sub / "bin"
    if d.is_dir():
        os.add_dll_directory(str(d))
        os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")

import aiohttp  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402
from livekit import rtc  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from listening import Segmenter, StreamVAD, load_vad  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def load_env() -> dict:
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    env.update({k: v for k, v in os.environ.items() if k.startswith(("ROLLO_", "SOLACE_", "NPC_AGENT"))})
    return env


ENV = load_env()
SOLACE = ENV.get("SOLACE_URL", "https://solace.zone").rstrip("/")
SECRET = ENV.get("NPC_AGENT_SECRET", "")
VOICE = ENV.get("ROLLO_VOICE", "am_michael")
# His real voice: the Queens recording Josh picked, cloned locally by
# voice_server.py in its own venv. ROLLO_CLONE=1 turns it on; Kokoro stays as
# the fallback whenever the clone is slow, down or still loading.
CLONE = ENV.get("ROLLO_CLONE", "0") == "1"
CLONE_PY = Path(ENV.get("ROLLO_CLONE_PY", r"D:\solace-ai\voice-venv\Scripts\python.exe"))
CLONE_PORT = int(ENV.get("ROLLO_CLONE_PORT", "8781"))
CLONE_TIMEOUT_S = 12.0
# TWO VOICES (Josh, Oct 14 2026 — four regulars on the floor): a voice server
# makes one line at a time, so two regulars talking at once queued behind each
# other. ROLLO_CLONE_VOICES=2 starts a second server on the next port, in half
# precision so both fit beside the ears on slopbot's 3080 (measured: 9.35 of
# 10 GB; two lines at once done in 2.2-2.4s against 3.8s queued; Josh heard
# the half-precision voices and they sound the same). Each line goes to
# whichever voice is free, the first (full) one when both are.
CLONE_VOICES = max(1, min(2, int(ENV.get("ROLLO_CLONE_VOICES", "1") or 1)))
# Thinking out loud while the brain writes his answer: if it isn't back in
# FILLER_AFTER_S, most of the time he says one of these (made once, at start).
FILLERS = ["Hmm.", "Uh, hold on.", "Lemme think.", "Heh. Okay, okay.", "Ayy, so...", "Yeah, yeah, yeah."]
FILLER_AFTER_S = 1.0
FILLER_ODDS = 0.7
MODELS = Path(ENV.get("ROLLO_MODELS", r"D:\solace-ai\models"))
LISTEN_RATE = 16_000  # what Whisper wants
SPEAK_RATE = 24_000  # what Kokoro makes
# Who's talking: Silero tells a voice from noise (listening.py); a sentence
# ends after END_SILENCE_S of quiet. Under FLOOR_RMS nothing counts at all.
FLOOR_RMS = float(ENV.get("ROLLO_FLOOR_RMS", "0.004"))
END_SILENCE_S = float(ENV.get("ROLLO_END_SILENCE", "0.55"))
# Talk over him and he stops (set ROLLO_BARGE=0 if players' speakers leak his
# own voice back into their mics and he keeps cutting himself off).
BARGE = ENV.get("ROLLO_BARGE", "1") != "0"
# SPEAKING ONLY (SURVIVORZ.md §11): ROLLO_EARS=0 never loads Whisper or the
# voice detector and subscribes to nobody — the regulars still speak, but hear
# no player. Frees ~1.2 GB of slopbot's card. For a show nobody talks to.
EARS = ENV.get("ROLLO_EARS", "1") != "0"
HEARTBEAT = Path(ENV["ROLLO_HEARTBEAT"]) if ENV.get("ROLLO_HEARTBEAT") else None
# The floor's proper nouns, so Whisper spells them right ("Rollo", not "Rolo").
VOCAB = "Rollo, Sterling, Dr. Voss, Ada, the goblins, Goblin Lenders, Solace, blackjack, roulette, slots, the Wheel, silver."
# Whisper invents these from breath and room noise; never answer them.
HALLUCINATIONS = {"thank you.", "thanks for watching!", "thank you for watching.", "you", "bye.", "so", "."}


# HIS MOOD IN HIS VOICE (Oct 2026). The server sends his mood and whether
# he's drunk; every line he speaks is played a touch faster or slower (which
# also moves the pitch with it, like a tape) and a touch louder or softer.
# Drugs are NOT here: the floor already pitch-shifts his voice for star dust
# and ego on every player's side, exactly as it does for a player.
MOOD_TEMPO = {"rattled": 1.08, "euphoric": 1.06, "hot": 1.03, "tilted": 1.04,
              "desperate": 1.0, "sour": 0.97, "even": 1.0}
MOOD_GAIN = {"rattled": 1.12, "euphoric": 1.15, "hot": 1.05, "tilted": 1.12,
             "desperate": 0.95, "sour": 0.9, "even": 1.0}
DRUNK_TEMPO = 0.9  # slower and lower: a slur, without a single new word


def color_voice(pcm: np.ndarray, mood: str, drunk: bool) -> np.ndarray:
    """Retime and re-level a line for his mood. Plain resampling: faster is
    higher, slower is lower — which is what a man sounds like hopped up or
    three drinks in."""
    tempo = MOOD_TEMPO.get(mood, 1.0) * (DRUNK_TEMPO if drunk else 1.0)
    gain = MOOD_GAIN.get(mood, 1.0)
    if abs(tempo - 1.0) < 1e-3 and abs(gain - 1.0) < 1e-3:
        return pcm
    x = pcm.astype(np.float32)
    if abs(tempo - 1.0) >= 1e-3 and len(x) > 1:
        n = max(1, int(len(x) / tempo))
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    return np.clip(x * gain, -32768, 32767).astype(np.int16)


# HIS OWN VOICE, COMING BACK (Oct 2026). A player on laptop speakers plays
# Rollo out loud and their mic hears him; browsers don't cancel the casino's
# 3D audio as echo. Measured in his log: "talked over him" two or three
# seconds into nearly every line, so he stopped mid-sentence and jumped to
# the next one — and sometimes answered his own words. Anything he hears that
# is mostly the words he just said is his echo, not a person.
# about 12 MB of audio at most: 24 kHz 16-bit, a few seconds a line
TTS_CACHE_LINES = 64
ECHO_WINDOW_S = 25.0
ECHO_SHARE = 0.6
# how long after his voice stops it can still be coming back in a mic
ECHO_LATE_S = 1.5
# how long a cloned-voice server that failed or timed out sits out
CLONE_BENCH_S = 45.0
# TURN-TAKING (Oct 14 2026): nobody starts while a regular close by is
# mid-sentence. A line of their own waits up to TURN_WAIT_SAY_S for the gap
# and is dropped if it doesn't come (it was idle talk; the moment passed);
# an answer to a player waits up to TURN_WAIT_ANSWER_S and then goes —
# somebody is standing there waiting for it. After a wait, a natural beat.
TURN_WAIT_SAY_S = 6.0
TURN_WAIT_ANSWER_S = 5.0
TURN_BEAT_S = (0.35, 0.8)


def words_of(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9']+", text.lower().replace("’", "'")) if len(w) > 1]


# Words every sentence has. With four regulars talking, "what they just
# said" covered "yeah what about you" and a player's real reply was thrown
# away as an echo (review, Oct 14 2026): only the words that carry meaning
# are compared.
STOPWORDS = set("""a an and are as at be but by do for from go got have he her him his how i if in is it its
me my no not of oh ok okay on or so that the then there they this to up was we well what when where who why
will with yeah yes you your i'm it's don't that's you're""".split())


def is_echo(heard: str, recent: list[str]) -> bool:
    """Most of what was heard is in what he just said."""
    hw = [w for w in words_of(heard) if w not in STOPWORDS]
    if not hw:
        return False
    said = set(w for line in recent for w in words_of(line) if w not in STOPWORDS)
    return sum(1 for w in hw if w in said) / len(hw) >= ECHO_SHARE


def split_opening(sentence: str) -> list[str]:
    """A long sentence's first clause on its own: at the first comma, dash or
    semicolon that leaves 3-10 words in front and at least 3 behind. A short
    sentence, or one with no good break, stays whole."""
    words = sentence.split()
    if len(words) < 9:
        return [sentence]
    for m in re.finditer(r"[,;]\s+|\s+[-—–]+\s+", sentence):
        head, tail = sentence[:m.start()].strip(), sentence[m.end():].strip()
        if 3 <= len(head.split()) <= 10 and len(tail.split()) >= 3:
            sep = m.group().strip()
            return [head + ("," if sep in (",", ";") else ""), tail]
    return [sentence]


def log(*a):
    print(time.strftime("%H:%M:%S"), "[rollo]", *a, flush=True)



# THE CAST (Oct 2026): the floor has four regulars now (src/npc/cast.ts), two
# on the floor at a time. One agent voices them all: ONE set of ears (a single
# subscription to the room — Whisper runs once whoever is being spoken to) and
# a mouth per regular, each its own LiveKit identity so every player's client
# places each voice at that regular's body. A line heard goes to the regular
# standing nearest the speaker among those who can hear them.
VOICES_DIR = Path(ENV.get("ROLLO_VOICES_DIR", r"D:\solace-ai\models\voices"))
# their thinking noises, in their own words
# THE SMALL SOUNDS (Oct 2026, previewed by Josh): the voice clone's own tags
# ([laugh], [groan], [sigh], [gasp], [chuckle]) open a line the server marks
# with one, and a player who keeps talking gets a quiet "I'm listening" from
# whoever they're talking to, once a sentence.
TAG = re.compile(r"\[[a-z ]+\]\s*")
BACKCHANNEL_AFTER_S = 2.8
# off until Josh okays the preview reels; ROLLO_BACKCHANNEL=1 turns it on
BACKCHANNEL = os.environ.get("ROLLO_BACKCHANNEL", "0") == "1"
BACKCHANNEL_LINES = {
    "rollo": ["Mm-hm.", "Yeah, yeah.", "[chuckle]"],
    "duke": ["Mm-hm.", "Uh-huh.", "[chuckle]"],
    "tasha": ["Mm-hm.", "Mmm.", "[chuckle]"],
    "chase": ["Mm-hm.", "Yeah, yeah.", "[chuckle]"],
}
BACKCHANNEL_GAIN = 0.75

FILLER_LINES = {
    "rollo": FILLERS,
    "duke": ["Hmm.", "Now hold on, son.", "Well, lemme tell ya.", "Heh. Okay."],
    "tasha": ["Mm.", "Oh, honey...", "Well...", "Mm-hm."],
    "chase": ["Bro...", "Okay, so...", "Hmm.", "Yeah, yeah."],
}


class Listener:
    """A house character the agent hears for but never voices (Sterling behind
    his bar): the line goes to /hear and the server puts his answer on the
    players' screens as blips and a subtitle."""

    def __init__(self, lid: int, npc: str, name: str):
        self.id, self.npc, self.name = lid, npc, name
        self.active = False
        self.near: dict[str, float] = {}
        self.busy = False

    async def hear(self, agent: "Agent", identity: str, text: str):
        if self.busy:
            return
        self.busy = True
        try:
            r = await agent.api("POST", "/api/npc/agent/hear", {"speakerId": int(identity), "text": text, "npcId": self.id})
            log(f"{self.name} heard {identity}: {'answered' if r.get('text') else r.get('reason', 'silent')}")
        except Exception as e:  # noqa: BLE001
            log(f"{self.name} hear:", e)
        finally:
            self.busy = False


class Voice:
    """One regular's mouth: their room connection, what they're saying, what
    they just said (the echo check reads it), their mood and their fillers."""

    def __init__(self, agent: "Agent", info: dict):
        self.agent = agent
        self.id = int(info["id"])
        self.npc = str(info.get("npc") or "rollo")
        self.name = str(info.get("name") or self.npc)
        v = info.get("voice") or {}
        self.kokoro_voice = str(v.get("kokoro") or VOICE)
        clone = str(v.get("clone") or "")
        # "" is the voice server's own (Rollo); any other needs its reference
        # recording on this PC, or this regular speaks with Kokoro
        self.clone = clone if (clone == "" or (VOICES_DIR / f"{clone}.mp3").is_file()) else None
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=4)
        self.near: dict[str, float] = {}
        self.active = False
        self.mood = "even"
        self.drunk = False
        self.speaking = False
        self.voice_until = 0.0
        self.cut = False
        self.said: list[tuple[float, str]] = []
        self.fillers: list[np.ndarray] = []
        self.fillers_cloned = False
        self.fillers_at = 0.0
        self.backchannels: list[np.ndarray] = []
        self.murmuring = False
        # the floor is ours: set the moment a wait for a turn is over, before
        # the first frame plays, so two can't both take the same gap
        self.holding = False
        self.source: rtc.AudioSource | None = None
        self.task: asyncio.Task | None = None
        # one subtitle request at a time, in order: two fire-and-forget posts
        # could land "" before the line and leave the subtitle stuck
        self.tell_lock = asyncio.Lock()

    def recent_lines(self) -> list[str]:
        now = time.time()
        self.said = [(t, s) for t, s in self.said if now - t < ECHO_WINDOW_S]
        return [s for _, s in self.said]

    def tell(self, text: str):
        """The subtitle follows the voice: tell the server what they're saying
        now ("" = stopped short). Fire and forget."""
        async def go():
            try:
                async with self.tell_lock:
                    await self.agent.api("POST", "/api/npc/agent/said", {"text": text, "npcId": self.id})
            except Exception as e:  # noqa: BLE001
                log(f"{self.npc} said:", e)
        asyncio.create_task(go())

    def synthesize(self, text: str) -> np.ndarray:
        return self.agent.synthesize(text, self.clone, self.kokoro_voice)

    async def voiced(self, text: str, noise: str | None = None):
        """A line sentence by sentence, the NEXT sentence voiced while this
        one plays. Stops when they're cut off. A reaction sound (a laugh, a
        groan) opens the first part, in their own voice."""
        loop = asyncio.get_running_loop()
        parts = [p for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()] or [text]
        parts[0:1] = split_opening(parts[0])
        if noise and re.fullmatch(r"[a-z ]+", noise):
            parts[0] = f"[{noise}] {parts[0]}"
        nxt = loop.run_in_executor(None, self.synthesize, parts[0])
        for i in range(len(parts)):
            pcm = await nxt
            if i + 1 < len(parts):
                nxt = loop.run_in_executor(None, self.synthesize, parts[i + 1])
            if self.cut:
                return
            yield pcm

    async def speak(self, pcm: np.ndarray):
        if not self.source:
            return
        pcm = color_voice(pcm, self.mood, self.drunk)
        step = SPEAK_RATE // 100  # 10 ms frames
        self.speaking = True
        try:
            for i in range(0, len(pcm), step):
                if self.cut:
                    self.source.clear_queue()
                    break
                chunk = pcm[i:i + step]
                if len(chunk) < step:
                    chunk = np.pad(chunk, (0, step - len(chunk)))
                await self.source.capture_frame(rtc.AudioFrame(chunk.tobytes(), SPEAK_RATE, 1, step))
        finally:
            await asyncio.sleep(0.3)
            self.speaking = False
            self.voice_until = time.time()

    def shares_room(self, other: "Voice") -> bool:
        """Somebody can hear both of us: their listeners overlap."""
        return bool(self.near.keys() & other.near.keys())

    async def wait_turn(self, max_wait: float) -> bool:
        """Wait until no regular close by is talking (or holding the floor),
        then a beat. False when the gap never came."""
        waited = False
        t0 = time.time()
        while True:
            busy = [v for v in self.agent.voices.values() if v is not self and (v.speaking or v.holding) and self.shares_room(v)]
            if not busy:
                break
            if time.time() - t0 > max_wait:
                return False
            waited = True
            await asyncio.sleep(0.1)
        self.holding = True
        if waited:
            await asyncio.sleep(random.uniform(*TURN_BEAT_S))
        return True

    async def say_line(self, text: str, first_hook=None, noise: str | None = None, verdict=None, own: bool = False):
        """Voice a line. With `verdict` (a pending /cleared call, Oct 13 2026)
        the line is only a DRAFT: its first part is built while the server's
        last read of it runs, and NOTHING is played or shown until the verdict
        returns the same text. Returns (played, replacement): a refused or
        changed line comes back as the replacement, unplayed."""
        t0 = time.time()
        gen = self.voiced(text, noise)
        first = asyncio.ensure_future(gen.__anext__())
        if verdict is not None:
            try:
                final = (await verdict).get("text")
            except Exception as e:  # noqa: BLE001
                log(f"{self.npc} cleared:", e)
                final = None
            if final != text:
                try:
                    await first
                except (StopAsyncIteration, Exception):  # noqa: BLE001
                    pass
                await gen.aclose()
                return False, final
        started = False
        try:
            while True:
                try:
                    pcm = await first
                except StopAsyncIteration:
                    break
                if not started:
                    # out of the room (the session dropped): nothing would be
                    # heard, so nothing is shown either
                    if not self.source:
                        await gen.aclose()
                        return False, None
                    # TURN-TAKING: the first part is ready; wait for the gap
                    t_ready = time.time()
                    if not await self.wait_turn(TURN_WAIT_SAY_S if own else TURN_WAIT_ANSWER_S) and own:
                        log(f"{self.npc}: no gap to say it in — let it go")
                        await gen.aclose()
                        return False, None
                    started = True
                    t_air = time.time()
                    # THE TIMING LINE (Oct 17 2026): when a line went on air,
                    # how long its first part took to make and how long it
                    # waited for a turn — read against a listener's ear
                    log(f"{self.npc}: on air {len(text)} chars · first part {t_ready - t0:.1f}s · turn {t_air - t_ready:.1f}s")
                    self.said.append((time.time(), text))
                    self.tell(text)
                    if first_hook:
                        first_hook()
                await self.speak(pcm)
                first = asyncio.ensure_future(gen.__anext__())
        except Exception:
            if started:
                self.tell("")
            raise
        finally:
            self.holding = False
        # "stopped" at the end of EVERY line (Oct 17 2026), not only a cut one:
        # the subtitle and the server's on-air flag follow the voice, and a
        # line that finished normally left the box to a guess from its length
        if started:
            self.tell("")
            log(f"{self.npc}: off air after {time.time() - t_air:.1f}s{' (cut)' if self.cut else ''}")
        return started, None

    async def render_fillers(self):
        """Their "hmm"s and "mm-hm"s, rendered once. Whether every one came out
        in the cloned voice is kept (`fillers_cloned`): one rendered in a bad
        moment came out of Kokoro, and the near loop renders them again once
        the clone is back rather than keeping a stranger's "hmm" forever."""
        loop = asyncio.get_running_loop()
        want = self.agent.clone_ready and self.clone is not None
        cloned = True
        out = []
        for line in FILLER_LINES.get(self.npc, FILLERS):
            try:
                pcm, c = await loop.run_in_executor(None, self.agent.synthesize_ex, line, self.clone, self.kokoro_voice)
                cloned = cloned and c
                out.append(pcm)
            except Exception as e:  # noqa: BLE001
                log(f"{self.npc} filler failed:", e)
                cloned = False
        self.fillers = out
        back = []
        for line in BACKCHANNEL_LINES.get(self.npc, BACKCHANNEL_LINES["rollo"]):
            try:
                pcm, c = await loop.run_in_executor(None, self.agent.synthesize_ex, line, self.clone, self.kokoro_voice)
                cloned = cloned and c
                if len(pcm) > SPEAK_RATE // 10:
                    back.append(pcm)
            except Exception as e:  # noqa: BLE001
                log(f"{self.npc} backchannel failed:", e)
                cloned = False
        self.backchannels = back
        self.fillers_cloned = cloned if want else not (self.clone is not None and CLONE)
        self.fillers_at = time.time()

    async def murmur(self):
        """A quiet "mm-hm" while somebody's still talking to them. Not
        SPEAKING — the listener must not read it as a regular talking over a
        player (that would cut the player off) — and never over a real line."""
        if not self.source or self.speaking or self.murmuring or not self.backchannels:
            return
        if any(v is not self and (v.speaking or v.holding) and self.shares_room(v) for v in self.agent.voices.values()):
            return
        self.murmuring = True
        try:
            pcm = (random.choice(self.backchannels).astype(np.float32) * BACKCHANNEL_GAIN).astype(np.int16)
            step = SPEAK_RATE // 100
            for i in range(0, len(pcm), step):
                if self.speaking:
                    break
                chunk = pcm[i:i + step]
                if len(chunk) < step:
                    chunk = np.pad(chunk, (0, step - len(chunk)))
                await self.source.capture_frame(rtc.AudioFrame(chunk.tobytes(), SPEAK_RATE, 1, step))
        finally:
            self.murmuring = False

    def stop_saying(self):
        """Cut short (talked over, or dead): lines they queued on their own can
        wait; anything somebody said TO them stays."""
        self.cut = True
        kept = []
        while not self.queue.empty():
            item = self.queue.get_nowait()
            if item[0] != "say":
                kept.append(item)
        for item in kept:
            self.queue.put_nowait(item)

    async def worker(self):
        loop = asyncio.get_running_loop()
        while True:
            kind, item = await self.queue.get()
            self.cut = False
            try:
                if kind == "say":
                    text, noise = item
                    log(f"{self.npc}: saying {len(text)} chars on their own{f' [{noise}]' if noise else ''}")
                    await self.say_line(text, noise=noise, own=True)
                    continue
                identity, text = item
                t1 = time.time()
                # `early`: the server hands back a DRAFT as soon as one exists,
                # and the voice is built while its last read runs (say_line).
                hear = asyncio.create_task(self.agent.api("POST", "/api/npc/agent/hear", {"speakerId": int(identity), "text": text, "npcId": self.id, "early": True}))
                done, _ = await asyncio.wait({hear}, timeout=FILLER_AFTER_S)
                if not done and self.fillers and not self.cut and random.random() < FILLER_ODDS:
                    await self.speak(random.choice(self.fillers))
                r = await hear
                t2 = time.time()
                said = lambda: log(f"{self.npc}: heard {len(text)} chars · brain {t2 - t1:.1f}s · first words {time.time() - t2:.1f}s")  # noqa: E731
                draft = r.get("draft")
                if draft and r.get("ticket"):
                    cleared = asyncio.create_task(self.agent.api("POST", "/api/npc/agent/cleared", {"ticket": r["ticket"]}))
                    played, other = await self.say_line(draft, said, verdict=cleared)
                    if not played and other and not self.cut:
                        log(f"{self.npc}: the draft was changed before it was said")
                        await self.say_line(other, said)
                    continue
                reply = r.get("text")
                if not reply:
                    log(f"{self.npc}: no answer ({r.get('reason')})")
                    continue
                await self.say_line(reply, said)
            except Exception as e:  # noqa: BLE001
                log(f"{self.npc} turn failed:", e)

    async def session_loop(self, listen: bool):
        """Their seat in the casino's voice room, kept connected. The FIRST
        regular's connection is also the ears (subscribes to every player);
        the others only publish."""
        while True:
            try:
                await self.session(listen)
            except Exception as e:  # noqa: BLE001
                log(f"{self.npc} disconnected:", e)
            self.source = None
            await asyncio.sleep(5)

    async def session(self, listen: bool):
        grant = await self.agent.api("POST", "/api/npc/agent/token", {"npcId": self.id})
        room = rtc.Room()
        listeners: dict[str, asyncio.Task] = {}
        if listen:
            @room.on("track_subscribed")
            def _on_track(track: rtc.Track, _pub, participant: rtc.RemoteParticipant):
                ident = participant.identity
                if track.kind == rtc.TrackKind.KIND_AUDIO and ident.isdigit() and not self.agent.is_cast(ident):
                    log(f"ears: a mic from {ident!r}")
                    old = listeners.get(ident)
                    if old:
                        old.cancel()
                    listeners[ident] = asyncio.create_task(self.agent.listen(ident, track))

            @room.on("participant_disconnected")
            def _on_gone(participant: rtc.RemoteParticipant):
                t = listeners.pop(participant.identity, None)
                if t:
                    t.cancel()

        done = asyncio.Event()
        room.on("disconnected", lambda *_: done.set())
        await room.connect(grant["url"], grant["token"], options=rtc.RoomOptions(auto_subscribe=listen))
        self.source = rtc.AudioSource(SPEAK_RATE, 1)
        track = rtc.LocalAudioTrack.create_audio_track(f"{self.npc}-voice", self.source)
        await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        log(f"{self.name} in the room as {grant['identity']}{' — and listening' if listen else ''}")

        async def roll_call():
            last = None
            while not done.is_set():
                who = []
                for ident, p in room.remote_participants.items():
                    if self.agent.is_cast(ident):
                        continue
                    mics = sum(1 for pub in p.track_publications.values() if pub.kind == rtc.TrackKind.KIND_AUDIO)
                    who.append(f"{ident}{'' if mics else '(no mic)'}")
                now_who = " ".join(sorted(who)) or "nobody"
                if now_who != last:
                    log("in the voice room:", now_who)
                    last = now_who
                await asyncio.sleep(5)

        rc = asyncio.create_task(roll_call()) if listen else None
        await done.wait()
        if rc:
            rc.cancel()
        for t in listeners.values():
            t.cancel()


class Agent:
    def __init__(self):
        if not SECRET:
            raise SystemExit("NPC_AGENT_SECRET is not set in .env")
        self.whisper = None
        if EARS:
            log("loading Whisper (large-v3-turbo, GPU)…")
            self.whisper = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8_float16",
                                        download_root=str(MODELS / "whisper"))
        else:
            log("speaking only (ROLLO_EARS=0): no Whisper, nobody heard")
        log("loading the voice (Kokoro)…")
        self.kokoro = Kokoro(str(MODELS / "kokoro" / "kokoro-v1.0.onnx"), str(MODELS / "kokoro" / "voices-v1.0.bin"))
        # finished lines, most recent last — (clone?, voice, text) -> pcm
        self.tts_cache: OrderedDict = OrderedDict()
        self.tts_lock = threading.Lock()
        # the voice servers: port -> up?; and how many lines each is making
        self.clone_up: dict[int, bool] = {}
        # a server that failed or timed out sits out CLONE_BENCH_S: without
        # it a wedged 8781 (it wins every tie) made almost every line wait
        # the whole timeout before trying 8782
        self.clone_bench: dict[int, float] = {}
        # Kokoro's phonemizer isn't safe on two threads at once, and it runs
        # concurrently exactly when both clones are busy
        self.kokoro_lock = threading.Lock()
        self.clone_busy: dict[int, int] = {}
        self.clone_pick = threading.Lock()
        self.vad = load_vad() if EARS else None
        self.http: aiohttp.ClientSession | None = None
        self.voices: dict[int, Voice] = {}
        # STERLING AT HIS BAR (src/npc/barsterling.ts): heard, never voiced —
        # he answers in robot blips on the players' screens, so a heard line is
        # posted to /hear and nothing is played here.
        self.listeners: dict[int, Listener] = {}
        self.heard: asyncio.Queue = asyncio.Queue(maxsize=6)
        # THE SEASON'S HOST (src/npc/seasons/host.ts): lines the server wrote,
        # voiced with the "host" reference and posted back as audio. Never
        # played here — the watchers' screens play it.
        self.host_lines: asyncio.Queue = asyncio.Queue(maxsize=6)
        self.host_seen: set[int] = set()
        # SOLACE SURVIVORZ (src/survivorz/voices.ts): the survivors' lines, each
        # with its clone; rendered and posted back, played by the watchers' screens
        self.surv_lines: asyncio.Queue = asyncio.Queue(maxsize=8)
        self.surv_seen: set[int] = set()

    @property
    def clone_ready(self) -> bool:
        return any(self.clone_up.values())

    def is_cast(self, identity: str) -> bool:
        return identity.isdigit() and int(identity) in self.voices

    # ---- the server ----------------------------------------------------------
    async def api(self, method: str, path: str, body: dict | None = None) -> dict:
        assert self.http
        async with self.http.request(method, SOLACE + path, json=body, headers={"x-agent-secret": SECRET},
                                     timeout=aiohttp.ClientTimeout(total=40)) as r:
            if r.status != 200:
                raise RuntimeError(f"{method} {path} -> {r.status}")
            return await r.json()

    async def near_loop(self):
        """A heartbeat (each regular is voiced while it beats) that says who's
        close enough to talk to each of them — only those mics are transcribed
        — and hands over what they've said on their own."""
        while True:
            try:
                st = await self.api("GET", "/api/npc/agent/near?v=2&sz=1")
                npcs = st.get("npcs")
                if not isinstance(npcs, list):
                    log("the server answered without a cast list — is it up to date?")
                    await asyncio.sleep(5)
                    continue
                for info in st.get("listeners", []) or []:
                    lid = int(info["id"])
                    lst = self.listeners.get(lid)
                    if lst is None:
                        lst = self.listeners[lid] = Listener(lid, str(info.get("npc", "")), str(info.get("name", "")))
                        log(f"{lst.name}: listening only (answers on screen)")
                    lst.active = bool(info.get("active"))
                    lst.near = {str(p["id"]): float(p.get("dist", 99)) for p in info.get("near", [])}
                for info in npcs:
                    vid = int(info["id"])
                    v = self.voices.get(vid)
                    if v is None:
                        v = self.voices[vid] = Voice(self, info)
                        log(f"{v.name}: voice {'clone ' + (v.clone or 'rollo') if v.clone is not None else 'kokoro ' + v.kokoro_voice}")
                        asyncio.create_task(v.worker())
                        v.task = asyncio.create_task(v.session_loop(listen=EARS and len(self.voices) == 1))
                        if self.clone_ready or not CLONE:
                            asyncio.create_task(v.render_fillers())
                    v.active = bool(info.get("active"))
                    v.near = {str(p["id"]): float(p.get("dist", 99)) for p in info.get("near", [])}
                    v.mood = str(info.get("mood") or "even")
                    v.drunk = bool(info.get("drunk"))
                    if info.get("doing") == "dead":
                        if v.speaking and not v.cut:
                            log(f"{v.npc} is dead — cutting them off")
                            v.tell("")
                        v.cut = True
                        while not v.queue.empty():
                            v.queue.get_nowait()
                        continue
                    for line in info.get("say", []) or []:
                        text, noise = (line.get("text", ""), line.get("noise")) if isinstance(line, dict) else (str(line), None)
                        if text and not v.queue.full():
                            v.queue.put_nowait(("say", (text, noise)))
                for line in st.get("host", []) or []:
                    hid = int(line.get("id", 0)) if isinstance(line, dict) else 0
                    if hid and hid not in self.host_seen and not self.host_lines.full():
                        self.host_seen.add(hid)
                        self.host_lines.put_nowait((hid, str(line.get("text", ""))))
                for line in st.get("survivorz", []) or []:
                    sid = int(line.get("id", 0)) if isinstance(line, dict) else 0
                    if sid and sid not in self.surv_seen and not self.surv_lines.full():
                        self.surv_seen.add(sid)
                        self.surv_lines.put_nowait((sid, str(line.get("text", "")), line.get("clone"), str(line.get("kokoro") or "am_michael"), str(line.get("who", ""))))
            except Exception as e:  # noqa: BLE001
                log("near:", e)
            # THE HEARTBEAT (slopbot, Oct 13 2026): touched every pass of this
            # loop, answered or not; a timer restarts the service if it goes
            # stale, which catches a hang that systemd's Restart= (crashes
            # only) can't. It used to be touched only on a GOOD check-in, so
            # the R220 down for two minutes read as a hang here and the
            # service reloaded Whisper and both voices every five (review,
            # Oct 14 2026). A hung request never reaches this line.
            if HEARTBEAT:
                try:
                    HEARTBEAT.touch()
                except OSError:
                    pass
            # their "hmm"s came out of Kokoro in a bad moment: again, now the
            # clone is back (at most once a minute per regular)
            if self.clone_ready:
                for v in self.voices.values():
                    if not v.fillers_cloned and v.clone is not None and time.time() - v.fillers_at > 60:
                        v.fillers_at = time.time()
                        asyncio.create_task(v.render_fillers())
            await asyncio.sleep(1.0)

    def nearest(self, identity: str) -> "Voice | Listener | None":
        best, bd = None, 1e9
        for v in [*self.voices.values(), *self.listeners.values()]:
            d = v.near.get(identity)
            if v.active and d is not None and d < bd:
                best, bd = v, d
        return best

    def near_anyone(self, identity: str) -> bool:
        return any(identity in v.near for v in self.voices.values()) or             any(l.active and identity in l.near for l in self.listeners.values())

    def speaking_near(self, identity: str) -> bool:
        return any(v.speaking for v in self.voices.values() if identity in v.near)

    def recent_lines(self, identity: str) -> list[str]:
        """What the regulars whose voices can reach this player's mic just
        said — only they can echo into it (review, Oct 14 2026: reading every
        regular on the floor, four of them, threw real lines away)."""
        return [s for v in self.voices.values() if identity in v.near for s in v.recent_lines()]

    def heard_late(self, began: float, identity: str) -> bool:
        return any(v.speaking or began <= v.voice_until + ECHO_LATE_S for v in self.voices.values() if identity in v.near)

    def addressed(self, identity: str, text: str) -> "Voice | Listener | None":
        """A regular near the speaker who was called by name ("hey Tasha")
        wins over whoever happens to stand closest."""
        low = text.lower()
        for v in [*self.voices.values(), *self.listeners.values()]:
            if v.active and identity in v.near and v.name and re.search(rf"\b{re.escape(v.name.split()[0].lower())}\b", low):
                return v
        return None

    def route(self, identity: str, text: str) -> "Voice | Listener | None":
        """Who answers: the one named, else the nearest — and past a regular
        whose queue is full to the next nearest, rather than dropping it."""
        named = self.addressed(identity, text)
        if named is not None and not (isinstance(named, Voice) and named.queue.full()):
            return named
        ranked = sorted((v for v in [*self.voices.values(), *self.listeners.values()] if v.active and identity in v.near),
                        key=lambda v: v.near[identity])
        for v in ranked:
            if not (isinstance(v, Voice) and v.queue.full()):
                return v
        return None

    # ---- listening -------------------------------------------------------------
    async def listen(self, identity: str, track: rtc.Track):
        stream = rtc.AudioStream(track, sample_rate=LISTEN_RATE, num_channels=1)
        vad = StreamVAD(self.vad)
        seg = Segmenter(end_s=END_SILENCE_S, floor_rms=FLOOR_RMS)
        peak, frames, reported = 0.0, 0, time.time()
        backed = False
        async for ev in stream:
            frame = ev.frame
            pcm = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0
            frames += 1
            if len(pcm):
                peak = max(peak, float(np.sqrt(np.mean(pcm * pcm))))
            near_any = self.near_anyone(identity)
            if time.time() - reported > 60:
                log(f"mic {identity}: {frames} frames, loudest {peak:.3f} (floor {FLOOR_RMS}), near={near_any}")
                peak, frames, reported = 0.0, 0, time.time()
            if not near_any:
                seg.reset()
                vad.reset()
                continue
            for win, prob in vad.feed(pcm):
                # still talking a while into a sentence: whoever they're
                # talking to says "mm-hm", once a sentence
                if BACKCHANNEL and seg.talking and seg.total >= BACKCHANNEL_AFTER_S and not backed:
                    backed = True
                    v = self.nearest(identity)
                    if isinstance(v, Voice) and not v.speaking:
                        asyncio.create_task(v.murmur())
                if not seg.talking:
                    backed = False
                for e in seg.push(win, prob, self.speaking_near(identity)):
                    if e[0] == "barge" and BARGE:
                        asyncio.create_task(self.check_barge(identity, e[1]))
                    elif e[0] == "utterance" and not self.heard.full():
                        log(f"caught {len(e[1]) / LISTEN_RATE:.1f}s of speech from {identity}")
                        self.heard.put_nowait((identity, e[1], time.time() - len(e[1]) / LISTEN_RATE))

    async def check_barge(self, identity: str, audio: np.ndarray):
        """Somebody seems to be talking over a regular. Stop only if it's
        really somebody — not a regular's voice played back through speakers."""
        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, self.transcribe, audio)
        if not text or text.lower() in HALLUCINATIONS or not words_of(text):
            return
        if is_echo(text, self.recent_lines(identity)):
            log(f"heard a regular through {identity}'s speakers — carries on")
            return
        # only the one they're talking to stops (review, Oct 14 2026: every
        # regular near the speaker was cut, so talking to Duke silenced Tasha
        # mid-line to somebody else)
        v = self.route(identity, text)
        if isinstance(v, Voice) and v.speaking and not v.cut:
            log(f"{identity} talked over {v.npc} — they stop")
            v.stop_saying()

    async def ears(self):
        """Every utterance near any regular: transcribed once, then handed to
        the regular standing nearest the speaker."""
        loop = asyncio.get_running_loop()
        while True:
            identity, audio, began = await self.heard.get()
            try:
                text = await loop.run_in_executor(None, self.transcribe, audio)
                if len(text.split()) < 2 or text.lower() in HALLUCINATIONS:
                    log(f"ignored a {len(text)}-char transcript (too short / noise)")
                    continue
                if self.heard_late(began, identity) and is_echo(text, self.recent_lines(identity)):
                    log(f"ignored {identity}: it was a regular's own voice coming back ({len(text)} chars)")
                    continue
                v = self.route(identity, text)
                if not v:
                    log(f"ignored {identity}: nobody near enough to hear them (or all of them busy)")
                    continue
                if isinstance(v, Listener):
                    asyncio.create_task(v.hear(self, identity, text))
                    continue
                v.queue.put_nowait(("heard", (identity, text)))
            except Exception as e:  # noqa: BLE001
                log("ears:", e)

    # ---- speech ------------------------------------------------------------------
    def transcribe(self, audio: np.ndarray) -> str:
        segs, _ = self.whisper.transcribe(audio, language="en", beam_size=1, vad_filter=True,
                                          condition_on_previous_text=False, initial_prompt=VOCAB)
        return " ".join(s.text.strip() for s in segs).strip()

    def synthesize(self, text: str, clone: str | None, kokoro_voice: str) -> np.ndarray:
        return self.synthesize_ex(text, clone, kokoro_voice)[0]

    def synthesize_ex(self, text: str, clone: str | None, kokoro_voice: str) -> tuple[np.ndarray, bool]:
        """A line in a regular's voice — from the cache when they've said
        these exact words before. Cached RAW: mood is laid on at speak time.
        Returns the audio and whether it is the cloned voice. It is cached
        under the engine that ACTUALLY made it (review, Oct 14 2026): a
        Kokoro fallback filed under the clone's key played that line in the
        wrong voice every time it came round again."""
        use_clone = self.clone_ready and clone is not None
        text = text.strip()
        key = (use_clone, clone if use_clone else kokoro_voice, text)
        with self.tts_lock:
            hit = self.tts_cache.get(key)
            if hit is not None:
                self.tts_cache.move_to_end(key)
                return hit, use_clone
        pcm, cloned = self._synthesize(text, clone if use_clone else None, kokoro_voice)
        made = (True, clone, text) if cloned else (False, kokoro_voice, text)
        with self.tts_lock:
            self.tts_cache[made] = pcm
            while len(self.tts_cache) > TTS_CACHE_LINES * 2:
                self.tts_cache.popitem(last=False)
        return pcm, cloned

    def _take_voice(self, skip: set[int]) -> int | None:
        """The voice server with the fewest lines in hand (the first, full one
        on a tie), marked busy; None when none is up."""
        with self.clone_pick:
            now = time.time()
            ports = [p for p, up in self.clone_up.items() if up and p not in skip and now >= self.clone_bench.get(p, 0.0)]
            if not ports:
                return None
            port = min(ports, key=lambda p: (self.clone_busy.get(p, 0), p))
            self.clone_busy[port] = self.clone_busy.get(port, 0) + 1
            return port

    def _give_voice(self, port: int) -> None:
        with self.clone_pick:
            self.clone_busy[port] = max(0, self.clone_busy.get(port, 0) - 1)

    def _synthesize(self, text: str, clone: str | None, kokoro_voice: str) -> tuple[np.ndarray, bool]:
        tried: set[int] = set()
        while clone is not None:
            port = self._take_voice(tried)
            if port is None:
                break
            tried.add(port)
            try:
                body = {"text": text, **({"voice": clone} if clone else {})}
                req = urllib.request.Request(f"http://127.0.0.1:{port}/say", data=json.dumps(body).encode(),
                                             headers={"content-type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=CLONE_TIMEOUT_S) as r:
                    pcm = np.frombuffer(r.read(), dtype="<i2").astype(np.int16)
                if len(pcm):
                    return pcm, True
            except Exception as e:  # noqa: BLE001
                log(f"cloned voice on {port} failed — benched {CLONE_BENCH_S:.0f}s:", e)
                with self.clone_pick:
                    self.clone_bench[port] = time.time() + CLONE_BENCH_S
            finally:
                self._give_voice(port)
        if clone is not None:
            log("no cloned voice free, Kokoro this time")
        text = TAG.sub("", text).strip()
        if not text:
            return np.zeros(SPEAK_RATE // 20, dtype=np.int16), False
        with self.kokoro_lock:
            samples, rate = self.kokoro.create(text, voice=kokoro_voice, speed=1.05, lang="en-us")
        if rate != SPEAK_RATE:
            idx = np.linspace(0, len(samples) - 1, int(len(samples) * SPEAK_RATE / rate))
            samples = np.interp(idx, np.arange(len(samples)), samples)
        return (np.clip(samples, -1, 1) * 32767).astype(np.int16), False

    # ---- the cloned voice ---------------------------------------------------------
    async def clone_loop(self, port: int, half: bool):
        """Keep one cloned voice running: start voice_server.py on `port`, wait
        until it answers, and start it again if it ever dies."""
        script = Path(__file__).parent / "voice_server.py"
        url = f"http://127.0.0.1:{port}"
        self.clone_up[port] = False
        while True:
            if not CLONE_PY.is_file():
                log(f"cloned voice: no venv at {CLONE_PY}; Kokoro it is")
                return
            # Not our LD_LIBRARY_PATH: on slopbot it points at Whisper's cuDNN 9
            # for CUDA 12, and the voice venv's PyTorch brings its own for
            # CUDA 13 — handed down, it crashes loading the wrong one.
            env = {k: v for k, v in os.environ.items() if k != "LD_LIBRARY_PATH"}
            env["ROLLO_CLONE_PORT"] = str(port)
            if half:
                env["ROLLO_VOICE_HALF"] = "1"
            proc = await asyncio.create_subprocess_exec(str(CLONE_PY), "-I", str(script), env=env)
            for _ in range(180):  # the model takes ~30s to load
                if proc.returncode is not None:
                    break
                try:
                    with urllib.request.urlopen(url + "/health", timeout=2) as r:
                        if r.read() == b"ok":
                            first = not self.clone_ready
                            self.clone_up[port] = True
                            log(f"cloned voice ready on {port}{' (half precision)' if half else ''}")
                            if first:
                                for v in list(self.voices.values()):
                                    asyncio.create_task(v.render_fillers())
                            break
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(1)
            if not self.clone_up.get(port) and proc.returncode is None:
                log(f"cloned voice on {port} never answered — stopping it")
                proc.kill()
            await proc.wait()
            self.clone_up[port] = False
            log(f"cloned voice on {port} stopped ({proc.returncode}); restarting in 10s")
            await asyncio.sleep(10)

    async def host_worker(self):
        """The season's host: render each line in the host's voice and post it
        back, downsampled so a line fits the server's body cap."""
        clone = "host" if (VOICES_DIR / "host.mp3").is_file() else None
        log(f"the host: voice {'clone host' if clone else 'kokoro bm_george'}")
        while True:
            hid, text = await self.host_lines.get()
            if not text:
                continue
            try:
                t0 = time.time()
                pcm = await asyncio.to_thread(self.synthesize, text, clone, "bm_george")
                # the server's JSON cap is 1 MB: 16 kHz holds ~22 s of base64'd
                # audio, so a long results line goes at 12 kHz (25 s fits)
                rate = 16_000 if len(pcm) / SPEAK_RATE <= 22 else 12_000
                if SPEAK_RATE != rate and len(pcm):
                    idx = np.linspace(0, len(pcm) - 1, int(len(pcm) * rate / SPEAK_RATE))
                    pcm = np.interp(idx, np.arange(len(pcm)), pcm.astype(np.float32)).astype(np.int16)
                import base64
                got = await self.api("POST", "/api/npc/agent/host-audio", {"id": hid, "rate": rate, "pcm": base64.b64encode(pcm.tobytes()).decode()})
                took = time.time() - t0
                # a clip the server no longer wants was LATE — it used to be
                # dropped without a word, which is how the announcer went silent
                if not got.get("ok"):
                    log(f"host: line {hid} arrived too late ({took:.1f}s) and was dropped")
                else:
                    log(f"host: line {hid} voiced in {took:.1f}s ({len(pcm) / rate:.1f}s of audio)")
            except Exception as e:  # noqa: BLE001
                log("host:", e)
            if len(self.host_seen) > 500:
                self.host_seen = set(sorted(self.host_seen)[-100:])

    async def share_voices(self) -> None:
        """Hand the server's voice library the references only this machine has (the survivors' picked
        voices), so the character creator can play and choose them. Once, at start."""
        try:
            assert self.http
            async with self.http.get(SOLACE + "/api/survivorz/voice-lib", headers={"x-agent-secret": SECRET},
                                     timeout=aiohttp.ClientTimeout(total=40)) as r:
                if r.status != 200:
                    return
                have = set((await r.json()).get("names", []))
            for f in sorted(VOICES_DIR.glob("*.mp3")):
                name = f.stem
                if name in have or not re.fullmatch(r"[a-z0-9-]{2,40}", name):
                    continue
                async with self.http.post(SOLACE + f"/api/survivorz/voice-lib?name={name}", data=f.read_bytes(),
                                          headers={"x-agent-secret": SECRET, "content-type": "application/octet-stream"},
                                          timeout=aiohttp.ClientTimeout(total=60)) as up:
                    log(f"voice {name}: {'shared with the library' if up.status == 200 else f'not shared ({up.status})'}")
        except Exception as e:  # noqa: BLE001
            log("voices: couldn't share them:", e)

    async def fetch_voice(self, name: str) -> None:
        """Bring one reference clip down from the server's voice library (the agent secret)."""
        if not re.fullmatch(r"[a-z0-9-]{2,40}", name or ""):
            return
        try:
            assert self.http
            async with self.http.get(SOLACE + f"/api/survivorz/voice-ref/{name}", headers={"x-agent-secret": SECRET},
                                     timeout=aiohttp.ClientTimeout(total=40)) as r:
                if r.status != 200:
                    return
                data = await r.read()
            VOICES_DIR.mkdir(parents=True, exist_ok=True)
            tmp = VOICES_DIR / f"{name}.part"
            tmp.write_bytes(data)
            tmp.replace(VOICES_DIR / f"{name}.mp3")
            log(f"voice {name}: fetched from the library ({len(data) // 1024} KB)")
        except Exception as e:  # noqa: BLE001
            log(f"voice {name}: couldn't fetch it:", e)

    async def survivorz_worker(self):
        """The Survivorz cast: render each held line in that survivor's clone
        (Rollo's "" is the voice server's own default reference) and post it
        back; the server sends the line out with its clip."""
        while True:
            sid, text, clone, kokoro, who = await self.surv_lines.get()
            if not text:
                continue
            try:
                t0 = time.time()
                c = clone if isinstance(clone, str) else None
                # a voice made in the character creator lives in the server's library: fetched the
                # first time a line needs it (src/routes/survivorz-voices.ts), then kept here
                if c and not (VOICES_DIR / f"{c}.mp3").is_file():
                    await self.fetch_voice(c)
                if c and not (VOICES_DIR / f"{c}.mp3").is_file():
                    c = None
                pcm = await asyncio.to_thread(self.synthesize, text, c, kokoro)
                rate = 16_000
                if SPEAK_RATE != rate and len(pcm):
                    idx = np.linspace(0, len(pcm) - 1, int(len(pcm) * rate / SPEAK_RATE))
                    pcm = np.interp(idx, np.arange(len(pcm)), pcm.astype(np.float32)).astype(np.int16)
                pcm = pcm[: rate * 20]
                import base64
                got = await self.api("POST", "/api/npc/agent/survivorz-audio", {"id": sid, "rate": rate, "pcm": base64.b64encode(pcm.tobytes()).decode()})
                took = time.time() - t0
                if not got.get("ok"):
                    log(f"survivorz: {who} line {sid} arrived too late ({took:.1f}s)")
                else:
                    log(f"survivorz: {who} line {sid} voiced in {took:.1f}s ({len(pcm) / rate:.1f}s)")
            except Exception as e:  # noqa: BLE001
                log("survivorz:", e)
            if len(self.surv_seen) > 500:
                self.surv_seen = set(sorted(self.surv_seen)[-100:])

    async def run(self):
        if CLONE:
            asyncio.create_task(self.clone_loop(CLONE_PORT, ENV.get("ROLLO_VOICE_HALF") == "1"))
            if CLONE_VOICES > 1:
                asyncio.create_task(self.clone_loop(CLONE_PORT + 1, True))
        async with aiohttp.ClientSession() as http:
            self.http = http
            asyncio.create_task(self.ears())
            asyncio.create_task(self.host_worker())
            asyncio.create_task(self.survivorz_worker())
            asyncio.create_task(self.share_voices())
            await self.near_loop()


if __name__ == "__main__":
    try:
        asyncio.run(Agent().run())
    except KeyboardInterrupt:
        pass
