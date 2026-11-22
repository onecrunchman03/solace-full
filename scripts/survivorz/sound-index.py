# SURVIVORZ: indexes every candidate sound file — the 98 picked Sonniss libraries, the
# Freesound downloads and the OpenGameArt packs — with its duration, channels, rate,
# source and licence, so the sound list can be filled by search instead of by hand.
#   python -I scripts/survivorz/sound-index.py  ->  assets/downloads/survivorz/sound/index.json
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FREE = os.path.join(ROOT, "assets", "downloads", "survivorz", "free")
SON = r"D:\solace-ai\sonnis"
OUT = os.path.join(ROOT, "assets", "downloads", "survivorz", "sound", "index.json")
EXT = {".wav", ".flac", ".aif", ".aiff", ".ogg", ".mp3"}

SONNISS_LIC = "Sonniss GDC bundle licence (royalty-free, no attribution, no AI training)"
jobs = []  # (path, source, library, licence, credit)
# the WHOLE bundle, not only the 98 picked libraries: a GDC library is a 3-4 file sampler,
# so the picks alone are a few hundred files. Picked libraries are flagged.
picked = {(m["year"], m["folder"]) for m in json.load(open(os.path.join(ROOT, "docs", "survivorz", "sourcing", "free", "sonniss-map.json"), encoding="utf-8"))}
for year in sorted(os.listdir(SON)):
    yd = os.path.join(SON, year)
    if not os.path.isdir(yd): continue
    for folder in os.listdir(yd):
        if folder.startswith("_"): continue
        lib = os.path.join(yd, folder)
        for dp, _, fs in os.walk(lib):
            for f in fs:
                if os.path.splitext(f)[1].lower() in EXT:
                    jobs.append((os.path.join(dp, f), "sonniss*" if (year, folder) in picked else "sonniss", f"{year} / {folder}", SONNISS_LIC, ""))
for name, logf in (("freesound", "LOG-freesound.json"), ("opengameart", "LOG.json")):
    log = json.load(open(os.path.join(FREE, logf), encoding="utf-8"))
    for key, rec in log.items():
        if name == "freesound" and not key.startswith("freesound:"): continue
        if name == "opengameart" and "opengameart" not in rec.get("page", ""): continue
        for rel in rec["files"]:
            p = os.path.join(FREE, rel)
            cands = [p] if os.path.splitext(p)[1].lower() in EXT else []
            x = os.path.join(os.path.dirname(p), "_x")
            if not cands and os.path.isdir(x):
                for dp, _, fs in os.walk(x):
                    cands += [os.path.join(dp, f) for f in fs if os.path.splitext(f)[1].lower() in EXT]
            for c in cands:
                jobs.append((c, name, rec["name"], rec["licence"], rec.get("credit", "")))
jobs = list({j[0]: j for j in jobs}.values())
print(len(jobs), "files", file=sys.stderr)

def probe(j):
    p = j[0]
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                            "stream=channels,sample_rate:format=duration", "-of", "json", p],
                           capture_output=True, text=True, timeout=30)
        d = json.loads(r.stdout or "{}")
        s = (d.get("streams") or [{}])[0]
        return {"path": p, "source": j[1], "library": j[2], "licence": j[3], "credit": j[4],
                "name": os.path.splitext(os.path.basename(p))[0], "dur": round(float(d.get("format", {}).get("duration", 0) or 0), 2),
                "ch": s.get("channels"), "rate": int(s.get("sample_rate", 0) or 0)}
    except Exception as e:
        return {"path": p, "source": j[1], "library": j[2], "err": str(e)}

with ThreadPoolExecutor(12) as ex:
    rows = list(ex.map(probe, jobs))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
bad = [r for r in rows if r.get("err") or not r.get("dur")]
print(f"indexed {len(rows)}, unreadable {len(bad)}, hours {sum(r.get('dur', 0) for r in rows) / 3600:.1f}")
