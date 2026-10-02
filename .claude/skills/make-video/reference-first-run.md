# Video automation — learned steps

Steps recorded while the user guided Claude through the app once.
These will become the `/make-video` agent.

> IMAGE workflow: being taught separately — notes go in
> `.claude/skills/make-image-video/image-steps.md` (to be created).
>
> SCOPE: everything below is the **VIDEO generation** workflow (media = video
> clips per shot, Data Exporter preset "Flow Video (No Spaces)").
> The **IMAGE generation** workflow is different and will be taught
> separately later — do not mix the two.

## RULE — Browser: use Google Chrome (Claude in Chrome), not the built-in pane
- User's choice: Chrome is faster and has their sign-ins. If the extension
  isn't connected, ask the user to connect it.
- Chrome may be on a different Google account than before — that's OK: if the
  saved Flow project isn't found, create a new project and keep going.
- Entering the prompt in Chrome: `type` can drop the start of long text. Use
  JS instead: focus the editor, `document.execCommand('selectAll')`, then
  `document.execCommand('insertText', false, PROMPT)`, and verify the box
  text === PROMPT before pressing Enter.
- Settings check in one JS call: click the chip ("Video · 720p · …"), read
  every `[role=radio]` aria-checked + "Omni …" + "Generating will use N credits".

## RULE — Timing (user)
- After pressing Enter, wait **1.5–2 min** (not more) before checking the clip.
  If it's still generating, check again in short steps.
- After clicking Download → 1080p: if no new .mp4 shows in Downloads within
  **1 min**, click Download → 1080p AGAIN; repeat every minute until it downloads.
- Chrome profile saves to `C:\Users\2305-00006\Downloads` with no Save-As prompt.

## RULE — Shorts vs Long form (ALWAYS, decided at the very start)
Decide the format from the project name, then CONFIRM it with the user
before doing anything else ("This is a SHORTS video, right?").

| Project name contains | Pause Trimming Aggressiveness | Target Aspect Ratio & Resolution |
|---|---|---|
| "short" / "shorts"    | 🔥 Ultra-Tight (0.12s)        | 9:16 Shorts/Reels (1080×1920)    |
| "long form"           | ⚡ Clean & Punchy (0.18s)      | 16:9 Landscape (1920×1080)       |

- Aspect ratio: pick it in the IMPORT SCRIPT dialog (Step 4) before PARSE,
  AND check it in VIDEO STUDIO & TIMELINE → Tight Video Timeline →
  **ASPECT RATIO** row (Step 7). The Video Studio one is what the export
  uses (button reads "EXPORT 9:16 MP4" / "EXPORT 16:9 MP4").
- Trimming: the dropdown in the Batch 01 card next to
  **REBUILD FULL NARRATION** (Step 6b). After changing it, click
  REBUILD FULL NARRATION.
- If the name has neither (or both), ask the user.

