#!/usr/bin/env python3
"""
Gemini TTS Generator - Application Launcher
Starts FastAPI backend server, serves the built frontend, polls health check,
and automatically opens Google Chrome at http://127.0.0.1:8000.
"""

import os
import sys
import time
import subprocess
import threading
import urllib.request
from pathlib import Path

# Add project root to Python module search path
if getattr(sys, "frozen", False):
    exe_dir = Path(sys.executable).resolve().parent
    cwd = Path.cwd()
    if (cwd / ".env").exists() or (cwd / "data").exists():
        PROJECT_ROOT = cwd
    else:
        PROJECT_ROOT = exe_dir
else:
    PROJECT_ROOT = Path(__file__).resolve().parent

sys.path.insert(0, str(PROJECT_ROOT))

from backend.config.settings import settings
from backend.services.chrome_launcher import ChromeLauncher


def check_server_ready(url: str, timeout: float = 15.0) -> bool:
    """Polls the server /api/health endpoint until responsive."""
    health_url = f"{url}/api/health"
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(health_url, timeout=1.0) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False


def build_frontend_if_needed():
    """Checks if frontend/dist exists. If not, builds it automatically (dev mode only)."""
    if getattr(sys, "frozen", False):
        return
    dist_dir = PROJECT_ROOT / "frontend" / "dist"
    if not dist_dir.exists() or not (dist_dir / "index.html").exists():
        print("[Launcher] Frontend build not found. Building now with npm...")
        frontend_dir = PROJECT_ROOT / "frontend"
        npm_bin = "npm.cmd" if sys.platform == "win32" else "npm"
        try:
            subprocess.run([npm_bin, "run", "build"], cwd=str(frontend_dir), check=True)
            print("[Launcher] Frontend build complete.")
        except Exception as e:
            print(f"[Launcher] Warning: Frontend build failed ({e}). Proceeding to launch server.")


def launch_browser_when_ready(url: str, chrome_path: str = ""):
    """Waits for server to be responsive then launches Chrome."""
    ready = check_server_ready(url, timeout=15.0)
    if ready:
        print(f"\n[Launcher] Server is ready. Launching browser to {url} ...")
        ChromeLauncher.launch(url, manual_path=chrome_path if chrome_path else None)
    else:
        print(f"\n[Launcher] Note: Could not confirm server health within timeout.")
        print(f"Please open your browser manually at: {url}\n")


def main():
    # Ensure database and output directories exist
    (PROJECT_ROOT / "data").mkdir(parents=True, exist_ok=True)
    (PROJECT_ROOT / "outputs").mkdir(parents=True, exist_ok=True)

    # Verify frontend assets
    build_frontend_if_needed()

    host = settings.HOST or "127.0.0.1"
    port = settings.PORT or 8000
    app_url = f"http://{host}:{port}"

    print("=" * 60)
    print("      GEMINI TTS STUDIO - LOCALHOST GENERATOR (PHASE 1)     ")
    print("=" * 60)
    print(f"  Target URL    : {app_url}")
    print(f"  Binding Host  : {host}")
    print(f"  Binding Port  : {port}")
    print(f"  Output Dir    : {settings.OUTPUT_FOLDER}")
    print("=" * 60)

    # Launch browser thread in background
    browser_thread = threading.Thread(
        target=launch_browser_when_ready,
        args=(app_url, settings.CHROME_PATH),
        daemon=True
    )
    browser_thread.start()

    # Import uvicorn and run FastAPI application
    import uvicorn
    from backend.app import app

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        reload=False
    )


if __name__ == "__main__":
    main()
