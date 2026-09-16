#!/bin/bash
cd "$(dirname "$0")"

echo "=================================================="
echo "    Stopping Gemini TTS Studio & Freeing Port 8000"
echo "=================================================="
echo ""

# 1. Send graceful shutdown request to the API
echo "[1/2] Sending graceful shutdown request to API..."
curl -s -X POST http://127.0.0.1:8000/api/shutdown >/dev/null 2>&1

sleep 1

# 2. Check for any process listening on port 8000 and terminate
echo "[2/2] Checking if port 8000 or launcher process is running..."
PID=$(lsof -ti:8000 2>/dev/null)
if [ -n "$PID" ]; then
    echo "Stopping process PID $PID on port 8000..."
    kill -9 $PID 2>/dev/null
fi

pkill -f "run.py" 2>/dev/null

echo ""
echo "=================================================="
echo "  Gemini TTS Studio is stopped. Port 8000 is free!"
echo "=================================================="
echo ""
sleep 2
