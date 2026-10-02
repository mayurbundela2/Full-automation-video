---
name: make-video
description: Make a finished narrated cartoon video (Shorts or Long form) from a raw Hinglish script — breakdown, Gemini TTS Studio voice, Google Flow clips, stitch, export and zip. Use when the user gives a project name and a script and asks to make/create the video, or runs /make-video.
---

# make-video — script → finished video (VIDEO workflow)

Input from the user: **project name** + **raw script**. Output:
`~/Downloads/<project>.mp4` and `~/Downloads/<project>.zip`, plus the clips in
`~/Downloads/<project>/1.mp4 … N.mp4`.

This is the VIDEO-clip workflow (Flow video per shot). The IMAGE workflow is
different and not covered here.

Works on Windows and macOS. Paths below use `~` for the home folder
(Windows: `C:\Users\<you>`). `SKILL` = this folder,
`ROOT` = the repo root (3 levels up). `PY` = `ROOT/.venv/bin/python` on macOS,
`ROOT\.venv\Scripts\python.exe` on Windows. Run the scripts with `PY`, from `SKILL/scripts`.

## Hard rules (from the user — never skip)
1. **Confirm the format first**, even if the name makes it obvious.
   Name has "short" → Shorts; "long form" → Long form; neither/both → ask.
   | | Shorts | Long form |
   |---|---|---|
   | Import + Video Studio aspect | `9:16 Shorts/Reels` | `16:9 Landscape` |
   | Pause trimming | `0.12` (Ultra-Tight) | `0.18` (Clean & Punchy) |
   | Flow aspect | `9:16` | `16:9` |
2. Script words never change; only numerals → Hinglish (10 → das, 2.5 → dhai, 4 se 6 → chaar se chhe).
3. Use **Google Chrome via Claude in Chrome** (not the built-in browser pane). If not connected, ask the user to connect it.
4. Flow: **Omni 1.1 Flash, x1**, one serial number at a time, prompt text exactly as exported (keep the `K"` prefix).
5. Flow duration from the VO duration of that shot: ≤4.5→**4s**, 4.6–6.5→**6s**, 6.6–8.5→**8s**, 8.6–10→**10s**, >10 → ask the user.
6. Download **1080p**; save as `~/Downloads/<project>/<K>.mp4` (serial number = file name).
7. Waits: generation 1.5–2 min then check; if a download doesn't start within 1 min, click Download → 1080p again, repeat each minute.
8. Flow refusal: retry once. If refused again for **policy**, rewrite ONLY that shot's video prompt to follow the Google Flow content policy (same character rig, style, 0-3/3-6/6-8/8-10s timings, SFX, mood; VO untouched), keep the `K"` prefix, generate again; after a few failures stop and tell the user. "Unusual activity" failures: just Retry.
9. Video Studio: **Video Sound 60%** always.
10. Never type passwords or sign in for the user. Downloads/sends to the user's Flow account are fine because the user asked for this workflow.

## Steps

### 0. Setup (each run)
- Work dir: `ROOT/outputs/_agent/<project>/` (git-ignored). Write there:
  - `script.txt` — the raw script exactly as given.
  - `breakdown.txt` — see step 1.