## Step 1 — Launch the project
- Check whether the server is already up: `GET http://127.0.0.1:8000/api/health` returns 200.
- If not, start it from the project root (without run.py's auto-Chrome):
  `.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000`
- Wait until `/api/health` returns 200, then open `http://127.0.0.1:8000`.
- Expected: the "Gemini TTS Studio" Projects page listing existing projects.

## Step 2 — Create a project
- Input: project name (user provides it, e.g. "anggotha short"). Description left empty.
- Click **+ NEW PROJECT** → "Create New Project" dialog.
- Type the name into **Project Name**, click **CREATE PROJECT**.
- Expected: app opens the project workspace automatically, with an empty
  "Batch 01 (0 paras)" in DRAFT, Voiceover Speed default 0.80x, TTS model
  default "Gemini 3.8 Flash TTS (Latest Expressive)".

## Step 3 — Generate the breakdown from the raw script (Claude does this)
- Input: the user's raw script (sections like HOOK / LOCK-IN / BODY / PAYOFF / CLOSE).
- Apply the fixed prompt in `.claude/prompt-template.md` (replace `{{SCRIPT}}`).
  The same prompt is always used.
- Output: "Part 1: ..." through the last Part's "Background music (add in editor):" line.
- Paste ONLY from `Part 1:` down to the final Background music line. Drop any
  header ("Total: N Parts...", notes) and footer ("All N parts done").

## Step 4 — Import the breakdown
- In the project workspace click **IMPORT SCRIPT** (top of Batch 01 card)
  → "Import AI Studio Reference" dialog.
- Paste the breakdown into **Paste Batch Reference / Breakdown** textarea.
- Defaults seen: Media Assets Folder empty, aspect 16:9 Landscape (1920×1080),
  Framing "Fill & Crop".
- Keep the defaults and click **PARSE REFERENCE**.
- Expected: "Step 2: Inspect parsed paragraphs" — "Detected N Paragraph(s) ready
  for import" (N = number of Parts), each card showing Voice Algenib
  (Newscaster • Natural), on-screen text, video prompt and the VO text.
- VERIFY: count the "Part N:" headings in the breakdown Claude generated, and
  compare with "Detected N Paragraph(s)" in the dialog. The number of Parts
  differs per video (the breakdown decides it) — they must be EQUAL.
  If they don't match, stop and report; don't import.
- If equal, click **CONFIRM & IMPORT INTO BATCH**.
- Expected: Batch 01 becomes READY, "Total Paras: N", "Ready: N",
  "Completed: 0", and the button reads **GENERATE READY (N)**.
  Each paragraph card: Voice Algenib (Male), Speed Default (Inherit),
  Style Newscaster, Pace Natural, Accent Neutral, on-screen text filled.

## Step 5 — Check script words
- Click **CHECK SCRIPT WORDS** → "Script Word Sequence Checker" dialog.
- Paste the user's ORIGINAL raw script (exactly what came after the prompt,
  section labels included) into **Master Reference Script (Original Text)**.
  Defaults: "Ignore emotion cues" ON, "Case-sensitive" OFF.
- It compares instantly: Match Score, Original Words, Batch Words,
  Missing in Batch, Extra/Added, plus a "Missing Words List".
- How to judge (first run: 88.6%, 156/176, 20 missing, +8 extra):
  the missing words were ONLY section labels (HOOK, action, turant:, LOCK-IN,
  BODY 1, RE-HOOK, BODY 2, PAYOFF, CLOSE, ":", "—") and numerals the prompt
  converts to Hinglish (4 → chaar, 6 → chhe). That is a PASS.
  Any missing real spoken word = FAIL → stop, leave the checker open, and
  tell the user exactly which spoken words are missing; wait for their call.
  (Confirmed by user.)
- On PASS: click **Close Checker** (bottom-right button; find it by its label, the
  dialog layout shifts) → back to the batch workspace.

## Step 6 — Generate voice
- Keep Voiceover Speed 0.80x and TTS model Gemini 3.8 Flash TTS (defaults).
- Click **GENERATE READY (N)** → "Batch Voice Synthesis" progress dialog
  (Progress x / N, est. remaining, elapsed). First run: 9 paras in ~45s.
- Wait until it closes and the banner reads
  "Successfully generated N paragraph(s) & assembled full narration!"
- Result on the page:
  - **MASTER NARRATION** — "All N parts joined" (first run 71.52s), WAV/MP3
    download, "Subtitles & Timestamps".
  - **TIGHT TIMELINE** — "0.18s PUNCHY", mode "Clean & Punchy (0.18s)"
    (first run 55.3s), WAV/MP3/MP4 download, "No-Pause Subtitles".
  - "VIDEO STUDIO & TIMELINE" tab gets a green dot (ready).
- If generation errors or any paragraph fails, stop and report.

## Step 6b — Set pause trimming + rebuild
- In the Batch 01 card, the trimming dropdown (default "⚡ Clean & Punchy (0.18s)")
  sits next to **REBUILD FULL NARRATION**.
  - Shorts → "🔥 Ultra-Tight (0.12s)"; Long form → "⚡ Clean & Punchy (0.18s)".
