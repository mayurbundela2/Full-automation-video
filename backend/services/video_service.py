import os
import re
import math
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from backend.services.audio_converter import AudioConverter


class VideoService:
    """
    Video & Image Asset Processing Service.
    Handles matching numbered media (1.mp4, 2.jpg), lossless speed-adjusting video to audio,
    image hold-framing, and multi-shot timeline stitching into a final 1080p MP4.
    """

    VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
    IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    ALL_MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | IMAGE_EXTENSIONS

    NUMBER_PREFIX_REGEX = re.compile(
        r'^(?:(?:shot|part|scene|p)[_\-\s]*)?(\d+)',
        re.IGNORECASE
    )

    @classmethod
    def scan_media_folder(cls, folder_path: str) -> Dict[int, Dict[str, Any]]:
        """
        Scans a directory for numbered media files (e.g. 1.mp4, 2.jpg, 03.mov, shot_4.png).
        Returns a dictionary mapping paragraph/shot number to media info:
        {
            1: {"path": "...", "filename": "1.mp4", "media_type": "video", "ext": ".mp4"},
            2: {"path": "...", "filename": "2.jpg", "media_type": "image", "ext": ".jpg"},
            ...
        }
        """
        folder = Path(folder_path)
        if not folder.exists() or not folder.is_dir():
            return {}

        matches: Dict[int, Dict[str, Any]] = {}

        for entry in sorted(folder.iterdir()):
            if not entry.is_file():
                continue

            ext = entry.suffix.lower()
            if ext not in cls.ALL_MEDIA_EXTENSIONS:
                continue

            name_without_ext = entry.stem
            match = cls.NUMBER_PREFIX_REGEX.search(name_without_ext)
            if not match:
                continue

            serial_num = int(match.group(1))
            media_type = "video" if ext in cls.VIDEO_EXTENSIONS else "image"

            # Prefer video over image if both exist for the same number
            if serial_num in matches and matches[serial_num]["media_type"] == "video" and media_type == "image":
                continue

            matches[serial_num] = {
                "path": str(entry.resolve()),
                "filename": entry.name,
                "media_type": media_type,
                "ext": ext,
            }

        return matches

    @classmethod
    def get_media_info(cls, file_path: str, ffmpeg_path: str = "ffmpeg") -> Dict[str, Any]:
        """
        Probes media file for duration, dimensions, and media type.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Media file not found: {file_path}")

        ext = path.suffix.lower()
        if ext in cls.IMAGE_EXTENSIONS:
            return {
                "media_type": "image",
                "duration": 0.0,
                "width": 1920,
                "height": 1080,
                "fps": 30.0,
                "has_audio": False,
            }

        # Video probe using ffmpeg -i
        ffmpeg_bin = AudioConverter.resolve_ffmpeg(ffmpeg_path)
        cmd = [ffmpeg_bin, "-hide_banner", "-i", str(path)]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            output = res.stderr
        except Exception:
            output = ""

        # Parse Duration: 00:00:10.50
        duration = 0.0
        dur_match = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', output)
        if dur_match:
            hours = float(dur_match.group(1))
            minutes = float(dur_match.group(2))
            seconds = float(dur_match.group(3))
            duration = hours * 3600 + minutes * 60 + seconds

        # Parse Resolution: 1920x1080
        width = 1920
        height = 1080
        res_match = re.search(r'Video:.*?(\d{3,5})x(\d{3,5})', output)
        if res_match:
            width = int(res_match.group(1))
            height = int(res_match.group(2))

        # Parse FPS
        fps = 30.0
        fps_match = re.search(r'(\d+(?:\.\d+)?)\s*fps', output)
        if fps_match:
            fps = float(fps_match.group(1))

        # Check for audio stream
        has_audio = bool(
            re.search(r'Stream\s+#\d+:\d+.*?: Audio:', output, re.IGNORECASE)
            or re.search(r':\s*Audio:\s*', output, re.IGNORECASE)
        )

        return {
            "media_type": "video",
            "duration": round(duration, 3),
            "width": width,
            "height": height,
            "fps": fps,
            "has_audio": has_audio,
        }

    @classmethod
    def build_atempo_filter(cls, tempo: float) -> str:
        """
        Builds an FFmpeg filter string chaining atempo filters to achieve any tempo,
        since each atempo filter must be between 0.5 and 2.0.
        """
        if tempo <= 0:
            tempo = 1.0
        # Clamp tempo to reasonable range (0.05 to 20.0)
        tempo = max(0.05, min(20.0, tempo))

        filters = []
        curr = tempo
        while curr > 2.0:
            filters.append("atempo=2.0")
            curr /= 2.0
        while curr < 0.5:
            filters.append("atempo=0.5")
            curr /= 0.5
        filters.append(f"atempo={round(curr, 4)}")
        return ",".join(filters)

    @classmethod
    def sync_media_to_audio(
        cls,
        media_path: str,
        audio_path: str,
        output_video_path: str,
        target_duration: Optional[float] = None,
        video_volume: float = 1.0,
        narration_volume: float = 1.0,
        ffmpeg_path: str = "ffmpeg"
    ) -> Dict[str, Any]:
        """
        Synchronizes media (video or image) to exact audio duration.
        - Video: Adjusts speed with setpts=(target_duration / orig_duration)*PTS.
                 If audio is 10s & video is 8s -> slows video to 10s.
                 If audio is 8s & video is 10s -> speeds video to 8s.
                 No frames are lost.
                 If the video has audio, its original audio is speed-matched via atempo
                 and mixed with the voiceover narration so video sound is preserved.
        - Image: Loops static frame for target_duration.
        - Output is standardized to 1920x1080 30fps H.264 with 320k AAC audio.
        """
        m_path = Path(media_path)
        a_path = Path(audio_path)
        out_v_path = Path(output_video_path)
        out_v_path.parent.mkdir(parents=True, exist_ok=True)

        if not m_path.exists():
            raise FileNotFoundError(f"Source media not found: {media_path}")
        if not a_path.exists():
            raise FileNotFoundError(f"Source audio not found: {audio_path}")

        # Resolve target audio duration
        if target_duration is None or target_duration <= 0:
            audio_info = AudioConverter.get_audio_info(str(a_path))
            target_duration = audio_info.get("duration", 2.0)

        target_duration = max(0.2, round(target_duration, 3))
        ffmpeg_bin = AudioConverter.resolve_ffmpeg(ffmpeg_path)
        media_info = cls.get_media_info(str(m_path), ffmpeg_bin)
        media_type = media_info["media_type"]
        has_audio = media_info.get("has_audio", False)

        if media_type == "video":
            orig_duration = max(0.1, media_info["duration"])
            speed_factor = target_duration / orig_duration
            # Round speed factor for filter string
            speed_ratio = round(speed_factor, 6)

            if has_audio:
                tempo = 1.0 / speed_factor if speed_factor > 0 else 1.0
                atempo_filter = cls.build_atempo_filter(tempo)
                v_vol = round(max(0.0, min(2.0, video_volume)), 2)
                n_vol = round(max(0.0, min(2.0, narration_volume)), 2)

                # Filter: setpts changes timing, scale crops to 16:9 1080p center, fps sets constant 30fps.
                # Audio: adjusts original video sound tempo to match duration, formats to stereo 44.1k,
                # and mixes with narration audio via amix without muting either track.
                filter_complex = (
                    f"[0:v]setpts={speed_ratio}*PTS,"
                    f"scale=1920:1080:force_original_aspect_ratio=increase,"
                    f"crop=1920:1080,"
                    f"fps=30[v];"
                    f"[0:a]{atempo_filter},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume={v_vol}[va];"
                    f"[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume={n_vol}[na];"
                    f"[va][na]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[a]"
                )
                audio_map_args = ["-map", "[a]"]
            else:
                # Silent video / visual-only clip
                filter_complex = (
                    f"[0:v]setpts={speed_ratio}*PTS,"
                    f"scale=1920:1080:force_original_aspect_ratio=increase,"
                    f"crop=1920:1080,"
                    f"fps=30[v]"
                )
                audio_map_args = ["-map", "1:a"]

            cmd = [
                ffmpeg_bin, "-y",
                "-i", str(m_path),
                "-i", str(a_path),
                "-filter_complex", filter_complex,
                "-map", "[v]",
                *audio_map_args,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "320k",
                "-t", str(target_duration),
                str(out_v_path)
            ]
        else:
            # Static image hold-frame
            orig_duration = target_duration
            speed_factor = 1.0

            filter_complex = (
                f"[0:v]scale=1920:1080:force_original_aspect_ratio=increase,"
                f"crop=1920:1080,"
                f"fps=30[v]"
            )

            cmd = [
                ffmpeg_bin, "-y",
                "-loop", "1",
                "-t", str(target_duration),
                "-i", str(m_path),
                "-i", str(a_path),
                "-filter_complex", filter_complex,
                "-map", "[v]",
                "-map", "1:a",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "320k",
                "-shortest",
                str(out_v_path)
            ]

        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except subprocess.CalledProcessError as e:
            if media_type == "video" and has_audio:
                # In case the source audio track has a corrupt/unsupported stream, fallback to narration only
                fallback_cmd = [
                    ffmpeg_bin, "-y",
                    "-i", str(m_path),
                    "-i", str(a_path),
                    "-filter_complex", (
                        f"[0:v]setpts={speed_ratio}*PTS,"
                        f"scale=1920:1080:force_original_aspect_ratio=increase,"
                        f"crop=1920:1080,"
                        f"fps=30[v]"
                    ),
                    "-map", "[v]",
                    "-map", "1:a",
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-preset", "fast",
                    "-c:a", "aac",
                    "-b:a", "320k",
                    "-t", str(target_duration),
                    str(out_v_path)
                ]
                try:
                    subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                except subprocess.CalledProcessError:
                    err = e.stderr.decode("utf-8", errors="replace")
                    raise RuntimeError(f"FFmpeg video sync failed: {err}")
            else:
                err = e.stderr.decode("utf-8", errors="replace")
                raise RuntimeError(f"FFmpeg video sync failed: {err}")

        # Extract representative thumbnail (at 0.3s or 0s)
        thumb_path = out_v_path.parent / f"{out_v_path.stem}_thumb.jpg"
        seek_pos = min(0.3, target_duration / 2.0)
        thumb_cmd = [
            ffmpeg_bin, "-y",
            "-ss", str(seek_pos),
            "-i", str(out_v_path),
            "-vframes", "1",
            "-q:v", "2",
            str(thumb_path)
        ]
        try:
            subprocess.run(thumb_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except Exception:
            pass

        return {
            "video_path": str(out_v_path),
            "thumbnail_path": str(thumb_path) if thumb_path.exists() else None,
            "media_type": media_type,
            "original_duration": orig_duration,
            "target_duration": target_duration,
            "speed_factor": round(speed_factor, 3),
            "has_video_sound": has_audio if media_type == "video" else False,
        }

    @classmethod
    def stitch_batch_videos(
        cls,
        shot_video_paths: List[str],
        output_master_path: str,
        ffmpeg_path: str = "ffmpeg"
    ) -> Dict[str, Any]:
        """
        Concatenates all synchronized shot videos in chronological order into a master 1080p MP4.
        """
        valid_paths = [p for p in shot_video_paths if p and Path(p).exists() and Path(p).stat().st_size > 1000]
        if not valid_paths:
            raise ValueError("No valid shot video files found to stitch.")

        out_path = Path(output_master_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        concat_list_file = out_path.parent / "concat_video_list.txt"

        # Write FFmpeg concat demuxer file
        with open(concat_list_file, "w", encoding="utf-8") as f:
            for p in valid_paths:
                clean_p = Path(p).resolve().as_posix()
                f.write(f"file '{clean_p}'\n")

        ffmpeg_bin = AudioConverter.resolve_ffmpeg(ffmpeg_path)

        # 1. Attempt fast stream copy concatenation
        copy_cmd = [
            ffmpeg_bin, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list_file),
            "-c", "copy",
            str(out_path)
        ]

        success = False
        try:
            subprocess.run(copy_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            success = out_path.exists() and out_path.stat().st_size > 1000
        except Exception:
            success = False

        # 2. Fallback to re-encode concat if stream copy failed
        if not success:
            reencode_cmd = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list_file),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "320k",
                str(out_path)
            ]
            subprocess.run(reencode_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

        # Get total duration
        info = cls.get_media_info(str(out_path), ffmpeg_bin)

        # Cleanup concat list
        try:
            concat_list_file.unlink(missing_ok=True)
        except Exception:
            pass

        return {
            "master_video_path": str(out_path),
            "duration": info["duration"],
            "shots_count": len(valid_paths),
        }
