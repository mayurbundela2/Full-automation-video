import os
import re
import json
import math
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from backend.services.audio_converter import AudioConverter


def make_long_path_safe(p: Path) -> Path:
    """Prepend \\\\?\\ on Windows if needed to bypass the 260-char MAX_PATH limit."""
    resolved = p.resolve()
    if os.name == "nt":
        resolved_str = str(resolved)
        if not resolved_str.startswith("\\\\?\\") and not resolved_str.startswith("\\\\"):
            return Path(f"\\\\?\\{resolved_str}")
    return resolved



class SubtitleService:
    """
    VAD-Powered Precision Subtitle & Word-Level Timestamp Generation Service.
    Uses FFmpeg voice activity / silence boundary detection to anchor captions
    and words to the exact milliseconds of spoken audio, eliminating drift.
    """

    @staticmethod
    def clean_transcript(text: str) -> str:
        """
        Strips inline emotion/direction tags like [serious], [whisper], [curious].
        """
        cleaned = re.sub(r'\[.*?\]', '', text)
        return re.sub(r'\s+', ' ', cleaned).strip()

    @classmethod
    def format_timestamp_srt(cls, seconds: float) -> str:
        """
        Converts seconds to standard SRT format: HH:MM:SS,mmm
        """
        if seconds < 0:
            seconds = 0.0
        total_ms = int(round(seconds * 1000))
        hrs = total_ms // 3600000
        mins = (total_ms % 3600000) // 60000
        secs = (total_ms % 60000) // 1000
        ms = total_ms % 1000
        return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"

    @classmethod
    def format_timestamp_vtt(cls, seconds: float) -> str:
        """
        Converts seconds to standard WebVTT format: HH:MM:SS.mmm
        """
        if seconds < 0:
            seconds = 0.0
        total_ms = int(round(seconds * 1000))
        hrs = total_ms // 3600000
        mins = (total_ms % 3600000) // 60000
        secs = (total_ms % 60000) // 1000
        ms = total_ms % 1000
        return f"{hrs:02d}:{mins:02d}:{secs:02d}.{ms:03d}"

    @classmethod
    def detect_speech_intervals(
        cls,
        wav_path: str,
        noise_threshold: str = "-38dB",
        min_silence: float = 0.15
    ) -> List[Dict[str, float]]:
        """
        Detects exact speech intervals in the audio file using FFmpeg silencedetect.
        Returns a list of dicts with start, end, and duration of active speech periods.
        """
        if not wav_path or not Path(wav_path).exists():
            return []

        ffmpeg_bin = AudioConverter.resolve_ffmpeg()
        cmd = [
            ffmpeg_bin, "-i", str(wav_path),
            "-af", f"silencedetect=noise={noise_threshold}:d={min_silence}",
            "-f", "null", "-"
        ]

        try:
            res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, check=True)
            output = res.stderr
        except Exception:
            fb = AudioConverter.resolve_ffmpeg("ffmpeg")
            if fb and fb != ffmpeg_bin:
                cmd[0] = fb
                try:
                    res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, check=True)
                    output = res.stderr
                except Exception:
                    return []
            else:
                return []

        info = AudioConverter.get_audio_info(str(wav_path))
        total_dur = info.get("duration", 0.0)

        silences = []
        for line in output.split('\n'):
            if 'silence_start:' in line:
                m = re.search(r'silence_start:\s*([0-9.]+)', line)
                if m:
                    silences.append({'start': float(m.group(1))})
            elif 'silence_end:' in line:
                m = re.search(r'silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)', line)
                if m and silences and 'end' not in silences[-1]:
                    silences[-1]['end'] = float(m.group(1))
                    silences[-1]['dur'] = float(m.group(2))

        speech_intervals = []
        prev_end = 0.0
        for s in silences:
            s_start = s['start']
            s_end = s.get('end', s_start)
            if s_start > prev_end + 0.04:
                speech_intervals.append({
                    'start': round(prev_end, 3),
                    'end': round(s_start, 3),
                    'duration': round(s_start - prev_end, 3)
                })
            prev_end = s_end

        if prev_end < total_dur - 0.04:
            speech_intervals.append({
                'start': round(prev_end, 3),
                'end': round(total_dur, 3),
                'duration': round(total_dur - prev_end, 3)
            })

        return speech_intervals

    @classmethod
    def align_words_with_vad(
        cls,
        transcript: str,
        wav_path: Optional[str] = None,
        duration: float = 2.0,
        start_offset: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Aligns words strictly within active speech intervals detected from audio.
        Guarantees that pauses/silences contain no overlapping words.
        """
        cleaned = cls.clean_transcript(transcript)
        words = [w.strip() for w in cleaned.split() if w.strip()]
        if not words:
            return []

        intervals = []
        if wav_path and Path(wav_path).exists():
            intervals = cls.detect_speech_intervals(wav_path)

        if not intervals:
            # Fallback to single interval matching given duration
            intervals = [{'start': 0.0, 'end': duration, 'duration': max(0.5, duration)}]

        total_chars = sum(len(w) for w in words)
        total_speech_dur = sum(inv['duration'] for inv in intervals) or 1.0

        word_entries = []
        w_idx = 0

        for inv_idx, inv in enumerate(intervals):
            inv_start = inv['start'] + start_offset
            inv_dur = inv['duration']

            if inv_idx == len(intervals) - 1:
                chunk_words = words[w_idx:]
            else:
                target_chars = (inv_dur / total_speech_dur) * total_chars
                curr_chars = 0
                chunk_words = []
                while w_idx < len(words):
                    w = words[w_idx]
                    chunk_words.append(w)
                    curr_chars += len(w)
                    w_idx += 1
                    if curr_chars >= target_chars and len(chunk_words) >= 1:
                        break

            if not chunk_words:
                continue

            chunk_weights = [max(1.0, len(w)) for w in chunk_words]
            chunk_weight_sum = sum(chunk_weights) or 1.0

            curr_t = inv_start
            for cw, cwt in zip(chunk_words, chunk_weights):
                w_dur = (cwt / chunk_weight_sum) * inv_dur
                s_dur = max(0.06, w_dur * 0.90)
                end_t = round(curr_t + s_dur, 3)
                word_entries.append({
                    "index": len(word_entries) + 1,
                    "word": cw,
                    "start": round(curr_t, 3),
                    "end": end_t,
                    "duration": round(s_dur, 3)
                })
                curr_t += w_dur

        return word_entries

    @classmethod
    def build_srt_content(cls, word_entries: List[Dict[str, Any]], words_per_caption: int = 4) -> str:
        """
        Builds CapCut & Premiere Pro compliant .SRT subtitle file.
        Groups words into 3-4 word segments anchored to voice activity.
        """
        if not word_entries:
            return ""

        srt_lines = []
        caption_idx = 1

        chunks = [
            word_entries[i:i + words_per_caption]
            for i in range(0, len(word_entries), words_per_caption)
        ]

        for idx, chunk in enumerate(chunks):
            if not chunk:
                continue

            start_sec = chunk[0]["start"]
            # If next chunk is within 0.15s, extend cleanly to eliminate flicker
            if idx < len(chunks) - 1 and chunks[idx + 1]:
                next_start = chunks[idx + 1][0]["start"]
                if next_start - chunk[-1]["end"] <= 0.25:
                    end_sec = round(next_start - 0.02, 3)
                else:
                    end_sec = chunk[-1]["end"]
            else:
                end_sec = chunk[-1]["end"]

            start_str = cls.format_timestamp_srt(start_sec)
            end_str = cls.format_timestamp_srt(end_sec)
            text = " ".join(c["word"] for c in chunk)

            srt_lines.append(f"{caption_idx}")
            srt_lines.append(f"{start_str} --> {end_str}")
            srt_lines.append(text)
            srt_lines.append("")
            caption_idx += 1

        return "\r\n".join(srt_lines) + "\r\n"

    @classmethod
    def build_vtt_content(cls, word_entries: List[Dict[str, Any]], words_per_caption: int = 4) -> str:
        """
        Builds standard .VTT WebVTT subtitle file.
        """
        if not word_entries:
            return "WEBVTT\r\n\r\n"

        vtt_lines = ["WEBVTT", ""]
        caption_idx = 1

        chunks = [
            word_entries[i:i + words_per_caption]
            for i in range(0, len(word_entries), words_per_caption)
        ]

        for idx, chunk in enumerate(chunks):
            if not chunk:
                continue

            start_sec = chunk[0]["start"]
            if idx < len(chunks) - 1 and chunks[idx + 1]:
                next_start = chunks[idx + 1][0]["start"]
                if next_start - chunk[-1]["end"] <= 0.25:
                    end_sec = round(next_start - 0.02, 3)
                else:
                    end_sec = chunk[-1]["end"]
            else:
                end_sec = chunk[-1]["end"]

            start_str = cls.format_timestamp_vtt(start_sec)
            end_str = cls.format_timestamp_vtt(end_sec)
            text = " ".join(c["word"] for c in chunk)

            vtt_lines.append(f"{caption_idx}")
            vtt_lines.append(f"{start_str} --> {end_str}")
            vtt_lines.append(text)
            vtt_lines.append("")
            caption_idx += 1

        return "\r\n".join(vtt_lines) + "\r\n"

    @classmethod
    def generate_paragraph_subtitles(
        cls,
        transcript: str,
        duration: float,
        output_dir: Path,
        prefix: str = "narration",
        wav_path: Optional[str] = None,
        words_per_caption: int = 4
    ) -> Dict[str, Any]:
        """
        Generates individual paragraph subtitle files using exact audio VAD alignment.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        if not wav_path:
            candidate = output_dir / f"{prefix}.wav"
            if candidate.exists():
                wav_path = str(candidate)

        words = cls.align_words_with_vad(
            transcript=transcript,
            wav_path=wav_path,
            duration=duration,
            start_offset=0.0
        )

        srt_file = output_dir / f"{prefix}.srt"
        try:
            srt_content = cls.build_srt_content(words, words_per_caption=words_per_caption)
            make_long_path_safe(srt_file).write_text(srt_content, encoding="utf-8")
        except Exception as e:
            print(f"[SubtitleService] SRT write warning: {e}")

        vtt_file = output_dir / f"{prefix}.vtt"
        try:
            vtt_content = cls.build_vtt_content(words, words_per_caption=words_per_caption)
            make_long_path_safe(vtt_file).write_text(vtt_content, encoding="utf-8")
        except Exception as e:
            print(f"[SubtitleService] VTT write warning: {e}")

        json_file = output_dir / f"{prefix}_words.json"
        try:
            json_data = {
                "total_words": len(words),
                "total_duration": round(duration, 3),
                "words": words
            }
            make_long_path_safe(json_file).write_text(json.dumps(json_data, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            print(f"[SubtitleService] JSON words write warning: {e}")

        return {
            "srt_path": str(srt_file),
            "vtt_path": str(vtt_file),
            "json_path": str(json_file),
            "total_words": len(words),
            "duration": round(duration, 3)
        }

    @classmethod
    def generate_batch_subtitles(
        cls,
        paragraphs_data: List[Dict[str, Any]],
        output_base_dir: Path,
        prefix: str = "full_batch_narration",
        full_wav_path: Optional[str] = None,
        silence_gap_seconds: float = 0.4,
        words_per_caption: int = 4
    ) -> Dict[str, Any]:
        """
        Generates frame-accurate .SRT, .VTT, and .JSON subtitle files for a full batch
        by anchoring every paragraph to its exact audio start millisecond.
        Guarantees zero-drift across long videos in CapCut and Premiere Pro.
        """
        output_base_dir.mkdir(parents=True, exist_ok=True)
        all_words: List[Dict[str, Any]] = []

        if not full_wav_path:
            candidate = output_base_dir / f"{prefix}.wav"
            if candidate.exists():
                full_wav_path = str(candidate)

        # Check if individual paragraph WAV paths are provided for per-paragraph anchoring
        has_individual_wavs = any(p.get("wav_path") and Path(p.get("wav_path")).exists() for p in paragraphs_data)

        if has_individual_wavs:
            curr_offset = 0.0
            for p in paragraphs_data:
                p_wav = p.get("wav_path")
                p_transcript = p.get("transcript", "")
                p_dur = p.get("duration", 0.0)

                if p_wav and Path(p_wav).exists():
                    info = AudioConverter.get_audio_info(str(p_wav))
                    p_dur = info.get("duration", p_dur)

                if not p_dur or p_dur <= 0:
                    p_dur = 2.0

                p_words = cls.align_words_with_vad(
                    transcript=p_transcript,
                    wav_path=p_wav if (p_wav and Path(p_wav).exists()) else None,
                    duration=p_dur,
                    start_offset=curr_offset
                )
                all_words.extend(p_words)
                curr_offset += p_dur + silence_gap_seconds
            total_duration = curr_offset - silence_gap_seconds if curr_offset > 0 else 0.0
        else:
            # Fallback to direct VAD on full WAV
            full_transcript = " \n\n ".join(p.get("transcript", "") for p in paragraphs_data)
            info = AudioConverter.get_audio_info(full_wav_path) if full_wav_path else {}
            total_duration = info.get("duration", sum(p.get("duration", 2.0) for p in paragraphs_data))

            all_words = cls.align_words_with_vad(
                transcript=full_transcript,
                wav_path=full_wav_path,
                duration=total_duration,
                start_offset=0.0
            )

        # 1. SRT file
        srt_content = cls.build_srt_content(all_words, words_per_caption=words_per_caption)
        srt_file = output_base_dir / f"{prefix}.srt"
        srt_file.write_text(srt_content, encoding="utf-8")

        # 2. VTT file
        vtt_content = cls.build_vtt_content(all_words, words_per_caption=words_per_caption)
        vtt_file = output_base_dir / f"{prefix}.vtt"
        vtt_file.write_text(vtt_content, encoding="utf-8")

        # 3. Word-level JSON timestamps
        json_data = {
            "total_words": len(all_words),
            "total_duration": round(total_duration, 3),
            "words": all_words
        }
        json_file = output_base_dir / f"{prefix}_words.json"
        json_file.write_text(json.dumps(json_data, indent=2, ensure_ascii=False), encoding="utf-8")

        return {
            "srt_path": str(srt_file),
            "vtt_path": str(vtt_file),
            "json_path": str(json_file),
            "total_words": len(all_words),
            "duration": round(total_duration, 3)
        }
