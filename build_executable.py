#!/usr/bin/env python3
"""
Automated Desktop Executable Builder for Mac & Windows PC.
Compiles the frontend and builds a single standalone executable using PyInstaller.
"""

import sys
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent

def run_cmd(cmd, cwd=ROOT_DIR):
    print(f"\n[Build] Running: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd), check=True)

def main():
    print("=" * 60)
    print("  Building Automated Gemini TTS Standalone Executable  ")
    print("=" * 60)

    # 1. Build frontend
    frontend_dir = ROOT_DIR / "frontend"
    print("\n[1/3] Building frontend assets...")
    npm_bin = "npm.cmd" if sys.platform == "win32" else "npm"
    try:
        run_cmd([npm_bin, "run", "build"], cwd=frontend_dir)
    except Exception as e:
        print(f"[Build] npm build error ({e}). Ensure Node.js & npm are installed.")
        sys.exit(1)

    # 2. Check / Install PyInstaller
    print("\n[2/3] Checking PyInstaller...")
    try:
        import PyInstaller
    except ImportError:
        print("[Build] Installing PyInstaller...")
        run_cmd([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # 3. Build executable with PyInstaller
    print("\n[3/3] Packaging standalone executable...")
    spec_file = ROOT_DIR / "gemini_tts_app.spec"
    run_cmd([
        sys.executable, "-m", "PyInstaller",
        str(spec_file),
        "--clean",
        "--noconfirm"
    ])

    dist_dir = ROOT_DIR / "dist"
    print("\n" + "=" * 60)
    if sys.platform == "win32":
        exe_path = dist_dir / "Automated-Gemini-TTS.exe"
        print(f"🎉 Build Complete! Your Windows executable is at:\n👉 {exe_path}")
    else:
        mac_path = dist_dir / "Automated-Gemini-TTS"
        print(f"🎉 Build Complete! Your Mac standalone binary is at:\n👉 {mac_path}")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
