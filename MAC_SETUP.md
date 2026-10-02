# Run the video agent on a MacBook

> How to use the agent (Image + Video workflows, Windows + Mac): see [HOW_TO_USE.md](HOW_TO_USE.md).

The agent is the Claude Code skill **`/make-video`** in `.claude/skills/make-video/`.
You give it a project name + script; it makes the voice in Gemini TTS Studio,
generates every shot in Google Flow (in Chrome), stitches, exports and zips
`~/Downloads/<project>.zip`.

## One-time setup (about 15 minutes)

1. **Get the latest code** into your existing Mac project folder
   `/Users/mayurbundela/Projects/Automate AI Video`:
   ```bash
   cd "/Users/mayurbundela/Projects/Automate AI Video"
   git pull
   ```
   (Quotes are needed because the folder name has spaces.)
2. **Install everything** (Python, ffmpeg, Node, packages, frontend build):
   ```bash
   bash setup_mac.sh
   ```
   If it says Homebrew is missing, install Homebrew with the command it prints, then run it again.
3. **API key** — open `.env` (`open -e .env`) and set `GEMINI_API_KEY=` to the same
   key(s) as in the Windows PC's `.env`. Never commit this file.
4. **Google Chrome + Claude in Chrome**
   - Install Chrome: https://www.google.com/chrome/
   - Install the extension: https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn
   - Open the Claude side panel in Chrome and sign in with the **same Claude account** as the app.
   - In Chrome, sign in to **https://flow.google.com** with your Flow PRO Google account.
   - Chrome → Settings → Downloads: keep the location **Downloads** and turn **off**
     "Ask where to save each file" (so clips save automatically).
5. **Claude desktop app** (Code tab) — install from https://claude.ai/download,
   sign in, and open the folder `/Users/mayurbundela/Projects/Automate AI Video` as the project.

## Every video

In the Claude Code tab (project folder open), type:

```
/make-video
project name: kaan short
script:
<paste the script>
```

Claude will first ask you to confirm Shorts or Long form, then run everything.
Total time is about 45 minutes for 10 shots.

## Keeping Mac and Windows in sync

After changing anything on one machine:
```bash
git pull        # get the latest agent/app changes
```
(Projects, voices and outputs stay local on each machine — `data/` and `outputs/` are not in git.)

## If something goes wrong
- "Claude in Chrome is not connected" → open Chrome, open the Claude side panel, check you're signed in.
- Flow shows a Google sign-in page → sign in yourself in Chrome, then tell Claude to continue.
- App not starting → in Terminal: `cd "/Users/mayurbundela/Projects/Automate AI Video" && .venv/bin/python -m uvicorn backend.app:app --port 8000` and read the error.
- Port 8000 busy → `lsof -i :8000` then quit that process (or run `./stop_mac.command`).
