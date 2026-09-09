import pytest
from backend.services.reference_parser import ReferenceParser

SAMPLE_AI_STUDIO_INPUT = """
Here is the breakdown for Batch 1...

### Part 1: COLD OPEN — The Riddle

Playground Setup:

- Scene: "A dimly lit room with an investigative board in the background, papers and red strings everywhere."
- Sample Context: "Gripping cold open hook, serious mystery tone."
- Audio Profile: "Deep, investigative, and authoritative Indian documentary YouTuber."
- Style: Newscaster
- Pace: Natural
- Accent: Neutral
- Voice: Algenib

Formatted Script to Copy-Paste:

[serious] [mysterious]

Ek sawaal...

[thoughtful] [curious]

Pichle baarah hazaar saalon mein insaan ne aisi kaunsi cheez khoji hai jo pehle aam thi aur aaj illegal hai?

### Part 2: THE ANCIENT ROOTS

Playground Setup:

- Scene: "Ancient Harappan civilization ruins and cave paintings."
- Sample Context: "Historical narration with awe and depth."
- Audio Profile: "Historical scholar, rich tone."
- Style: Conversational
- Pace: Slow
- Accent: Neutral
- Voice: Aoede

Formatted Script to Copy-Paste:

[reflective] [authoritative]

Himalaya ki vaadiyon se lekar Atharvaveda ke pannon tak, yeh paudha har jagah maujood tha.

### Part 3: COLONIAL INTERVENTION

Playground Setup:

- Scene: "British East India Company archives and stamps."
- Voice: Charon
- Style: Newscaster

Formatted Script to Copy-Paste:

[blunt] [direct]

1894 mein Britishers ne banaya Indian Hemp Drugs Commission.

### Part 4: THE GLOBAL SHIFT

Playground Setup:

- Scene: "Modern legal battle and UN conventions."
- Voice: Fenrir
- Style: Energetic

Formatted Script to Copy-Paste:

[excited] [amazed]

Aaj duniya phir se wahi mudh rahi hai jahan se yeh kahani shuru hui thi.
"""


def test_parse_batch_detects_four_paragraphs():
    paragraphs = ReferenceParser.parse_batch_text(SAMPLE_AI_STUDIO_INPUT)
    assert len(paragraphs) == 4

    p1 = paragraphs[0]
    assert p1["paragraph_number"] == 1
    assert "COLD OPEN" in p1["part_number"]
    assert "investigative board" in p1["scene"]
    assert p1["style"] == "Newscaster"
    assert p1["pace"] == "Natural"
    assert p1["accent"] == "Neutral"
    assert p1["voice"] == "Algenib"
    assert "Ek sawaal..." in p1["transcript"]
    assert "[serious] [mysterious]" in p1["transcript"]

    p2 = paragraphs[1]
    assert p2["paragraph_number"] == 2
    assert "Harappan civilization" in p2["scene"]
    assert p2["voice"] == "Aoede"
    assert p2["style"] == "Conversational"
    assert p2["pace"] == "Slow"
    assert "Atharvaveda" in p2["transcript"]

    p3 = paragraphs[2]
    assert p3["paragraph_number"] == 3
    assert p3["voice"] == "Charon"
    assert "1894 mein" in p3["transcript"]

    p4 = paragraphs[3]
    assert p4["paragraph_number"] == 4
    assert p4["voice"] == "Fenrir"
    assert p4["style"] == "Energetic"
    assert "Aaj duniya" in p4["transcript"]


def test_parse_raw_reference_preserved():
    paragraphs = ReferenceParser.parse_batch_text(SAMPLE_AI_STUDIO_INPUT)
    for p in paragraphs:
        assert p["raw_reference"] is not None
        assert len(p["raw_reference"]) > 0


def test_parse_single_unstructured_paragraph():
    raw = "Scene: Room\nVoice: Puck\nFormatted Script:\nHello world this is a test."
    paragraphs = ReferenceParser.parse_batch_text(raw)
    assert len(paragraphs) == 1
    assert paragraphs[0]["voice"] == "Puck"
    assert paragraphs[0]["scene"] == "Room"
    assert paragraphs[0]["transcript"] == "Hello world this is a test."


def test_dialogue_starting_with_video_or_audio_not_truncated():
    raw = """
#### Part 56: CLOSING — The Incredible Brain (Paragraph 56)
* **Scene:** "A final, majestic shot of the human brain pulsing with light."
* **Style:** Newscaster | **Pace:** Natural | **Voice:** Algenib
**Formatted Script to Copy-Paste:**
> `[awe-struck]` `[intimate]`
> Video ke end mein ye sochna zaroori hai ki humara dimaag kitna anokha hai.
> Yeh har pal naye vichar paida karta hai.

---

#### Part 58: CLOSING — The Call to Action (Paragraph 58)
* **Scene:** "The video end screen appears."
* **Voice:** Algenib
**Formatted Script to Copy-Paste:**
> `[inviting]` `[helpful]`
> Video pasand aayi toh screen par click karke aag ki kahani dekhein.

🎬 CapCut Editing Tip: Cut to wide shot.
"""
    paragraphs = ReferenceParser.parse_batch_text(raw)
    assert len(paragraphs) == 2

    p56 = paragraphs[0]
    assert p56["paragraph_number"] == 56
    assert "Video ke end mein" in p56["transcript"]
    assert "Yeh har pal naye vichar" in p56["transcript"]
    assert "[awe-struck]" in p56["transcript"]

    p58 = paragraphs[1]
    assert p58["paragraph_number"] == 58
    assert "Video pasand aayi toh screen par" in p58["transcript"]
    assert "CapCut Editing Tip" not in p58["transcript"]


def test_voiceover_and_narration_headers_and_shots():
    raw = """
#### Part 1: HOOK (Paragraph 1)
* **Scene:** Dark room. Shot 1: Zoom. Shot 2: Pan.
**Voiceover:**
> [serious] [curious]
> Audio suno dhyaan se, kya ye aag ki aawaaz hai?

#### Part 2: BODY (Paragraph 2)
**Narration:**
> [reflective] [calm]
> Notes lene ki zaroorat nahi hai.
"""
    paragraphs = ReferenceParser.parse_batch_text(raw)
    assert len(paragraphs) == 2
    assert paragraphs[0]["paragraph_number"] == 1
    assert "Audio suno dhyaan se" in paragraphs[0]["transcript"]
    assert paragraphs[1]["paragraph_number"] == 2
    assert "Notes lene ki zaroorat nahi hai" in paragraphs[1]["transcript"]

