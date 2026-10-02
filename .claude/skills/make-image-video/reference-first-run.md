# IMAGE workflow — learned steps

Steps recorded while the user guides Claude through the IMAGE-based workflow
once (in Google Chrome via Claude in Chrome). This is separate from the VIDEO
workflow in `.claude/skills/make-video/`. These notes will become an agent.

Shared rules that still apply unless the user says otherwise:
- Confirm Shorts vs Long form at the start (name "short" → 9:16 + Ultra-Tight
  0.12s; "long form" → 16:9 + Clean & Punchy 0.18s).
- Use Google Chrome (Claude in Chrome), Browser 1 on Windows / the Mac's Chrome.
- One serial number at a time; files named by serial number.

## Steps

### Step 1 — Ask IMAGE or VIDEO + confirm format, create the project
- ALWAYS ask the user first (user rule): **"Is this an IMAGE project or a
  VIDEO project?"** — together with Shorts vs Long form. Don't infer it from
  the name. IMAGE → this workflow; VIDEO → the make-video workflow.
- Input: project name + raw script (first run: "angootha image short", the
  same angootha script as the video run).
- TTS Studio → Projects → **+ NEW PROJECT** → name → **CREATE PROJECT**
  → opens the workspace with empty "Batch 01 (0 paras)".

### Step 2 — Same as the VIDEO workflow up to opening the Flow tab (user)
Follow `.claude/skills/make-video/SKILL.md` sections 0–2 unchanged:
breakdown (same prompt-template.md) → import (aspect) + Parts==detected check
→ confirm → check words → generate → trim (0.12/0.18) + rebuild → Video
Studio aspect → Data Exporter (paste breakdown, extract, preset) → COPY
DURATIONS (real click) → durations.py.
The image-specific part starts when the Flow tab is opened.
- First run (angootha image short): 9 Parts = 9 detected, words 88.6% PASS,
  master 72.6s, tight 0.12s ULTRA 52.38s, 9 shot prompts exported.
  Durations: 6.4, 6.8, 6.0, 7.1, 5.7, 6.5, 4.8, 6.2, 2.9 s.

### Step 2b — IMAGE prompt + voice-only import (user correction, run 1)
- IMAGE projects use a DIFFERENT prompt: `make-image-video/prompt-template.md`
  (Parts by section label, split >20 words at a sentence break; beat-based
  IMAGES 1–4s each; still-image prompts; CapCut motion/SFX). VIDEO projects
  keep `make-video/prompt-template.md`. The template says "first 10 images,
  wait" — the agent generates ALL images in one go.
- Run 1: 10 Parts / 25 Images; zero word changes verified (Parts == script,
  image VO == Parts, rig in all 25 prompts).
- DON'T import the full image breakdown into TTS Studio: its parser takes
  everything after "Formatted Script to Copy-Paste" up to the next Part, so
  the BGM line + all IMAGE blocks would be read aloud. Instead
  `scripts/split_image_breakdown.py <work>` → `tts.txt` (Parts only) for
  IMPORT SCRIPT, and `images.json` (25 prompts + VO/text/motion/SFX).
- Gotcha: the import dialog's aspect buttons duplicate the Video Studio's
  behind it — click the one INSIDE the dialog (helper fixed).
- A redo inside an existing project: + NEW BATCH, TYPE a name (empty name =
  Create does nothing), CREATE BATCH; old batch kept.
- Data Exporter "Flow Video" preset is for VIDEO prompts — skipped for images;
  image prompts come from images.json.
- COPY DURATIONS gives Part lengths → `scripts/image_timing.py <work>` spreads
  each Part over its images by word count, min 0.8s (run 1: 48.42s total,
  all 25 images 0.8–3.7s).

### Step 3 — Open Google Flow (new Chrome tab)
- Same as video: new tab → https://flow.google.com/ (signed in).
- Click **+ New project** → new project (run 1: "Oct 02 - 10:14"), empty
  "Start creating or drop media"; chip still shows last VIDEO settings
  ("Video · 720p · 4s ▯ x1"). No popups this time.
- Click the **What do you want to create?** box.
- Click the settings chip ("Video · 720p · …") → popover → click **Image** tab.
  Image settings: aspect 16:9 | 4:3 | 1:1 | 3:4 | **9:16**, model
  **Nano Banana 2**, count **x1**–x4, "Generating will use 0 credits".
  Run 1 defaults after switching: Image, 9:16, Nano Banana 2, x1 (0 credits).
  Chip reads "🍌 Nano Banana 2 ▯ x1".
