import subprocess
from pathlib import Path
import os
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, File, UploadFile, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Project, Batch, Paragraph, Generation, AppSetting
from backend.schemas import (
    BatchCreate, BatchResponse, ParseReferenceRequest,
    ParseReferenceResponse, ParagraphResponse,
    ScanMediaRequest, ScanMediaResponse, MediaMatchItem, AssignMediaRequest
)
from backend.services.video_service import VideoService
from backend.services.reference_parser import ReferenceParser
from backend.services.text_splitter import TextSplitter
from backend.services.prompt_builder import PromptBuilder
from backend.services.gemini_tts_service import GeminiTTSService
from backend.services.audio_converter import AudioConverter
from backend.services.waveform_service import WaveformService
from backend.services.subtitle_service import SubtitleService
from backend.services.delivery_provider import LocalDeliveryProvider, sanitize_filename
from backend.config.settings import settings

router = APIRouter(tags=["Batches"])


def enrich_paragraph(para: Paragraph, db: Session) -> ParagraphResponse:
    # Fetch limit thresholds
    max_c = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first() else settings.MAX_TTS_CHARACTERS)
    max_w = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first() else settings.MAX_TTS_WORDS)
    threshold = float(db.query(AppSetting).filter(AppSetting.key == "NEAR_LIMIT_THRESHOLD").first().value if db.query(AppSetting).filter(AppSetting.key == "NEAR_LIMIT_THRESHOLD").first() else settings.NEAR_LIMIT_THRESHOLD)

    metrics = TextSplitter.check_limit_status(para.transcript, max_c, max_w, threshold)
    
    # Latest generation info
    latest_gen = db.query(Generation).filter(Generation.paragraph_id == para.id).order_by(Generation.created_at.desc()).first()
    gen_dict = None
    if latest_gen:
        waveform_data = WaveformService.extract_peaks_from_wav(latest_gen.wav_path) if latest_gen.wav_path else None
        gen_dict = {
            "id": latest_gen.id,
            "voice": latest_gen.voice,
            "model": latest_gen.model,
            "duration": latest_gen.duration,
            "wav_path": latest_gen.wav_path,
            "mp3_path": latest_gen.mp3_path,
            "metadata_path": latest_gen.metadata_path,
            "status": latest_gen.status,
            "error_message": latest_error if (latest_error := latest_gen.error_message) else None,
            "created_at": latest_gen.created_at,
            "waveform": waveform_data
        }

    return ParagraphResponse(
        id=para.id,
        batch_id=para.batch_id,
        paragraph_number=para.paragraph_number,
        part_number=para.part_number,
        scene=para.scene,
        sample_context=para.sample_context,
        audio_profile=para.audio_profile,
        speaker=para.speaker,
        style=para.style or "Newscaster",
        pace=para.pace or "Natural",
        accent=para.accent or "Neutral",
        voice=para.voice or "Algenib",
        director_notes=para.director_notes,
        additional_notes=para.additional_notes,
        on_screen_text=para.on_screen_text,
        video_prompt=para.video_prompt,
        scene_progression=para.scene_progression,
        overall_mood=para.overall_mood,
        sound_effects=para.sound_effects,
        background_music=para.background_music,
        media_path=para.media_path,
        media_type=para.media_type,
        original_media_duration=para.original_media_duration,
        speed_factor=para.speed_factor,
        synced_video_path=para.synced_video_path,
        thumbnail_path=para.thumbnail_path,
        transcript=para.transcript,
        custom_prompt=para.custom_prompt,
        word_count=para.word_count,
        character_count=para.character_count,
        status=para.status,
        limit_status=metrics["status"],
        limit_metrics=metrics,
        raw_reference=para.raw_reference,
        parent_paragraph_id=para.parent_paragraph_id,
        created_at=para.created_at,
        updated_at=para.updated_at,
        latest_generation=gen_dict
    )


def enrich_batch(batch: Batch, db: Session) -> BatchResponse:
    paragraphs = [enrich_paragraph(p, db) for p in batch.paragraphs]
    total_words = sum(p.word_count for p in paragraphs)
    total_characters = sum(p.character_count for p in paragraphs)
    ready_count = sum(1 for p in paragraphs if p.status == "READY" and p.limit_status != "OVER_LIMIT")
    over_limit_count = sum(1 for p in paragraphs if p.limit_status == "OVER_LIMIT")
    completed_count = sum(1 for p in paragraphs if p.status == "COMPLETED")

    combined_info = None
    if batch.combined_wav_path and os.path.exists(batch.combined_wav_path):
        waveform_data = WaveformService.extract_peaks_from_wav(batch.combined_wav_path)
        combined_info = {
            "wav_path": batch.combined_wav_path,
            "mp3_path": batch.combined_mp3_path,
            "duration": batch.combined_duration,
            "waveform": waveform_data
        }

    tight_info = None
    if batch.tight_wav_path and os.path.exists(batch.tight_wav_path):
        tight_wf = WaveformService.extract_peaks_from_wav(batch.tight_wav_path)
        tight_info = {
            "wav_path": batch.tight_wav_path,
            "mp3_path": batch.tight_mp3_path,
            "mp4_path": batch.tight_mp4_path,
            "duration": batch.tight_duration,
            "waveform": tight_wf
        }

    return BatchResponse(
        id=batch.id,
        project_id=batch.project_id,
        batch_number=batch.batch_number,
        name=batch.name,
        raw_reference=batch.raw_reference,
        status=batch.status,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
        paragraphs=paragraphs,
        total_words=total_words,
        total_characters=total_characters,
        ready_count=ready_count,
        over_limit_count=over_limit_count,
        completed_count=completed_count,
        combined_audio=combined_info,
        tight_audio=tight_info,
        media_folder=batch.media_folder,
        master_video_path=batch.master_video_path,
        master_video_duration=batch.master_video_duration
    )


