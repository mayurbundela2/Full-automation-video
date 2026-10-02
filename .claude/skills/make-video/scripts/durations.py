"""Read the COPY DURATIONS list from the clipboard and map each to a Flow length.

Rule: <=4.5s -> 4s | 4.6-6.5 -> 6s | 6.6-8.5 -> 8s | 8.6-10 -> 10s | >10 -> ASK USER
Usage: python durations.py [work_dir]   (also writes durations.json there)
"""
import json
import re
import sys
from pathlib import Path

from common import read_clipboard


def flow_len(sec: float) -> str:
    if sec <= 4.5:
        return "4s"
    if sec <= 6.5:
        return "6s"
    if sec <= 8.5:
        return "8s"
    if sec <= 10.0:
        return "10s"
    return "ASK"


def main():
    text = read_clipboard()
    rows = [(int(k), float(v)) for k, v in re.findall(r"^\s*(\d+)\.\s*([\d.]+)\s*seconds", text, re.M)]
    if not rows:
        print("NO DURATIONS ON CLIPBOARD:\n" + text[:300])
        sys.exit(2)
    out = [{"shot": k, "vo": v, "flow": flow_len(v)} for k, v in rows]
    for r in out:
        print(f"{r['shot']}: {r['vo']}s -> {r['flow']}")
    if len(sys.argv) > 1:
        Path(sys.argv[1], "durations.json").write_text(json.dumps(out), encoding="utf-8")
    if any(r["flow"] == "ASK" for r in out):
        print("SOME SHOTS > 10s - ask the user")
        sys.exit(3)


if __name__ == "__main__":
    main()
