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

    ASPECT_RATIO_RESOLUTIONS = {
        "16:9": (1920, 1080),
        "9:16": (1080, 1920),
        "1:1": (1080, 1080),
        "4:5": (1080, 1350),
        "4:3": (1440, 1080),
        "21:9": (2560, 1080),
    }

    @classmethod
    def get_resolution_for_aspect_ratio(cls, aspect_ratio: Optional[str] = "16:9") -> Tuple[int, int]:
        ar = (aspect_ratio or "16:9").strip()
        if ar in cls.ASPECT_RATIO_RESOLUTIONS:
            return cls.ASPECT_RATIO_RESOLUTIONS[ar]
        if "x" in ar:
            parts = ar.split("x")
            try:
                w, h = int(parts[0]), int(parts[1])
                return (w if w % 2 == 0 else w + 1, h if h % 2 == 0 else h + 1)
            except Exception:
                pass
        return (1920, 1080)

    @classmethod
    def build_video_scale_filter(
        cls,
        input_label: str,
        output_label: str,
        target_width: int = 1920,
        target_height: int = 1080,
        fit_mode: str = "crop"
    ) -> str:
        w = target_width if target_width % 2 == 0 else target_width + 1
        h = target_height if target_height % 2 == 0 else target_height + 1
        mode = (fit_mode or "crop").lower().strip()

        if mode == "fit":
            return (
                f"{input_label}scale={w}:{h}:force_original_aspect_ratio=decrease,"
                f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,"
                f"fps=30{output_label}"
            )
        elif mode in ("blur_pad", "blur", "blurred"):
            return (
                f"{input_label}split=2[__bgin][__fgin];"
                f"[__bgin]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=25:5[__bg];"
                f"[__fgin]scale={w}:{h}:force_original_aspect_ratio=decrease[__fg];"
                f"[__bg][__fg]overlay=(W-w)/2:(H-h)/2,"
                f"fps=30{output_label}"
            )
        else:  # default "crop" (fill)
            return (
                f"{input_label}scale={w}:{h}:force_original_aspect_ratio=increase,"
                f"crop={w}:{h},"
                f"fps=30{output_label}"
            )

    @classmethod
    def build_photo_motion_filter(
        cls,
        input_label: str,
        output_label: str,
        target_width: int,
        target_height: int,
        duration: float,
        motion: str = "zoom_in",
        transition: str = "fade_in_out",
        fit_mode: str = "crop",
        fps: int = 30
    ) -> str:
        """
        Builds professional video editor photo animations:
        - Ken Burns keyframing: zoom_in (1.0x -> 1.20x), zoom_out (1.20x -> 1.0x), pan_left, pan_right, zoom_pan, or none
        - In/Out transitions: fade_in_out, fade_in, fade_out, zoom_pop, or none
        Uses 2x pre-scaling to guarantee smooth, jitter-free interpolation across any aspect ratio.
        """
        w = target_width if target_width % 2 == 0 else target_width + 1
        h = target_height if target_height % 2 == 0 else target_height + 1
        dur = max(0.4, float(duration))
        import math
        # Guarantee zoompan generates enough frames so the image never terminates before audio ends
        total_frames = max(1, int(math.ceil(dur * fps)) + 5)
        m = (motion or "zoom_in").lower().strip()
        t = (transition or "fade_in_out").lower().strip()

        # Step 1: Base motion / scaling
        if m in ("none", "static"):
            if fit_mode == "fit":
                base_chain = f"{input_label}scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,fps={fps}"
            elif fit_mode in ("blur_pad", "blur", "blurred"):
                base_chain = (
                    f"{input_label}split=2[__pbgin][__pfg];"
                    f"[__pbgin]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=25:5[__pbg];"
                    f"[__pfg]scale={w}:{h}:force_original_aspect_ratio=decrease[__pfgsc];"
                    f"[__pbg][__pfgsc]overlay=(W-w)/2:(H-h)/2,fps={fps}"
                )
            else:
                base_chain = f"{input_label}scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps}"
        else:
            zoom_step = round(0.20 / max(1, total_frames), 6)
            pan_step = round((w * 2 - (w * 2) / 1.20) / max(1, total_frames), 4)

            if m == "zoom_out":
                zp = f"zoompan=z='if(lte(on,1),1.20,max(1.0,zoom-{zoom_step}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
            elif m == "pan_left":
                zp = f"zoompan=z=1.20:x='if(lte(on,1),iw-iw/zoom,max(0,x-{pan_step}))':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
            elif m == "pan_right":
                zp = f"zoompan=z=1.20:x='if(lte(on,1),0,min(iw-iw/zoom,x+{pan_step}))':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
            elif m == "zoom_pan":
                zp = f"zoompan=z='min(zoom+{zoom_step},1.20)':x='min(iw-iw/zoom,x+{pan_step*0.5})':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
            else:  # default "zoom_in"
                zp = f"zoompan=z='min(zoom+{zoom_step},1.20)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"

            base_chain = f"{input_label}scale={w*2}:{h*2}:force_original_aspect_ratio=increase,crop={w*2}:{h*2},{zp}"

        # Step 2: Transitions (subtle 0.10s dissolve so image stays visible until audio completes)
        fade_d = round(min(0.12, max(0.06, dur * 0.05)), 3)
        fade_out_start = round(max(0.0, dur - fade_d), 3)

        if t in ("fade_in_out", "fade", "dissolve"):
            trans_chain = f",fade=t=in:st=0:d={fade_d},fade=t=out:st={fade_out_start}:d={fade_d}"
        elif t == "fade_in":
            trans_chain = f",fade=t=in:st=0:d={fade_d}"
        elif t == "fade_out":
            trans_chain = f",fade=t=out:st={fade_out_start}:d={fade_d}"
        elif t == "zoom_pop":
            trans_chain = f",fade=t=in:st=0:d={round(fade_d * 0.8, 3)}"
        else:
            trans_chain = ""


        return f"{base_chain}{trans_chain}{output_label}"

    @classmethod
    def build_animated_text_filter(
        cls,
        text: str,
        target_width: int,
        target_height: int,
        duration: float,
        temp_dir: Path,
        input_label: str = "[v]",
        output_label: str = "[vout]",
        position: str = "top",
        animation_style: str = "slide_down",
        font_family: str = "Impact",
        font_color: str = "yellow",
        text_x: Optional[float] = None,
        text_y: Optional[float] = None,
        text_scale: Optional[float] = None
    ) -> Tuple[str, Optional[Path]]:
        """
        Creates an FFmpeg filter using ASS subtitles for professional video editor styling:
        - Bold display font (Impact / Arial Black / Montserrat)
        - Crisp 4px black text stroke outline & drop shadow, without any dark background box
        - Supports free-form drag-and-drop coordinates (text_x, text_y in percentage 0-100)
        - Supports dynamic size scaling (text_scale in percentage 50-250)
        - Real-time animations: slide_down, slide_left, slide_right, typewriter, fade, slide_up
        """
        clean_text = (text or "").strip()
        if not clean_text:
            return f"{input_label}null{output_label}", None

        is_vertical = target_height > target_width
        dur = max(0.8, duration)
        fade_in_ms = int(min(0.35, dur * 0.25) * 1000)
        fade_out_ms = int(min(0.25, dur * 0.20) * 1000)

        # Coordinate resolution: free-form drag/drop percentages (0-100%) or top/bottom presets
        x_pct = float(text_x) if text_x is not None else 50.0
        if text_y is not None:
            y_pct = float(text_y)
        else:
            is_top = (position or "top").lower() != "bottom"
            y_pct = (6.0 if is_vertical else 7.5) if is_top else (90.0 if is_vertical else 88.0)

        cx = int(round(target_width * (max(2.0, min(98.0, x_pct)) / 100.0)))
        cy = int(round(target_height * (max(2.0, min(98.0, y_pct)) / 100.0)))

        # Dynamic font scaling
        scale_factor = (max(40.0, min(300.0, float(text_scale))) / 100.0) if text_scale is not None else 1.0
        base_fontsize = max(26, int(min(target_width, target_height) * (0.056 if is_vertical else 0.050)))
        shot_fontsize = max(16, int(round(base_fontsize * scale_factor)))
        font = font_family.strip() if font_family and font_family.strip() else "Impact"

        # Color: Vibrant Yellow (&H0000E8FF in BGR) or White (&H00FFFFFF) or Cyan (&H00F0FF00)
        col = (font_color or "yellow").lower()
        if "white" in col:
            primary_color = "&H00FFFFFF"
        elif "cyan" in col:
            primary_color = "&H00F0FF00"
        else:
            primary_color = "&H0000E8FF"  # Iconic video editor yellow

        anim = (animation_style or "slide_down").lower().strip()
        ass_file = temp_dir / f"anim_title_{abs(hash(clean_text + anim + font + str(x_pct) + str(y_pct) + str(shot_fontsize))) % 10000000}.ass"

        def fmt_time(sec: float) -> str:
            h = int(sec // 3600)
            m = int((sec % 3600) // 60)
            s = sec % 60
            return f"{h}:{m:02d}:{s:05.2f}"

        ass_header = (
            "[Script Info]\n"
            "ScriptType: v4.00+\n"
            f"PlayResX: {target_width}\n"
            f"PlayResY: {target_height}\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: VideoTitle,{font},{shot_fontsize},{primary_color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,4,2,5,20,20,20,1\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

        safe_text = clean_text.replace(r"\N", " ").replace("\n", " ").replace('"', '').strip()

        if anim == "typewriter":
            typing_dur = min(1.6, dur * 0.65)
            n_chars = len(safe_text)
            step = typing_dur / max(1, n_chars)
            events = []
            for i in range(1, n_chars + 1):
                t_start = (i - 1) * step
                t_end = i * step if i < n_chars else dur
                sub = safe_text[:i]
                events.append(f"Dialogue: 0,{fmt_time(t_start)},{fmt_time(t_end)},VideoTitle,,0,0,0,{{\\an5\\fs{shot_fontsize}\\pos({cx},{cy})}},{sub}")
            ass_content = ass_header + "\n".join(events) + "\n"
        elif anim == "slide_left":
            start_x = max(0, cx - int(target_width * 0.25))
            override = f"{{\\an5\\fs{shot_fontsize}\\move({start_x},{cy},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
            ass_content = ass_header + f"Dialogue: 0,0:00:00.00,{fmt_time(dur)},VideoTitle,,0,0,0,,{override}{safe_text}\n"
        elif anim == "slide_right":
            start_x = min(target_width, cx + int(target_width * 0.25))
            override = f"{{\\an5\\fs{shot_fontsize}\\move({start_x},{cy},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
            ass_content = ass_header + f"Dialogue: 0,0:00:00.00,{fmt_time(dur)},VideoTitle,,0,0,0,,{override}{safe_text}\n"
        elif anim == "slide_up":
            start_y = min(target_height, cy + int(target_height * 0.08))
            override = f"{{\\an5\\fs{shot_fontsize}\\move({cx},{start_y},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
            ass_content = ass_header + f"Dialogue: 0,0:00:00.00,{fmt_time(dur)},VideoTitle,,0,0,0,,{override}{safe_text}\n"
        elif anim == "fade":
            override = f"{{\\an5\\fs{shot_fontsize}\\pos({cx},{cy})\\fad({fade_in_ms},{fade_out_ms})}}"
            ass_content = ass_header + f"Dialogue: 0,0:00:00.00,{fmt_time(dur)},VideoTitle,,0,0,0,,{override}{safe_text}\n"
        else:  # slide_down
            start_y = max(0, cy - int(target_height * 0.08))
            override = f"{{\\an5\\fs{shot_fontsize}\\move({cx},{start_y},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
            ass_content = ass_header + f"Dialogue: 0,0:00:00.00,{fmt_time(dur)},VideoTitle,,0,0,0,,{override}{safe_text}\n"

        ass_file.write_text(ass_content, encoding="utf-8")
        clean_ass_path = ass_file.name
        filter_str = f"{input_label}subtitles='{clean_ass_path}'{output_label}"
        return filter_str, ass_file

    @classmethod
    def build_timeline_animated_subtitles_ass(
        cls,
        shots: List[Dict[str, Any]],
        target_width: int,
        target_height: int,
        temp_dir: Path,
        position: str = "top",
        animation_style: str = "slide_down",
        font_family: str = "Impact",
        font_color: str = "yellow",
        text_x: Optional[float] = None,
        text_y: Optional[float] = None,
        text_scale: Optional[float] = None
    ) -> Path:
        """
        Builds a single ASS script covering the entire timeline with animated subtitles for each shot.
        Supports free-form drag-and-drop positioning (text_x, text_y) and dynamic sizing (text_scale)
        both globally and on a per-shot basis.
        """
        is_vertical = target_height > target_width
        font = font_family.strip() if font_family and font_family.strip() else "Impact"
        base_fontsize = max(26, int(min(target_width, target_height) * (0.056 if is_vertical else 0.050)))

        col = (font_color or "yellow").lower()
        if "white" in col:
            primary_color = "&H00FFFFFF"
        elif "cyan" in col:
            primary_color = "&H00F0FF00"
        else:
            primary_color = "&H0000E8FF"

        anim = (animation_style or "slide_down").lower().strip()

        def fmt_time(sec: float) -> str:
            h = int(sec // 3600)
            m = int((sec % 3600) // 60)
            s = sec % 60
            return f"{h}:{m:02d}:{s:05.2f}"

        ass_header = (
            "[Script Info]\n"
            "ScriptType: v4.00+\n"
            f"PlayResX: {target_width}\n"
            f"PlayResY: {target_height}\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: VideoTitle,{font},{base_fontsize},{primary_color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,4,2,5,20,20,20,1\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

        dialogues = []
        for shot in shots:
            raw_text = (shot.get("text") or "").strip()
            if not raw_text:
                continue
            safe_text = raw_text.replace(r"\N", " ").replace("\n", " ").replace('"', '').strip()
            t_start = float(shot.get("start", 0.0))
            dur = max(0.5, float(shot.get("duration", 2.0)))
            t_end = t_start + dur
            fade_in_ms = int(min(0.35, dur * 0.25) * 1000)
            fade_out_ms = int(min(0.25, dur * 0.20) * 1000)

            # Per-shot coordinates with fallback to batch settings
            s_x = shot.get("text_x") if shot.get("text_x") is not None else text_x
            s_y = shot.get("text_y") if shot.get("text_y") is not None else text_y
            s_scale = shot.get("text_scale") if shot.get("text_scale") is not None else text_scale

            x_pct = float(s_x) if s_x is not None else 50.0
            if s_y is not None:
                y_pct = float(s_y)
            else:
                is_top = (position or "top").lower() != "bottom"
                y_pct = (6.0 if is_vertical else 7.5) if is_top else (90.0 if is_vertical else 88.0)

            cx = int(round(target_width * (max(2.0, min(98.0, x_pct)) / 100.0)))
            cy = int(round(target_height * (max(2.0, min(98.0, y_pct)) / 100.0)))

            scale_factor = (max(40.0, min(300.0, float(s_scale))) / 100.0) if s_scale is not None else 1.0
            shot_fontsize = max(16, int(round(base_fontsize * scale_factor)))

            if anim == "typewriter":
                typing_dur = min(1.6, dur * 0.65)
                n_chars = len(safe_text)
                step = typing_dur / max(1, n_chars)
                for i in range(1, n_chars + 1):
                    c_start = t_start + (i - 1) * step
                    c_end = t_start + (i * step if i < n_chars else dur)
                    sub = safe_text[:i]
                    dialogues.append(f"Dialogue: 0,{fmt_time(c_start)},{fmt_time(c_end)},VideoTitle,,0,0,0,{{\\an5\\fs{shot_fontsize}\\pos({cx},{cy})}},{sub}")
            elif anim == "slide_left":
                start_x = max(0, cx - int(target_width * 0.25))
                override = f"{{\\an5\\fs{shot_fontsize}\\move({start_x},{cy},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
                dialogues.append(f"Dialogue: 0,{fmt_time(t_start)},{fmt_time(t_end)},VideoTitle,,0,0,0,,{override}{safe_text}")
            elif anim == "slide_right":
                start_x = min(target_width, cx + int(target_width * 0.25))
                override = f"{{\\an5\\fs{shot_fontsize}\\move({start_x},{cy},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
                dialogues.append(f"Dialogue: 0,{fmt_time(t_start)},{fmt_time(t_end)},VideoTitle,,0,0,0,,{override}{safe_text}")
            elif anim == "slide_up":
                start_y = min(target_height, cy + int(target_height * 0.08))
                override = f"{{\\an5\\fs{shot_fontsize}\\move({cx},{start_y},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
                dialogues.append(f"Dialogue: 0,{fmt_time(t_start)},{fmt_time(t_end)},VideoTitle,,0,0,0,,{override}{safe_text}")
            elif anim == "fade":
                override = f"{{\\an5\\fs{shot_fontsize}\\pos({cx},{cy})\\fad({fade_in_ms},{fade_out_ms})}}"
                dialogues.append(f"Dialogue: 0,{fmt_time(t_start)},{fmt_time(t_end)},VideoTitle,,0,0,0,,{override}{safe_text}")
            else:  # slide_down
                start_y = max(0, cy - int(target_height * 0.08))
                override = f"{{\\an5\\fs{shot_fontsize}\\move({cx},{start_y},{cx},{cy},0,{fade_in_ms})\\fad({fade_in_ms},{fade_out_ms})}}"
                dialogues.append(f"Dialogue: 0,{fmt_time(t_start)},{fmt_time(t_end)},VideoTitle,,0,0,0,,{override}{safe_text}")

        ass_content = ass_header + "\n".join(dialogues) + "\n"
        ass_file = temp_dir / f"timeline_titles_{abs(hash(font + position + anim + str(text_x) + str(text_y) + str(text_scale) + str(len(shots)))) % 10000000}.ass"
        ass_file.write_text(ass_content, encoding="utf-8")
        return ass_file

    @classmethod
    def build_logo_overlay_filter(
        cls,
        logo_path: str,
        target_width: int,
        target_height: int,
        input_label: str = "[v]",
        output_label: str = "[vout]",
        position: str = "top_right",
        scale_pct: float = 12.0,
        opacity: float = 0.85
    ) -> str:
        """
        Builds an FFmpeg filter snippet to overlay a logo/watermark onto video.
        """
        l_path = Path(logo_path)
        if not l_path.exists():
            return f"{input_label}null{output_label}"

        clean_logo = l_path.resolve().as_posix().replace(":", r"\:")
        lw = max(32, int(target_width * (max(3.0, min(50.0, scale_pct)) / 100.0)))
        if lw % 2 != 0:
            lw += 1
        op = round(max(0.05, min(1.0, opacity)), 2)
        margin = max(12, int(target_width * 0.025))

        pos = (position or "top_right").lower().strip()
        if pos == "top_left":
            overlay_coords = f"x={margin}:y={margin}"
        elif pos == "bottom_left":
            overlay_coords = f"x={margin}:y=H-h-{margin}"
        elif pos == "bottom_right":
            overlay_coords = f"x=W-w-{margin}:y=H-h-{margin}"
        elif pos == "center":
            overlay_coords = f"x=(W-w)/2:y=(H-h)/2"
        else:  # top_right
            overlay_coords = f"x=W-w-{margin}:y={margin}"

        return (
            f"movie='{clean_logo}',scale={lw}:-1,format=rgba,colorchannelmixer=aa={op}[__logo];"
            f"{input_label}[__logo]overlay={overlay_coords}{output_label}"
        )

    @classmethod
    def burn_text_overlay_on_video(
        cls,
        input_video_path: str,
        output_video_path: str,
        shots: List[Dict[str, Any]],
        target_width: int,
        target_height: int,
        position: str = "top",
        animation_style: str = "slide_down",
        font_family: str = "Impact",
        font_color: str = "yellow",
        text_x: Optional[float] = None,
        text_y: Optional[float] = None,
        text_scale: Optional[float] = None,
        logo_path: Optional[str] = None,
        logo_position: str = "top_right",
        logo_scale: float = 12.0,
        logo_opacity: float = 0.85,
        logo_enabled: bool = False,
        ffmpeg_path: str = "ffmpeg"
    ) -> str:
        """
        Burns animated text overlay and/or logo watermark onto an already-stitched master video in a fast single pass.
        Avoids re-rendering all individual shots, finishing in seconds.
        """
        in_p = Path(input_video_path)
        out_p = Path(output_video_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        ffmpeg_bin = AudioConverter.resolve_ffmpeg(ffmpeg_path)

        has_subtitles = bool(shots and any(s.get("text") and s["text"].strip() for s in shots))
        ass_file = None
        if has_subtitles:
            ass_file = cls.build_timeline_animated_subtitles_ass(
                shots=shots,
                target_width=target_width,
                target_height=target_height,
                temp_dir=out_p.parent,
                position=position,
                animation_style=animation_style,
                font_family=font_family,
                font_color=font_color,
                text_x=text_x,
                text_y=text_y,
                text_scale=text_scale
            )

        has_logo = bool(logo_enabled and logo_path and Path(logo_path).exists())

        if has_logo:
            logo_p = Path(logo_path)
            lw = max(32, int(target_width * (max(3.0, min(50.0, logo_scale)) / 100.0)))
            if lw % 2 != 0:
                lw += 1
            op = round(max(0.05, min(1.0, logo_opacity)), 2)
            margin = max(12, int(target_width * 0.025))

            pos = (logo_position or "top_right").lower().strip()
            if pos == "top_left":
                overlay_coords = f"{margin}:{margin}"
            elif pos == "bottom_left":
                overlay_coords = f"{margin}:H-h-{margin}"
            elif pos == "bottom_right":
                overlay_coords = f"W-w-{margin}:H-h-{margin}"
            elif pos == "center":
                overlay_coords = f"(W-w)/2:(H-h)/2"
            else:  # top_right
                overlay_coords = f"W-w-{margin}:{margin}"

            logo_filter = f"[1:v]scale={lw}:-1,format=rgba,colorchannelmixer=aa={op}[__logo]"

            if ass_file:
                clean_ass_path = ass_file.name
                filter_complex = (
                    f"{logo_filter};"
                    f"[0:v]subtitles='{clean_ass_path}'[__subbed];"
                    f"[__subbed][__logo]overlay={overlay_coords}[vout]"
                )
            else:
                filter_complex = (
                    f"{logo_filter};"
                    f"[0:v][__logo]overlay={overlay_coords}[vout]"
                )

            cmd = [
                ffmpeg_bin, "-y",
                "-i", str(in_p),
                "-i", str(logo_p),
                "-filter_complex", filter_complex,
                "-map", "[vout]",
                "-map", "0:a?",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                str(out_p)
            ]
        elif ass_file:
            clean_ass_path = ass_file.name
            cmd = [
                ffmpeg_bin, "-y",
                "-i", str(in_p),
                "-vf", f"subtitles='{clean_ass_path}'",
                "-map", "0:v",
                "-map", "0:a?",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                str(out_p)
            ]
        else:
            # Neither subtitles nor logo; copy video directly
            shutil.copy2(str(in_p), str(out_p))
            return str(out_p)

        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(out_p.parent))
            if res.returncode != 0:
                # If stream copy of audio failed, retry with aac audio re-encode
                fallback_cmd = list(cmd)
                if "-c:a" in fallback_cmd:
                    ca_idx = fallback_cmd.index("-c:a")
                    fallback_cmd[ca_idx + 1] = "aac"
                    res = subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(out_p.parent))

            if res.returncode != 0:
                err_snippet = res.stderr[-500:] if res.stderr else "Unknown error"
                raise RuntimeError(f"FFmpeg render pass failed (code {res.returncode}): {err_snippet.strip()}")
            return str(out_p)
        finally:
            if ass_file and ass_file.exists():
                try:
                    ass_file.unlink()
                except Exception:
                    pass

    @classmethod
    def sync_media_to_audio(
        cls,
        media_path: str,
        audio_path: str,
        output_video_path: str,
        target_duration: Optional[float] = None,
        video_volume: float = 1.0,
        narration_volume: float = 1.0,
        target_width: int = 1920,
        target_height: int = 1080,
        fit_mode: str = "crop",
        photo_motion: str = "zoom_in",
        photo_transition: str = "fade_in_out",
        on_screen_text: Optional[str] = None,
        text_animation_style: str = "slide_down",
        text_position: str = "top",
        font_family: str = "Impact",
        font_color: str = "yellow",
        text_x: Optional[float] = None,
        text_y: Optional[float] = None,
        text_scale: Optional[float] = None,
        ffmpeg_path: str = "ffmpeg"
    ) -> Dict[str, Any]:
        """
        Synchronizes media (video or image) to exact audio duration and configured aspect ratio/fit mode.
        - Video: Adjusts speed with setpts=(target_duration / orig_duration)*PTS.
        - Image: Keyframed Ken Burns motion (zoom_in, zoom_out, pan_left, pan_right, zoom_pan) and in/out transitions.
        - Scales & fits video according to fit_mode ('crop', 'fit', or 'blur_pad').
        - Overlays animated on_screen_text with selected style (slide_down, slide_left, slide_right, typewriter, fade, slide_up), font, color, position, coordinates, and scale.
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

        has_text = bool(on_screen_text and on_screen_text.strip())
        temp_txt_file = None

        try:
            if media_type == "video":
                orig_duration = max(0.1, media_info["duration"])
                speed_factor = target_duration / orig_duration
                speed_ratio = round(speed_factor, 6)

                if has_text:
                    scale_filter = cls.build_video_scale_filter("[__timed]", "[__scaled]", target_width, target_height, fit_mode)
                    text_filter, temp_txt_file = cls.build_animated_text_filter(
                        on_screen_text, target_width, target_height, target_duration, out_v_path.parent, "[__scaled]", "[v]",
                        position=text_position, animation_style=text_animation_style,
                        font_family=font_family, font_color=font_color,
                        text_x=text_x, text_y=text_y, text_scale=text_scale
                    )
                    v_chain = f"[0:v]setpts={speed_ratio}*PTS[__timed];{scale_filter};{text_filter}"
                else:
                    scale_filter = cls.build_video_scale_filter("[__timed]", "[v]", target_width, target_height, fit_mode)
                    v_chain = f"[0:v]setpts={speed_ratio}*PTS[__timed];{scale_filter}"

                if has_audio:
                    tempo = 1.0 / speed_factor if speed_factor > 0 else 1.0
                    atempo_filter = cls.build_atempo_filter(tempo)
                    v_vol = round(max(0.0, min(2.0, video_volume)), 2)
                    n_vol = round(max(0.0, min(2.0, narration_volume)), 2)

                    filter_complex = (
                        f"{v_chain};"
                        f"[0:a]{atempo_filter},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume={v_vol}[va];"
                        f"[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume={n_vol}[na];"
                        f"[va][na]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[a]"
                    )
                    audio_map_args = ["-map", "[a]"]
                else:
                    # Silent video / visual-only clip
                    filter_complex = v_chain
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
                # Static image hold-frame: lock to exact audio duration so image stays until audio finishes
                exact_info = AudioConverter.get_audio_info(str(a_path))
                if exact_info and exact_info.get("duration"):
                    target_duration = max(0.2, round(float(exact_info["duration"]), 3))

                orig_duration = target_duration
                speed_factor = 1.0

                if has_text:
                    photo_filter = cls.build_photo_motion_filter(
                        "[0:v]", "[__scaled]", target_width, target_height,
                        target_duration, motion=photo_motion, transition=photo_transition,
                        fit_mode=fit_mode
                    )
                    text_filter, temp_txt_file = cls.build_animated_text_filter(
                        on_screen_text, target_width, target_height, target_duration, out_v_path.parent, "[__scaled]", "[v]",
                        position=text_position, animation_style=text_animation_style,
                        font_family=font_family, font_color=font_color,
                        text_x=text_x, text_y=text_y, text_scale=text_scale
                    )
                    filter_complex = f"{photo_filter};{text_filter}"
                else:
                    filter_complex = cls.build_photo_motion_filter(
                        "[0:v]", "[v]", target_width, target_height,
                        target_duration, motion=photo_motion, transition=photo_transition,
                        fit_mode=fit_mode
                    )

                cmd = [
                    ffmpeg_bin, "-y",
                    "-loop", "1",
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
                    "-t", str(target_duration),
                    str(out_v_path)
                ]

            try:
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, cwd=str(out_v_path.parent))
            except subprocess.CalledProcessError as e:
                if media_type == "video" and has_audio:
                    # Fallback to narration audio only if source audio corrupt
                    fallback_cmd = [
                        ffmpeg_bin, "-y",
                        "-i", str(m_path),
                        "-i", str(a_path),
                        "-filter_complex", v_chain,
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
                        subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, cwd=str(out_v_path.parent))
                    except subprocess.CalledProcessError:
                        err = e.stderr.decode("utf-8", errors="replace")
                        raise RuntimeError(f"FFmpeg video sync failed: {err}")
                else:
                    err = e.stderr.decode("utf-8", errors="replace")
                    raise RuntimeError(f"FFmpeg video sync failed: {err}")
        finally:
            if temp_txt_file and temp_txt_file.exists():
                try:
                    temp_txt_file.unlink()
                except Exception:
                    pass

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
            "width": target_width,
            "height": target_height,
            "fit_mode": fit_mode,
            "photo_motion": photo_motion if media_type != "video" else None,
            "photo_transition": photo_transition if media_type != "video" else None,
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

    @classmethod
    def reformat_video_aspect_ratio(
        cls,
        input_video_path: str,
        output_video_path: str,
        target_width: int,
        target_height: int,
        fit_mode: str = "crop",
        ffmpeg_path: str = "ffmpeg"
    ) -> str:
        """
        Fast converter that reformats an existing master/timeline video into another aspect ratio
        (e.g., 16:9 -> 9:16 Shorts/Reels) using hardware/ultrafast FFmpeg filters without needing
        to re-render all individual paragraph shots from scratch.
        """
        in_p = Path(input_video_path)
        out_p = Path(output_video_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)

        if not in_p.exists():
            raise FileNotFoundError(f"Input video not found: {input_video_path}")

        ffmpeg_bin = AudioConverter.resolve_ffmpeg(ffmpeg_path)
        scale_filter = cls.build_video_scale_filter("[0:v]", "[v]", target_width, target_height, fit_mode)

        cmd = [
            ffmpeg_bin, "-y",
            "-i", str(in_p),
            "-filter_complex", scale_filter,
            "-map", "[v]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "ultrafast",
            "-c:a", "copy",
            str(out_p)
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return str(out_p)
