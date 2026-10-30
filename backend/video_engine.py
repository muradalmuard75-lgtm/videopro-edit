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
