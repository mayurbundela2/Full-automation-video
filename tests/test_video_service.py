import os
import wave
import pytest
from pathlib import Path
from backend.services.audio_converter import AudioConverter
from backend.services.video_service import VideoService


def test_scan_media_folder(tmp_path):
    # Create sample media files
    (tmp_path / "1.mp4").write_text("dummy video")
    (tmp_path / "2.jpg").write_text("dummy image")
    (tmp_path / "shot_3.png").write_text("dummy image 3")
    (tmp_path / "04.mov").write_text("dummy mov")
    (tmp_path / "readme.txt").write_text("not media")

    matches = VideoService.scan_media_folder(str(tmp_path))

    assert 1 in matches
    assert matches[1]["media_type"] == "video"
    assert matches[1]["filename"] == "1.mp4"

    assert 2 in matches
    assert matches[2]["media_type"] == "image"
    assert matches[2]["filename"] == "2.jpg"

    assert 3 in matches
    assert matches[3]["media_type"] == "image"
    assert matches[3]["filename"] == "shot_3.png"

    assert 4 in matches
    assert matches[4]["media_type"] == "video"
    assert matches[4]["filename"] == "04.mov"

    assert 5 not in matches


def test_image_sync_to_audio(tmp_path):
    # Generate real audio
    pcm = AudioConverter.generate_demo_wav(duration_seconds=2.0, sample_rate=24000)
    audio_path = tmp_path / "test_audio.wav"
    AudioConverter.save_wav_master(pcm, str(audio_path), sample_rate=24000, channels=1)

    # Generate a simple 1x1 or test image
    # We can create a simple BMP or generate a solid image using ffmpeg
    img_path = tmp_path / "1.jpg"
    ffmpeg_bin = AudioConverter.resolve_ffmpeg()
    
    # Generate a test image with ffmpeg
    import subprocess
    subprocess.run([
        ffmpeg_bin, "-y",
        "-f", "lavfi", "-i", "color=c=blue:s=1920x1080",
        "-vframes", "1",
        str(img_path)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    out_mp4 = tmp_path / "shot_1_synced.mp4"
    res = VideoService.sync_media_to_audio(
        media_path=str(img_path),
        audio_path=str(audio_path),
        output_video_path=str(out_mp4),
        target_duration=2.0,
        ffmpeg_path=ffmpeg_bin
    )

    assert os.path.exists(res["video_path"])
    assert res["media_type"] == "image"
    assert 1.8 <= res["target_duration"] <= 2.2
    assert os.path.getsize(res["video_path"]) > 1000


def test_video_speed_sync_to_audio(tmp_path):
    ffmpeg_bin = AudioConverter.resolve_ffmpeg()
    import subprocess

    # 1. Generate 3.0s test video clip
    src_video = tmp_path / "orig_video.mp4"
    subprocess.run([
        ffmpeg_bin, "-y",
        "-f", "lavfi", "-i", "testsrc=duration=3:size=1280x720:rate=30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        str(src_video)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 2. Generate 1.5s audio (so video must speed up to 1.5s)
    pcm = AudioConverter.generate_demo_wav(duration_seconds=1.5, sample_rate=24000)
    audio_path = tmp_path / "short_audio.wav"
    AudioConverter.save_wav_master(pcm, str(audio_path), sample_rate=24000, channels=1)

    out_synced = tmp_path / "speedup_synced.mp4"
    res = VideoService.sync_media_to_audio(
        media_path=str(src_video),
        audio_path=str(audio_path),
        output_video_path=str(out_synced),
        target_duration=1.5,
        ffmpeg_path=ffmpeg_bin
    )

    assert os.path.exists(res["video_path"])
    assert res["media_type"] == "video"
    # Speed factor should be approx 1.5 / 3.0 = 0.5
    assert 0.45 <= res["speed_factor"] <= 0.55

    # 3. Test stitching
    master_out = tmp_path / "master_timeline.mp4"
    stitch_res = VideoService.stitch_batch_videos(
        shot_video_paths=[str(out_synced)],
        output_master_path=str(master_out),
        ffmpeg_path=ffmpeg_bin
    )

    assert os.path.exists(stitch_res["master_video_path"])
    assert stitch_res["shots_count"] == 1


def test_video_with_audio_preserved_and_mixed(tmp_path):
    ffmpeg_bin = AudioConverter.resolve_ffmpeg()
    import subprocess

    # 1. Create a 3.0s video that has its OWN audio stream (440Hz sine tone)
    src_video_with_audio = tmp_path / "video_with_native_audio.mp4"
    subprocess.run([
        ffmpeg_bin, "-y",
        "-f", "lavfi", "-i", "testsrc=duration=3:size=1280x720:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-c:v", "libx264", "-c:a", "aac",
        str(src_video_with_audio)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 2. Check get_media_info detects has_audio == True
    info = VideoService.get_media_info(str(src_video_with_audio), ffmpeg_bin)
    assert info["media_type"] == "video"
    assert info["has_audio"] is True
    assert 2.8 <= info["duration"] <= 3.2

    # 3. Create a 4.5s narration audio track
    pcm = AudioConverter.generate_demo_wav(duration_seconds=4.5, sample_rate=24000)
    audio_path = tmp_path / "narration_audio.wav"
    AudioConverter.save_wav_master(pcm, str(audio_path), sample_rate=24000, channels=1)

    # 4. Synchronize: video (3s) slowed to match narration (4.5s), preserving both audio tracks
    out_synced = tmp_path / "synced_with_both_sounds.mp4"
    res = VideoService.sync_media_to_audio(
        media_path=str(src_video_with_audio),
        audio_path=str(audio_path),
        output_video_path=str(out_synced),
        target_duration=4.5,
        video_volume=0.9,
        narration_volume=1.0,
        ffmpeg_path=ffmpeg_bin
    )

    assert os.path.exists(res["video_path"])
    assert res["media_type"] == "video"
    assert res["has_video_sound"] is True
    assert 4.3 <= res["target_duration"] <= 4.7
    # Speed factor should be 4.5 / 3.0 = 1.5
    assert 1.4 <= res["speed_factor"] <= 1.6

    # 5. Probe final synced video to ensure it has an active audio track
    out_info = VideoService.get_media_info(res["video_path"], ffmpeg_bin)
    assert out_info["has_audio"] is True
    assert 4.3 <= out_info["duration"] <= 4.7