def combine_batch_audio_files(batch_id: int, db: Session) -> Dict[str, Any]:
    """
    Combines all completed paragraph WAV files in sequential order into a single full batch audio file.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    project = batch.project
    paragraphs = db.query(Paragraph).filter(Paragraph.batch_id == batch_id).order_by(Paragraph.paragraph_number.asc(), Paragraph.id.asc()).all()

    wav_paths = []
    for p in paragraphs:
        latest_gen = db.query(Generation).filter(Generation.paragraph_id == p.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
        if latest_gen and latest_gen.wav_path and os.path.exists(latest_gen.wav_path):
            wav_paths.append(latest_gen.wav_path)

    if not wav_paths:
        raise HTTPException(status_code=400, detail="No completed audio files found to combine in this batch.")

    output_dir_setting = db.query(AppSetting).filter(AppSetting.key == "OUTPUT_FOLDER").first()
    ffmpeg_path_setting = db.query(AppSetting).filter(AppSetting.key == "FFMPEG_PATH").first()
    bitrate_setting = db.query(AppSetting).filter(AppSetting.key == "MP3_BITRATE").first()

    output_base = output_dir_setting.value if output_dir_setting else settings.OUTPUT_FOLDER
    ffmpeg_path = ffmpeg_path_setting.value if ffmpeg_path_setting else settings.FFMPEG_PATH
    bitrate = bitrate_setting.value if bitrate_setting else settings.MP3_BITRATE

    delivery = LocalDeliveryProvider(base_output_dir=output_base)
    batch_dir = delivery.base_dir / sanitize_filename(project.name) / f"Batch_{batch.batch_number:02d}"
    batch_dir.mkdir(parents=True, exist_ok=True)

    combined_wav = str(batch_dir / "full_batch_narration.wav")
    combined_mp3 = str(batch_dir / "full_batch_narration.mp3")

    result = AudioConverter.combine_audio_files(
        wav_file_paths=wav_paths,
        output_wav_path=combined_wav,
        output_mp3_path=combined_mp3,
        silence_gap_seconds=0.20,
        ffmpeg_path=ffmpeg_path,
        bitrate=bitrate
    )

    batch.combined_wav_path = combined_wav
    batch.combined_mp3_path = combined_mp3
    batch.combined_duration = result["duration"]
    db.commit()

    # Generate Master Subtitles & Word Timestamps
    paras_meta = []
    for p in paragraphs:
        latest_gen = db.query(Generation).filter(Generation.paragraph_id == p.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
        dur = latest_gen.duration if (latest_gen and latest_gen.duration) else 2.5
        wav_p = latest_gen.wav_path if latest_gen else None
        paras_meta.append({
            "paragraph_number": p.paragraph_number,
            "part_title": p.part_number or f"Paragraph {p.paragraph_number}",
            "transcript": p.transcript,
            "duration": dur,
            "wav_path": wav_p
        })

    SubtitleService.generate_batch_subtitles(
        paragraphs_data=paras_meta,
        output_base_dir=batch_dir,
        prefix="full_batch_narration",
        full_wav_path=combined_wav,
        silence_gap_seconds=0.4,
        words_per_caption=4
    )

    waveform = WaveformService.extract_peaks_from_wav(combined_wav)
    return {
        "status": "COMBINED",
        "batch_id": batch.id,
        "wav_path": combined_wav,
        "mp3_path": combined_mp3,
        "duration": result["duration"],
        "combined_count": result["combined_count"],
        "waveform": waveform
    }


def tighten_batch_audio_files(batch_id: int, db: Session, silence_threshold: float = 0.18) -> Dict[str, Any]:
    """
    Trims excessive pauses / silences from the combined audio, producing no-pause WAV, MP3, timeline MP4 video,
    and no-pause aligned SRT/VTT/JSON subtitles.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if not batch.combined_wav_path or not os.path.exists(batch.combined_wav_path):
        # Auto-combine first if not combined yet
        combine_batch_audio_files(batch_id, db)
        batch = db.query(Batch).filter(Batch.id == batch_id).first()

    project = batch.project
    output_dir_setting = db.query(AppSetting).filter(AppSetting.key == "OUTPUT_FOLDER").first()
    ffmpeg_path_setting = db.query(AppSetting).filter(AppSetting.key == "FFMPEG_PATH").first()
    bitrate_setting = db.query(AppSetting).filter(AppSetting.key == "MP3_BITRATE").first()

    output_base = output_dir_setting.value if output_dir_setting else settings.OUTPUT_FOLDER
    ffmpeg_path = ffmpeg_path_setting.value if ffmpeg_path_setting else settings.FFMPEG_PATH
    bitrate = bitrate_setting.value if bitrate_setting else settings.MP3_BITRATE

    delivery = LocalDeliveryProvider(base_output_dir=output_base)
    batch_dir = delivery.base_dir / sanitize_filename(project.name) / f"Batch_{batch.batch_number:02d}"
    batch_dir.mkdir(parents=True, exist_ok=True)

    tight_wav = str(batch_dir / "full_batch_tight.wav")
    tight_mp3 = str(batch_dir / "full_batch_tight.mp3")
    tight_mp4 = str(batch_dir / "full_batch_tight.mp4")

    # Per-paragraph precision tight trimming
    paragraphs = db.query(Paragraph).filter(Paragraph.batch_id == batch_id).order_by(Paragraph.paragraph_number.asc(), Paragraph.id.asc()).all()
    paras_tight_meta = []
    tight_wav_paths = []
    inter_para_tight_gap = 0.06

    for p in paragraphs:
        latest_gen = db.query(Generation).filter(Generation.paragraph_id == p.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
        if not latest_gen or not latest_gen.wav_path or not os.path.exists(latest_gen.wav_path):
            continue

        p_wav = Path(latest_gen.wav_path)
        p_tight_wav = p_wav.parent / "narration_tight.wav"
        
        # Trim silence on individual paragraph WAV
        filter_str = f"silenceremove=start_periods=1:start_duration=0.04:start_threshold=-42dB:stop_periods=-1:stop_duration={silence_threshold}:stop_threshold=-42dB"
        ffmpeg_bin = AudioConverter.resolve_ffmpeg(ffmpeg_path)
        cmd_p_trim = [ffmpeg_bin, "-y", "-i", str(p_wav), "-af", filter_str, str(p_tight_wav)]
        try:
            subprocess.run(cmd_p_trim, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except Exception:
            fb = AudioConverter.resolve_ffmpeg("ffmpeg")
            if fb and fb != ffmpeg_bin:
                cmd_p_trim[0] = fb
                try:
                    subprocess.run(cmd_p_trim, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                except Exception:
                    pass

        if not p_tight_wav.exists() or p_tight_wav.stat().st_size < 1000:
            # Fallback to original WAV if silence removal trimmed completely
            p_tight_wav = p_wav

        tight_info = AudioConverter.get_audio_info(str(p_tight_wav))
        tight_dur = tight_info.get("duration", 2.0)
        tight_wav_paths.append(str(p_tight_wav))

        paras_tight_meta.append({
            "paragraph_number": p.paragraph_number,
            "part_title": p.part_number or f"Paragraph {p.paragraph_number}",
            "transcript": p.transcript,
            "duration": tight_dur,
            "wav_path": str(p_tight_wav)
        })

    # Combine tight paragraph WAVs into full_batch_tight.wav
    if tight_wav_paths:
        combine_tight_res = AudioConverter.combine_audio_files(
            wav_file_paths=tight_wav_paths,
            output_wav_path=tight_wav,
            output_mp3_path=tight_mp3,
            silence_gap_seconds=inter_para_tight_gap,
            ffmpeg_path=ffmpeg_path,
            bitrate=bitrate
        )
        tight_dur = combine_tight_res.get("duration", 0.0)
    else:
        # Fallback to combined wav trim
        combine_tight_res = AudioConverter.tighten_and_trim_silence(
            input_wav=batch.combined_wav_path,
            output_wav=tight_wav,
            output_mp3=tight_mp3,
            silence_duration_threshold=silence_threshold,
            silence_db_threshold="-42dB",
            ffmpeg_path=ffmpeg_path,
            bitrate=bitrate
        )
        tight_dur = combine_tight_res.get("duration", 0.0)

    # Render timeline MP4 video
    AudioConverter.create_timeline_mp4_from_audio(
        input_audio_path=tight_wav,
        output_mp4_path=tight_mp4,
        ffmpeg_path=ffmpeg_path
    )

    batch.tight_wav_path = tight_wav
    batch.tight_mp3_path = tight_mp3
    batch.tight_mp4_path = tight_mp4
    batch.tight_duration = tight_dur
    db.commit()

    # Generate Tight Subtitles anchored frame-accurately to each tight paragraph
    SubtitleService.generate_batch_subtitles(
        paragraphs_data=paras_tight_meta,
        output_base_dir=batch_dir,
        prefix="full_batch_tight",
        full_wav_path=tight_wav,
        silence_gap_seconds=inter_para_tight_gap,
        words_per_caption=4
    )

    waveform = WaveformService.extract_peaks_from_wav(tight_wav)
    return {
        "status": "TIGHTENED",
        "batch_id": batch.id,
        "wav_path": tight_wav,
        "mp3_path": tight_mp3,
        "mp4_path": tight_mp4,
        "duration": tight_dur,
        "original_duration": batch.combined_duration,
        "saved_seconds": round((batch.combined_duration or 0) - tight_dur, 2),
        "waveform": waveform
    }


@router.post("/api/batches/{batch_id}/combine-audio")
def trigger_combine_batch_audio(batch_id: int, db: Session = Depends(get_db)):
    return combine_batch_audio_files(batch_id, db)


@router.post("/api/batches/{batch_id}/tighten-audio")
def trigger_tighten_batch_audio(batch_id: int, silence_threshold: float = 0.18, db: Session = Depends(get_db)):
    return tighten_batch_audio_files(batch_id, db, silence_threshold)


@router.post("/api/batches/{batch_id}/rebuild-all")
def trigger_rebuild_all_batch_audio(batch_id: int, silence_threshold: float = 0.18, db: Session = Depends(get_db)):
    """
    Rebuilds both the master combined narration and the no-pause tight narration + timeline MP4 video + subtitles.
    """
    combine_res = combine_batch_audio_files(batch_id, db)
    tighten_res = tighten_batch_audio_files(batch_id, db, silence_threshold)
    return {
        "status": "REBUILT",
        "combined": combine_res,
        "tight": tighten_res
    }


@router.get("/api/batches/{batch_id}/subtitles")
def get_batch_subtitles(batch_id: int, format: str = "srt", type: str = "master", download: bool = False, db: Session = Depends(get_db)):
    """
    Downloads or previews SRT, VTT, or JSON subtitles for master or tight narration.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    project = batch.project
    output_dir_setting = db.query(AppSetting).filter(AppSetting.key == "OUTPUT_FOLDER").first()
    output_base = output_dir_setting.value if output_dir_setting else settings.OUTPUT_FOLDER

    delivery = LocalDeliveryProvider(base_output_dir=output_base)
    batch_dir = delivery.base_dir / sanitize_filename(project.name) / f"Batch_{batch.batch_number:02d}"

    prefix = "full_batch_tight" if type == "tight" else "full_batch_narration"
    filename_suffix = "_words.json" if format == "json" else f".{format}"
    file_path = batch_dir / f"{prefix}{filename_suffix}"

    if not file_path.exists():
        # Auto generate subtitles
        if type == "tight":
            tighten_batch_audio_files(batch_id, db)
        else:
            combine_batch_audio_files(batch_id, db)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Subtitle file not found.")

    media_types = {
        "srt": "application/x-subrip",
        "vtt": "text/vtt",
        "json": "application/json"
    }
    media_type = media_types.get(format, "text/plain")
    download_name = f"{sanitize_filename(project.name)}_Batch_{batch.batch_number:02d}_{type}{filename_suffix}"
    disposition = "attachment" if download else "inline"

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=download_name,
        headers={"Content-Disposition": f"{disposition}; filename=\"{download_name}\""}
    )


@router.get("/api/batches/{batch_id}/word-timestamps")
def get_batch_word_timestamps(batch_id: int, type: str = "master", db: Session = Depends(get_db)):
    """
    Returns the parsed JSON array of word timestamps for the interactive UI subtitle viewer.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    project = batch.project
    output_dir_setting = db.query(AppSetting).filter(AppSetting.key == "OUTPUT_FOLDER").first()
    output_base = output_dir_setting.value if output_dir_setting else settings.OUTPUT_FOLDER

    delivery = LocalDeliveryProvider(base_output_dir=output_base)
    batch_dir = delivery.base_dir / sanitize_filename(project.name) / f"Batch_{batch.batch_number:02d}"

    prefix = "full_batch_tight" if type == "tight" else "full_batch_narration"
    json_path = batch_dir / f"{prefix}_words.json"

    if not json_path.exists():
        if type == "tight":
            tighten_batch_audio_files(batch_id, db)
        else:
            combine_batch_audio_files(batch_id, db)

    if not json_path.exists():
        return {"total_words": 0, "total_duration": 0, "words": []}

    import json
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read word timestamps: {e}")


@router.get("/api/batches/{batch_id}/tight-audio")
def get_batch_tight_audio(batch_id: int, format: str = "wav", download: bool = False, t: Optional[str] = None, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if format == "mp4":
        file_path = batch.tight_mp4_path
        media_type = "video/mp4"
    elif format == "mp3":
        file_path = batch.tight_mp3_path
        media_type = "audio/mpeg"
    else:
        file_path = batch.tight_wav_path
        media_type = "audio/wav"

    if not file_path or not os.path.exists(file_path):
        # Auto create if not made yet
        tighten_batch_audio_files(batch_id, db)
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        file_path = batch.tight_mp4_path if format == "mp4" else (batch.tight_mp3_path if format == "mp3" else batch.tight_wav_path)

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="No-pause file not found. Click 'Trim Pauses & Create MP4' first.")

    filename = f"full_batch_{batch.batch_number}_tight.{format}"
    disposition = "attachment" if download else "inline"

    with open(file_path, "rb") as f:
        content = f.read()

    from fastapi import Response
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"{disposition}; filename=\"{filename}\"",
            "Accept-Ranges": "bytes",
            "Content-Length": str(len(content)),
        }
    )


@router.get("/api/batches/{batch_id}/audio")
def get_batch_combined_audio(batch_id: int, format: str = "wav", download: bool = False, t: Optional[str] = None, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    file_path = batch.combined_mp3_path if format == "mp3" and batch.combined_mp3_path else batch.combined_wav_path
    if not file_path or not os.path.exists(file_path):
        try:
            combine_batch_audio_files(batch_id, db)
            batch = db.query(Batch).filter(Batch.id == batch_id).first()
            file_path = batch.combined_mp3_path if format == "mp3" and batch.combined_mp3_path else batch.combined_wav_path
        except Exception as e:
            pass

    if not file_path or not os.path.exists(file_path):
        file_path = batch.combined_wav_path
        format = "wav"

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Combined batch audio file not found. Generate paragraphs and click Combine Audio.")

    media_type = "audio/mpeg" if format == "mp3" else "audio/wav"
    filename = f"full_batch_{batch.batch_number}_{batch.name}.{format}"
    disposition = "attachment" if download else "inline"

    with open(file_path, "rb") as f:
        content = f.read()

    from fastapi import Response
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"{disposition}; filename=\"{filename}\"",
            "Accept-Ranges": "bytes",
            "Content-Length": str(len(content)),
        }
    )


