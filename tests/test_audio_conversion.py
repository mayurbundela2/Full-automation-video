import os
import wave
import pytest
from pathlib import Path
from backend.services.audio_converter import AudioConverter
from backend.services.waveform_service import WaveformService


def test_wav_master_generation_and_audio_info(tmp_path):
    demo_pcm = AudioConverter.generate_demo_wav(duration_seconds=2.0, sample_rate=24000)
    assert len(demo_pcm) > 0

    wav_dest = tmp_path / "test_narration.wav"
    saved = AudioConverter.save_wav_master(demo_pcm, str(wav_dest), sample_rate=24000, channels=1)
    assert os.path.exists(saved)

    info = AudioConverter.get_audio_info(saved)
    assert info["sample_rate"] == 24000
    assert info["channels"] == 1
    assert 1.9 <= info["duration"] <= 2.1


def test_wav_to_mp3_conversion_with_ffmpeg(tmp_path):
    demo_pcm = AudioConverter.generate_demo_wav(duration_seconds=1.5, sample_rate=24000)
    wav_dest = tmp_path / "test_audio.wav"
    mp3_dest = tmp_path / "test_audio.mp3"

    AudioConverter.save_wav_master(demo_pcm, str(wav_dest), sample_rate=24000, channels=1)

    # Test FFmpeg conversion
    converted_mp3 = AudioConverter.convert_wav_to_mp3(
        wav_path=str(wav_dest),
        mp3_path=str(mp3_dest),
        ffmpeg_path=AudioConverter.resolve_ffmpeg(),
        bitrate="320k"
    )

    assert os.path.exists(converted_mp3)
    assert os.path.getsize(converted_mp3) > 1000
    # Ensure WAV master is untouched and preserved
    assert os.path.exists(wav_dest)


def test_waveform_peak_extraction(tmp_path):
    demo_pcm = AudioConverter.generate_demo_wav(duration_seconds=2.5, sample_rate=24000)
    wav_dest = tmp_path / "test_waveform.wav"
    AudioConverter.save_wav_master(demo_pcm, str(wav_dest), sample_rate=24000, channels=1)

    wf_data = WaveformService.extract_peaks_from_wav(str(wav_dest), num_peaks=50)
    assert "peaks" in wf_data
    assert len(wf_data["peaks"]) == 50
    assert wf_data["duration"] > 0
    assert all(0.0 <= p <= 1.0 for p in wf_data["peaks"])


def test_combine_audio_files(tmp_path):
    p1 = tmp_path / "part1.wav"
    p2 = tmp_path / "part2.wav"
    out_wav = tmp_path / "combined.wav"
    out_mp3 = tmp_path / "combined.mp3"

    pcm1 = AudioConverter.generate_demo_wav(duration_seconds=1.5, sample_rate=24000)
    pcm2 = AudioConverter.generate_demo_wav(duration_seconds=2.0, sample_rate=24000)

    AudioConverter.save_wav_master(pcm1, str(p1), sample_rate=24000, channels=1)
    AudioConverter.save_wav_master(pcm2, str(p2), sample_rate=24000, channels=1)

    res = AudioConverter.combine_audio_files(
        wav_file_paths=[str(p1), str(p2)],
        output_wav_path=str(out_wav),
        output_mp3_path=str(out_mp3),
        silence_gap_seconds=0.4,
        ffmpeg_path=AudioConverter.resolve_ffmpeg(),
        bitrate="320k"
    )

    assert os.path.exists(res["wav_path"])
    assert os.path.exists(res["mp3_path"])
    assert res["combined_count"] == 2
    # 1.5s + 0.4s gap + 2.0s = approx 3.9s
    assert 3.7 <= res["duration"] <= 4.1
