import os
import re
import json
import zipfile
import subprocess
from typing import List, Dict, Any, Optional

def run_command(cmd: List[str]) -> subprocess.CompletedProcess:
    """Run an external command and return the completed process."""
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def get_video_info(file_path: str) -> Dict[str, Any]:
    """Inspect video properties via ffprobe."""
    if not os.path.exists(file_path):
        return {"error": "File does not exist"}

    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    res = run_command(cmd)
    if res.returncode != 0:
        return {"error": f"ffprobe error: {res.stderr}"}

    try:
        data = json.loads(res.stdout)
        format_info = data.get("format", {})
        duration = float(format_info.get("duration", 0.0))
        size_bytes = int(format_info.get("size", 0))
        bit_rate = int(format_info.get("bit_rate", 0))

        v_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
        a_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)

        width = int(v_stream.get("width", 0)) if v_stream else 0
        height = int(v_stream.get("height", 0)) if v_stream else 0
        v_codec = v_stream.get("codec_name", "unknown") if v_stream else "none"
        fps_eval = v_stream.get("r_frame_rate", "25/1") if v_stream else "25/1"
        try:
            num, den = map(int, fps_eval.split("/"))
            fps = round(num / den, 2) if den else 25.0
        except Exception:
            fps = 25.0

        has_audio = a_stream is not None

        return {
            "duration": duration,
            "formatted_duration": format_time(duration),
            "size_bytes": size_bytes,
            "size_mb": round(size_bytes / (1024 * 1024), 2),
            "bit_rate": bit_rate,
            "width": width,
            "height": height,
            "resolution": f"{width}x{height}",
            "aspect_ratio": f"{round(width/height, 2)}:1" if height > 0 else "16:9",
            "fps": fps,
            "codec": v_codec,
            "has_audio": has_audio,
        }
    except Exception as e:
        return {"error": str(e)}

