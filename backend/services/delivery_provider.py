import json
import re
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any, Optional


def sanitize_filename(name: str) -> str:
    """Sanitizes project or batch names for filesystem directory paths."""
    if not name:
        return "unnamed"
    clean = re.sub(r'[^\w\-_.]', '_', name.strip())
    clean = re.sub(r'_+', '_', clean)
    return clean.strip('_')


class OutputDeliveryProvider(ABC):
    """
    Abstract interface for output artifact delivery.
    Phase 1 implements LocalDeliveryProvider.
    Future phases can implement TelegramDeliveryProvider, S3DeliveryProvider, etc.
    """

    @abstractmethod
    def deliver_audio_artifact(
        self,
        project_name: str,
        batch_number: int,
        paragraph_number: int,
        part_identifier: Optional[str],
        wav_bytes: bytes,
        mp3_path_or_bytes: Optional[str | bytes],
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        pass


class LocalDeliveryProvider(OutputDeliveryProvider):
    """
    Persists audio files and generation metadata directly to local directory hierarchy:
    outputs/
      └── Project_Name/
          └── Batch_01/
              └── Paragraph_01/
                  ├── narration.wav
                  ├── narration.mp3
                  └── metadata.json
    """

    def __init__(self, base_output_dir: str = "outputs"):
        self.base_dir = Path(base_output_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_paragraph_dir(
        self,
        project_name: str,
        batch_number: int,
        paragraph_number: int,
        part_identifier: Optional[str] = None
    ) -> Path:
        proj_clean = sanitize_filename(project_name)
        batch_folder = f"Batch_{batch_number:02d}"
        batch_dir = self.base_dir / proj_clean / batch_folder
        batch_dir.mkdir(parents=True, exist_ok=True)

        # Re-use existing directory if one already exists for this paragraph number & part
        prefix = f"Paragraph_{paragraph_number:02d}"
        if batch_dir.exists():
            for candidate in batch_dir.iterdir():
                if candidate.is_dir():
                    c_name = candidate.name.lower()
                    if part_identifier and sanitize_filename(part_identifier).lower()[:20] in c_name:
                        return candidate
                    elif not part_identifier and c_name == prefix.lower():
                        return candidate

        # Paragraph or Part folder with safe length limit for Windows MAX_PATH
        if part_identifier and part_identifier.strip():
            part_clean = sanitize_filename(part_identifier)[:35].rstrip('_')
            para_folder = f"Paragraph_{paragraph_number:02d}_{part_clean}"
        else:
            para_folder = f"Paragraph_{paragraph_number:02d}"

        target_dir = batch_dir / para_folder
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir

    def deliver_audio_artifact(
        self,
        project_name: str,
        batch_number: int,
        paragraph_number: int,
        part_identifier: Optional[str],
        wav_bytes: bytes,
        mp3_path_or_bytes: Optional[str | bytes],
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        target_dir = self.get_paragraph_dir(project_name, batch_number, paragraph_number, part_identifier)

        wav_dest = target_dir / "narration.wav"
        with open(wav_dest, "wb") as f:
            f.write(wav_bytes)

        mp3_dest = target_dir / "narration.mp3"
        if isinstance(mp3_path_or_bytes, (str, Path)):
            src_mp3 = Path(mp3_path_or_bytes)
            if src_mp3.exists() and src_mp3 != mp3_dest:
                shutil.copyfile(src_mp3, mp3_dest)
        elif isinstance(mp3_path_or_bytes, bytes):
            with open(mp3_dest, "wb") as f:
                f.write(mp3_path_or_bytes)

        # Update and save metadata.json
        metadata["wav"] = "narration.wav"
        metadata["mp3"] = "narration.mp3" if mp3_dest.exists() else None
        metadata["wav_path"] = str(wav_dest.resolve())
        metadata["mp3_path"] = str(mp3_dest.resolve()) if mp3_dest.exists() else None

        meta_dest = target_dir / "metadata.json"
        with open(meta_dest, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        return {
            "output_directory": str(target_dir.resolve()),
            "wav_path": str(wav_dest.resolve()),
            "mp3_path": str(mp3_dest.resolve()) if mp3_dest.exists() else None,
            "metadata_path": str(meta_dest.resolve())
        }
