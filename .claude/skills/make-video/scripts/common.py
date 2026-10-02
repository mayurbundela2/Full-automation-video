"""Shared paths and helpers for the make-video scripts (Windows + macOS)."""
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SKILL_DIR.parent.parent.parent  # .claude/skills/make-video -> repo root
DOWNLOADS = Path.home() / "Downloads"
IS_MAC = sys.platform == "darwin"
IS_WIN = sys.platform == "win32"


def venv_python() -> Path:
    if IS_WIN:
        return PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    return PROJECT_ROOT / ".venv" / "bin" / "python"


def ffprobe_info(path: Path) -> str:
    """Return 'WIDTHxHEIGHT, DURATIONs' for a video, or an error string."""
    exe = shutil.which("ffprobe")
    if not exe:
        return "ffprobe not found"
    out = subprocess.run(
        [exe, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height:format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    ).stdout.split()
    if len(out) >= 3:
        return f"{out[0]}x{out[1]}, {float(out[2]):.2f}s"
    return "unreadable: " + " ".join(out)


def read_clipboard() -> str:
    if IS_MAC:
        return subprocess.run(["pbpaste"], capture_output=True, text=True).stdout
    if IS_WIN:
        return subprocess.run(
            ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
            capture_output=True, text=True, encoding="utf-8",
        ).stdout
    for cmd in (["xclip", "-o", "-selection", "clipboard"], ["wl-paste"]):
        if shutil.which(cmd[0]):
            return subprocess.run(cmd, capture_output=True, text=True).stdout
    return ""
