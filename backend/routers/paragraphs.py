import datetime
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Project, Batch, Paragraph, Generation, AppSetting
from backend.schemas import (
    ParagraphCreate, ParagraphUpdate, ParagraphResponse,
    ParagraphSplitRequest, PromptPreviewResponse, GenerationResponse
)
from backend.services.text_splitter import TextSplitter
from backend.services.prompt_builder import PromptBuilder
from backend.services.gemini_tts_service import GeminiTTSService
from backend.services.audio_converter import AudioConverter
from backend.services.waveform_service import WaveformService
from backend.services.subtitle_service import SubtitleService
from backend.services.delivery_provider import LocalDeliveryProvider, sanitize_filename
from backend.config.settings import settings

router = APIRouter(tags=["Paragraphs"])


def get_paragraph_or_404(paragraph_id: int, db: Session) -> Paragraph:
    para = db.query(Paragraph).filter(Paragraph.id == paragraph_id).first()
    if not para:
        raise HTTPException(status_code=404, detail="Paragraph not found")
    return para


def execute_paragraph_generation(paragraph_id: int, db: Session) -> Dict[str, Any]:
    """
    Core generation worker for a single paragraph.
    1. Validates transcript
    2. Builds final TTS prompt (or uses custom prompt)
    3. Calls GeminiTTSService
    4. Saves master WAV
    5. Converts to MP3 (if auto_convert_mp3 is ON)
    6. Writes metadata.json
    7. Creates Generation DB record
    """
    para = db.query(Paragraph).filter(Paragraph.id == paragraph_id).first()
    if not para:
        raise HTTPException(status_code=404, detail="Paragraph not found")

    if not para.transcript or not para.transcript.strip():
        raise HTTPException(status_code=400, detail="Cannot generate audio for empty transcript.")

    # Read active settings
    api_key_setting = db.query(AppSetting).filter(AppSetting.key == "GEMINI_API_KEY").first()
    model_setting = db.query(AppSetting).filter(AppSetting.key == "GEMINI_MODEL").first()
    auto_mp3_setting = db.query(AppSetting).filter(AppSetting.key == "AUTO_CONVERT_MP3").first()
    bitrate_setting = db.query(AppSetting).filter(AppSetting.key == "MP3_BITRATE").first()
    ffmpeg_path_setting = db.query(AppSetting).filter(AppSetting.key == "FFMPEG_PATH").first()
    output_dir_setting = db.query(AppSetting).filter(AppSetting.key == "OUTPUT_FOLDER").first()
    preserve_tags_setting = db.query(AppSetting).filter(AppSetting.key == "PRESERVE_INLINE_TAGS").first()

    api_key = api_key_setting.value if api_key_setting else settings.GEMINI_API_KEY
    model_name = model_setting.value if model_setting else settings.GEMINI_MODEL
    auto_mp3 = (auto_mp3_setting.value.lower() == "true") if auto_mp3_setting else settings.AUTO_CONVERT_MP3
    bitrate = bitrate_setting.value if bitrate_setting else settings.MP3_BITRATE
    ffmpeg_path = ffmpeg_path_setting.value if ffmpeg_path_setting else settings.FFMPEG_PATH
    output_folder = output_dir_setting.value if output_dir_setting else settings.OUTPUT_FOLDER
    preserve_tags = (preserve_tags_setting.value.lower() == "true") if preserve_tags_setting else settings.PRESERVE_INLINE_TAGS

    batch = para.batch
    project = batch.project

    para_config = {
        "scene": para.scene,
        "sample_context": para.sample_context,
        "audio_profile": para.audio_profile,
        "speaker": para.speaker,
        "style": para.style,
        "pace": para.pace,
        "accent": para.accent,
        "voice": para.voice,
        "director_notes": para.director_notes,
        "additional_notes": para.additional_notes,
        "transcript": para.transcript,
        "custom_prompt": para.custom_prompt
    }

    final_prompt = PromptBuilder.build_tts_prompt(para_config, preserve_inline_tags=preserve_tags)

    para.status = "GENERATING"
    db.commit()

    try:
        # Generate speech bytes
        audio_pcm_or_wav, gen_meta = GeminiTTSService.generate_speech(
            prompt=final_prompt,
            transcript=para.transcript,
            voice=para.voice or "Algenib",
            model=model_name,
            api_key=api_key
        )

        delivery = LocalDeliveryProvider(base_output_dir=output_folder)
        target_dir = delivery.get_paragraph_dir(
            project_name=project.name,
            batch_number=batch.batch_number,
            paragraph_number=para.paragraph_number,
            part_identifier=para.part_number
        )

        temp_wav = target_dir / "narration.wav"
        # Save master WAV
        sample_rate = gen_meta.get("sample_rate", 24000)
        saved_wav = AudioConverter.save_wav_master(
            pcm_or_wav_data=audio_pcm_or_wav,
            output_wav_path=str(temp_wav),
            sample_rate=sample_rate,
            channels=1
        )

        # Get audio characteristics
        audio_info = AudioConverter.get_audio_info(saved_wav)
        duration = audio_info["duration"]

        # Convert to MP3
        saved_mp3 = None
        if auto_mp3:
            mp3_dest = target_dir / "narration.mp3"
            try:
                saved_mp3 = AudioConverter.convert_wav_to_mp3(
                    wav_path=saved_wav,
                    mp3_path=str(mp3_dest),
                    ffmpeg_path=ffmpeg_path,
                    bitrate=bitrate
                )
            except Exception as ffmpeg_err:
                print(f"[ParagraphGeneration] MP3 conversion warning: {ffmpeg_err}")

        # Metadata dictionary
        metadata_payload = {
            "project": project.name,
            "project_id": project.id,
            "batch": batch.batch_number,
            "batch_id": batch.id,
            "paragraph": para.paragraph_number,
            "paragraph_id": para.id,
            "part": para.part_number,
            "voice": para.voice,
            "model": gen_meta.get("model", model_name),
            "scene": para.scene,
            "sample_context": para.sample_context,
            "audio_profile": para.audio_profile,
            "speaker": para.speaker,
            "style": para.style,
            "pace": para.pace,
            "accent": para.accent,
            "director_notes": para.director_notes,
            "additional_notes": para.additional_notes,
            "transcript": para.transcript,
            "generated_prompt": final_prompt,
            "word_count": para.word_count,
            "character_count": para.character_count,
            "duration_seconds": duration,
            "sample_rate": sample_rate,
            "channels": audio_info["channels"],
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "wav": "narration.wav",
            "mp3": "narration.mp3" if saved_mp3 else None,
            "is_demo": gen_meta.get("is_demo", False)
        }

        # Deliver and write metadata.json
        delivery_res = delivery.deliver_audio_artifact(
            project_name=project.name,
            batch_number=batch.batch_number,
            paragraph_number=para.paragraph_number,
            part_identifier=para.part_number,
            wav_bytes=open(saved_wav, "rb").read(),
            mp3_path_or_bytes=saved_mp3,
            metadata=metadata_payload
        )

        # Generate paragraph subtitles (SRT, VTT, JSON)
        try:
            SubtitleService.generate_paragraph_subtitles(
                transcript=para.transcript,
                duration=duration,
                output_dir=target_dir,
                prefix="narration"
            )
        except Exception as sub_err:
            print(f"[ParagraphGeneration] Subtitle generation notice: {sub_err}")


        # Create Generation record
        gen_record = Generation(
            paragraph_id=para.id,
            project_name=project.name,
            batch_number=batch.batch_number,
            paragraph_number=para.paragraph_number,
            part_number=para.part_number,
            voice=para.voice or "Algenib",
            model=gen_meta.get("model", model_name),
            duration=duration,
            wav_path=delivery_res["wav_path"],
            mp3_path=delivery_res["mp3_path"],
            metadata_path=delivery_res["metadata_path"],
            prompt_used=final_prompt,
            transcript_used=para.transcript,
            status="COMPLETED"
        )
        db.add(gen_record)
        db.commit()
        db.refresh(gen_record)

        para.status = "COMPLETED"
        para.generation_id = gen_record.id
        db.commit()

        waveform = WaveformService.extract_peaks_from_wav(delivery_res["wav_path"])

        return {
            "status": "COMPLETED",
            "paragraph_id": para.id,
            "generation_id": gen_record.id,
            "wav_path": delivery_res["wav_path"],
            "mp3_path": delivery_res["mp3_path"],
            "duration": duration,
            "waveform": waveform
        }

    except Exception as e:
        para.status = "FAILED"
        gen_record = Generation(
            paragraph_id=para.id,
            project_name=project.name,
            batch_number=batch.batch_number,
            paragraph_number=para.paragraph_number,
            part_number=para.part_number,
            voice=para.voice or "Algenib",
            model=model_name,
            status="FAILED",
            error_message=str(e),
            prompt_used=final_prompt,
            transcript_used=para.transcript
        )
        db.add(gen_record)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/paragraphs/{paragraph_id}", response_model=ParagraphResponse)
