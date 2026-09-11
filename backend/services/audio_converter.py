import os
import wave
import struct
import math
import subprocess
import shutil
import glob
import json
from pathlib import Path
from typing import Dict, Any, Tuple, Optional


class AudioConverter:
    """
    Handles WAV audio creation, PCM formatting, FFmpeg MP3 encoding, and audio metadata extraction.
    """

    @classmethod
    def resolve_ffmpeg(cls, ffmpeg_path: str = "ffmpeg") -> str:
        """Resolves ffmpeg executable across Windows, Mac, and Linux."""
        if ffmpeg_path:
            if shutil.which(ffmpeg_path) or os.path.exists(ffmpeg_path):
                return ffmpeg_path

        candidates = [
            "ffmpeg",
            "ffmpeg.exe",
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        ]

        # Check WinGet packages on Windows
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        if local_appdata:
            winget_pattern = os.path.join(local_appdata, "Microsoft", "WinGet", "Packages", "**", "ffmpeg.exe")
            candidates.extend(glob.glob(winget_pattern, recursive=True))

        for candidate in candidates:
            resolved = shutil.which(candidate)
            if resolved:
                return resolved
            if os.path.exists(candidate):
                return candidate

        return ffmpeg_path or "ffmpeg"

    @classmethod
    def save_wav_master(cls, pcm_or_wav_data: bytes, output_wav_path: str, sample_rate: int = 24000, channels: int = 1) -> str:
        """
        Saves audio data to output_wav_path. If data is raw PCM (no RIFF header), wraps it with a proper WAV header.
        """
        out_path = Path(output_wav_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        # Check if already a valid WAV header
        if pcm_or_wav_data.startswith(b"RIFF") and b"WAVE" in pcm_or_wav_data[:12]:
            with open(out_path, "wb") as f:
                f.write(pcm_or_wav_data)
        else:
            # Wrap raw 16-bit PCM in standard WAV container
            with wave.open(str(out_path), "wb") as wav_file:
                wav_file.setnchannels(channels)
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(pcm_or_wav_data)

        return str(out_path)

    @classmethod
    def convert_wav_to_mp3(
        cls,
        wav_path: str,
        mp3_path: str,
        ffmpeg_path: str = "ffmpeg",
        bitrate: str = "320k"
    ) -> str:
        """
        Converts WAV master to high-quality MP3 using FFmpeg.
        """
        w_path = Path(wav_path)
        m_path = Path(mp3_path)
        m_path.parent.mkdir(parents=True, exist_ok=True)

        if not w_path.exists():
            raise FileNotFoundError(f"Source WAV file not found: {wav_path}")

        resolved_bin = cls.resolve_ffmpeg(ffmpeg_path)
        cmd = [
            resolved_bin,
            "-y",  # overwrite output
            "-threads", "0",
            "-i", str(w_path),
            "-codec:a", "libmp3lame",
            "-b:a", bitrate,
            str(m_path)
        ]

        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True
            )
            return str(m_path)
        except subprocess.CalledProcessError as e:
            err_msg = e.stderr.decode("utf-8", errors="replace")
            raise RuntimeError(f"FFmpeg conversion failed: {err_msg}")
        except FileNotFoundError:
            # Fallback if ffmpeg is in another standard location
            fallback_resolved = cls.resolve_ffmpeg("ffmpeg")
            if fallback_resolved and fallback_resolved != resolved_bin:
                cmd[0] = fallback_resolved
                try:
                    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                    return str(m_path)
                except Exception:
                    pass
            raise RuntimeError(f"FFmpeg executable not found at '{ffmpeg_path}'. Please install FFmpeg or configure its path in Settings.")

    @classmethod
    def get_audio_info(cls, wav_path: str) -> Dict[str, Any]:
        """
        Retrieves duration, sample rate, and channels from a WAV file.
        """
        with wave.open(wav_path, "rb") as wf:
            channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            framerate = wf.getframerate()
            frames = wf.getnframes()
            duration = frames / float(framerate) if framerate > 0 else 0.0

            return {
                "channels": channels,
                "sample_width": sample_width,
                "sample_rate": framerate,
                "frames": frames,
                "duration": round(duration, 2)
            }

    @classmethod
    def combine_audio_files(
        cls,
        wav_file_paths: list[str],
        output_wav_path: str,
        output_mp3_path: Optional[str] = None,
        silence_gap_seconds: float = 0.4,
        ffmpeg_path: str = "ffmpeg",
        bitrate: str = "320k"
    ) -> Dict[str, Any]:
        """
        Concatenates multiple WAV audio files sequentially with an optional silence gap.
        Saves output_wav_path and converts to output_mp3_path if provided.
        """
        valid_paths = [p for p in wav_file_paths if p and os.path.exists(p)]
        if not valid_paths:
            raise FileNotFoundError("No valid WAV files provided to combine.")

        out_wav = Path(output_wav_path)
        out_wav.parent.mkdir(parents=True, exist_ok=True)

        # Read first file to establish audio format parameters
        with wave.open(valid_paths[0], "rb") as first_wf:
            channels = first_wf.getnchannels()
            sample_width = first_wf.getsampwidth()
            framerate = first_wf.getframerate()

        # Precompute silence bytes
        silence_frames_count = int(silence_gap_seconds * framerate)
        silence_bytes = b"\x00" * (silence_frames_count * channels * sample_width)

        with wave.open(str(out_wav), "wb") as output_wf:
            output_wf.setnchannels(channels)
            output_wf.setsampwidth(sample_width)
            output_wf.setframerate(framerate)

            for idx, file_path in enumerate(valid_paths):
                with wave.open(file_path, "rb") as input_wf:
                    data = input_wf.readframes(input_wf.getnframes())
                    output_wf.writeframes(data)

                # Add silence gap between paragraphs (except after the last one)
                if idx < len(valid_paths) - 1 and silence_frames_count > 0:
                    output_wf.writeframes(silence_bytes)

        saved_mp3 = None
        if output_mp3_path:
            saved_mp3 = cls.convert_wav_to_mp3(
                wav_path=str(out_wav),
                mp3_path=output_mp3_path,
                ffmpeg_path=ffmpeg_path,
                bitrate=bitrate
            )

        info = cls.get_audio_info(str(out_wav))
        return {
            "wav_path": str(out_wav),
            "mp3_path": saved_mp3,
            "duration": info["duration"],
            "combined_count": len(valid_paths)
        }

    @classmethod
    def tighten_and_trim_silence(
        cls,
        input_wav: str,
        output_wav: str,
        output_mp3: Optional[str] = None,
        output_mp4: Optional[str] = None,
        silence_duration_threshold: float = 0.18,
        silence_db_threshold: str = "-42dB",
        ffmpeg_path: str = "ffmpeg",
        bitrate: str = "320k"
    ) -> Dict[str, Any]:
        """
        Removes long pauses and dead air from narration using FFmpeg silenceremove filter.
        Generates trimmed WAV, trimmed MP3, and ready-to-edit 1080p MP4 timeline video.
        """
        in_path = Path(input_wav)
        if not in_path.exists():
            raise FileNotFoundError(f"Source audio not found: {input_wav}")

        out_wav_path = Path(output_wav)
        out_wav_path.parent.mkdir(parents=True, exist_ok=True)

        ffmpeg_bin = cls.resolve_ffmpeg(ffmpeg_path)

        # 1. Trim pauses in WAV with lead-in and inter-sentence silence removal
        filter_str = (
            f"silenceremove=start_periods=1:start_duration=0.04:start_threshold=-45dB:"
            f"stop_periods=-1:stop_duration={silence_duration_threshold}:stop_threshold={silence_db_threshold}"
        )
        cmd_trim = [
            ffmpeg_bin, "-y",
            "-threads", "0",
            "-i", str(in_path),
            "-af", filter_str,
            str(out_wav_path)
        ]

        try:
            subprocess.run(cmd_trim, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            ffmpeg_path = ffmpeg_bin
        except Exception:
            fb = cls.resolve_ffmpeg("ffmpeg")
            if fb and fb != ffmpeg_bin:
                cmd_trim[0] = fb
                ffmpeg_path = fb
                subprocess.run(cmd_trim, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

        # 2. Convert to MP3
        saved_mp3 = None
        if output_mp3:
            saved_mp3 = cls.convert_wav_to_mp3(
                wav_path=str(out_wav_path),
                mp3_path=output_mp3,
                ffmpeg_path=ffmpeg_path,
                bitrate=bitrate
            )

        # 3. Create 1080p MP4 timeline video
        saved_mp4 = None
        if output_mp4:
            saved_mp4 = cls.create_timeline_mp4_from_audio(
                input_audio_path=str(out_wav_path),
                output_mp4_path=output_mp4,
                ffmpeg_path=ffmpeg_path
            )

    @classmethod
    def create_timeline_mp4_from_audio(
        cls,
        input_audio_path: str,
        output_mp4_path: str,
        ffmpeg_path: str = "ffmpeg"
    ) -> Optional[str]:
        """
        Creates a clean 1080p timeline video with 320k AAC audio ready for CapCut and Premiere Pro import.
        """
        in_audio = Path(input_audio_path)
        out_mp4 = Path(output_mp4_path)
        out_mp4.parent.mkdir(parents=True, exist_ok=True)

        ffmpeg_bin = cls.resolve_ffmpeg(ffmpeg_path)

        cmd_mp4 = [
            ffmpeg_bin, "-y",
            "-threads", "0",
            "-f", "lavfi", "-i", "color=c=0x0c121e:s=1920x1080:r=30",
            "-i", str(in_audio),
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "320k",
            "-shortest",
            str(out_mp4)
        ]
        try:
            subprocess.run(cmd_mp4, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return str(out_mp4)
        except Exception:
            fb = cls.resolve_ffmpeg("ffmpeg")
            if fb and fb != ffmpeg_bin:
                cmd_mp4[0] = fb
                try:
                    subprocess.run(cmd_mp4, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                    return str(out_mp4)
                except Exception:
                    pass
            return None

        info = cls.get_audio_info(str(out_wav_path))
        return {
            "wav_path": str(out_wav_path),
            "mp3_path": saved_mp3,
            "mp4_path": saved_mp4,
            "duration": info["duration"]
        }

    @classmethod
    def generate_demo_wav(cls, duration_seconds: float = 3.5, sample_rate: int = 24000) -> bytes:
        """
        Generates simulated speech audio for Demo Mode testing without API quota.
        """
        num_samples = int(duration_seconds * sample_rate)
        pcm_bytes = bytearray()

        # Multi-frequency modulated speech-like waveform
        for i in range(num_samples):
            t = i / sample_rate
            # Modulation frequencies simulating human cadence
            carrier = math.sin(2 * math.pi * 220 * t) * 0.4 + math.sin(2 * math.pi * 440 * t) * 0.3
            envelope = math.sin(2 * math.pi * 2.5 * t) ** 2  # syllabic rhythm
            sample_val = int(carrier * envelope * 28000)
            sample_val = max(-32768, min(32767, sample_val))
            pcm_bytes.extend(struct.pack("<h", sample_val))

        return bytes(pcm_bytes)
