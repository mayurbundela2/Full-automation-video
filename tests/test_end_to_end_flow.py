import os
import json
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.database import Base, engine, SessionLocal
from backend.models import Project, Batch, Paragraph, Generation

client = TestClient(app)

SAMPLE_4_PARAGRAPH_BATCH = """
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


from unittest.mock import patch
from backend.services.audio_converter import AudioConverter


def mock_generate_speech(prompt, transcript, voice="Algenib", model="gemini-3.1-flash-tts-preview", api_key=None, max_retries=3):
    pcm = AudioConverter.generate_demo_wav(duration_seconds=2.5, sample_rate=24000)
    return pcm, {
        "model": model,
        "voice": voice,
        "sample_rate": 24000,
        "mime_type": "audio/l16; rate=24000; channels=1",
        "is_demo": False
    }


@patch("backend.services.gemini_tts_service.GeminiTTSService.generate_speech", side_effect=mock_generate_speech)
def test_full_end_to_end_pipeline(mock_speech, tmp_path):
    import time
    unique_name = f"E2E Cannabis Doc {int(time.time() * 1000)}"
    proj_id = None
    try:
        # 1. Create Project
        proj_res = client.post("/api/projects", json={
            "name": unique_name,
            "description": "Full documentary voiceover batch"
        })
        assert proj_res.status_code == 200
        proj_data = proj_res.json()
        proj_id = proj_data["id"]
        assert proj_data["name"] == unique_name

        # 2. Create Batch
        batch_res = client.post(f"/api/projects/{proj_id}/batches", json={
            "name": "Batch 01",
            "batch_number": 1
        })
        assert batch_res.status_code == 200
        batch_data = batch_res.json()
        batch_id = batch_data["id"]

        # 3. Parse Reference (Preview without committing)
        parse_res = client.post(f"/api/batches/{batch_id}/parse-reference", json={
            "raw_text": SAMPLE_4_PARAGRAPH_BATCH,
            "default_voice": "Algenib"
        })
        assert parse_res.status_code == 200
        parse_data = parse_res.json()
        assert parse_data["detected_count"] == 4

        # 4. Import Reference into Batch
        import_res = client.post(f"/api/batches/{batch_id}/import-reference", json={
            "raw_text": SAMPLE_4_PARAGRAPH_BATCH,
            "default_voice": "Algenib"
        })
        assert import_res.status_code == 200
        imported_batch = import_res.json()
        assert len(imported_batch["paragraphs"]) == 4

        # Verify Paragraph 1 metadata
        p1 = imported_batch["paragraphs"][0]
        assert p1["paragraph_number"] == 1
        assert p1["voice"] == "Algenib"
        assert "Ek sawaal..." in p1["transcript"]
        assert p1["word_count"] > 0
        assert p1["character_count"] > 0
        assert p1["limit_status"] == "SAFE"

        # 5. Test Prompt Preview
        prompt_res = client.post(f"/api/paragraphs/{p1['id']}/preview-prompt")
        assert prompt_res.status_code == 200
        prompt_data = prompt_res.json()
        assert "Generate a natural spoken narration." in prompt_data["prompt"]
        assert "SCENE:" in prompt_data["prompt"]
        assert "TRANSCRIPT:" in prompt_data["prompt"]
        assert "Ek sawaal..." in prompt_data["prompt"]

        # 6. Generate Single Paragraph Audio (Demo mode synthesizer fallback in test)
        gen_res = client.post(f"/api/paragraphs/{p1['id']}/generate")
        assert gen_res.status_code == 200
        gen_data = gen_res.json()
        assert gen_data["status"] == "COMPLETED"
        assert gen_data["duration"] > 0
        assert os.path.exists(gen_data["wav_path"])
        assert "waveform" in gen_data
        assert len(gen_data["waveform"]["peaks"]) > 0

        # 7. Generate All Ready Paragraphs in Batch
        batch_gen_res = client.post(f"/api/batches/{batch_id}/generate-ready")
        assert batch_gen_res.status_code == 200
        batch_gen_data = batch_gen_res.json()
        assert batch_gen_data["generated_count"] >= 3

        # 8. Check Generation History
        hist_res = client.get("/api/generations")
        assert hist_res.status_code == 200
        history = hist_res.json()
        assert len(history) >= 4

        # 9. Verify Audio Stream Endpoint
        latest_gen_id = history[0]["id"]
        audio_stream_res = client.get(f"/api/generations/{latest_gen_id}/audio?format=wav")
        assert audio_stream_res.status_code == 200
        assert audio_stream_res.headers["content-type"] == "audio/wav"
        assert len(audio_stream_res.content) > 100

        # 10. Test Split Feature on an Over-Limit Paragraph
        # Create an artificially long paragraph
        long_para_res = client.post(f"/api/paragraphs/{imported_batch['paragraphs'][3]['id']}/split-manual", json={
            "part_a_transcript": "[excited] Aaj duniya phir se wahi mudh rahi hai jahan se yeh kahani shuru hui thi.",
            "part_b_transcript": "[amazed] Yeh ek aisi kranti hai jise koi rok nahi sakta."
        })
        assert long_para_res.status_code == 200

        # Verify updated batch has 5 paragraphs now
        refreshed_batch_res = client.get(f"/api/batches/{batch_id}")
        assert len(refreshed_batch_res.json()["paragraphs"]) == 5
    finally:
        if proj_id:
            try:
                client.delete(f"/api/projects/{proj_id}")
            except Exception:
                pass
