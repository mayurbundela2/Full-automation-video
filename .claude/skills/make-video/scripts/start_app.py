"""Start Gemini TTS Studio (if not running) and the local hand-off file server.

Usage:  python start_app.py <work_dir>
  - TTS Studio:   http://127.0.0.1:8000  (uvicorn, no auto-Chrome)
  - File server:  http://localhost:8765  serving <work_dir> (GET + PUT, CORS)
Both are started detached; the script returns once they answer.
"""
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from common import PROJECT_ROOT, SKILL_DIR, IS_WIN, venv_python


def up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1.5) as r:
            return r.status < 500
    except Exception:
        return False


def spawn(args, cwd):
    kw = {"cwd": str(cwd), "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if IS_WIN:
        kw["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | NEW_PROCESS_GROUP
    else:
        kw["start_new_session"] = True
    subprocess.Popen(args, **kw)


def main():
    work = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    work.mkdir(parents=True, exist_ok=True)
    py = str(venv_python()) if venv_python().exists() else sys.executable

    if not up("http://127.0.0.1:8000/api/health"):
        spawn([py, "-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8000"], PROJECT_ROOT)
    if not up("http://localhost:8765/"):
        spawn([py, str(SKILL_DIR / "scripts" / "file_server.py"), "8765", str(work)], work)

    for _ in range(40):
        if up("http://127.0.0.1:8000/api/health") and up("http://localhost:8765/"):
            print(f"ready: app=http://127.0.0.1:8000  files=http://localhost:8765 -> {work}")
            return
        time.sleep(0.5)
    print("NOT READY: app", up("http://127.0.0.1:8000/api/health"), "files", up("http://localhost:8765/"))
    sys.exit(1)


if __name__ == "__main__":
    main()
