"""Move the newest downloaded Flow image into the project folder as <K>.<ext>.

Usage:
  python grab_image.py <K> "<project name>" [secs]   # wait (default 30s) and save as K.jpg/.png
Exit code 2 = no new image within the wait (click Download -> 2K again).
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "make-video" / "scripts"))
from common import DOWNLOADS, ffprobe_info  # noqa: E402

EXTS = (".jpg", ".jpeg", ".png", ".webp")


def main():
    k, project = sys.argv[1], sys.argv[2]
    wait = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    folder = DOWNLOADS / project
    folder.mkdir(parents=True, exist_ok=True)
    marker = folder / ".marker"
    if not marker.exists():
        marker.touch()
    since = marker.stat().st_mtime
    end = time.time() + wait
    while time.time() < end:
        new = [f for f in DOWNLOADS.iterdir()
               if f.is_file() and f.suffix.lower() in EXTS and f.stat().st_mtime > since]
        if new:
            src = max(new, key=lambda f: f.stat().st_mtime)
            time.sleep(1.5)
            for old in folder.glob(f"{k}.*"):
                if old.suffix.lower() in EXTS:
                    old.unlink()
            dst = folder / f"{k}{src.suffix.lower()}"
            src.replace(dst)
            marker.touch()
            print(f"saved {dst.name} <- {src.name} | {ffprobe_info(dst).split(',')[0]}")
            return
        time.sleep(2)
    print("NOT_STARTED")
    sys.exit(2)


if __name__ == "__main__":
    main()