def update_paragraph(paragraph_id: int, data: ParagraphUpdate, db: Session = Depends(get_db)):
    para = get_paragraph_or_404(paragraph_id, db)
    from backend.routers.batches import enrich_paragraph

    data_dict = data.model_dump(exclude_unset=True)
    for field, val in data_dict.items():
        setattr(para, field, val)

    # Recalculate stats if transcript changed
    if "transcript" in data_dict:
        para.word_count = TextSplitter.count_words(para.transcript)
        para.character_count = TextSplitter.count_characters(para.transcript)

    db.commit()
    db.refresh(para)
    return enrich_paragraph(para, db)


@router.delete("/api/paragraphs/{paragraph_id}")
def delete_paragraph(paragraph_id: int, db: Session = Depends(get_db)):
    para = get_paragraph_or_404(paragraph_id, db)
    db.delete(para)
    db.commit()
    return {"status": "deleted", "id": paragraph_id}


@router.post("/api/paragraphs/{paragraph_id}/preview-prompt", response_model=PromptPreviewResponse)
def preview_prompt(paragraph_id: int, db: Session = Depends(get_db)):
    para = get_paragraph_or_404(paragraph_id, db)
    preserve_tags_setting = db.query(AppSetting).filter(AppSetting.key == "PRESERVE_INLINE_TAGS").first()
    preserve_tags = (preserve_tags_setting.value.lower() == "true") if preserve_tags_setting else settings.PRESERVE_INLINE_TAGS

    para_config = {
        "scene": para.scene,
        "sample_context": para.sample_context,
        "audio_profile": para.audio_profile,
        "speaker": para.speaker,
        "style": para.style,
        "pace": para.pace,
        "accent": para.accent,
        "voice": para.voice,
        "director_notes": para.director_notes,
        "additional_notes": para.additional_notes,
        "transcript": para.transcript,
        "custom_prompt": para.custom_prompt
    }

    prompt = PromptBuilder.build_tts_prompt(para_config, preserve_inline_tags=preserve_tags)
    return PromptPreviewResponse(
        paragraph_id=para.id,
        prompt=prompt,
        is_custom=bool(para.custom_prompt and para.custom_prompt.strip()),
        transcript=para.transcript,
        voice=para.voice or "Algenib"
    )


