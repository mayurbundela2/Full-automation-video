---
name: make-image-video
description: IMAGE workflow of the video agent — turn a raw Hinglish script into a finished narrated video made from still images (Google Flow Nano Banana Pro), one voice paragraph per image, stitched in Gemini TTS Studio, exported and zipped. Use when the user's project is an IMAGE project (the /make-video agent routes here after asking "Image or Video?"), or the user runs /make-image-video.
---

# make-image-video — script → still-image video (IMAGE workflow)

Input from the user: **project name** + **raw script**. Output:
`~/Downloads/<project>.mp4` and `~/Downloads/<project>.zip`, plus the images in
`~/Downloads/<project>/1.jpg … N.jpg`.

Works on Windows and macOS. `ROOT` = repo root (3 levels up from this folder).
`VSKILL` = `ROOT/.claude/skills/make-video` (shared app helpers and scripts).
`PY` = `ROOT/.venv/bin/python` (macOS) or `ROOT\.venv\Scripts\python.exe` (Windows).
`WORK` = `ROOT/outputs/_agent/<project>/` (git-ignored).

## Hard rules (from the user — never skip)
1. **Ask first: IMAGE or VIDEO project?** and **Shorts or Long form?** — never infer from the name.
   VIDEO → use the `make-video` skill instead. Shorts → 9:16 + trim 0.12; Long form → 16:9 + trim 0.18.
2. Breakdown uses **this folder's `prompt-template.md`** (the IMAGE prompt), not the video one.
   Script words never change; only numerals → Hinglish. Generate ALL images in one go
   (ignore the template's "first 10, then wait").
3. **One voice paragraph per image**: paragraph K = image K's VO words only
   (image 1 "Ruko —" → paragraph 1 is just "Ruko —"). Import `tts_per_image.txt`, never the full breakdown.
4. Use **Google Chrome via Claude in Chrome**. If several browsers are connected, ask which.
5. Flow image settings: **Image · 🍌 Nano Banana Pro · x1 · 9:16** (Long form 16:9).
   One image at a time, prompt prefixed with its serial `K"`.
6. Waits: **30 s** per image, then check; download **2K**; if the download doesn't start
   within 30 s–1 min, click Download → 2K again. Save as `~/Downloads/<project>/K.jpg`.
7. Flow refusal: Retry once; if refused again for policy, rewrite ONLY that image's prompt to
   follow the Google Flow policy (same rig/style/moment idea), keep `K"`, try again; after a few
   failures stop and tell the user.
8. After SCAN & MATCH: **ASK the user** which **Photo Motion** (Zoom In / Zoom Out / Pan Left /
   Pan Right / Zoom + Pan / Static) and **In/Out Cut** (Fade In/Out / Fade In / Fade Out /
   Zoom Pop / Cut (None)) — never choose yourself.
9. **Video Sound 60%** always. Never type passwords or sign in for the user.

## Steps

### 0. Setup
- Write `WORK/script.txt` (raw script exactly as given).
- `PY VSKILL/scripts/start_app.py "WORK"` → TTS Studio http://127.0.0.1:8000 + file server
  http://localhost:8765 → WORK (pages must use `localhost`). Re-run if a fetch fails.
- Chrome: `tabs_context_mcp` → new tab → `http://127.0.0.1:8000`; paste
  `VSKILL/scripts/app_helpers.js` into `javascript_tool` (re-paste after any reload).

### 1. Breakdown (Claude)
Apply `prompt-template.md` (replace `{{SCRIPT}}`, set 9:16 / 16:9) and write `WORK/breakdown.txt`
(first line "Total: X Parts / Y Images", then Parts with their IMAGE blocks). Then
`PY scripts/split_image_breakdown.py "WORK"` → must print `vo_match=True missing_prompts=[]`.
It writes `tts.txt`, `tts_per_image.txt` (one paragraph per image) and `images.json`.

### 2. TTS Studio (app tab)
1. `await vsCreateProject('<project>')`.
2. `await vsLoad(); await vsLoadTts('tts_per_image.txt')` → `parts` = number of images.
3. `await vsImport('9:16 Shorts/Reels' | '16:9 Landscape')` → `detected` must equal the image
   count and `ratio` must match, else stop. `await vsConfirmImport()`.
4. `await vsCheckWords()` → PASS if `missing` is only section labels and original numerals;
   else stop and tell the user. `await vsCloseChecker()`.
5. `await vsGenerate()`; poll `vsGenStatus()` (~15 s) until `done` = `N/N`. If the page shows a
   GENERATION ERROR, check via `GET /api/projects/<id>/batches` + `/api/batches/<id>` that all
   paragraphs are COMPLETED; regenerate any that aren't.
6. Tight badge must read `0.12s ULTRA` (shorts) / `0.18s PUNCHY` (long). If not:
   `await vsTrimRebuild('0.12'|'0.18')` and poll until not rebuilding.
7. `await vsVideoStudio('9:16 Shorts/Reels' | '16:9 Landscape')`.

### 3. Google Flow (new Chrome tab)
1. `https://flow.google.com/` → if a sign-in page shows, ask the user to sign in.
   `find` "New project button" → click. Paste `scripts/image_flow_helpers.js`, then
   `await imDismiss(); await imLoad()` (= image count) and `await imSet('9:16'|'16:9')` →
   `on` has Image, aspect, x1; `model` = Nano Banana Pro.
2. Make the folder `~/Downloads/<project>/` and touch `.marker` in it.
3. For K = 1..N: `await imPut(K)` (require `ok: true`) → `computer key "ctrl+End Return"` →
   `await imWaitDl(K)` → `PY scripts/grab_image.py K "<project>" 30`
   (exit 2 → `await imDl('2K')` and grab again). `notReady` → wait a few seconds, re-check
   `imFirst()`; `failed` → rule 7 (`imRetry()`).
4. Close the Flow tab.

### 4. Video Studio → export → zip (app tab)
1. `await vsMatch('<home>/Downloads/<project>')` → `N / N shots`.
2. **Ask the user** Photo Motion + In/Out Cut (rule 8) → `await vsPhotoFx('<motion>', '<cut>')`.
3. Video Sound 60%: `find` "60% quick chip button next to Video Sound dropdown" → click →
   `vsVideoSound()` must be `0.6`.
4. Note `date +%s`; `await vsStitch()`; poll `vsStitchStatus()` until `rendering` null and
   `synced` = `N / N` (~2 min for 25 images).
5. `find` "EXPORT 9:16 MP4 button" (or 16:9) → click → `PY VSKILL/scripts/finish.py "<project>" <time>`
   → `~/Downloads/<project>.mp4` + `.zip`.
6. Report: image count, total length, any retries/rewrites, file paths.

## Reference
`reference-first-run.md` — notes from the first guided run ("angootha image short":
10 Parts / 25 images, 52 s final video).