def format_time(seconds: float) -> str:
    """Format seconds into HH:MM:SS or MM:SS."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"

def split_video_by_interval(
    file_path: str,
    output_dir: str,
    interval_sec: float = 60.0,
    prefix: str = "clip",
    reencode: bool = False
) -> Dict[str, Any]:
    """
    Split a video into segments of interval_sec seconds (e.g. 30s, 60s, 120s, or custom).
    Uses fast stream copy (-c copy) by default for zero quality loss and instant speed,
    with re-encoding fallback for sub-keyframe accuracy.
    Bundles all parts into a zip file.
    """
    info = get_video_info(file_path)
    total_duration = info.get("duration", 0.0)
    if total_duration <= 0:
        return {"error": "Invalid video duration"}

    os.makedirs(output_dir, exist_ok=True)
    chunks: List[Dict[str, Any]] = []

    start = 0.0
    part_idx = 1

    while start < total_duration:
        end = min(start + interval_sec, total_duration)
        duration = end - start
        if duration < 1.0: # skip microscopic tail segments
            break

        chunk_name = f"{prefix}_part_{part_idx:02d}_{int(start)}s-{int(end)}s.mp4"
        chunk_path = os.path.join(output_dir, chunk_name)

        if reencode:
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start),
                "-to", str(end),
                "-i", file_path,
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-c:a", "aac", "-b:a", "128k",
                "-avoid_negative_ts", "make_zero",
                chunk_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start),
                "-to", str(end),
                "-i", file_path,
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                chunk_path
            ]

        res = run_command(cmd)
        if res.returncode != 0:
            # Fallback to reencode if stream copy fails
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start),
                "-to", str(end),
                "-i", file_path,
                "-c:v", "libx264", "-preset", "ultrafast",
                "-c:a", "aac",
                chunk_path
            ]
            run_command(cmd)

        if os.path.exists(chunk_path):
            chunk_size = os.path.getsize(chunk_path)
            chunks.append({
                "part": part_idx,
                "filename": chunk_name,
                "file_path": chunk_path,
                "start": start,
                "end": end,
                "duration": round(duration, 2),
                "formatted_range": f"{format_time(start)} - {format_time(end)}",
                "size_mb": round(chunk_size / (1024 * 1024), 2),
                "url": f"/api/download/part/{os.path.basename(output_dir)}/{chunk_name}",
            })

        start = end
        part_idx += 1

    # Create ZIP archive
    zip_filename = f"{prefix}_all_parts.zip"
    zip_path = os.path.join(output_dir, zip_filename)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for ch in chunks:
            if os.path.exists(ch["file_path"]):
                zipf.write(ch["file_path"], arcname=ch["filename"])

    return {
        "success": True,
        "total_chunks": len(chunks),
        "interval_seconds": interval_sec,
        "chunks": chunks,
        "zip_url": f"/api/download/zip/{os.path.basename(output_dir)}/{zip_filename}",
        "zip_size_mb": round(os.path.getsize(zip_path) / (1024 * 1024), 2) if os.path.exists(zip_path) else 0,
    }

def auto_reframe_aspect_ratio(
    file_path: str,
    output_path: str,
    target_ratio: str = "9:16",
    mode: str = "smart_blur"
) -> Dict[str, Any]:
    """
    Convert video to different aspect ratios:
    - 9:16 (TikTok, Reels, Shorts) -> 1080x1920
    - 16:9 (YouTube, standard landscape) -> 1920x1080
    - 1:1 (Instagram Square) -> 1080x1080
    - 4:5 (Social portraits) -> 1080x1350

    Modes:
    - 'smart_blur': Gorgeous blurred background fill preserving entire original frame (ideal for landscape to 9:16).
    - 'crop': Smart center crop filling entire canvas.
    """
    ratio_map = {
        "9:16": (1080, 1920),
        "16:9": (1920, 1080),
        "1:1": (1080, 1080),
        "4:5": (1080, 1350),
    }

    target_w, target_h = ratio_map.get(target_ratio, (1080, 1920))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if mode == "smart_blur":
        # Background: scale & crop to target, apply boxblur. Foreground: scale to fit inside target. Overlay centered.
        vf = (
            f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h},boxblur=25:5[bg];"
            f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2"
        )
    else:
        # Center crop
        vf = f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h}"

    cmd = [
        "ffmpeg", "-y",
        "-i", file_path,
        "-filter_complex", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path
    ]

    res = run_command(cmd)
    if res.returncode != 0:
        return {"error": f"Reframe failed: {res.stderr}"}

    return {
        "success": True,
        "output_path": output_path,
        "target_ratio": target_ratio,
        "resolution": f"{target_w}x{target_h}",
        "mode": mode,
        "file_size_mb": round(os.path.getsize(output_path) / (1024 * 1024), 2)
    }

def auto_remove_silence(
    file_path: str,
    output_path: str,
    noise_threshold_db: float = -30.0,
    min_silence_duration: float = 0.5
) -> Dict[str, Any]:
    """
    Detect silent periods and cut them out cleanly, jump-cutting speech segments together.
    """
    info = get_video_info(file_path)
    total_duration = info.get("duration", 0.0)
    if total_duration <= 0:
        return {"error": "Invalid video duration"}

    # 1. Detect silence timestamps using ffmpeg silencedetect filter
    detect_cmd = [
        "ffmpeg",
        "-i", file_path,
        "-af", f"silencedetect=noise={noise_threshold_db}dB:d={min_silence_duration}",
        "-f", "null",
        "-"
    ]
    res = run_command(detect_cmd)

    silence_starts = []
    silence_ends = []

    for line in res.stderr.splitlines():
        if "silence_start:" in line:
            m = re.search(r"silence_start:\s*([\d\.]+)", line)
            if m:
                silence_starts.append(float(m.group(1)))
        elif "silence_end:" in line:
            m = re.search(r"silence_end:\s*([\d\.]+)", line)
            if m:
                silence_ends.append(float(m.group(1)))

    # Pair silence intervals
    silence_intervals = []
    for i in range(min(len(silence_starts), len(silence_ends))):
        silence_intervals.append((silence_starts[i], silence_ends[i]))

    # Invert silence to get non-silent (speech) segments
    speech_segments = []
    current_time = 0.0

    for s_start, s_end in silence_intervals:
        if s_start > current_time + 0.15: # Keep segments longer than 150ms
            speech_segments.append((current_time, s_start))
        current_time = s_end

    if current_time < total_duration - 0.15:
        speech_segments.append((current_time, total_duration))

    if not speech_segments:
        # If no silence found, just copy or return full video
        speech_segments = [(0.0, total_duration)]

    total_silence_cut = sum(s[1] - s[0] for s in silence_intervals)

    # 2. Concat speech segments with ffmpeg
    filter_parts = []
    concat_inputs = []

    for idx, (seg_start, seg_end) in enumerate(speech_segments):
        filter_parts.append(
            f"[0:v]trim=start={seg_start}:end={seg_end},setpts=PTS-STARTPTS[v{idx}];"
            f"[0:a]atrim=start={seg_start}:end={seg_end},asetpts=PTS-STARTPTS[a{idx}];"
        )
        concat_inputs.append(f"[v{idx}][a{idx}]")

    num_segs = len(speech_segments)
    concat_filter = (
        "".join(filter_parts) +
        "".join(concat_inputs) +
        f"concat=n={num_segs}:v=1:a=1[outv][outa]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", file_path,
        "-filter_complex", concat_filter,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        "-movflags", "+faststart",
        output_path
    ]

    res = run_command(cmd)
    if res.returncode != 0:
        return {"error": f"Silence removal failed: {res.stderr}"}

    new_info = get_video_info(output_path)
    new_duration = new_info.get("duration", 0.0)

    return {
        "success": True,
        "output_path": output_path,
        "original_duration": round(total_duration, 2),
        "new_duration": round(new_duration, 2),
        "silence_cut_seconds": round(total_duration - new_duration, 2),
        "silence_percentage": round(((total_duration - new_duration) / total_duration) * 100, 1) if total_duration > 0 else 0,
        "segments_kept_count": num_segs,
        "speech_segments": [{"start": round(s[0], 2), "end": round(s[1], 2)} for s in speech_segments],
    }

def extract_video_highlights(
    file_path: str,
    output_dir: str,
    num_highlights: int = 3,
    highlight_duration: float = 20.0
) -> Dict[str, Any]:
    """
    Analyze video for scene transitions and dynamic action moments,
    extracting top highlight clips (Shorts/Reels ready).
    """
    info = get_video_info(file_path)
    total_duration = info.get("duration", 0.0)
    if total_duration <= 0:
        return {"error": "Invalid video duration"}

    os.makedirs(output_dir, exist_ok=True)

    # 1. Run scene score detection
    detect_cmd = [
        "ffmpeg",
        "-i", file_path,
        "-filter:v", "select='gt(scene,0.25)',showinfo",
        "-f", "null",
        "-"
    ]
    res = run_command(detect_cmd)

    scene_timestamps = []
    for line in res.stderr.splitlines():
        if "pts_time:" in line:
            m = re.search(r"pts_time:\s*([\d\.]+)", line)
            if m:
                t = float(m.group(1))
                if not scene_timestamps or (t - scene_timestamps[-1] > 10.0):
                    scene_timestamps.append(t)

    # Fallback if few scene changes (e.g. static sunset video): distribute intervals evenly across golden sections
    if len(scene_timestamps) < num_highlights:
        step = total_duration / (num_highlights + 1)
        scene_timestamps = [step * i for i in range(1, num_highlights + 1)]

    highlights = []
    for idx, t in enumerate(scene_timestamps[:num_highlights]):
        start = max(0.0, t - 2.0)
        end = min(total_duration, start + highlight_duration)
        if end - start < 5.0:
            continue

        clip_name = f"highlight_{idx+1}_{int(start)}s-{int(end)}s.mp4"
        clip_path = os.path.join(output_dir, clip_name)

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-to", str(end),
            "-i", file_path,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-c:a", "aac",
            "-avoid_negative_ts", "make_zero",
            clip_path
        ]
        run_command(cmd)

        if os.path.exists(clip_path):
            highlights.append({
                "index": idx + 1,
                "title": f"أفضل لقطة #{idx + 1} ({format_time(start)} - {format_time(end)})",
                "filename": clip_name,
                "file_path": clip_path,
                "start": round(start, 2),
                "end": round(end, 2),
                "duration": round(end - start, 2),
                "url": f"/api/download/part/{os.path.basename(output_dir)}/{clip_name}",
            })

    return {
        "success": True,
        "count": len(highlights),
        "highlights": highlights
    }

def export_final_video(
    file_path: str,
    output_path: str,
    resolution: str = "1080p",
    format_type: str = "mp4",
    brightness: float = 0.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
) -> Dict[str, Any]:
    """
    Render & export video with custom color adjustments, resolution, and format.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    res_map = {
        "4k": (3840, 2160),
        "1080p": (1920, 1080),
        "720p": (1280, 720),
        "480p": (854, 480),
    }

    w, h = res_map.get(resolution.lower(), (1920, 1080))

    if format_type.lower() == "mp3":
        # Audio only export
        cmd = [
            "ffmpeg", "-y",
            "-i", file_path,
            "-vn",
            "-c:a", "libmp3lame", "-b:a", "192k",
            output_path
        ]
    else:
        # Video export with filters
        vf = f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation},scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"

        if format_type.lower() == "webm":
            v_codec = "libvpx-vp9"
            a_codec = "libopus"
        else:
            v_codec = "libx264"
            a_codec = "aac"

        cmd = [
            "ffmpeg", "-y",
            "-i", file_path,
            "-vf", vf,
            "-c:v", v_codec, "-preset", "veryfast", "-crf", "22",
            "-c:a", a_codec,
            "-movflags", "+faststart",
            output_path
        ]

    res = run_command(cmd)
    if res.returncode != 0:
        return {"error": f"Export failed: {res.stderr}"}

    return {
        "success": True,
        "output_path": output_path,
        "resolution": resolution,
        "format": format_type,
        "size_mb": round(os.path.getsize(output_path) / (1024 * 1024), 2)
    }

