# How to use the video agent (`/make-video`)

The agent turns **a project name + a raw Hinglish script** into a finished,
narrated cartoon video — on **Windows or macOS**.

It asks you two things first, then does everything else on its own:
1. **Image project or Video project?**
   - **Video**: one Google Flow *video clip* per shot (Omni 1.1 Flash).
   - **Image**: one Google Flow *still image* per beat (Nano Banana Pro), each with its own voice line.
2. **Shorts or Long form?** — Shorts = 9:16 vertical, Long form = 16:9.

For Image projects it also asks which **Photo Motion** and **In/Out Cut** you want.

**Output** (in your Downloads folder):
- `<project>.mp4` — the final video
- `<project>.zip` — the same video zipped
- `<project>/` — the clips (`1.mp4 …`) or images (`1.jpg …`)

---

## Run a video

1. Open the **Claude desktop app → Code tab**, open this project folder.
2. Make sure Chrome is open with the **Claude in Chrome** extension signed in
   (and that Chrome is signed in to **flow.google.com**).
3. Type:

```
/make-video
project name: kaan short
script:
HOOK (0-3s):
"Ruko — bina haath lagaye apne kaan hilao."
...
```

4. Answer the questions (Image/Video, Shorts/Long form, and for images the motion/cut).
5. Wait. Roughly **45 min** for ~10 video shots, **~30 min** for ~25 images.
   You can watch it work in Chrome. It stops and tells you if something needs you
   (Google sign-in, a word missing from the voice, a shot Flow keeps refusing).

Tips
- Put "short" or "long form" in the project name — it still confirms with you.
- The script's numbers are spoken in Hinglish automatically (10 → das, 2.5 → dhai); no other words change.
- Credits (Flow, 720p video x1): 4s = 7, 6s = 10, 8s = 12. Images (Nano Banana Pro x1): 0.

---

## One-time setup on a new machine

Both machines use the same GitHub repo:
`https://github.com/mayurbundela2/Full-automation-video`

### macOS (MacBook)
```bash
cd "/Users/mayurbundela/Projects/Automate AI Video"
git pull
bash setup_mac.sh
```
Details and troubleshooting: [MAC_SETUP.md](MAC_SETUP.md).

### Windows
1. Install **Python 3.12+**, **Node.js**, **ffmpeg** (`winget install Gyan.FFmpeg`) and **Git**.
2. In the project folder (Command Prompt / PowerShell):
   ```bat
   git pull
   python -m venv .venv
   .venv\Scripts\python -m pip install -r requirements.txt
   cd frontend && npm ci && npm run build && cd ..
   ```
3. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (same key as the other machine).

### Both
- **Google Chrome** + the **Claude in Chrome** extension
  (https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn),
  signed in with the same Claude account as the app.
- In Chrome, sign in to **https://flow.google.com** (Flow PRO account).
- Chrome → Settings → Downloads: location **Downloads**, and **off** "Ask where to save each file".
- **Claude desktop app** (https://claude.ai/download) → Code tab → open the project folder.

---

## Keep machines in sync
After changes on one machine: commit + push there, then `git pull` on the other.
`data/`, `outputs/` and `.env` stay local (not in git).

## Where things live
| What | Where |
|---|---|
| Agent entry (asks Image/Video) | `.claude/skills/make-video/SKILL.md` |
| Video workflow + prompt | `.claude/skills/make-video/` (`prompt-template.md`) |
| Image workflow + prompt | `.claude/skills/make-image-video/` (`prompt-template.md`) |
| Notes from the guided first runs | `reference-first-run.md` in each folder |
| Per-run working files | `outputs/_agent/<project>/` |

## If something goes wrong
- **"Claude in Chrome is not connected"** → open Chrome, open the Claude side panel, sign in.
- **Several Chromes connected** → the agent asks which one to use; pick the one on this machine.
- **Google sign-in page in Flow** → sign in yourself in Chrome, then tell Claude to continue.
- **App not starting** → port 8000 busy: close the other copy (`stop_windows.bat` / `stop_mac.command`).
- **A Flow shot keeps failing** → the agent retries, then rewrites that one prompt to follow
  Flow's policy; if it still fails it stops and tells you which shot.
