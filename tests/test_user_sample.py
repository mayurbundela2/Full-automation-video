from backend.services.reference_parser import ReferenceParser

USER_SCRIPT = """Part 1: COLD OPEN — Aaj Tumne Kya Khaya? (Paragraph 1)
Playground Setup:
Scene: "Narrator engaging viewer directly with relatable food questions."
Sample Context: "Hook the viewer with familiar comfort food references."
Audio Profile: "Conversational, casual, inviting."
Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib
Formatted Script to Copy-Paste:
[conversational] [reflective]
Aaj tumne kya khaya? Maggie? Pizza?
[conversational]
Ghar ka dal chawal? Ya raat ke do baje wala Kurkure?
VIDEO SHOT 1 — [0:00–0:10] (10 seconds) — THE MIDNIGHT MEAL
Voice-over & Subtitle Alignment (SRT: 0:00–0:10):
0:00–0:05: "[conversational] [reflective] Aaj tumne kya khaya? Maggie? Pizza?"
0:05–0:10: "[conversational] Ghar ka dal chawal? Ya raat ke do baje wala Kurkure?"
On-screen text (add in editor):
AAJ TUMNE KYA KHAYA?
Video prompt (Google Flow — 10 second silent video, visuals only):
"Flat 2D vector cartoon animation, 10 seconds, hand-drawn cartoon aesthetic with soft crayon shading and warm painterly background, NO photorealism, NO 3D, NO text, NO captions, silent visual only.
Character throughout: Flat 2D vector cartoon character, round white spherical head, black dot eyes, single-line mouth (closed, motionless), no nose, spiky black hair on top, wearing a simple grey hoodie and dark pants.
Scene progression:
0-3 seconds: Character sits alone at a wooden table in a dimly lit kitchen at night, looking down at an empty blue plate.
3-6 seconds: A bowl of steaming noodles and a slice of pizza smoothly slide onto the table from opposite sides.
6-8 seconds: A traditional steel plate of dal chawal and a bright snack packet pop onto the tabletop around the character.
8-10 seconds: Character rests chin in palm, staring down at the feast with a contemplative gaze.
Overall mood: Introspective late-night vibe. Minimalist children's book illustration style with soft crayon-like shading."
Sound effects (SFX — add in editor):
Scene Progression 0–3s (Kitchen stillness): Faint hum of refrigerator ambient at 15%
Scene Progression 3–6s (Plates sliding): Gentle ceramic slide and subtle steam hiss at 25%
Scene Progression 6–8s (Metal plate & packet): Soft metallic clink and crinkling foil at 30%
Scene Progression 8–10s (Character settling): Quiet elbow thud on wooden table at 20%
Background music (add in editor):
Light, curious lo-fi acoustic guitar with subtle felt piano, thoughtful and warm, ducked at -18dB.
Part 2: COLD OPEN — Common Factor (Paragraph 2)
Playground Setup:
Scene: "Emphasizing the hidden commonality behind all cooked meals."
Sample Context: "Make the audience pause and realize an invisible reality."
Audio Profile: "Reflective, steady, intriguing."
Style: Newscaster | Pace: Natural | Accent: Neutral | Voice: Algenib
Formatted Script to Copy-Paste:
[reflective] [intimate]
Chahe kuch bhi khaya ho... ek cheez common thi.
[deep]
Wo pakaya hua tha... Aur ye baat itni normal lagti hai ki tumne kabhi socha bhi nahi hoga.
VIDEO SHOT 2 — [0:10–0:20] (10 seconds) — THE STEAMING COMMONALITY
Voice-over & Subtitle Alignment (SRT: 0:10–0:20):
0:10–0:15: "[reflective] [intimate] Chahe kuch bhi khaya ho... ek cheez common thi."
0:15–0:20: "[deep] Wo pakaya hua tha... Aur ye baat itni normal lagti hai ki tumne kabhi socha bhi nahi hoga."
On-screen text (add in editor):
SAB KUCH PAKAYA HUA THA
Video prompt (Google Flow — 10 second silent video, visuals only):
"Flat 2D vector cartoon animation, 10 seconds, hand-drawn cartoon aesthetic with soft crayon shading and warm painterly background, NO photorealism, NO 3D, NO text, NO captions, silent visual only.
Character throughout: Flat 2D vector cartoon character, round white spherical head, black dot eyes, single-line mouth (closed, motionless), no nose, spiky black hair on top, wearing a simple grey hoodie and dark pants.
Scene progression:
0-3 seconds: Camera pushes in close toward the food on the table, showing soft vapor curls rising into the warm ambient light.
3-6 seconds: The food items dissolve into warm golden glowing outlines, highlighting heat and cooking energy.
6-8 seconds: Camera shifts slightly up to show the character's face, staring straight ahead with wide black dot eyes in realization.
8-10 seconds: The character slowly blinks once, background darkening slightly to put focus on their thoughtful posture.
Overall mood: Sudden subtle revelation. Minimalist children's book illustration style with soft crayon-like shading."
Sound effects (SFX — add in editor):
Scene Progression 0–3s (Steam rising): Soft, airy heat sizzle/steam simmer at 20%
Scene Progression 3–6s (Golden outline glow): Warm low frequency sine swell at 25%
Scene Progression 6–8s (Camera pull up): Gentle subtle whoosh at 15%
Scene Progression 8–10s (Blink & stillness): Clean, hollow wood block tap at 15%
Background music (add in editor):
Pensive ambient keys and gentle suspended cello note, ducked at -20dB.
"""

def test_user_script_parses_cleanly():
    res = ReferenceParser.parse_batch_text(USER_SCRIPT)
    assert len(res) == 2
    p1 = res[0]
    assert p1["paragraph_number"] == 1
    # Check that transcript is clean and contains only the dialogue
    assert "Aaj tumne kya khaya? Maggie? Pizza?" in p1["transcript"]
    assert "Ghar ka dal chawal? Ya raat ke do baje wala Kurkure?" in p1["transcript"]
    assert "VIDEO SHOT 1" not in p1["transcript"]
    assert "AAJ TUMNE KYA KHAYA?" not in p1["transcript"]
    # Check video prompt
    assert "Flat 2D vector cartoon animation" in p1["video_prompt"]
    assert p1["on_screen_text"] == "AAJ TUMNE KYA KHAYA?"
