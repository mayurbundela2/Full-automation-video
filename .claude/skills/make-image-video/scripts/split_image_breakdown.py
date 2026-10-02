"""Split an IMAGE breakdown into the two files the workflow needs.

Usage: python split_image_breakdown.py <work_dir>
Reads  <work_dir>/breakdown.txt  (image prompt-template output)
Writes <work_dir>/tts.txt        Parts only (header + Playground Setup + Formatted Script)
                                 -> this is what goes into TTS Studio IMPORT SCRIPT, so
                                    the voice never reads music/image notes.
       <work_dir>/images.json    [{n, part, start, end, dur, title, vo, text, prompt, motion, sfx}]
Prints counts and checks that the image VO lines add up to the Part scripts.
"""
import json
import re
import sys
from pathlib import Path


def words(t: str):
    return re.findall(r"[a-z0-9']+", t.lower().replace("'", " "))


def main():
    work = Path(sys.argv[1])
    text = (work / "breakdown.txt").read_text(encoding="utf-8").replace("\r", "")
    chunks = re.split(r"(?m)^(?=Part \d+:)", text)
    parts, images = [], []
    for ch in chunks:
        m = re.match(r"Part (\d+):", ch)
        if not m:
            continue
        pno = int(m.group(1))
        head = ch.split("\n---", 1)[0]
        head = re.split(r"(?m)^Background music:", head)[0].rstrip()
        parts.append(head)
        for blk in re.split(r"(?m)^(?=IMAGE \d+ —)", ch)[1:]:
            h = re.match(r"IMAGE (\d+) — \[([^–\]]+)–([^\]]+)\] \(([\d.]+)s\) — (.+)", blk)
            g = lambda pat: (re.search(pat, blk, re.S) or [None, ""])[1].strip()
            images.append({
                "n": int(h.group(1)), "part": pno, "start": h.group(2), "end": h.group(3),
                "dur": float(h.group(4)), "title": h.group(5).strip(),
                "vo": g(r'VO on this image: "(.*?)"\n'),
                "text": g(r"On-screen text: (.*?)\n"),
                "prompt": g(r'Image prompt \(Google Flow — still image\):\n"(.*?)"\n\nCapCut'),
                "motion": g(r"CapCut motion: (.*?)\n"),
                "sfx": g(r"SFX: (.*?)(?:\n|$)"),
            })
    (work / "tts.txt").write_text("\n\n".join(parts) + "\n", encoding="utf-8")

    # One TTS paragraph PER IMAGE (user rule): paragraph K = image K's VO words,
    # with its Part's Playground Setup + emotion tags, so SCAN & MATCH puts K.jpg on it.
    per_image = []
    for img in images:
        ptxt = parts[img["part"] - 1]
        setup = re.search(r"Playground Setup:\n(.*?)\n\nFormatted Script", ptxt, re.S).group(1)
        tags = re.search(r"Formatted Script to Copy-Paste:\n\n?(\[[^\n]*)\n", ptxt).group(1)
        title = re.match(r"Part \d+: ([^\n]+)", ptxt).group(1)
        per_image.append(
            f"Part {img['n']}: {title} — Image {img['n']}\n\nPlayground Setup:\n{setup}\n\n"
            f"Formatted Script to Copy-Paste:\n\n{tags}\n{img['vo']}"
        )
    (work / "tts_per_image.txt").write_text("\n\n".join(per_image) + "\n", encoding="utf-8")
    (work / "images.json").write_text(json.dumps(images, ensure_ascii=False, indent=1), encoding="utf-8")

    part_vo = [re.search(r"Formatted Script to Copy-Paste:\n\n?\[[^\n]*\n([^\n]+)", p).group(1) for p in parts]
    ok = words(" ".join(part_vo)) == words(" ".join(i["vo"] for i in images))
    missing = [i["n"] for i in images if not i["prompt"]]
    print(f"parts={len(parts)} images={len(images)} vo_match={ok} missing_prompts={missing}")
    if not ok or missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