- Click **REBUILD FULL NARRATION** → "Rebuilding Full Narration" dialog (~8s)
  → when it says "Full master narration & tight timeline rebuilt successfully",
  click **Great, Continue!**
- Check: TIGHT TIMELINE badge shows "🔥 0.12s ULTRA" (shorts) — first run
  went 55.3s → 53.26s. Master narration stays the same length.

## Step 7 — Video Studio: aspect ratio
- Click the **VIDEO STUDIO & TIMELINE** tab.
- Panel "Tight Video Timeline" (READY, shows tight duration). Its
  **ASPECT RATIO** row: 16:9 Landscape | 9:16 Shorts/Reels | 1:1 | 4:5 | 4:3 | 21:9.
  It came in as 16:9 from the import even for a short — always set it here:
  Shorts → **9:16 Shorts/Reels**, Long form → **16:9 Landscape**.
- Check: export button reads "EXPORT 9:16 MP4" and live preview says "• 9:16".
- Other defaults seen (not changed yet): Fit Mode Fill & Crop, Speed 0.80x,
  Text Animation ON (Slide Down (Top), pos TOP, Impact font, YELLOW, 100%),
  Photo Motion Zoom In, In/Out Cut Fade In/Out, Logo watermark OFF,
  Video Sound 100%, Voice 100%. Media matched 0 / N shots (no media folder yet).

## Step 8 — Data Exporter: paste the breakdown
- Click **DATA EXPORTER** in the Batch 01 card → "Data Exporter &
  Multi-Heading Extractor" panel.
- The box **Paste Full Script Breakdown (Audio & Video SHOTs)** comes
  pre-filled with an old sample ("Part 1: COLD OPEN — Aaj Tumne Kya Khaya?",
  4 shots). REPLACE it entirely with the same breakdown used in Step 4
  (Part 1 → last Background music line; no header/footer).
- The textarea has no label; it's the first <textarea> on the page.
  Tag it with an aria-label via JS, then fill it with form_input.
  (A React value-setter via JS threw "Illegal invocation".)
- Gotcha: the panel can close by itself — re-open DATA EXPORTER and re-check
  the box contents before continuing.
- Check: box starts "Part 1: HOOK..." and ends with the final BGM line.
  Badge still says "4 Shots Parsed" / "EXTRACT HEADINGS (4 Detected)" until
  extracted.
- Click **EXTRACT HEADINGS** (the old count on the button is stale; ignore it).
- Check: badge reads "N Shots Parsed" (N = number of Parts; first run 9).
  Input box collapses ("Paste Different Script" button appears).
  Default selection: preset "Only Script" → heading "Formatted Script to
  Copy-paste" ticked; output panel shows "N Shots", numbered 1..N with the
  emotion tags + VO text.

## Step 9 — Preset: Flow Video (No Spaces)
- Under "Presets", click **⚡ Flow Video (No Spaces)**.
- Check: "4 Active" / "4 HEADINGS SELECTED", "N Shots", **No-Space Mode: ON**,
  "Include Section Labels" ticked. Ticked headings:
  Video-prompt (google flow…), scene progression, overall modd (sic),
  sound effects (SFX…). Everything else unticked.
- Output: one compact line per shot, numbered 1..N, starting
  `1"Flat 2D vector cartoon animation, 10 seconds, ...`.
  Button reads **COPY ALL (4 HEADINGS • NO SPACES)**.
- Click **Close** (bottom-right of the panel) → back to the workspace
  (Video Studio & Timeline tab still open).

## Step 10 — Back to SCRIPT & AUDIO
- Click the **SCRIPT & AUDIO (N)** tab (find it by label; page scroll moves it).
- Shows MASTER NARRATION (71.52s) and TIGHT TIMELINE (🔥 0.12s ULTRA, 53.26s,
  Ultra-Tight selected) with WAV/MP3/MP4 + "No-Pause Subtitles".