@router.post("/api/batches/{batch_id}/generate-ready")
def generate_all_ready(batch_id: int, db: Session = Depends(get_db)):
    """
    Sequentially generates audio for all READY paragraphs in this batch,
    then automatically combines them into full_batch_narration audio.
    """
    from backend.routers.paragraphs import execute_paragraph_generation

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    paragraphs = db.query(Paragraph).filter(
        Paragraph.batch_id == batch_id
    ).order_by(Paragraph.paragraph_number.asc()).all()

    # Filter only ready paragraphs that are not over limit
    max_c = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first() else settings.MAX_TTS_CHARACTERS)
    max_w = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first() else settings.MAX_TTS_WORDS)

    ready_paras = []
    skipped_paras = []

    for p in paragraphs:
        limit_info = TextSplitter.check_limit_status(p.transcript, max_c, max_w)
        if limit_info["is_over_limit"]:
            p.status = "OVER_LIMIT"
            skipped_paras.append(p.id)
        elif p.transcript and p.transcript.strip():
            ready_paras.append(p)
        else:
            skipped_paras.append(p.id)

    db.commit()

    if not ready_paras:
        raise HTTPException(
            status_code=400,
            detail="No valid READY paragraphs found for generation. Note: Over-limit paragraphs must be split first."
        )

    results = []
    for p in ready_paras:
        res = execute_paragraph_generation(p.id, db)
        results.append(res)

    batch.status = "COMPLETED" if all(r.get("status") == "COMPLETED" for r in results) else "PARTIAL"
    db.commit()

    # Automatically combine full batch audio
    combined_result = None
    try:
        combined_result = combine_batch_audio_files(batch_id, db)
    except Exception as e:
        print(f"[Batches] Auto-combine warning: {e}")

    return {
        "batch_id": batch_id,
        "generated_count": len(results),
        "skipped_over_limit_count": len(skipped_paras),
        "results": results,
        "combined_audio": combined_result
    }


