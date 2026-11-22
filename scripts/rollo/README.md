> **Nov 2026:** the casino regulars were removed. This agent now voices only
> the Solace Survivorz show (speaking only, `ROLLO_EARS=0`); its server door
> is `src/routes/voice-agent.ts`. The rest of this file describes the old
> casino setup.

# Rollo — the casino floor's regular

Rollo is an ex-Async surveyor in a purple hazmat suit who hangs around the 3D
casino floor, broke and sure the wheel is due. You talk to him with your
voice and he answers out loud.

**The cast (Oct 2026):** Rollo has company — Duke, Tasha and Chase
(`src/npc/cast.ts`), two of the four on the floor at a time. This one agent
voices all of them: it hears the room once, gives each line to the regular
standing nearest whoever spoke, and joins the room once per regular so each
voice comes from its own body. A regular speaks with their cloned voice once
`D:solace-aimodelsoices<duke|tasha|chase>.mp3` exists (pick it from
`node scripts/rollo/design-voice.mjs <name>`), and with Kokoro until then.

**Simply:** your mic goes to this PC, which writes down what you said, asks
Solace what Rollo would say, and speaks it back into the room at his body.

**Technically:** three pieces.

| Piece | Where | What |
|---|---|---|
| His body + brain | the Solace server (`src/npc/rollo.ts`) | walks a fixed route between the slots, the bar, the tables; `brain.floorReply` writes his line with the same gate, facts and checks as every other NPC |
| His ears + mouth | this PC (`agent.py`) | joins the `casino_floor` LiveKit room AS Rollo; Whisper (GPU) turns nearby players' speech into text, Kokoro (CPU) turns his reply into speech |
| The door between | `/api/npc/agent/*` | guarded by `NPC_AGENT_SECRET` (both `.env` files, ≥24 chars); anything else is a 404 |

His identity in the voice room is his Solace user id, so every player's
client places his voice where his body stands — same as a real player.

## Where it runs (since Oct 13 2026): slopbot

The agent and its cloned voices run on **slopbot's RTX 3080** as
`solace-voices.service`, so Josh's 3090 Ti is left to the 26B brain and the
3D casino. Install or update it from the PC:

```bash
SLOPBOT_SUDO_PW='…' bash deploy/slopbot/setup-voices.sh
```

It copies `agent.py`, `listening.py` and `voice_server.py` to
`/data/solace-ai/solace/scripts/rollo/`, writes the agent's `.env` from the
repo's, and (re)starts the service. The venvs (`/data/solace-ai/rollo-venv`,
`voice-venv`) mirror the PC's pinned packages (`deploy/slopbot/requirements-*.txt`);
the models are in `/data/solace-ai/models`. A watchdog timer restarts the
service when its heartbeat goes stale (a hang), and the server's health page
turns red when the agent stops checking in. Logs:
`ssh you@YOUR_GPU_BOX_IP journalctl -u solace-voices -f`.

The PC sections below still describe the setup there — `solace-gpu.ps1
-VoicesHere` moves the voices back to the PC.

## Running it (on the PC)

```powershell
D:\solace-ai\rollo-venv\Scripts\python.exe scripts\rollo\agent.py
```

or `scripts\rollo\run.ps1`. **Normally you don't run it by hand: the
workstation supervisor does** (`deploy\workstation\solace-gpu.ps1 -Install`,
Oct 2026). It starts the agent at logon, restarts it if it dies, and stops it
— with its cloned voice server — while a game needs the card or after
`-Pause`; `-Status` shows it, and its output is
`%USERPROFILE%\.solace-gpu\rollo.log`. **Re-run `-Install` after editing the
supervisor**, and don't also start the agent by hand while it runs — two
agents fight over one identity in the voice room. His BODY is on the floor
whenever `ROLLO_LIVE=1`; only his voice comes and goes. Models live in
`D:\solace-ai\models` (`whisper\`, `kokoro\`); about 4.5 GB of VRAM with the
clone, beside the 26B brain.

`.env` (repo root, gitignored): `NPC_AGENT_SECRET`, `SOLACE_URL`
(default `https://solace.zone`), optionally `ROLLO_VOICE` (Kokoro voice id,
default `am_michael`), `ROLLO_FLOOR_RMS` (the quietest sound that can count
as speech, default 0.004), `ROLLO_END_SILENCE` (seconds of quiet that end a
sentence, default 0.55) and `ROLLO_BARGE=0` (stop him being interrupted, if
players' speakers leak his voice back into their mics).

Speech detection is `listening.py` (Silero, streamed); check it with
`D:/solace-ai/rollo-venv/Scripts/python.exe -I scripts/rollo/test_listening.py`.

## His real voice (the New York clone)

`ROLLO_CLONE=1` gives him the Queens voice Josh picked from ElevenLabs Voice
Design (`design-voice.mjs` makes candidates; the pick lives at
`D:\solace-ai\models\rollo-voice\queens-1.mp3`, out of git). The agent starts
`voice_server.py` itself, a Chatterbox Turbo server (MIT) in its OWN venv,
`D:\solace-ai\voice-venv`, because Chatterbox pins an old PyTorch that must not
share a venv with Whisper. It listens on 127.0.0.1:8781 only, holds ~3 GB of
GPU, and speaks at about twice real time (a short line in ~1.5s). Whenever the
clone is loading, slow (12s) or down, that line falls back to Kokoro. Run
`D:/solace-ai/voice-venv/Scripts/python.exe -I scripts/rollo/try_clone.py` to
hear it without the agent.

While the brain writes an answer, a reply slower than a second gets one of six
thinking noises (`FILLERS`, rendered once in his voice at start, 70% of the
time), and a long reply is voiced a sentence ahead of what is playing, so
there is no gap between sentences.

The voice-venv was built with `torch==2.14.1` + `torchaudio` from the cu130
index, then `pip install --no-deps chatterbox-tts==0.1.7` and its other
dependencies minus gradio (`numpy<2 librosa==0.11.0 s3tokenizer
transformers==5.2.0 diffusers==0.29.0 resemble-perth conformer==0.3.2
safetensors pyloudnorm omegaconf huggingface_hub soundfile`).

## His life

He is a real player now (`src/npc/rollo-life.ts` decides, `src/npc/rollo.ts` does): slots and the Derby with real silver, drinks and the occasional celebration drug, begging when broke (press **E** on him to spot him silver), sulking at the bar for half an hour when nobody does, hands up when a gun is pointed at him, and back in at the entrance when he's shot. He remembers people and slowly writes his own account of who he's become. His body is always on the floor while `ROLLO_LIVE=1` is in the server's `.env`; this agent only gives him a voice — it also speaks what he says on his own.

## Who sees and hears him

`ROLLO_VISIBLE` in the server's `.env`: `admin` (only the admin sees him)
or `all` (prod since 2026-10-12). **He only listens to people who can see
him**, and never to DMs or private calls. The Privacy Policy (v2) says so.

Nothing he hears is written to disk; the server logs only lengths.

## His mouth

Rollo is the one UNFILTERED character: he swears, roasts, tells dirty jokes
and has opinions on the real world. One line is held in code no matter what —
nothing sexual involving minors, anyone who hasn't consented, animals or
family — at the gate, by a regex on his reply, and by a second read of it.
Someone in crisis still gets the 988 line. Judge his voice against the real
model with `node scripts/rollo-eval.mjs`.

## Harness

`node scripts/checks/test_rollo_life.mjs` (48) — his life on a fake clock. `node scripts/checks/test_rollo.mjs` (26) — the secret door, the blue suit,
the audience (seen AND heard), the hearing range, the subtitle, and the one
line held at all three places.
