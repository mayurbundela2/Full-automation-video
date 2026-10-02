"""After EXPORT: rename the newest batch_*_tight_*.mp4 to '<project>.mp4' and zip it.

Usage: python finish.py "<project name>" <since_epoch_seconds>
Creates Downloads/<project>.mp4 and Downloads/<project>.zip (zip holds the mp4).
"""
import sys
import time
import zipfile
from pathlib import Path

from common import DOWNLOADS, ffprobe_info


def main():
    project = sys.argv[1]
    since = float(sys.argv[2]) if len(sys.argv) > 2 else time.time() - 600
    end = time.time() + 90
    src = None
    while time.time() < end and not src:
        cands = [f for f in DOWNLOADS.glob("batch_*_tight_*.mp4") if f.stat().st_mtime >= since]
        src = max(cands, key=lambda f: f.stat().st_mtime) if cands else None
        if not src:
            time.sleep(3)
    if not src:
        print("EXPORT NOT FOUND in", DOWNLOADS)
        sys.exit(2)
    time.sleep(2)
    final = DOWNLOADS / f"{project}.mp4"
    if final.exists():
        final.unlink()
    src.replace(final)
    zpath = DOWNLOADS / f"{project}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(final, final.name)
    print(f"video: {final} | {ffprobe_info(final)}")
    print(f"zip:   {zpath} ({zpath.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