## Step 11 — Copy durations
- Click **COPY DURATIONS** in the Batch 01 card → button flips to
  "✓ COPIED DURATIONS!" and the list goes to the system clipboard.
- Read it with PowerShell `Get-Clipboard` (browser clipboard read is blocked).
- Format, one line per paragraph:
  `1. 8.2 seconds long` … `9. 2.8 seconds long`
  (first run: 8.2, 6.4, 6.8, 6.7, 4.7, 7.3, 5.1, 5.3, 2.8 — sums ≈ 53.3s = tight timeline)
- Meaning (user): line K = the REAL generated voice-over length for VIDEO SHOT K.
  The video clip for each shot must fit that duration (not the planned 10s).
- Keep this list — it's used in the next step.

## Step 12 — Re-open Data Exporter
- Click **DATA EXPORTER** in the Batch 01 card. It re-opens with the same
  state: 9 Shots Parsed, Flow Video (No Spaces) preset, No-Space Mode ON.

## Step 13 — Copy ONE shot prompt, open Google Flow
- ONE SERIAL NUMBER AT A TIME (user rule). Start with shot 1, then 2, ... N.
- Take shot K's line from the exporter output (output textarea starts with
  `1"Flat 2D`; split on newlines before `<digits>"`). Copy it exactly,
  INCLUDING the leading serial number, e.g.
  `1"Flat 2D vector cartoon animation, 10 seconds, ... soft crayon-like shading.`
  (shot 1 = 1462 chars, ends at the [overall modd:] text).
- Put it on the system clipboard: save to a UTF-8 file in the scratchpad,
  then `powershell.exe -Command "Get-Content -Raw -Encoding UTF8 f | Set-Clipboard"`
  (verify with Get-Clipboard). Don't use clip.exe — it breaks the — and – dashes.
- Open **https://flow.google.com/** in a NEW browser tab (keep the TTS
  Studio tab open). It lands on flow.google.com/about →
  "Create with Google Flow" button. Google sign-in is done by the USER.
- Click **Create with Google Flow** → if not signed in, Google "Sign in"
  page (accounts.google.com). Claude NEVER types the email/password —
  pause and ask the user to sign in in the browser pane, then continue.
  (The pane keeps sign-ins, so later runs should skip this.)
- The "Create with Google Flow" button only appears when NOT signed in —
  it may or may not be there. If already signed in, flow.google.com opens
  straight to the Flow home (PRO badge + account avatar top-right, banner,
  grid of past projects, floating **+ New project** button).

## Step 14 — Flow: new project
- Click **+ New project** → opens flow.google.com/project/<id>, auto-named
  by date/time (e.g. "Oct 01 - 13:54").
- An announcement popup may appear ("Flow is now on iOS" etc.) — dismiss it
  with **Get started** (info only). May not appear every time.
