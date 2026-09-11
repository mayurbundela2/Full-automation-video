import json
import re
import shutil
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.models import Project, Batch, Paragraph, Generation
from backend.services.delivery_provider import sanitize_filename
from backend.services.video_service import VideoService


class ProjectSyncer:
    """
    Synchronizes projects, batches, paragraphs, audio artifacts, and media
    between the filesystem 'outputs/' directory and the SQLite database.
    Ensures that any folder pulled from git or created externally is immediately
    discovered and loaded into the UI.
    """

    _last_sync_time: float = 0.0
    _SYNC_COOLDOWN_SECONDS: float = 20.0

    @classmethod
    def sync_outputs(cls, db: Session, base_output_dir: str = "outputs", force: bool = False) -> Dict[str, Any]:
        now = time.time()
        if not force and (now - cls._last_sync_time < cls._SYNC_COOLDOWN_SECONDS):
            return {"synced_projects": 0, "total_projects": db.query(Project).count(), "cached": True}

        cls._last_sync_time = now
        base_dir = Path(base_output_dir)
        if not base_dir.exists() or not base_dir.is_dir():
            return {"synced_projects": 0, "total_projects": db.query(Project).count()}

        synced_count = 0

        for proj_entry in sorted(base_dir.iterdir()):
            if not proj_entry.is_dir():
                continue

            folder_name = proj_entry.name.strip()
            # Ignore hidden directories and transient test output folders
            if folder_name.startswith(".") or folder_name.startswith("E2E_"):
                continue

            # Check if project exists in database by folder name or by sanitized match
            project = db.query(Project).filter(Project.name == folder_name).first()
            if not project:
                # Also try case-insensitive or sanitized match
                for existing in db.query(Project).all():
                    if sanitize_filename(existing.name).lower() == sanitize_filename(folder_name).lower():
                        project = existing
                        break

            if not project:
                project = Project(
                    name=folder_name,
                    description=f"Auto-synced from outputs/{folder_name}"
                )
                db.add(project)
                db.flush()
                synced_count += 1

            # Discover batches inside the project directory
            cls._sync_project_batches(db, project, proj_entry)

        db.commit()
        total_projects = db.query(Project).count()
        return {
            "synced_projects": synced_count,
            "total_projects": total_projects
        }

    @classmethod
    def _sync_project_batches(cls, db: Session, project: Project, proj_dir: Path):
        # Look for Batch_XX folders
        batch_entries = [d for d in proj_dir.iterdir() if d.is_dir() and re.match(r'batch', d.name, re.IGNORECASE)]

        if not batch_entries:
            # Check if paragraph folders exist directly under the project directory
            para_entries = [d for d in proj_dir.iterdir() if d.is_dir() and re.match(r'paragraph', d.name, re.IGNORECASE)]
            if para_entries:
                cls._sync_single_batch(db, project, proj_dir, batch_number=1, is_flat=True)
            return

        for batch_dir in sorted(batch_entries, key=lambda d: d.name):
            match = re.search(r'(\d+)', batch_dir.name)
            batch_number = int(match.group(1)) if match else 1
            cls._sync_single_batch(db, project, batch_dir, batch_number=batch_number, is_flat=False)

    @classmethod
    def _sync_single_batch(cls, db: Session, project: Project, batch_dir: Path, batch_number: int, is_flat: bool = False):
        batch_name = f"Batch {batch_number:02d}"
        batch = db.query(Batch).filter(
            Batch.project_id == project.id,
            Batch.batch_number == batch_number
        ).first()

        if not batch:
            batch = Batch(
                project_id=project.id,
                batch_number=batch_number,
                name=batch_name,
                status="COMPLETED"
            )
            db.add(batch)
            db.flush()

        # Batch-level audio & video artifacts
        # 1. Master video
        for video_filename in ["full_timeline_master.mp4", "final_video_1080p.mp4", "full_batch_final.mp4"]:
            candidate = batch_dir / video_filename
            if candidate.exists() and not batch.master_video_path:
                batch.master_video_path = str(candidate.resolve())
                break

        # 2. Combined narration audio
        comb_wav = batch_dir / "full_batch_narration.wav"
        comb_mp3 = batch_dir / "full_batch_narration.mp3"
        if comb_wav.exists() and not batch.combined_wav_path:
            batch.combined_wav_path = str(comb_wav.resolve())
        if comb_mp3.exists() and not batch.combined_mp3_path:
            batch.combined_mp3_path = str(comb_mp3.resolve())

        # 3. Tight audio & video
        tight_wav = batch_dir / "full_batch_tight.wav"
        tight_mp3 = batch_dir / "full_batch_tight.mp3"
        tight_mp4 = batch_dir / "full_batch_tight.mp4"
        if tight_wav.exists() and not batch.tight_wav_path:
            batch.tight_wav_path = str(tight_wav.resolve())
        if tight_mp3.exists() and not batch.tight_mp3_path:
            batch.tight_mp3_path = str(tight_mp3.resolve())
        if tight_mp4.exists() and not batch.tight_mp4_path:
            batch.tight_mp4_path = str(tight_mp4.resolve())

        # 4. Media folder scan
        media_dir = batch_dir / "media"
        media_map: Dict[int, Dict[str, Any]] = {}
        if media_dir.is_dir():
            batch.media_folder = str(media_dir.resolve())
            media_map = VideoService.scan_media_folder(str(media_dir))

        # 5. Scan Paragraph directories
        para_entries = [d for d in batch_dir.iterdir() if d.is_dir() and re.match(r'paragraph', d.name, re.IGNORECASE)]

        for para_dir in sorted(para_entries, key=lambda d: d.name):
            cls._sync_single_paragraph(db, project, batch, para_dir, media_map)

    @classmethod
    def _sync_single_paragraph(cls, db: Session, project: Project, batch: Batch, para_dir: Path, media_map: Dict[int, Dict[str, Any]]):
        match = re.search(r'Paragraph_(\d+)', para_dir.name, re.IGNORECASE)
        para_number = int(match.group(1)) if match else 1

        # Read metadata.json if available
        meta_file = para_dir / "metadata.json"
        meta: Dict[str, Any] = {}
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                pass

        transcript = meta.get("transcript") or ""
        part_name = meta.get("part")
        if not part_name:
            part_match = re.search(r'Paragraph_\d+_(.*)', para_dir.name, re.IGNORECASE)
            if part_match:
                part_name = part_match.group(1).replace("_", " ")

        # Look for existing paragraph in database
        existing_paras = db.query(Paragraph).filter(
            Paragraph.batch_id == batch.id,
            Paragraph.paragraph_number == para_number
        ).all()

        target_para: Optional[Paragraph] = None
        for p in existing_paras:
            if part_name and p.part_number == part_name:
                target_para = p
                break
            if transcript and p.transcript and p.transcript.strip() == transcript.strip():
                target_para = p
                break

        if not target_para and len(existing_paras) == 1 and not existing_paras[0].transcript:
            target_para = existing_paras[0]

        if target_para and target_para.status == "COMPLETED" and target_para.generation_id:
            # Paragraph already synced and attached to generation, skip redundant disk file re-checks
            return

        if not target_para:
            target_para = Paragraph(
                batch_id=batch.id,
                paragraph_number=para_number,
                part_number=part_name[:250] if part_name else None,
                transcript=transcript or f"Paragraph {para_number}",
                status="COMPLETED"
            )
            db.add(target_para)
            db.flush()

        # Update fields if empty or newly discovered
        if transcript:
            target_para.transcript = transcript
        if part_name:
            target_para.part_number = part_name[:250]
        if meta.get("scene"):
            target_para.scene = meta.get("scene")
        if meta.get("sample_context"):
            target_para.sample_context = meta.get("sample_context")
        if meta.get("audio_profile"):
            target_para.audio_profile = meta.get("audio_profile")
        if meta.get("speaker"):
            target_para.speaker = meta.get("speaker")
        if meta.get("style"):
            target_para.style = meta.get("style")
        if meta.get("pace"):
            target_para.pace = meta.get("pace")
        if meta.get("accent"):
            target_para.accent = meta.get("accent")
        if meta.get("voice"):
            target_para.voice = meta.get("voice")
        if meta.get("director_notes"):
            target_para.director_notes = meta.get("director_notes")
        if meta.get("additional_notes"):
            target_para.additional_notes = meta.get("additional_notes")
        if meta.get("word_count"):
            target_para.word_count = meta.get("word_count")
        if meta.get("character_count"):
            target_para.character_count = meta.get("character_count")

        # Media match
        if para_number in media_map and not target_para.media_path:
            m_info = media_map[para_number]
            target_para.media_path = m_info["path"]
            target_para.media_type = m_info["media_type"]

        # Check audio files
        wav_path = para_dir / "narration.wav"
        mp3_path = para_dir / "narration.mp3"
        has_audio = wav_path.exists() or mp3_path.exists()

        if has_audio:
            target_para.status = "COMPLETED"
            gen = db.query(Generation).filter(Generation.paragraph_id == target_para.id).first()
            if not gen:
                gen = Generation(
                    paragraph_id=target_para.id,
                    project_name=project.name,
                    batch_number=batch.batch_number,
                    paragraph_number=target_para.paragraph_number,
                    part_number=target_para.part_number,
                    voice=target_para.voice or "Algenib",
                    model=meta.get("model", "gemini-3.1-flash-tts-preview"),
                    duration=meta.get("duration_seconds"),
                    wav_path=str(wav_path.resolve()) if wav_path.exists() else None,
                    mp3_path=str(mp3_path.resolve()) if mp3_path.exists() else None,
                    metadata_path=str(meta_file.resolve()) if meta_file.exists() else None,
                    status="COMPLETED"
                )
                db.add(gen)
                db.flush()
                target_para.generation_id = gen.id
            else:
                if wav_path.exists() and not gen.wav_path:
                    gen.wav_path = str(wav_path.resolve())
                if mp3_path.exists() and not gen.mp3_path:
                    gen.mp3_path = str(mp3_path.resolve())
                if meta_file.exists() and not gen.metadata_path:
                    gen.metadata_path = str(meta_file.resolve())
                if meta.get("duration_seconds") and not gen.duration:
                    gen.duration = meta.get("duration_seconds")
                target_para.generation_id = gen.id

    @classmethod
    def delete_project_storage(cls, project_name: str, base_output_dir: str = "outputs") -> bool:
        """
        Removes the project directory hierarchy from outputs/ if it exists.
        """
        base_dir = Path(base_output_dir)
        if not base_dir.exists():
            return False

        sanitized_name = sanitize_filename(project_name)
        deleted = False
        for candidate in [base_dir / sanitized_name, base_dir / project_name]:
            if candidate.exists() and candidate.is_dir():
                shutil.rmtree(candidate, ignore_errors=True)
                deleted = True
        return deleted

    @classmethod
    def delete_batch_storage(cls, project_name: str, batch_number: int, base_output_dir: str = "outputs") -> bool:
        """
        Removes the Batch_XX directory from outputs/ if it exists.
        """
        base_dir = Path(base_output_dir)
        if not base_dir.exists():
            return False

        sanitized_proj = sanitize_filename(project_name)
        batch_folder_name = f"Batch_{batch_number:02d}"
        deleted = False
        for proj_cand in [base_dir / sanitized_proj, base_dir / project_name]:
            batch_cand = proj_cand / batch_folder_name
            if batch_cand.exists() and batch_cand.is_dir():
                shutil.rmtree(batch_cand, ignore_errors=True)
                deleted = True
        return deleted