@router.get("/api/projects/{project_id}/batches", response_model=List[BatchResponse])
def list_batches(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    batches = db.query(Batch).filter(Batch.project_id == project_id).order_by(Batch.batch_number.asc()).all()
    return [enrich_batch(b, db) for b in batches]


@router.post("/api/projects/{project_id}/batches", response_model=BatchResponse)
def create_batch(project_id: int, data: BatchCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Auto-assign batch number if not specified
    existing_count = db.query(Batch).filter(Batch.project_id == project_id).count()
    batch_num = data.batch_number if data.batch_number else (existing_count + 1)

    batch = Batch(
        project_id=project_id,
        batch_number=batch_num,
        name=data.name.strip() or f"Batch {batch_num:02d}",
        status="DRAFT"
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return enrich_batch(batch, db)


@router.get("/api/batches/{batch_id}", response_model=BatchResponse)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return enrich_batch(batch, db)


@router.delete("/api/batches/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    db.delete(batch)
    db.commit()
    return {"status": "deleted", "id": batch_id}


@router.post("/api/batches/{batch_id}/parse-reference", response_model=ParseReferenceResponse)
def parse_reference(batch_id: int, request_data: ParseReferenceRequest, db: Session = Depends(get_db)):
    """
    Parses pasted AI Studio reference text without committing to DB.
    Allows user to inspect parsed results before confirming import.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    default_voice = request_data.default_voice or "Algenib"
    parsed_paragraphs = ReferenceParser.parse_batch_text(request_data.raw_text, default_voice)

    return ParseReferenceResponse(
        detected_count=len(parsed_paragraphs),
        paragraphs=parsed_paragraphs
    )


@router.post("/api/batches/{batch_id}/import-reference", response_model=BatchResponse)
def import_reference_into_batch(batch_id: int, request_data: ParseReferenceRequest, db: Session = Depends(get_db)):
    """
    Parses and commits the pasted reference into the database as paragraph units.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch.raw_reference = request_data.raw_text
    parsed_paragraphs = ReferenceParser.parse_batch_text(request_data.raw_text, request_data.default_voice or "Algenib")

    if not parsed_paragraphs:
        raise HTTPException(status_code=400, detail="Could not parse any paragraphs from the provided text.")

    # Remove existing paragraphs in this batch if refreshing
    db.query(Paragraph).filter(Paragraph.batch_id == batch_id).delete()

    max_c = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first() else settings.MAX_TTS_CHARACTERS)
    max_w = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first() else settings.MAX_TTS_WORDS)

    matches_map = {}
    if request_data.media_folder and os.path.exists(request_data.media_folder) and os.path.isdir(request_data.media_folder):
        batch.media_folder = request_data.media_folder.strip().strip('"\'')
        matches_map = VideoService.scan_media_folder(batch.media_folder)

    for item in parsed_paragraphs:
        words = TextSplitter.count_words(item["transcript"])
        chars = TextSplitter.count_characters(item["transcript"])
        limit_info = TextSplitter.check_limit_status(item["transcript"], max_c, max_w)

        para_status = "OVER_LIMIT" if limit_info["is_over_limit"] else ("READY" if item["transcript"] else "DRAFT")

        media_match = matches_map.get(item["paragraph_number"])
        media_path = media_match["path"] if media_match else None
        media_type = media_match["media_type"] if media_match else None
        orig_dur = None
        if media_path:
            try:
                info = VideoService.get_media_info(media_path)
                orig_dur = info["duration"]
            except Exception:
                pass

        new_para = Paragraph(
            batch_id=batch_id,
            paragraph_number=item["paragraph_number"],
            part_number=item.get("part_number"),
            scene=item.get("scene"),
            sample_context=item.get("sample_context"),
            audio_profile=item.get("audio_profile"),
            speaker=item.get("speaker"),
            style=item.get("style") or "Newscaster",
            pace=item.get("pace") or "Natural",
            accent=item.get("accent") or "Neutral",
            voice=item.get("voice") or (request_data.default_voice or "Algenib"),
            director_notes=item.get("director_notes"),
            additional_notes=item.get("additional_notes"),
            on_screen_text=item.get("on_screen_text"),
            video_prompt=item.get("video_prompt"),
            scene_progression=item.get("scene_progression"),
            overall_mood=item.get("overall_mood"),
            sound_effects=item.get("sound_effects"),
            background_music=item.get("background_music"),
            media_path=media_path,
            media_type=media_type,
            original_media_duration=orig_dur,
            speed_factor=1.0 if media_type == "image" else None,
            transcript=item["transcript"],
            word_count=words,
            character_count=chars,
            status=para_status,
            raw_reference=item.get("raw_reference")
        )
        db.add(new_para)

    batch.status = "READY"
    db.commit()
    db.refresh(batch)
    return enrich_batch(batch, db)


@router.post("/api/batches/{batch_id}/generate-ready")
def generate_all_ready(batch_id: int, db: Session = Depends(get_db)):
    """
    Sequentially generates audio for all READY paragraphs in this batch.
    Skips any OVER_LIMIT paragraphs.
    """
    from backend.routers.paragraphs import execute_paragraph_generation

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    paragraphs = db.query(Paragraph).filter(
        Paragraph.batch_id == batch_id
    ).order_by(Paragraph.paragraph_number.asc()).all()

    # Filter only ready paragraphs that are not over limit
    max_c = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_CHARACTERS").first() else settings.MAX_TTS_CHARACTERS)
    max_w = int(db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first().value if db.query(AppSetting).filter(AppSetting.key == "MAX_TTS_WORDS").first() else settings.MAX_TTS_WORDS)

    ready_paras = []
    skipped_paras = []

    for p in paragraphs:
        limit_info = TextSplitter.check_limit_status(p.transcript, max_c, max_w)
        if limit_info["is_over_limit"]:
            p.status = "OVER_LIMIT"
            skipped_paras.append(p.id)
        elif p.transcript and p.transcript.strip():
            ready_paras.append(p)
        else:
            skipped_paras.append(p.id)

    db.commit()

    if not ready_paras:
        raise HTTPException(
            status_code=400,
            detail="No valid READY paragraphs found for generation. Note: Over-limit paragraphs must be split first."
        )

    results = []
    for p in ready_paras:
        res = execute_paragraph_generation(p.id, db)
        results.append(res)

    batch.status = "COMPLETED" if all(r.get("status") == "COMPLETED" for r in results) else "PARTIAL"
    db.commit()

    return {
        "batch_id": batch_id,
        "generated_count": len(results),
        "skipped_over_limit_count": len(skipped_paras),
        "results": results
    }


# =========================================================================
# Video Media Matching, Speed Synchronization & Timeline Stitching Endpoints
# =========================================================================

@router.post("/api/batches/{batch_id}/scan-media", response_model=ScanMediaResponse)
def scan_and_match_batch_media(batch_id: int, req: ScanMediaRequest, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    raw_path = req.folder_path or req.media_folder or ""
    folder_path = raw_path.strip().strip('"\'')
    if not folder_path:
        raise HTTPException(status_code=400, detail="Please select or enter a valid media folder path")
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail=f"Folder not found or is not a directory: {folder_path}")

    matches_map = VideoService.scan_media_folder(folder_path)
    batch.media_folder = folder_path

    paragraphs = db.query(Paragraph).filter(Paragraph.batch_id == batch_id).order_by(Paragraph.paragraph_number.asc()).all()
    matched_items = []

    for p in paragraphs:
        match = matches_map.get(p.paragraph_number)
        if match:
            p.media_path = match["path"]
            p.media_type = match["media_type"]
            try:
                info = VideoService.get_media_info(match["path"])
                p.original_media_duration = info["duration"]
            except Exception:
                p.original_media_duration = None

            # Check audio duration if already generated
            latest_gen = db.query(Generation).filter(Generation.paragraph_id == p.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
            audio_dur = latest_gen.duration if latest_gen else None
            speed_factor = None
            if audio_dur and p.original_media_duration and p.original_media_duration > 0 and p.media_type == "video":
                speed_factor = round(audio_dur / p.original_media_duration, 3)
            elif p.media_type == "image":
                speed_factor = 1.0

            p.speed_factor = speed_factor

            matched_items.append(MediaMatchItem(
                paragraph_number=p.paragraph_number,
                paragraph_id=p.id,
                matched_file=match["filename"],
                media_type=p.media_type,
                original_duration=p.original_media_duration,
                audio_duration=audio_dur,
                speed_factor=speed_factor
            ))

    db.commit()
    return ScanMediaResponse(
        media_folder=folder_path,
        total_files_found=len(matches_map),
        matches=matched_items
    )


@router.post("/api/batches/{batch_id}/upload-media", response_model=ScanMediaResponse)
async def upload_batch_media_files(
    batch_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Accepts uploaded video/image files (e.g. from browser or mobile folder selection),
    stores them in the project's media assets directory, and auto-matches to paragraphs.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    target_dir = os.path.abspath(os.path.join("data", "projects", f"project_{batch.project_id}", f"batch_{batch_id}_media"))
    os.makedirs(target_dir, exist_ok=True)

    saved_count = 0
    for f in files:
        if not f.filename:
            continue
        dest_filename = os.path.basename(f.filename)
        dest_path = os.path.join(target_dir, dest_filename)
        content = await f.read()
        with open(dest_path, "wb") as out:
            out.write(content)
        saved_count += 1

    normalized_dir = target_dir.replace("\\", "/")
    batch.media_folder = normalized_dir

    matches_map = VideoService.scan_media_folder(normalized_dir)
    paragraphs = db.query(Paragraph).filter(Paragraph.batch_id == batch_id).order_by(Paragraph.paragraph_number.asc()).all()
    matched_items = []

    for p in paragraphs:
        match = matches_map.get(p.paragraph_number)
        if match:
            p.media_path = match["path"]
            p.media_type = match["media_type"]
            try:
                info = VideoService.get_media_info(match["path"])
                p.original_media_duration = info["duration"]
            except Exception:
                p.original_media_duration = None

            latest_gen = db.query(Generation).filter(Generation.paragraph_id == p.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
            audio_dur = latest_gen.duration if latest_gen else None
            speed_factor = None
            if audio_dur and p.original_media_duration and p.original_media_duration > 0 and p.media_type == "video":
                speed_factor = round(audio_dur / p.original_media_duration, 3)
            elif p.media_type == "image":
                speed_factor = 1.0

            p.speed_factor = speed_factor

            matched_items.append(MediaMatchItem(
                paragraph_number=p.paragraph_number,
                paragraph_id=p.id,
                matched_file=match["filename"],
                media_type=p.media_type,
                original_duration=p.original_media_duration,
                audio_duration=audio_dur,
                speed_factor=speed_factor
            ))

    db.commit()

    return ScanMediaResponse(
        media_folder=normalized_dir,
        total_files_found=saved_count,
        matches=matched_items
    )



@router.post("/api/batches/{batch_id}/assign-media")
def assign_paragraph_media(batch_id: int, req: AssignMediaRequest, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    para = db.query(Paragraph).filter(Paragraph.id == req.paragraph_id, Paragraph.batch_id == batch_id).first()
    if not para:
        raise HTTPException(status_code=404, detail="Paragraph not found in this batch")

    file_path = req.file_path.strip().strip('"\'')
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {file_path}")

    ext = Path(file_path).suffix.lower()
    media_type = "video" if ext in VideoService.VIDEO_EXTENSIONS else ("image" if ext in VideoService.IMAGE_EXTENSIONS else None)
    if not media_type:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

    info = VideoService.get_media_info(file_path)
    para.media_path = file_path
    para.media_type = media_type
    para.original_media_duration = info["duration"]

    latest_gen = db.query(Generation).filter(Generation.paragraph_id == para.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
    if latest_gen and latest_gen.duration and info["duration"] > 0 and media_type == "video":
        para.speed_factor = round(latest_gen.duration / info["duration"], 3)
    elif media_type == "image":
        para.speed_factor = 1.0

    db.commit()
    return {
        "status": "ASSIGNED",
        "paragraph_id": para.id,
        "media_path": para.media_path,
        "media_type": para.media_type,
        "original_duration": para.original_media_duration,
        "speed_factor": para.speed_factor
    }


@router.post("/api/batches/{batch_id}/render-video")
def render_batch_video(
    batch_id: int,
    video_volume: float = Query(1.0, description="Volume multiplier for video original audio (0.0 - 2.0)"),
    narration_volume: float = Query(1.0, description="Volume multiplier for voice narration (0.0 - 2.0)"),
    db: Session = Depends(get_db)
):
    """
    Renders synchronized video for each paragraph by adjusting speed to match audio,
    then stitches all clips into a full master 1080p MP4.
    Preserves original video sound mixed with narration voice-over.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    project = batch.project
    paragraphs = db.query(Paragraph).filter(Paragraph.batch_id == batch_id).order_by(Paragraph.paragraph_number.asc()).all()
    if not paragraphs:
        raise HTTPException(status_code=400, detail="No paragraphs found in this batch.")

    output_dir_setting = db.query(AppSetting).filter(AppSetting.key == "OUTPUT_FOLDER").first()
    output_base = output_dir_setting.value if output_dir_setting else settings.OUTPUT_FOLDER
    ffmpeg_path_setting = db.query(AppSetting).filter(AppSetting.key == "FFMPEG_PATH").first()
    ffmpeg_path = ffmpeg_path_setting.value if ffmpeg_path_setting else settings.FFMPEG_PATH

    delivery = LocalDeliveryProvider(base_output_dir=output_base)
    batch_dir = delivery.base_dir / sanitize_filename(project.name) / f"Batch_{batch.batch_number:02d}"
    video_dir = batch_dir / "video_timeline"
    video_dir.mkdir(parents=True, exist_ok=True)

    shot_video_paths = []
    shot_results = []

    for p in paragraphs:
        # Find latest completed audio
        latest_gen = db.query(Generation).filter(Generation.paragraph_id == p.id, Generation.status == "COMPLETED").order_by(Generation.created_at.desc()).first()
        if not latest_gen or not latest_gen.wav_path or not os.path.exists(latest_gen.wav_path):
            raise HTTPException(
                status_code=400,
                detail=f"Paragraph {p.paragraph_number} has not generated audio yet. Please generate all audio first."
            )

        target_audio_path = latest_gen.wav_path
        target_duration = latest_gen.duration or AudioConverter.get_audio_info(target_audio_path)["duration"]
        shot_out_mp4 = video_dir / f"shot_{p.paragraph_number:02d}_synced.mp4"

        # If user provided a media file for this paragraph
        if p.media_path and os.path.exists(p.media_path):
            sync_res = VideoService.sync_media_to_audio(
                media_path=p.media_path,
                audio_path=target_audio_path,
                output_video_path=str(shot_out_mp4),
                target_duration=target_duration,
                video_volume=video_volume,
                narration_volume=narration_volume,
                ffmpeg_path=ffmpeg_path
            )
            p.synced_video_path = sync_res["video_path"]
            p.thumbnail_path = sync_res["thumbnail_path"]
            p.speed_factor = sync_res["speed_factor"]
            p.original_media_duration = sync_res["original_duration"]
            shot_video_paths.append(sync_res["video_path"])
            shot_results.append(sync_res)
        else:
            # Fallback: create standard placeholder clip
            AudioConverter.create_timeline_mp4_from_audio(
                input_audio_path=target_audio_path,
                output_mp4_path=str(shot_out_mp4),
                ffmpeg_path=ffmpeg_path
            )
            p.synced_video_path = str(shot_out_mp4)
            shot_video_paths.append(str(shot_out_mp4))
            shot_results.append({
                "video_path": str(shot_out_mp4),
                "media_type": "generated_placeholder",
                "target_duration": target_duration,
                "speed_factor": 1.0
            })

    # Stitch all shot videos into master video
    master_video_path = batch_dir / "full_timeline_master.mp4"
    stitch_res = VideoService.stitch_batch_videos(
        shot_video_paths=shot_video_paths,
        output_master_path=str(master_video_path),
        ffmpeg_path=ffmpeg_path
    )

    batch.master_video_path = stitch_res["master_video_path"]
    batch.master_video_duration = stitch_res["duration"]
    db.commit()

    return {
        "status": "COMPLETED",
        "master_video_path": batch.master_video_path,
        "master_video_duration": batch.master_video_duration,
        "total_shots": len(shot_results),
        "shots": shot_results
    }


@router.get("/api/batches/{batch_id}/master-video")
def get_batch_master_video(batch_id: int, download: bool = False, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch or not batch.master_video_path or not os.path.exists(batch.master_video_path):
        raise HTTPException(status_code=404, detail="Master video has not been rendered yet.")

    filename = f"batch_{batch.batch_number}_master_video.mp4"
    disposition = "attachment" if download else "inline"

    with open(batch.master_video_path, "rb") as f:
        content = f.read()

    from fastapi import Response
    return Response(
        content=content,
        media_type="video/mp4",
        headers={
            "Content-Disposition": f"{disposition}; filename=\"{filename}\"",
            "Accept-Ranges": "bytes",
            "Content-Length": str(len(content)),
        }
    )


@router.get("/api/paragraphs/{para_id}/video")
def get_paragraph_video(para_id: int, download: bool = False, db: Session = Depends(get_db)):
    p = db.query(Paragraph).filter(Paragraph.id == para_id).first()
    if not p or not p.synced_video_path or not os.path.exists(p.synced_video_path):
        raise HTTPException(status_code=404, detail="Synchronized video for this paragraph not found.")

    filename = f"paragraph_{p.paragraph_number}_synced.mp4"
    disposition = "attachment" if download else "inline"

    with open(p.synced_video_path, "rb") as f:
        content = f.read()

    from fastapi import Response
    return Response(
        content=content,
        media_type="video/mp4",
        headers={
            "Content-Disposition": f"{disposition}; filename=\"{filename}\"",
            "Accept-Ranges": "bytes",
            "Content-Length": str(len(content)),
        }
    )


@router.get("/api/paragraphs/{para_id}/thumbnail")
def get_paragraph_thumbnail(para_id: int, db: Session = Depends(get_db)):
    p = db.query(Paragraph).filter(Paragraph.id == para_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Paragraph not found.")

    thumb_file = p.thumbnail_path or (p.media_path if p.media_type == "image" else None)
    if not thumb_file or not os.path.exists(thumb_file):
        raise HTTPException(status_code=404, detail="Thumbnail not found.")

    with open(thumb_file, "rb") as f:
        content = f.read()

    ext = Path(thumb_file).suffix.lower()
    media_type = "image/png" if ext == ".png" else "image/jpeg"
    from fastapi import Response
    return Response(content=content, media_type=media_type)