def add_audio_to_video(
    video_path: str,
    audio_path: str,
    output_path: str,
    video_vol: float = 1.0,
    audio_vol: float = 0.5
) -> Dict[str, Any]:
    """
    Mix background music or sound with the video's original audio.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    v_info = get_video_info(video_path)
    has_audio = v_info.get("has_audio", False)
    duration = v_info.get("duration", 0.0)

    if has_audio:
        filter_complex = f"[0:a]volume={video_vol}[a0];[1:a]volume={audio_vol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]"
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            output_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-filter:a", f"volume={audio_vol}",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            output_path
        ]

    res = run_command(cmd)
    if res.returncode != 0:
        return {"error": f"Audio merge failed: {res.stderr}"}

    out_info = get_video_info(output_path)
    return {
        "success": True,
        "output_path": output_path,
        "duration": out_info.get("duration", duration),
        "size_mb": out_info.get("size_mb", 0.0)
    }

def merge_video_clips(
    file_paths: List[str],
    output_path: str
) -> Dict[str, Any]:
    """
    Concatenate multiple video clips into a single video file.
    Scales all inputs to 1920x1080 with 16:9 letterbox for consistent encoding.
    """
    if not file_paths:
        return {"error": "No clips provided"}

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    inputs = []
    filter_parts = []
    concat_inputs = []

    for idx, path in enumerate(file_paths):
        inputs.extend(["-i", path])
        # Scale and pad to standard 1080p, and ensure audio stream exists
        filter_parts.append(
            f"[{idx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{idx}];"
        )
        concat_inputs.append(f"[v{idx}][{idx}:a]")

    n = len(file_paths)
    concat_filter = "".join(filter_parts) + "".join(concat_inputs) + f"concat=n={n}:v=1:a=1[outv][outa]"

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", concat_filter,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path
    ]

    res = run_command(cmd)
    if res.returncode != 0:
        # Fallback if some clips have no audio stream
        v_filter = "".join(filter_parts) + "".join([f"[v{i}]" for i in range(n)]) + f"concat=n={n}:v=1:a=0[outv]"
        cmd_fallback = [
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", v_filter,
            "-map", "[outv]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-movflags", "+faststart",
            output_path
        ]
        res_fb = run_command(cmd_fallback)
        if res_fb.returncode != 0:
            return {"error": f"Merge failed: {res.stderr}"}

    out_info = get_video_info(output_path)
    return {
        "success": True,
        "output_path": output_path,
        "total_clips": len(file_paths),
        "duration": out_info.get("duration", 0.0),
        "size_mb": out_info.get("size_mb", 0.0)
    }

def add_text_to_video(
    video_path: str,
    output_path: str,
    text: str,
    font_size: int = 36,
    font_color: str = "white",
    position: str = "bottom",
    box_color: str = "black@0.6"
) -> Dict[str, Any]:
    """
    Burn custom text or sticker onto the video.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Position calculation
    if position == "top":
        y_pos = "h*0.1"
    elif position == "center":
        y_pos = "(h-text_h)/2"
    else: # bottom
        y_pos = "h*0.82"

    # Normalize hex color for FFmpeg
    safe_font_color = font_color.replace("#", "0x") if font_color.startswith("#") else font_color

    # Escape text for drawtext
    escaped_text = text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")

    # Discover best available TrueType font for Arabic and Unicode glyphs
    font_file = None
    for candidate in [
        "/usr/share/fonts/opentype/fonts-hosny-amiri/Amiri-Bold.ttf",
        "/usr/share/fonts/opentype/fonts-hosny-amiri/Amiri-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]:
        if os.path.exists(candidate):
            font_file = candidate
            break

    font_opt = f":fontfile='{font_file}'" if font_file else ""

    vf = f"drawtext=text='{escaped_text}'{font_opt}:fontsize={font_size}:fontcolor={safe_font_color}:box=1:boxcolor={box_color}:boxborderw=10:x=(w-text_w)/2:y={y_pos}"

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path
    ]

    res = run_command(cmd)
    if res.returncode != 0:
        return {"error": f"Text overlay failed: {res.stderr}"}

    out_info = get_video_info(output_path)
    return {
        "success": True,
        "output_path": output_path,
        "text": text,
        "duration": out_info.get("duration", 0.0),
        "size_mb": out_info.get("size_mb", 0.0)
    }