@router.post("/api/paragraphs/{paragraph_id}/reset-prompt", response_model=PromptPreviewResponse)
def reset_prompt(paragraph_id: int, db: Session = Depends(get_db)):
    para = get_paragraph_or_404(paragraph_id, db)
    para.custom_prompt = None
    db.commit()
    return preview_prompt(paragraph_id, db)


@router.post("/api/paragraphs/{paragraph_id}/generate")
def generate_single_paragraph(paragraph_id: int, db: Session = Depends(get_db)):
    return execute_paragraph_generation(paragraph_id, db)


@router.post("/api/paragraphs/{paragraph_id}/split-auto")
def auto_split_paragraph(paragraph_id: int, db: Session = Depends(get_db)):
    """
    Automatically splits over-limit paragraph into sequential parts (e.g., Part A, Part B)
    preserving punctuation and metadata.
    """
    para = get_paragraph_or_404(paragraph_id, db)

    max_c = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first() else settings.MAX_TTS_CHARACTERS)
    max_w = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first() else settings.MAX_TTS_WORDS)

    chunks = TextSplitter.split_by_limit(para.transcript, max_c, max_w)
    if len(chunks) <= 1:
        return {"status": "noop", "message": "Text is already within safe limits or cannot be split further."}

    # Transform current paragraph to Part A and create new Part B, Part C...
    sub_labels = ["A", "B", "C", "D", "E", "F"]

    orig_para_num = para.paragraph_number
    orig_part_name = para.part_number or f"Part {orig_para_num}"

    # Update original to Part A
    para.part_number = f"{orig_part_name} (Part A)"
    para.transcript = chunks[0]
    para.word_count = TextSplitter.count_words(chunks[0])
    para.character_count = TextSplitter.count_characters(chunks[0])
    para.status = "READY"

    created_sub_paras = [para.id]

    for idx, chunk in enumerate(chunks[1:], start=1):
        label = sub_labels[idx] if idx < len(sub_labels) else f"Part_{idx+1}"
        new_sub = Paragraph(
            batch_id=para.batch_id,
            paragraph_number=orig_para_num,
            part_number=f"{orig_part_name} (Part {label})",
            scene=para.scene,
            sample_context=para.sample_context,
            audio_profile=para.audio_profile,
            speaker=para.speaker,
            style=para.style,
            pace=para.pace,
            accent=para.accent,
            voice=para.voice,
            director_notes=para.director_notes,
            additional_notes=para.additional_notes,
            transcript=chunk,
            word_count=TextSplitter.count_words(chunk),
            character_count=TextSplitter.count_characters(chunk),
            status="READY",
            parent_paragraph_id=para.id,
            raw_reference=para.raw_reference
        )
        db.add(new_sub)
        db.flush()
        created_sub_paras.append(new_sub.id)

    db.commit()

    return {
        "status": "split_completed",
        "split_count": len(chunks),
        "paragraph_ids": created_sub_paras
    }