- REQUIRED image settings (user rule):
  - Model: **🍌 Nano Banana Pro** — open the model dropdown ("Select model
    family" button) → menu: Nano Banana Pro | Nano Banana 2 | Nano Banana 2 Lite.
  - Count: **x1**
  - Aspect: Shorts → **9:16**, Long form → **16:9**
  - Check: chip reads "🍌 Nano Banana Pro ▯ x1" (run 1: 0 credits).
### Step 4 — Generate image K (one at a time)
- Prompt = `K"` + images.json[K-1].prompt (multi-line is fine). Put it in the
  box with execCommand insertText, verify, then real keys `ctrl+End Return`.
- Wait **1 min only** (user rule) for each image, then check the first card.
  Run 1, image 1: done well within 1 min ("Created …, Nano Banana Pro, 9:16").

### Step 5 — Download image K at 2K
- Same as video: newest card first → hover → ⋮ More options → **Download** →
  menu for images: 1K (Original size) | **2K (Upscaled)** | 4K (Upscaled).
  Click **2K**. (Image card menu also has "Animate" instead of "Add to scene".)
- Wait for the download **30 s – 1 min only** (user rule); if it doesn't
  start, click Download → 2K again.
- Saved as JPG, e.g. `Character_making_stop_gesture_2K_<timestamp>.jpg`,
  1536×2752 (9:16). Move it to `~/Downloads/<project>/K.jpg` (serial number).
  Run 1, image 1: arrived in a few seconds.

### Step 6 — Loop all images (user: waits 30 s only)
- For K = 1..N: imPut(K) (insert `K"`+prompt, verify, chip = Nano Banana Pro
  9:16 x1) → real keys `ctrl+End Return` → wait **30 s** → check the first
  card's title starts with `K"` (else wait/retry) → Download → **2K** →
  `scripts/grab_image.py K "<project>" 30` (moves newest image to K.jpg).
- Run 1: all 25 images generated + downloaded first try, ~65 s per image,
  no failures, all 1536×2752 JPG in `Downloads\angootha image short\1.jpg…25.jpg`.

### Step 7 — Back to TTS Studio Video Studio, set the image folder
- Close the Flow tab. In the app (image batch selected), VIDEO STUDIO &
  TIMELINE tab, aspect 9:16 → type the folder into **Media Folder path**:
  `C:/Users/<you>/Downloads/<project>` (same as BROWSE FOLDER).
- Run 1: "Matched Media 0 / 10 shots" before scanning (10 voice Parts vs 25 images).
- Click **SCAN & MATCH** → "Matched Media 10 / 10 shots": it maps by
  number to PARTS — Part K gets `K.jpg` (1.jpg…10.jpg); images 11–25 unused.
  Each Part card shows an IMAGE badge, Photo Motion "Zoom In" and Photo Cut
  "Fade In/Out" (per-shot + "Apply to All Photos"). One image per Part only.

## RULE — ONE VOICE PARAGRAPH PER IMAGE (user correction, run 1)
For IMAGE projects the TTS Studio batch must have **one paragraph per image**,
each with ONLY that image's VO words (image 1 = "Ruko —" only, image 2 =
"apna angootha aur chhoti ungli milao.", …). Then SCAN & MATCH puts `K.jpg`
on paragraph K and each image lasts exactly as long as its own words.
- `split_image_breakdown.py` also writes `tts_per_image.txt`: "Part K: <part
  title> — Image K" + that Part's Playground Setup + emotion tags + image K's VO.
  IMPORT THIS file (not tts.txt). Check detected == number of images.
- Video workflow is NOT changed by this.
- Run 1: new batch "Batch 03 Per Image" → 25 detected at 9:16 → words PASS
  (88.6%) → 25/25 generated (one transient error auto-recovered; verify via
  API all COMPLETED) → master 71.6s, tight 0.12s ULTRA 51.96s → Video Studio
  → SCAN & MATCH **25 / 25 shots**, 1.jpg…25.jpg in order.
  Per-image VO (tight): 0.4, 2.5, 1.1, 2.2, 0.9, 2.2, 3.2, 2.1, 2.5, 1.2, 3.2,
  3.1, 4.2, 0.8, 2.4, 2.3, 2.5, 2.7, 1.9, 2.0, 1.8, 1.4, 3.2, 0.9, 1.2 s.
- Gotcha: the trim dropdown wasn't on screen in this state; the tight track
  was already 0.12s ULTRA after generation — check the TIGHT TIMELINE badge.
- Gotcha: the local file server (port 8765) can stop — re-run start_app.py.

## RULE — ASK the user for Photo Motion + In/Out Cut (every image project)
After SCAN & MATCH, ALWAYS ask the user which options they want — never pick
yourself:
- **Photo Motion (Images Only):** Zoom In | Zoom Out | Pan Left | Pan Right |
  Zoom + Pan | Static
- **In/Out Cut (Images Only):** Fade In/Out | Fade In | Fade Out | Zoom Pop | Cut (None)
Then apply with the matching button + **APPLY TO ALL PHOTOS** (per-shot
overrides exist on each card).
- Run 1: user chose **Zoom In** + **Cut (None)** → toast "Bulk applied cut
  transition "none" to ALL 25 shots!"; cards show ZOOM IN, no FADE IN/OUT.

### Step 8 — Video Sound 60% → SYNC & STITCH → EXPORT → zip (same as video)
- Video Sound **60%** quick chip (verify select = 0.6) → **SYNC & STITCH TIGHT
  VIDEO** (run 1: ~2 min for 25 photo shots) → "Synced Clips N / N" →
  **EXPORT 9:16 MP4** → `make-video/scripts/finish.py "<project>" <since>`
  renames to `<project>.mp4` and zips `<project>.zip`.
- Run 1 result: `Downloads\angootha image short.mp4` 1080×1920, 52.09 s, with
  audio; `angootha image short.zip` 15.4 MB.
