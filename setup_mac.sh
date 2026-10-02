#!/bin/bash
# One-time setup of Gemini TTS Studio + the /make-video agent on macOS.
# Run from the repo folder:   bash setup_mac.sh
set -e
cd "$(dirname "$0")"

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$1"; }

say "Checking Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is not installed. Install it first (paste in Terminal):"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo "Then run:  bash setup_mac.sh  again."
  exit 1
fi

say "Installing Python 3.13, ffmpeg and Node (skips what is already installed)"
brew list python@3.13 >/dev/null 2>&1 || brew install python@3.13
brew list ffmpeg      >/dev/null 2>&1 || brew install ffmpeg
command -v node >/dev/null 2>&1 || brew install node

PY="$(brew --prefix python@3.13)/bin/python3.13"
[ -x "$PY" ] || PY="$(command -v python3)"

say "Creating the Python virtual environment (.venv)"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/python -m pip install --upgrade pip >/dev/null
.venv/bin/python -m pip install -r requirements.txt

say "Building the web frontend"
(cd frontend && npm ci && npm run build)

say "Preparing .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo ">>> Open .env and put your real GEMINI_API_KEY (copy it from the Windows PC's .env)."
else
  echo ".env already exists - leaving it as is."
fi

mkdir -p data outputs
chmod +x start_mac.command stop_mac.command 2>/dev/null || true

say "Checking Google Chrome"
if [ -d "/Applications/Google Chrome.app" ]; then
  echo "Chrome found."
else
  echo "Google Chrome not found - install it from https://www.google.com/chrome/"
fi

say "Quick test: starting the app for 5 seconds"
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 >/tmp/tts_test.log 2>&1 &
APP=$!
sleep 5
if curl -s http://127.0.0.1:8000/api/health | grep -q healthy; then echo "App OK"; else echo "App did not start - see /tmp/tts_test.log"; fi
kill $APP 2>/dev/null || true

say "Done. Next steps are in MAC_SETUP.md (Chrome extension, Flow sign-in, Claude Code)."