- Project page: left sidebar (All media, Characters, Scenes, Tools, Trash,
  Collapse), banner "…generating with Gemini Omni Flash…", and the prompt box
  "What do you want to create?" at the bottom. Model chip default seen:
  "Nano Banana 2" with "x2" (that's an IMAGE model — check before generating
  video; waiting for user's instructions on the right settings).
- Click **Collapse** (bottom of the left sidebar) → sidebar shrinks to icons
  only. The full banner is now visible: "You're generating with Gemini Omni
  Flash, our latest video model! Try creating 10 second clips…" with a
  **Got it** button. Prompt bar: "+", "Agent", model chip "Nano Banana 2 ▭ x2", → send.
- Click **Got it** → banner closes; page shows "Start creating or drop media"
  with the prompt bar "What do you want to create?" at the bottom.
  (Banner may not show on later runs.)

## Step 15 — Open the generation settings
- Click into the prompt box **"What do you want to create?"**.
- Click the model chip (shows "Nano Banana 2 ▭ x2") → settings popover:
  - Tabs: **Image** | **Video** (Image selected by default)
  - Aspect: 16:9 | 4:3 | 1:1 | 3:4 | 9:16 (16:9 default)
  - Model dropdown: "Nano Banana 2"
  - Count: x1 | x2 | x3 | x4 (x2 default)
  - Footer: "Generating will use N credits"
- Click the **Video** tab → video settings:
  - Mode: **Frames** | **Ingredients** (Ingredients selected by default)
  - Aspect: 16:9 | 9:16 (16:9 default)
  - Model dropdown: "Omni 1.1 Flash"
  - Resolution: 360p | 720p (720p default)
  - Duration: 4s | 6s | 8s | 10s (8s default)
  - Count: x1 | x2 | x3 | x4 (x2 default)
  - Default cost shown: "Generating will use 24 credits"
  - Chip now reads "Video · 720p · 8s ▭ x2"
- REQUIRED settings (user):
  - Model: **Omni 1.1 Flash** (verify it's selected)
  - Count: **x1** (last row)
  - Aspect: Shorts → **9:16**, Long form → **16:9** (same format rule as above)
  - Leave Ingredients / 720p / duration as-is unless told otherwise.
- Check: footer "Generating will use 12 credits"; chip reads
  "Video · 720p · 8s ▯ x1".

## Step 16 — Pick duration from COPY DURATIONS, then enter the prompt
- For shot K, look up line K of the Copy Durations list (Step 11) and pick
  the Flow duration:
  | VO duration (s) | Flow duration |
  |---|---|
  | ≤ 4.5        | **4s**  |
  | 4.6 – 6.5    | **6s**  |
  | 6.6 – 8.5    | **8s**  |
  | 8.6 – 10     | **10s** |
  | > 10         | stop and ask the user |
  (first run: 1→8s, 2→6s, 3→8s, 4→8s, 5→6s, 6→8s, 7→6s, 8→6s, 9→4s)
- Click that duration in the Video settings popover.
- Then click the prompt box **What do you want to create?** and enter shot
  K's prompt (from Step 13), exactly, starting with its serial number.
  NOTE: Ctrl+V does NOT work in the browser pane (it doesn't share the
  Windows clipboard) — use the computer `type` action with the full text.
- Check: the box shows the whole prompt; chip still "Video · 720p · <dur> ▯ x1";
  the → send button turns white (active). Do NOT send until told.

## Step 17 — Generate the clip
- Click inside the prompt box, press End, then **Enter** → generation starts
  (costs 12 credits for 720p x1).
- Check: prompt box clears back to "What do you want to create?", a new
  9:16 (or 16:9) placeholder card appears top-left in All media with a
  blurred/loading preview, and a new Videos icon shows in the sidebar.
  Settings chip keeps "Video · 720p · 8s ▯ x1" for the next shot.

## Step 18 — Wait, then download 1080p into the project folder
- Wait until the card shows the real video thumbnail (first run ~3 min).
- Project folder: **C:\Users\2305-00006\Downloads\<project name>**
  (e.g. `Downloads\anggotha short`), created once per project. (User chose Downloads.)
- Hover the clip card → buttons appear (♡, reuse, **⋮ More**). Click **⋮**.
- Menu: Favorite, Reuse prompt, Add to scene, Add to prompt, **Download ▸**,
  Copy, Rename, Share, Publish to YouTube, Set project cover, Flag output,
  Move to trash. Hover **Download** → 270p (GIF) | 720p (Original) |
  **1080p (Upscaled)** | 4K (needs upgrade). Click **1080p**.
- Toast: "Upscaling your video. This may take several minutes. Refrain from
  starting multiple upscaling jobs…" (first run ~5 min). Don't start another
  upscale meanwhile.
- The browser pane saves straight to Downloads (no Save dialog) with Flow's
  own name, e.g. `Cartoon_character_gestures_and_w…_20261001141823.mp4`.
  Poll Downloads for the new .mp4, then MOVE it into the project folder and
  rename it to the shot serial number: `1.mp4`, `2.mp4`, … (TTS Studio's
  media folder auto-matches 1.mp4, 2.mp4… to paragraph numbers).
- Check: 1080×1920 (shorts) / 1920×1080 (long), duration = chosen Flow duration.

## Step 19 — Repeat for the next serial (2, 3, … N), one at a time
- Flow puts the NEWEST clip FIRST (top-left); older clips shift right.
  So right after generating shot K, its card is the first card.
- Loop per shot K: get shot K's prompt from the exporter → open settings chip
  → click duration for line K → type prompt → Enter → wait (~2.5–3 min) →
  hover FIRST card → ⋮ → Download → 1080p → wait (~2–5 min) → move the new
  .mp4 from Downloads to `Downloads\<project>\K.mp4` → verify with ffprobe.
- If the TTS Studio page was reloaded/restarted, the Data Exporter forgets the
  pasted breakdown (old 4-part sample comes back): re-paste, EXTRACT HEADINGS,
  pick Flow Video (No Spaces) again, check "N Shots Parsed".
- Shot 2 (first run): 6.4s → 6s, 10 credits, 1080×1920, 6.0s → 2.mp4.
- First run complete: 9/9 clips in `Downloads\anggotha short` (1–5 in the
  built-in browser, 6–9 in Chrome, new Flow project "Oct 01 - 15:32").
  Credits: 8s = 12, 6s = 10, 4s = 7. In Chrome, a JS helper did the
  per-shot loop fast: set 9:16 + duration + x1 by radio text, insertText the
  prompt, Enter, wait ~100s, then More options → Download → 1080p on the
  first card; file arrived within ~1 min each time.

## Step 20 — Back to TTS Studio: Video Studio & Timeline
- After all N clips are saved, close the Flow tab and open the TTS Studio
  app (http://127.0.0.1:8000; start the server if needed) → Projects →
  open the project card (e.g. "anggotha short").
- Gotcha: after an app restart the batch-card trim dropdown can show
  "Clean & Punchy (0.18s)" again even for a short — re-check it.
- Click the **VIDEO STUDIO & TIMELINE** tab. Panel shows: Media Folder path
  box, BROWSE FOLDER, SELECT FILES, COPY DURATIONS, SCAN & MATCH,
  "Matched Media: 0 / N shots", "Synced Clips: 0 / N", Tight Duration.

## Step 21 — Set the media folder
- User says "Browse folder and pick the download folder". BROWSE FOLDER makes
  the server pop a native Windows FolderBrowserDialog (backend/routers/voices.py
  select-folder) which Claude can't drive from Chrome; all it does is fill the
  **Media Folder path** box. So type the path into that box instead, forward
  slashes: `C:/Users/2305-00006/Downloads/<project name>`.
- Check the box value; aspect row already shows 9:16 Shorts/Reels for shorts.

## Step 22 — SCAN & MATCH
- Click **SCAN & MATCH** → "Matched Media: N / N shots" (first run 9/9 in ~2s).
  "Synced Clips" stays 0 / N until stitching.
- One card per Part (e.g. "Part 7: PAYOFF — Spare Part") with the matched
  file (`7.mp4`), "Audio: <tight VO s>", "Orig Video: <clip s>", and a speed
  badge when the clip is longer than the VO (e.g. "1.17x Sped (+17%)").
  Clips shorter than the VO (shot 1: 8.0s vs 8.2s, shot 2: 6.0s vs 6.4s)
  get no "Sped" badge — they're stretched slightly instead.

## Step 23 — Video Sound = 60% (ALWAYS, user rule)
- In the Tight Video Timeline panel, **Video Sound** defaults to 100%.
  Click the **60%** quick chip next to it ("Set video sound volume to 60%").
- Check: the Video Sound select value = 0.6 ("60%"). Voice stays 100% (Full).

## Step 24 — SYNC & STITCH TIGHT VIDEO
- Click **SYNC & STITCH TIGHT VIDEO** → button shows "RENDERING TIGHT… x%"
  (first run ~2.5 min for 9 shots). Don't run long JS waits in the page while
  it renders (CDP timed out at 45s) — poll with short checks instead.
- Done when the RENDERING label is gone and "Synced Clips: N / N".
- Output files in `outputs/<project_folder>/Batch_01/`:
  `full_timeline_tight_9x16.mp4` (+ `_clean.mp4`) and
  `video_timeline/shot_tight_KK_synced.mp4` per shot.
  First run: 1080×1920, with audio, 53.32s (= tight duration).

## Step 25 — EXPORT 9:16 MP4
- Click **EXPORT 9:16 MP4** ("Download 9:16 MP4 directly"; reads EXPORT
  16:9 MP4 for long form). Chrome saves it straight to Downloads within
  seconds as `batch_1_tight_9x16.mp4` (first run: 13.7 MB, 1080×1920, audio,
  53.32s). Verify with ffprobe.

## Fast path (second run "kaan short", fully autonomous, ~45 min end to end)
- Claude writes the breakdown itself from prompt-template.md (10 Parts here).
- A tiny local CORS file server (scratchpad cors_serve.py on port 8765, GET+PUT)
  lets pages load the breakdown/script and save the exporter's shot prompts:
  fetch from `http://localhost:8765/...` (NOT 127.0.0.1 — Chrome blocked it).
- App steps all via page JS: create project, import (9:16), parse + count
  check, confirm, check words, generate, set trim 0.12 + rebuild, Video Studio
  9:16, Data Exporter → Flow Video preset → PUT shots JSON.
- COPY DURATIONS needs a REAL click (computer tool), then PowerShell Get-Clipboard.
- Flow loop per shot via helpers zzGo(k, dur) + real `End Return` keypress +
  wait ~90–100s + zzDownload() + grab.sh K (moves newest .mp4 to K.mp4).
- Card "More options" buttons are hidden until hover — click them via JS
  after dispatching pointer/mouse-over events on the card.
- If a download is clicked twice, the first may arrive late — delete stray
  duplicates in Downloads before grabbing the next shot.
- Export name gets " (1)" if an older batch_1_tight_9x16.mp4 is in Downloads.

## Step 26 — Zip the exported video
- Zip the exported MP4 into `Downloads\<project name>.zip`
  (PowerShell `Compress-Archive -Path <export.mp4> -DestinationPath <zip>`).
  Zip contains just the exported video (e.g. `batch_1_tight_9x16.mp4`).
  Matches the user's existing naming (e.g. "cooking short 3.zip").

## RULE — Flow policy violation on a shot (user)
Sometimes Flow refuses a generation saying it violates its policy.
1. First, just RETRY the same prompt once (same settings).
2. If it fails again: go back to where the breakdown was generated (Claude
   generated it from the prompt template) and regenerate ONLY that shot's
   video prompt with the instruction: "Please regenerate only this shot.
   Follow the Google Flow content policy — it must not violate the policy.
   Keep the same structure, character rig, art style, scene timings
   (0-3 / 3-6 / 6-8 / 8-10s), SFX and mood." Keep the VO/script untouched.
3. Use the rebuilt prompt (same serial number prefix, e.g. `5"Flat 2D…`) and
   generate again. If it still fails, rebuild again and retry; if it keeps
   failing after a few tries, stop and tell the user which shot.
- The saved clip name stays the serial number (`K.mp4`).
- Other failure seen: card shows "Failed — We noticed some unusual activity.
  Please visit the Help Center… You have not been charged." Hover the card →
  **Retry** (↻) button. One retry fixed it on shot 5 (first run).
- Flow's page layout/zoom can shift between shots — never click settings by
  fixed coordinates. Tag the radio buttons by their text (4s/6s/8s/10s,
  x1–x4, 9:16/16:9) via JS and click by ref; verify aria-checked + credits.
