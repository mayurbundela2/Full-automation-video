"""Move the newest downloaded Flow clip into the project folder as <K>.mp4.

Usage:
  python grab_clip.py mark  "<project name>"        # call right before clicking Download
  python grab_clip.py <K>   "<project name>" [secs] # wait (default 60s) and save as K.mp4

Exit code 2 = no new download within the wait (click Download -> 1080p again).
Late duplicates (a 2nd download of the same clip) are moved to <project>/_duplicates when you 'mark'.
"""
import sys
import time
from pathlib import Path

from common import DOWNLOADS, ffprobe_info


def main():
    what, project = sys.argv[1], sys.argv[2]
    wait = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    folder = DOWNLOADS / project
    folder.mkdir(parents=True, exist_ok=True)
    marker = folder / ".marker"

    if what == "mark":
        # An .mp4 that landed in Downloads after the last grab is a late duplicate of
        # the previous clip. Park it in <project>/_duplicates instead of deleting it.
        if marker.exists():
            for f in DOWNLOADS.glob("*.mp4"):
                if f.stat().st_mtime > marker.stat().st_mtime and not f.name.startswith("batch_"):
                    dupes = folder / "_duplicates"
                    dupes.mkdir(exist_ok=True)
                    f.replace(dupes / f.name)
                    print("moved stray duplicate", f.name, "-> _duplicates/")
        marker.touch()
        print("marked")
        return

    if not marker.exists():
        marker.touch()
        print("no marker yet - marked now, click Download and run again")
        sys.exit(2)
    since = marker.stat().st_mtime
    end = time.time() + wait
    while time.time() < end:
        new = [f for f in DOWNLOADS.glob("*.mp4")
               if f.stat().st_mtime > since and not f.name.endswith((".crdownload", ".part"))]
        if new:
            src = max(new, key=lambda f: f.stat().st_mtime)
            time.sleep(2)  # let the browser finish writing
            dst = folder / f"{what}.mp4"
            if dst.exists():
                dst.unlink()
            src.replace(dst)
            marker.touch()
            print(f"saved {dst.name} <- {src.name} | {ffprobe_info(dst)}")
            return
        time.sleep(3)
    print("NOT_STARTED")
    sys.exit(2)


if __name__ == "__main__":
    main()