@router.post("/api/paragraphs/{paragraph_id}/split-manual")
def manual_split_paragraph(paragraph_id: int, data: ParagraphSplitRequest, db: Session = Depends(get_db)):
    """
    Splits paragraph using user-provided text for Part A, Part B, and optional Part C.
    """
    para = get_paragraph_or_404(paragraph_id, db)

    if not data.part_a_transcript.strip() or not data.part_b_transcript.strip():
        raise HTTPException(status_code=400, detail="Both Part A and Part B must have content to split.")

    orig_para_num = para.paragraph_number
    orig_part_name = para.part_number or f"Part {orig_para_num}"

    para.part_number = f"{orig_part_name} (Part A)"
    para.transcript = data.part_a_transcript.strip()
    para.word_count = TextSplitter.count_words(para.transcript)
    para.character_count = TextSplitter.count_characters(para.transcript)
    para.status = "READY"

    # Part B
    part_b = Paragraph(
        batch_id=para.batch_id,
        paragraph_number=orig_para_num,
        part_number=f"{orig_part_name} (Part B)",
        scene=para.scene,
        sample_context=para.sample_context,
        audio_profile=para.audio_profile,
        speaker=para.speaker,
        style=para.style,
        pace=para.pace,
        accent=para.accent,
        voice=para.voice,
        director_notes=para.director_notes,
        additional_notes=para.additional_notes,
        transcript=data.part_b_transcript.strip(),
        word_count=TextSplitter.count_words(data.part_b_transcript.strip()),
        character_count=TextSplitter.count_characters(data.part_b_transcript.strip()),
        status="READY",
        parent_paragraph_id=para.id,
        raw_reference=para.raw_reference
    )
    db.add(part_b)

    # Optional Part C
    if data.part_c_transcript and data.part_c_transcript.strip():
        part_c = Paragraph(
            batch_id=para.batch_id,
            paragraph_number=orig_para_num,
            part_number=f"{orig_part_name} (Part C)",
            scene=para.scene,
            sample_context=para.sample_context,
            audio_profile=para.audio_profile,
            speaker=para.speaker,
            style=para.style,
            pace=para.pace,
            accent=para.accent,
            voice=para.voice,
            director_notes=para.director_notes,
            additional_notes=para.additional_notes,
            transcript=data.part_c_transcript.strip(),
            word_count=TextSplitter.count_words(data.part_c_transcript.strip()),
            character_count=TextSplitter.count_characters(data.part_c_transcript.strip()),
            status="READY",
            parent_paragraph_id=para.id,
            raw_reference=para.raw_reference
        )
        db.add(part_c)

    db.commit()
    return {"status": "split_completed", "parent_id": para.id}