def burn_subtitles_into_video(
    video_path: str,
    output_path: str,
    cues: List[Dict[str, Any]],
    font_name: str = "Cairo",
    font_size: int = 46,
    text_color: str = "#facc15",
    outline_color: str = "#000000",
    outline_width: float = 3.5,
    back_color: str = "&H80000000",
    border_style: int = 1,
    shadow: float = 1.0,
    position: str = "bottom",
    style_preset: Optional[str] = None,
    pop_animation: bool = True,
    chunk_for_reels: bool = True
) -> Dict[str, Any]:
    """
    Burn / hardcode Arabic/multilingual subtitles permanently into the video frames.
    Uses ASS formatting with libass for perfect RTL Arabic shaping, bold viral outline,
    bounding box styling, and ultrafast FFmpeg encoding.
    """
    if not os.path.exists(video_path):
        return {"error": "Source video file not found"}

    if not cues or len(cues) == 0:
        return {"error": "No subtitle cues provided to burn"}

    import sys
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    from ai_subtitles import build_ass, chunk_cues_for_reels

    info = get_video_info(video_path)
    width = int(info.get("width") or 0)
    height = int(info.get("height") or 0)
    is_vertical = (height > width) if (height and width) else False

    processed_cues = chunk_cues_for_reels(cues) if chunk_for_reels else cues

    ass_content = build_ass(
        cues=processed_cues,
        font_name=font_name,
        font_size=font_size,
        text_color=text_color,
        outline_color=outline_color,
        outline_width=outline_width,
        back_color=back_color,
        border_style=border_style,
        shadow=shadow,
        position=position,
        style_preset=style_preset,
        pop_animation=pop_animation,
        chunk_for_reels=False,
        is_vertical=is_vertical
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_ass = os.path.join(os.path.dirname(output_path), f"subs_{os.path.basename(output_path)}.ass")
    with open(temp_ass, "w", encoding="utf-8") as f:
        f.write(ass_content)

    try:
        # Sanitize fonts directory by removing any corrupt HTML downloads
        fonts_dir = os.path.join(backend_dir, "fonts")
        if os.path.isdir(fonts_dir):
            for fname in os.listdir(fonts_dir):
                fpath = os.path.join(fonts_dir, fname)
                if os.path.isfile(fpath):
                    try:
                        with open(fpath, "rb") as fp:
                            header = fp.read(32)
                            if b"<!DOCTYPE" in header or b"<html" in header or b"<svg" in header:
                                os.remove(fpath)
                    except Exception:
                        pass

        # Use ass filter in ffmpeg with ultrafast preset and fixed thread count for maximum cloud speed
        escaped_ass = temp_ass.replace("\\", "/").replace(":", "\\:").replace("'", "'\\''")

        if os.path.isdir(fonts_dir):
            escaped_fonts = fonts_dir.replace("\\", "/").replace(":", "\\:").replace("'", "'\\''")
            ass_filter = f"ass=filename='{escaped_ass}':fontsdir='{escaped_fonts}'"
        else:
            ass_filter = f"ass='{escaped_ass}'"

        has_audio = info.get("has_audio", True)
        audio_flags = ["-c:a", "copy"] if has_audio else ["-an"]

        # Optimize encoding speed & memory for cloud/Render:
        # If video resolution > 720p, downscale to 720p preserving aspect ratio.
        # This speeds up burning by 3x-5x and prevents timeouts/OOM on high-res videos.
        filters = []
        if (height and height > 720) or (width and width > 1280):
            if height and width and height > width:
                # Vertical / Reels / Shorts (e.g. 1080x1920 -> 720x1280)
                if width > 720:
                    filters.append("scale='720:-2'")
            else:
                # Landscape (e.g. 1920x1080 -> 1280x720)
                if height > 720:
                    filters.append("scale='-2:720'")

        filters.append(ass_filter)
        combined_vf = ",".join(filters)

        cmd = [
            "ffmpeg", "-y",
            "-threads", "2",
            "-i", video_path,
            "-vf", combined_vf,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "fastdecode",
            "-crf", "26",
            "-pix_fmt", "yuv420p",
            *audio_flags,
            "-sn",
            "-movflags", "+faststart",
            output_path
        ]

        res = run_command(cmd)

        # Retry with re-encoded AAC audio if stream copying failed (e.g. PCM / non-MP4 native codec)
        if res.returncode != 0 and has_audio:
            cmd_fallback = [
                "ffmpeg", "-y",
                "-threads", "2",
                "-i", video_path,
                "-vf", combined_vf,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "fastdecode",
                "-crf", "26",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k",
                "-sn",
                "-movflags", "+faststart",
                output_path
            ]
            res = run_command(cmd_fallback)

        if res.returncode != 0:
            return {"error": f"Failed to burn subtitles into video: {res.stderr}"}
    finally:
        # Cleanup temp ass
        if os.path.exists(temp_ass):
            try:
                os.remove(temp_ass)
            except Exception:
                pass

    out_info = get_video_info(output_path)
    return {
        "success": True,
        "output_path": output_path,
        "cues_burned": len(processed_cues),
        "duration": out_info.get("duration", 0.0),
        "size_mb": out_info.get("size_mb", 0.0)
    }


def is_valid_youtube_url(url: str) -> bool:
    """Validate whether input string is a valid YouTube video or Shorts URL."""
    if not url or not isinstance(url, str):
        return False
    clean = url.strip()
    if not clean.startswith(("http://", "https://")):
        clean = "https://" + clean
    # Support youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/..., m.youtube.com, etc.
    youtube_regex = (
        r'^(https?://)?(www\.|m\.)?'
        r'(youtube\.com/(watch\?.*v=|shorts/|embed/|v/|live/)|youtu\.be/)'
        r'([a-zA-Z0-9_-]{6,})'
    )
    return bool(re.search(youtube_regex, clean))


def download_youtube_video(
    url: str,
    output_dir: str,
    quality: str = "720p"
) -> Dict[str, Any]:
    """
    Download any YouTube video (Standard watch videos, Shorts, mobile links) via yt-dlp.
    Capped to 720p or 1080p for high performance and bandwidth efficiency.
    Produces web-optimized MP4 with faststart flags.
    """
    import yt_dlp
    import uuid

    clean_url = url.strip()
    if not clean_url.startswith(("http://", "https://")):
        clean_url = "https://" + clean_url

    os.makedirs(output_dir, exist_ok=True)
    video_id = f"yt_{uuid.uuid4().hex[:10]}"
    target_basename = video_id
    out_tmpl = os.path.join(output_dir, f"{target_basename}.%(ext)s")

    max_height = 1080 if str(quality).lower() == "1080p" else 720

    # Format selector prioritizing standard MP4 video + M4A audio within max_height
    format_selector = (
        f"bestvideo[height<={max_height}][ext=mp4]+bestaudio[ext=m4a]/"
        f"bestvideo[height<={max_height}]+bestaudio/"
        f"best[height<={max_height}][ext=mp4]/"
        f"best[height<={max_height}]/"
        f"best"
    )

    ydl_opts = {
        'format': format_selector,
        'outtmpl': out_tmpl,
        'merge_output_format': 'mp4',
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 30,
        'postprocessor_args': {
            'ffmpeg': ['-movflags', '+faststart']
        }
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info_dict = ydl.extract_info(clean_url, download=True)
        if not info_dict:
            raise ValueError("فشل استخراج معلومات الفيديو من YouTube")

        raw_title = info_dict.get("title") or "YouTube Video"
        safe_title = re.sub(r'[\\/*?:"<>|]', "", raw_title).strip() or "youtube_video"

    expected_mp4 = os.path.join(output_dir, f"{target_basename}.mp4")

    # If the merged file has a different extension (e.g. .mkv, .webm), remux to .mp4
    if not os.path.exists(expected_mp4):
        candidates = [f for f in os.listdir(output_dir) if f.startswith(target_basename)]
        if not candidates:
            raise FileNotFoundError("لم يتم العثور على ملف الفيديو بعد التنزيل")
        downloaded = os.path.join(output_dir, candidates[0])
        remux_cmd = [
            "ffmpeg", "-nostdin", "-y", "-i", downloaded,
            "-c", "copy", "-movflags", "+faststart", expected_mp4
        ]
        subprocess.run(remux_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        try:
            if downloaded != expected_mp4 and os.path.exists(downloaded):
                os.remove(downloaded)
        except Exception:
            pass

    info = get_video_info(expected_mp4)
    return {
        "success": True,
        "video_id": f"{target_basename}.mp4",
        "filename": f"{safe_title}.mp4",
        "title": raw_title,
        "preview_url": f"/api/video/stream/{target_basename}.mp4",
        "info": info
    }



