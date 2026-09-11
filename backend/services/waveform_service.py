import wave
import struct
import numpy as np
from pathlib import Path
from typing import List, Dict, Any


class WaveformService:
    """
    Extracts normalized amplitude peaks and duration from audio files
    for rich, smooth client-side waveform rendering.
    """

    _peaks_cache: Dict[tuple, Dict[str, Any]] = {}

    @classmethod
    def extract_peaks_from_wav(cls, wav_path: str, num_peaks: int = 120) -> Dict[str, Any]:
        """
        Reads WAV file and returns normalized peak amplitudes [0.05 to 1.0] and duration.
        Caches results by (path, mtime, size, num_peaks) to eliminate repetitive disk reads.
        """
        if not wav_path:
            return {
                "peaks": [0.1] * num_peaks,
                "duration": 0.0
            }

        p = Path(wav_path)
        if not p.exists():
            return {
                "peaks": [0.1] * num_peaks,
                "duration": 0.0
            }

        try:
            stat = p.stat()
            cache_key = (str(p.resolve()), stat.st_mtime, stat.st_size, num_peaks)
            if cache_key in cls._peaks_cache:
                return cls._peaks_cache[cache_key]
            with wave.open(str(p), "rb") as wf:
                channels = wf.getnchannels()
                sample_width = wf.getsampwidth()
                framerate = wf.getframerate()
                nframes = wf.getnframes()

                if nframes == 0 or framerate == 0:
                    return {"peaks": [0.1] * num_peaks, "duration": 0.0}

                duration = round(nframes / float(framerate), 2)
                raw_frames = wf.readframes(nframes)

                # Unpack samples based on width
                if sample_width == 2:
                    fmt = f"<{nframes * channels}h"
                    samples = np.array(struct.unpack(fmt, raw_frames), dtype=np.float32)
                elif sample_width == 1:
                    samples = np.frombuffer(raw_frames, dtype=np.uint8).astype(np.float32) - 128
                elif sample_width == 4:
                    fmt = f"<{nframes * channels}i"
                    samples = np.array(struct.unpack(fmt, raw_frames), dtype=np.float32)
                else:
                    samples = np.zeros(num_peaks, dtype=np.float32)

                # If multi-channel, average channels
                if channels > 1:
                    samples = samples.reshape(-1, channels).mean(axis=1)

                samples = np.abs(samples)
                if len(samples) < num_peaks:
                    # Pad
                    padded = np.zeros(num_peaks)
                    padded[:len(samples)] = samples
                    samples = padded

                # Bucket into num_peaks
                bucket_size = len(samples) // num_peaks
                peaks = []
                for i in range(num_peaks):
                    start = i * bucket_size
                    end = (i + 1) * bucket_size if i < num_peaks - 1 else len(samples)
                    bucket = samples[start:end]
                    peak = float(np.max(bucket)) if len(bucket) > 0 else 0.0
                    peaks.append(peak)

                max_val = max(peaks) if peaks and max(peaks) > 0 else 1.0
                # Normalize and apply subtle non-linear boost for visual aesthetics
                norm_peaks = [round(max(0.08, float((p / max_val) ** 0.8)), 3) for p in peaks]

                result = {
                    "peaks": norm_peaks,
                    "duration": duration,
                    "sample_rate": framerate,
                    "channels": channels
                }
                cls._peaks_cache[cache_key] = result
                return result
        except Exception:
            # Safe fallback if waveform parsing encounters any exception
            return {
                "peaks": [0.15] * num_peaks,
                "duration": 0.0
            }