@router.post("/api/paragraphs/{paragraph_id}/merge")
def merge_subparagraphs(paragraph_id: int, db: Session = Depends(get_db)):
    """
    Merges child sub-paragraphs back into parent paragraph.
    """
    para = get_paragraph_or_404(paragraph_id, db)

    # Find children
    children = db.query(Paragraph).filter(Paragraph.parent_paragraph_id == para.id).all()
    if not children:
        # Check if this paragraph is itself a child
        if para.parent_paragraph_id:
            parent = db.query(Paragraph).filter(Paragraph.id == para.parent_paragraph_id).first()
            if parent:
                return merge_subparagraphs(parent.id, db)
        raise HTTPException(status_code=400, detail="This paragraph has no split sub-paragraphs to merge.")

    all_transcripts = [para.transcript] + [c.transcript for c in children]
    combined_transcript = "\n\n".join(t for t in all_transcripts if t.strip())

    para.transcript = combined_transcript
    para.word_count = TextSplitter.count_words(combined_transcript)
    para.character_count = TextSplitter.count_characters(combined_transcript)
    # Clean part title
    if para.part_number and "(Part A)" in para.part_number:
        para.part_number = para.part_number.replace(" (Part A)", "")

    # Delete child paragraphs
    for c in children:
        db.delete(c)

    db.commit()
    db.refresh(para)
    return {"status": "merged", "paragraph_id": para.id}


@router.get("/api/paragraphs/{paragraph_id}/subtitles")
def get_paragraph_subtitles(paragraph_id: int, format: str = "srt", download: bool = False, db: Session = Depends(get_db)):
    """
    Downloads or returns .SRT, .VTT, or .JSON subtitles for a single paragraph.
    """
    para = get_paragraph_or_404(paragraph_id, db)
    batch = para.batch
    project = batch.project
    output_dir_setting = db.query(AppSetting).filter(AppSetting.key == "OUTPUT_FOLDER").first()
    output_base = output_dir_setting.value if output_dir_setting else settings.OUTPUT_FOLDER
    delivery = LocalDeliveryProvider(base_output_dir=output_base)
    target_dir = delivery.get_paragraph_dir(
        project_name=project.name,
        batch_number=batch.batch_number,
        paragraph_number=para.paragraph_number,
        part_identifier=para.part_number
    )
    filename_suffix = "_words.json" if format == "json" else f".{format}"
    file_path = target_dir / f"narration{filename_suffix}"
    
    if not file_path.exists():
        latest_gen = db.query(Generation).filter(Generation.paragraph_id == para.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
        dur = latest_gen.duration if (latest_gen and latest_gen.duration) else max(2.0, para.word_count * 0.35)
        SubtitleService.generate_paragraph_subtitles(
            transcript=para.transcript,
            duration=dur,
            output_dir=target_dir,
            prefix="narration"
        )
        
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Subtitle file not found.")

    media_types = {
        "srt": "application/x-subrip",
        "vtt": "text/vtt",
        "json": "application/json"
    }
    media_type = media_types.get(format, "text/plain")
    safe_part = sanitize_filename(para.part_number or f"Part_{para.paragraph_number}")[:30]
    safe_proj = sanitize_filename(project.name)[:30]
    download_name = f"{safe_proj}_P{para.paragraph_number:02d}_{safe_part}{filename_suffix}"
    disposition = "attachment" if download else "inline"

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=download_name,
        headers={"Content-Disposition": f"{disposition}; filename=\"{download_name}\""}
    )