- `PY start_app.py "<workdir>"` → starts TTS Studio (http://127.0.0.1:8000) and the
  hand-off file server (http://localhost:8765 → workdir). Pages must fetch from
  **`localhost`**, not 127.0.0.1.
- Chrome: `tabs_context_mcp` → new tab → `http://127.0.0.1:8000`. Paste
  `scripts/app_helpers.js` into `javascript_tool` (re-paste after any page reload).

### 1. Breakdown (Claude does this)
Apply `prompt-template.md` (replace `{{SCRIPT}}`) yourself and write the result
to `breakdown.txt`: from `Part 1:` to the last Part's `Background music` lines —
no header/footer. ~15–20 spoken words per 10-second Part. Keep video prompts
policy-safe (cartoon, no gore/blood, no real people/brands, no on-screen text).

### 2. TTS Studio (all in the app tab, via helpers)
1. `await vsLoad()` → check `parts` = number of Parts.
2. `await vsCreateProject('<project>')`.
3. `await vsImport('<aspect label>')` → **detected must equal parts**, else stop & report.
   Then `await vsConfirmImport()`.
4. `await vsCheckWords()` → PASS if `missing` contains only section labels
   (HOOK, LOCK-IN, BODY 1, RE-HOOK, PAYOFF, CLOSE, `:`, `—`, timing like `(0-3s)`)
   and the original numerals. Any real spoken word missing → stop, leave the
   checker open, tell the user. On PASS `await vsCloseChecker()`.
5. `await vsGenerate()`; poll `vsGenStatus()` every ~15s (short calls only —
   long in-page waits time out at 45s) until `done` = `N/N`.
6. `await vsTrimRebuild('0.12' | '0.18')`; poll `vsGenStatus()` until not
   rebuilding; tight badge must read `0.12s ULTRA` / `0.18s PUNCHY`.
7. `await vsVideoStudio('9:16 Shorts/Reels' | '16:9 Landscape')` → export label matches.
8. `await vsExportShots()` → `shots` = N, `saved` = 200 (writes `shots.json`).
9. **COPY DURATIONS needs a real click**: `find` "COPY DURATIONS button in Batch 01
   card" → `computer left_click` that ref → `PY durations.py "<workdir>"`
   (prints shot → Flow length; exit 3 = a shot >10s → ask the user).

### 3. Google Flow (new Chrome tab)
1. Open `https://flow.google.com/`. If a Google sign-in page shows, stop and ask
   the user to sign in. Click **New project** (`find` "New project button" + click).
   Paste `scripts/flow_helpers.js`, then `await flDismiss(); await flLoadShots()` (= N).
2. For K = 1..N, one at a time:
   - `await flGo(K, '<flow aspect>', '<dur K>')` → require `exact: true`,
     `model` "Omni 1.1 Flash", `on` contains Video, Ingredients, aspect, dur, x1.
   - `computer key "End Return"` (a real keypress) to generate.
   - Wait ~90–100s (8s/10s clips ~100s), screenshot at scale 0.4 to see the first card.
     Failed card → `flStatus()`; follow rule 8 (`flRetry()` / rewrite prompt).
   - `PY grab_clip.py mark "<project>"` then `await flDownload()` then
     `PY grab_clip.py K "<project>"`. Exit 2 → `flDownload()` again and re-run grab (rule 7).
     Check the printed size/length (1080x1920 or 1920x1080, length = Flow duration).
   - Flow puts the newest clip FIRST — `flDownload()` always takes the first card.
3. After all N clips are saved, close the Flow tab.

### 4. Video Studio → export → zip (app tab)
1. `await vsMatch('<home>/Downloads/<project>')` (forward slashes) → `N / N shots`.
2. Video Sound 60%: `find` "60% quick chip button next to Video Sound dropdown" →
   click → `vsVideoSound()` must be `0.6`.
3. Note the time (`date +%s`), `await vsStitch()`; poll `vsStitchStatus()` until
   `rendering` is null and `synced` = `N / N` (~2.5 min).
4. `find` "EXPORT 9:16 MP4 button" (or 16:9) → click → `PY finish.py "<project>" <time>`
   → renames the export to `<project>.mp4` and zips it to `<project>.zip`.
5. Report to the user: clips table (VO vs Flow length), final video size/length,
   zip path, any retries/rewrites.

## Known gotchas
- Flow layout/zoom changes between shots — never click by fixed coordinates;
  helpers select by text/aria.
- Clip card buttons are hidden until hover; `flDownload()` dispatches hover events.
- The Data Exporter forgets its text after a page reload — `vsExportShots()` re-pastes.
- After an app restart the trim dropdown can show 0.18 again — re-check before stitching.
- Chrome extension can drop for a moment — call `tabs_context_mcp` and retry; helpers
  survive if the page didn't reload (`typeof window.flGo`).
- Credits per clip (720p x1): 4s=7, 6s=10, 8s=12.
