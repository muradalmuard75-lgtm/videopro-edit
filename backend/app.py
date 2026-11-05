import os
import time
import uuid
import json
import shutil
import subprocess
import glob
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

DEPLOY_TIMESTAMP = int(time.time())

from video_engine import (
    get_video_info,
    split_video_by_interval,
    trim_video_range,
    auto_reframe_aspect_ratio,
    auto_remove_silence,
    extract_video_highlights,
    export_final_video,
    add_audio_to_video,
    merge_video_clips,
    add_text_to_video,
    burn_subtitles_into_video,
    change_video_speed_and_direction,
    enhance_voice_and_denoise,
    prepare_social_publish_package,
    parse_youtube_url,
    get_youtube_metadata,
    fetch_youtube_video,
)
from ai_subtitles import (
    generate_subtitles,
    translate_cues_list,
    self_reliant_translate,
    build_srt,
    build_vtt,
)
from youtube_scheduler import (
    load_credentials,
    save_credentials,
    load_scheduled_jobs,
    save_scheduled_jobs,
    get_oauth_auth_url,
    exchange_code_for_tokens,
    fetch_channel_info,
    upload_and_schedule_video,
    calculate_schedule_plan,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
EXPORTS_DIR = os.path.join(BASE_DIR, "exports")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)

# Startup hygiene: ensure fonts directory exists and remove any corrupt HTML downloads
FONTS_DIR = os.path.join(BASE_DIR, "fonts")
if os.path.isdir(FONTS_DIR):
    for fname in os.listdir(FONTS_DIR):
        fpath = os.path.join(FONTS_DIR, fname)
        if os.path.isfile(fpath):
            try:
                with open(fpath, "rb") as fp:
                    header = fp.read(32)
                    if b"<!DOCTYPE" in header or b"<html" in header or b"<svg" in header:
                        os.remove(fpath)
            except Exception:
                pass

app = FastAPI(
    title="VideoPro Edit API v2.0",
    description="Self-Reliant Smart Video Editing, YouTube/Shorts Importer, AI Subtitles & Social Publisher Suite",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if not (request.url.path.startswith("/api/video/stream/") or request.url.path.startswith("/api/download/")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        if request.url.path == "/" or request.url.path.endswith(".html"):
            response.headers["Clear-Site-Data"] = '"cache"'
        if "etag" in response.headers:
            del response.headers["etag"]
        if "last-modified" in response.headers:
            del response.headers["last-modified"]
    return response


@app.get("/api/version")
async def get_version():
    return JSONResponse(
        content={"version": DEPLOY_TIMESTAMP, "release": "2.0.0"},
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


def get_default_sample_path() -> Optional[str]:
    sample_path = os.path.join(UPLOADS_DIR, "sample.mp4")
    if os.path.exists(sample_path):
        return sample_path
    frontend_demo = os.path.join(FRONTEND_DIR, "assets", "demo_video.mp4")
    if os.path.exists(frontend_demo):
        return frontend_demo
    return None


def resolve_video_path(video_id: str) -> str:
    """Resolve video_id to actual file on disk."""
    if not video_id or video_id in ("sample", "demo", "default"):
        sp = get_default_sample_path()
        if sp:
            return sp

    target = os.path.join(UPLOADS_DIR, f"{video_id}.mp4")
    if os.path.exists(target):
        return target

    target_exact = os.path.join(UPLOADS_DIR, video_id)
    if os.path.exists(target_exact):
        return target_exact

    export_target = os.path.join(EXPORTS_DIR, f"{video_id}.mp4")
    if os.path.exists(export_target):
        return export_target

    export_exact = os.path.join(EXPORTS_DIR, video_id)
    if os.path.exists(export_exact):
        return export_exact

    for root, dirs, files in os.walk(EXPORTS_DIR):
        if video_id in files:
            return os.path.join(root, video_id)
        if f"{video_id}.mp4" in files:
            return os.path.join(root, f"{video_id}.mp4")

    raise HTTPException(status_code=404, detail="Video file not found")


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "VideoPro Edit", "version": "2.0.0"}


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a custom video file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Empty filename")

    video_id = f"video_{uuid.uuid4().hex[:10]}"
    ext = os.path.splitext(file.filename)[1].lower() or ".mp4"
    saved_name = f"{video_id}{ext}"
    saved_path = os.path.join(UPLOADS_DIR, saved_name)

    with open(saved_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    info = get_video_info(saved_path)
    return {
        "success": True,
        "video_id": saved_name,
        "filename": file.filename,
        "preview_url": f"/api/video/stream/{saved_name}",
        "info": info,
    }


@app.post("/api/youtube/info")
def api_youtube_info(url: str = Form(...)):
    """
    Inspect a YouTube video or YouTube Shorts link and return metadata before or during import.
    """
    res = get_youtube_metadata(url)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "رابط يوتيوب غير صالح"))
    return res


@app.post("/api/youtube/fetch")
def api_youtube_fetch(
    url: str = Form(...),
    quality: str = Form("best"),
):
    """
    Fetch a YouTube video or YouTube Short into the studio workspace so all VideoPro tools
    (Splitting, Subtitles, Reframe, Silence Removal, Highlights, Social Publish, etc.) work on it.
    """
    res = fetch_youtube_video(
        url=url,
        uploads_dir=UPLOADS_DIR,
        quality=quality,
        fallback_sample_path=get_default_sample_path(),
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "فشل جلب الفيديو من يوتيوب"))
    return res


@app.get("/api/youtube/progress/{yt_id}")
def api_youtube_progress(yt_id: str):
    """Return real-time download and processing progress for a YouTube video."""
    from video_engine import get_yt_download_progress
    return get_yt_download_progress(yt_id)


@app.get("/api/video/info")
async def video_info(video_id: str = "sample"):
    """Get video technical specifications."""
    file_path = resolve_video_path(video_id)
    info = get_video_info(file_path)
    return {"video_id": video_id, "info": info}


@app.post("/api/video/split")
def split_video(
    video_id: str = Form("sample"),
    interval_seconds: float = Form(60.0),
    prefix: str = Form("videopro"),
    split_mode: str = Form("interval"),
    reencode: bool = Form(False),
):
    """
    Split video by interval (15s, 30s, 60s, 120s, custom) or by AI scene detection (split_mode='scene').
    Returns all separate clips and a ready-to-download ZIP file.
    """
    file_path = resolve_video_path(video_id)
    job_id = f"split_{uuid.uuid4().hex[:8]}"
    out_dir = os.path.join(EXPORTS_DIR, job_id)

    result = split_video_by_interval(
        file_path=file_path,
        output_dir=out_dir,
        interval_sec=interval_seconds,
        prefix=prefix,
        reencode=reencode,
        split_mode=split_mode,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["job_id"] = job_id
    result["video_id"] = job_id
    if result.get("chunks") and len(result["chunks"]) > 0:
        result["url"] = result["chunks"][0]["url"]
        result["filename"] = result["chunks"][0]["filename"]
    return result


@app.post("/api/video/trim")
def api_trim_video(
    video_id: str = Form("sample"),
    start_sec: float = Form(0.0),
    end_sec: float = Form(30.0),
    reencode: bool = Form(False),
):
    """
    Precision Range Trimmer: Cut a specific segment from start_sec to end_sec.
    """
    file_path = resolve_video_path(video_id)
    out_name = f"trim_{int(start_sec)}s_{int(end_sec)}s_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = trim_video_range(
        file_path=file_path,
        output_path=out_path,
        start_sec=start_sec,
        end_sec=end_sec,
        reencode=reencode,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["video_id"] = out_name
    result["filename"] = out_name
    return result


@app.post("/api/video/reframe")
def reframe_video(
    video_id: str = Form("sample"),
    target_ratio: str = Form("9:16"),
    mode: str = Form("smart_blur"),
):
    """
    Auto-reframe video to 9:16, 16:9, 1:1, or 4:5 with smart blur background or crop.
    """
    file_path = resolve_video_path(video_id)
    out_name = f"reframe_{target_ratio.replace(':', 'x')}_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = auto_reframe_aspect_ratio(
        file_path=file_path,
        output_path=out_path,
        target_ratio=target_ratio,
        mode=mode,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["video_id"] = out_name
    result["filename"] = out_name
    return result


@app.post("/api/video/remove-silence")
def remove_silence(
    video_id: str = Form("sample"),
    noise_threshold_db: float = Form(-30.0),
    min_silence_duration: float = Form(0.5),
):
    """
    Auto-detect silent pauses and cut them out cleanly (Jump-Cut).
    """
    file_path = resolve_video_path(video_id)
    out_name = f"jumpcut_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = auto_remove_silence(
        file_path=file_path,
        output_path=out_path,
        noise_threshold_db=noise_threshold_db,
        min_silence_duration=min_silence_duration,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["video_id"] = out_name
    result["filename"] = out_name
    return result


@app.post("/api/video/highlights")
def get_highlights(
    video_id: str = Form("sample"),
    count: int = Form(3),
    duration: float = Form(20.0),
):
    """
    AI scene & dynamic action analysis extracting the best moments into viral shorts.
    """
    file_path = resolve_video_path(video_id)
    job_id = f"highlights_{uuid.uuid4().hex[:8]}"
    out_dir = os.path.join(EXPORTS_DIR, job_id)

    result = extract_video_highlights(
        file_path=file_path,
        output_dir=out_dir,
        num_highlights=count,
        highlight_duration=duration,
    )
    result["job_id"] = job_id
    result["video_id"] = job_id
    if result.get("highlights") and len(result["highlights"]) > 0:
        result["url"] = result["highlights"][0]["url"]
        result["filename"] = result["highlights"][0]["filename"]
    return result


@app.post("/api/video/subtitles")
def auto_subtitles(
    video_id: str = Form("sample"),
    language: str = Form("ar"),
    chunk_reels: bool = Form(True),
    max_words: int = Form(4),
    bilingual: bool = Form(False),
    gemini_key: Optional[str] = Form(None),
):
    """
    Speech-to-text automated subtitles with self-reliant multi-language translation and timestamps.
    """
    file_path = resolve_video_path(video_id)
    result = generate_subtitles(
        video_path=file_path,
        target_language=language,
        gemini_api_key=gemini_key,
        chunk_for_reels=chunk_reels,
        max_words_per_cue=max_words,
        bilingual=bilingual,
    )
    return result


@app.post("/api/video/translate-cues")
def api_translate_cues(
    cues_json: str = Form("[]"),
    target_language: str = Form("en"),
    bilingual: bool = Form(False),
):
    """
    Translate existing subtitle cues into another language (ar, en, fr, tr, es)
    using the self-reliant hybrid translation engine.
    """
    try:
        cues = json.loads(cues_json)
    except Exception:
        raise HTTPException(status_code=400, detail="تنسيق الترجمة غير صالح")

    if not isinstance(cues, list) or not cues:
        raise HTTPException(status_code=400, detail="لا توجد أسطر لترجمتها")

    translated = translate_cues_list(cues, target_lang=target_language, bilingual=bilingual)
    return {
        "success": True,
        "target_language": target_language,
        "bilingual": bilingual,
        "cues": translated,
        "srt": build_srt(translated),
        "vtt": build_vtt(translated),
    }


@app.post("/api/video/burn-subtitles")
def api_burn_subtitles(
    video_id: str = Form("sample"),
    cues_json: str = Form("[]"),
    font_name: str = Form("Cairo"),
    font_size: int = Form(46),
    text_color: str = Form("#facc15"),
    outline_color: str = Form("#000000"),
    outline_width: float = Form(3.5),
    back_color: str = Form("&H80000000"),
    border_style: int = Form(1),
    shadow: float = Form(1.0),
    position: str = Form("bottom"),
    style_preset: Optional[str] = Form(None),
    pop_animation: bool = Form(True),
    chunk_for_reels: bool = Form(True),
    karaoke_mode: bool = Form(False),
    bilingual_mode: bool = Form(False),
):
    """
    Burn subtitles directly and permanently into the video frames using viral ASS styling.
    """
    file_path = resolve_video_path(video_id)
    try:
        cues = json.loads(cues_json)
    except Exception:
        raise HTTPException(status_code=400, detail="تنسيق الترجمة (JSON) غير صالح")

    if not cues or not isinstance(cues, list):
        raise HTTPException(status_code=400, detail="يرجى توفير أسطر الترجمة لحرقها داخل الفيديو")

    out_name = f"videopro_subtitled_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = burn_subtitles_into_video(
        video_path=file_path,
        output_path=out_path,
        cues=cues,
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
        chunk_for_reels=chunk_for_reels,
        karaoke_mode=karaoke_mode,
        bilingual_mode=bilingual_mode,
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["filename"] = out_name
    result["video_id"] = out_name
    result["cues"] = cues
    return result


@app.post("/api/video/auto-caption-and-burn")
def api_auto_caption_and_burn(
    video_id: str = Form("sample"),
    target_language: str = Form("ar"),
    font_name: str = Form("Cairo"),
    font_size: int = Form(46),
    text_color: str = Form("#facc15"),
    outline_color: str = Form("#000000"),
    outline_width: float = Form(3.5),
    back_color: str = Form("&H80000000"),
    border_style: int = Form(1),
    shadow: float = Form(1.0),
    position: str = Form("bottom"),
    style_preset: Optional[str] = Form("tiktok_yellow"),
    pop_animation: bool = Form(True),
    chunk_for_reels: bool = Form(True),
    max_words: int = Form(4),
    karaoke_mode: bool = Form(False),
    bilingual_mode: bool = Form(False),
):
    """
    All-in-one automated pipeline for TikTok / Reels / Shorts.
    """
    file_path = resolve_video_path(video_id)
    sub_res = generate_subtitles(
        video_path=file_path,
        target_language=target_language,
        chunk_for_reels=chunk_for_reels,
        max_words_per_cue=max_words,
        bilingual=bilingual_mode,
    )
    if not sub_res.get("success") or not sub_res.get("cues"):
        err = sub_res.get("error", "لم يتم رصد كلام واضح في مقطع الصوت لاستخراجه")
        raise HTTPException(status_code=400, detail=err)

    cues = sub_res["cues"]
    out_name = f"videopro_autocaptioned_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    burn_res = burn_subtitles_into_video(
        video_path=file_path,
        output_path=out_path,
        cues=cues,
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
        karaoke_mode=karaoke_mode,
        bilingual_mode=bilingual_mode,
    )

    if "error" in burn_res:
        raise HTTPException(status_code=500, detail=burn_res["error"])

    burn_res["url"] = f"/api/download/export/{out_name}"
    burn_res["filename"] = out_name
    burn_res["video_id"] = out_name
    burn_res["cues"] = cues
    burn_res["srt"] = sub_res.get("srt", "")
    burn_res["detected_language"] = sub_res.get("detected_language", "ar")
    return burn_res


@app.post("/api/video/speed")
def api_video_speed(
    video_id: str = Form("sample"),
    speed: float = Form(1.5),
    reverse: bool = Form(False),
    boomerang: bool = Form(False),
):
    """
    Change video playback speed (0.5x to 4.0x), reverse video, or create a Boomerang loop.
    """
    file_path = resolve_video_path(video_id)
    out_name = f"videopro_speed_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = change_video_speed_and_direction(
        file_path=file_path,
        output_path=out_path,
        speed=speed,
        reverse=reverse,
        boomerang=boomerang,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["filename"] = out_name
    result["video_id"] = out_name
    return result


@app.post("/api/video/enhance-voice")
def api_enhance_voice(
    video_id: str = Form("sample"),
    denoise_strength: str = Form("medium"),
    podcast_boost: bool = Form(True),
    normalize_lufs: bool = Form(True),
):
    """
    Self-Reliant DSP Audio Studio: Noise Reduction (afftdn) + Podcast Voice Compression + Loudness Normalization.
    """
    file_path = resolve_video_path(video_id)
    out_name = f"videopro_voicepro_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = enhance_voice_and_denoise(
        file_path=file_path,
        output_path=out_path,
        denoise_strength=denoise_strength,
        podcast_boost=podcast_boost,
        normalize_lufs=normalize_lufs,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["filename"] = out_name
    result["video_id"] = out_name
    return result


@app.post("/api/video/publish-kit")
def api_publish_kit(
    video_id: str = Form("sample"),
    platform: str = Form("youtube_shorts"),
    custom_topic: str = Form(""),
    transcript_text: str = Form(""),
):
    """
    Social Media Publisher & Viral Kit:
    Optimizes video for target platform, extracts cover thumbnail frame, and generates
    viral hooks, SEO description with chapters, and trending hashtags.
    """
    file_path = resolve_video_path(video_id)
    job_id = f"publish_{uuid.uuid4().hex[:8]}"
    out_dir = os.path.join(EXPORTS_DIR, job_id)

    result = prepare_social_publish_package(
        file_path=file_path,
        output_dir=out_dir,
        platform=platform,
        custom_topic=custom_topic,
        transcript_text=transcript_text,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["job_id"] = job_id
    result["url"] = result["video_url"]
    return result


@app.post("/api/video/export")
def export_video(
    video_id: str = Form("sample"),
    resolution: str = Form("1080p"),
    format_type: str = Form("mp4"),
    brightness: float = Form(0.0),
    contrast: float = Form(1.0),
    saturation: float = Form(1.0),
):
    """
    Export final video with chosen resolution, format, and color adjustments.
    """
    file_path = resolve_video_path(video_id)
    ext = format_type.lower()
    out_name = f"videopro_export_{resolution}_{uuid.uuid4().hex[:6]}.{ext}"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = export_final_video(
        file_path=file_path,
        output_path=out_path,
        resolution=resolution,
        format_type=ext,
        brightness=brightness,
        contrast=contrast,
        saturation=saturation,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["filename"] = out_name
    result["video_id"] = out_name
    return result


@app.post("/api/video/add-audio")
async def api_add_audio(
    video_id: str = Form("sample"),
    video_volume: float = Form(1.0),
    music_volume: float = Form(0.5),
    preset: str = Form("upbeat"),
    audio_file: Optional[UploadFile] = File(None),
):
    """
    Mix background audio/music with the video.
    """
    file_path = resolve_video_path(video_id)
    audio_path = None

    if audio_file and audio_file.filename:
        audio_name = f"audio_{uuid.uuid4().hex[:8]}_{audio_file.filename}"
        audio_path = os.path.join(UPLOADS_DIR, audio_name)
        with open(audio_path, "wb") as f:
            shutil.copyfileobj(audio_file.file, f)
    else:
        v_info = get_video_info(file_path)
        dur = max(5.0, v_info.get("duration", 30.0))
        audio_name = f"preset_{preset}_{uuid.uuid4().hex[:6]}.mp3"
        audio_path = os.path.join(UPLOADS_DIR, audio_name)

        freq = 440 if preset == "upbeat" else 330 if preset == "calm" else 520
        gen_cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={dur}",
            "-c:a", "libmp3lame", "-b:a", "128k",
            audio_path,
        ]
        subprocess.run(gen_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    out_name = f"videopro_audio_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = add_audio_to_video(
        video_path=file_path,
        audio_path=audio_path,
        output_path=out_path,
        video_vol=video_volume,
        audio_vol=music_volume,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["filename"] = out_name
    result["video_id"] = out_name
    return result


@app.post("/api/video/merge")
async def api_merge_clips(
    video_id: str = Form("sample"),
    extra_clips: Optional[str] = Form(None),
    clip_files: Optional[List[UploadFile]] = File(None),
):
    """
    Merge multiple video clips together into a single continuous video.
    """
    primary_path = resolve_video_path(video_id)
    all_paths = [primary_path]

    if clip_files:
        for f in clip_files:
            if f.filename:
                extra_name = f"clip_{uuid.uuid4().hex[:6]}_{f.filename}"
                extra_path = os.path.join(UPLOADS_DIR, extra_name)
                with open(extra_path, "wb") as out_f:
                    shutil.copyfileobj(f.file, out_f)
                all_paths.append(extra_path)

    if extra_clips:
        ids = [cid.strip() for cid in extra_clips.split(",") if cid.strip()]
        for cid in ids:
            try:
                p = resolve_video_path(cid)
                if p not in all_paths:
                    all_paths.append(p)
            except Exception:
                pass

    if len(all_paths) == 1:
        all_paths.append(primary_path)

    out_name = f"videopro_merged_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = merge_video_clips(all_paths, out_path)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["filename"] = out_name
    result["video_id"] = out_name
    return result


@app.post("/api/video/add-text")
async def api_add_text(
    video_id: str = Form("sample"),
    text: str = Form("VideoPro Edit"),
    font_size: int = Form(36),
    font_color: str = Form("yellow"),
    position: str = Form("bottom"),
):
    """
    Burn custom text or sticker onto the video.
    """
    file_path = resolve_video_path(video_id)
    out_name = f"videopro_text_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = add_text_to_video(
        video_path=file_path,
        output_path=out_path,
        text=text,
        font_size=font_size,
        font_color=font_color,
        position=position,
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["filename"] = out_name
    result["video_id"] = out_name
    return result


# Download endpoints
@app.get("/api/video/stream/{video_id}")
async def stream_uploaded(video_id: str):
    file_path = resolve_video_path(video_id)
    return FileResponse(file_path, media_type="video/mp4")


@app.get("/api/download/part/{job_id}/{filename}")
async def download_part(job_id: str, filename: str):
    file_path = os.path.join(EXPORTS_DIR, job_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "video/mp4"
    return FileResponse(file_path, filename=filename, media_type=media_type)


@app.get("/api/download/zip/{job_id}/{filename}")
async def download_zip(job_id: str, filename: str):
    file_path = os.path.join(EXPORTS_DIR, job_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archive not found")
    return FileResponse(file_path, filename=filename, media_type="application/zip")


@app.get("/api/download/export/{filename}")
async def download_export(filename: str):
    file_path = os.path.join(EXPORTS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Exported file not found")
    media_type = "audio/mpeg" if filename.endswith(".mp3") else "video/mp4"
    return FileResponse(file_path, filename=filename, media_type=media_type)


@app.api_route("/api/video/delete", methods=["POST", "DELETE"])
async def delete_video(
    video_id: Optional[str] = Form(None),
    vid_param: Optional[str] = Query(None, alias="video_id"),
):
    """Delete video from server uploads if present."""
    target_id = video_id or vid_param
    if not target_id:
        return {"success": True, "message": "No active video specified"}

    if target_id in ("sample", "demo", "default"):
        return {"success": True, "message": "Workspace reset successfully"}

    deleted = False
    candidates = [
        os.path.join(UPLOADS_DIR, target_id),
        os.path.join(UPLOADS_DIR, f"{target_id}.mp4"),
        os.path.join(EXPORTS_DIR, target_id),
        os.path.join(EXPORTS_DIR, f"{target_id}.mp4"),
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                if os.path.isfile(p):
                    os.remove(p)
                    deleted = True
                elif os.path.isdir(p):
                    shutil.rmtree(p, ignore_errors=True)
                    deleted = True
            except Exception:
                pass

    return {"success": True, "deleted": deleted, "message": "Video deleted successfully"}


# ==============================================================================
# 🚀 YOUTUBE AUTO-SCHEDULER & BATCH PUBLISHER ENDPOINTS
# ==============================================================================

@app.get("/api/youtube/scheduler/status")
async def youtube_scheduler_status():
    """Returns whether YouTube credentials are saved and channel information."""
    creds = load_credentials()
    has_creds = bool(creds.get("refresh_token") or creds.get("access_token") or creds.get("api_key"))
    channel_res = fetch_channel_info()
    return {
        "success": True,
        "configured": has_creds,
        "channel": channel_res.get("channel") if channel_res.get("success") else None,
        "client_id_configured": bool(creds.get("client_id")),
    }


@app.post("/api/youtube/scheduler/save-credentials")
async def youtube_scheduler_save_creds(
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None),
    refresh_token: Optional[str] = Form(None),
    access_token: Optional[str] = Form(None),
    api_key: Optional[str] = Form(None),
):
    """Save user YouTube API & OAuth credentials."""
    data = {}
    if client_id:
        data["client_id"] = client_id.strip()
    if client_secret:
        data["client_secret"] = client_secret.strip()
    if refresh_token:
        data["refresh_token"] = refresh_token.strip()
    if access_token:
        data["access_token"] = access_token.strip()
        data["token_expiry"] = time.time() + 3500
    if api_key:
        data["api_key"] = api_key.strip()

    ok = save_credentials(data)
    channel_res = fetch_channel_info()
    return {
        "success": ok,
        "message": "تم حفظ بيانات اعتماد YouTube بنجاح",
        "channel": channel_res.get("channel") if channel_res.get("success") else None,
    }


@app.post("/api/youtube/scheduler/oauth-url")
async def youtube_scheduler_oauth_url(
    client_id: str = Form(...),
    redirect_uri: str = Form("http://localhost:8000/api/youtube/scheduler/callback"),
):
    url = get_oauth_auth_url(client_id, redirect_uri)
    return {"success": True, "auth_url": url}


@app.post("/api/youtube/scheduler/plan")
async def youtube_scheduler_plan(
    clips_json: str = Form(...),
    start_time: str = Form(...),
    interval_minutes: int = Form(60),
    base_title: str = Form("فيديو جديد"),
    description: str = Form("تم المونتاج والتقطيع عبر VideoPro Studio"),
    tags_csv: str = Form("shorts,videopro,viral"),
):
    """Calculates scheduled times and metadata for a batch of clips."""
    try:
        clips = json.loads(clips_json)
    except Exception:
        clips = []

    tags = [t.strip() for t in tags_csv.split(",") if t.strip()]
    plan = calculate_schedule_plan(
        clips=clips,
        start_time_iso=start_time,
        interval_minutes=interval_minutes,
        base_title=base_title,
        base_description=description,
        tags=tags,
    )
    return {"success": True, "plan": plan, "total_clips": len(plan)}


@app.post("/api/youtube/scheduler/execute")
async def youtube_scheduler_execute(
    plan_json: str = Form(...),
    simulate: bool = Form(False),
):
    """Uploads and schedules clips to YouTube according to the plan."""
    try:
        plan = json.loads(plan_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid plan JSON: {e}")

    results = []
    creds = load_credentials()
    has_token = bool(creds.get("access_token") or creds.get("refresh_token"))

    for item in plan:
        clip_path = item.get("path")
        if not clip_path or not os.path.exists(clip_path):
            cands = glob.glob(os.path.join(EXPORTS_DIR, "**", item.get("filename", "")), recursive=True)
            if cands:
                clip_path = cands[0]

        if not clip_path or not os.path.exists(clip_path):
            item["status"] = "error"
            item["error"] = "الملف غير موجود على الخادم"
            results.append(item)
            continue

        if simulate or not has_token:
            mock_id = f"demo_{uuid.uuid4().hex[:8]}"
            item["status"] = "scheduled_demo" if not has_token else "scheduled"
            item["video_id"] = mock_id
            item["url"] = f"https://youtu.be/{mock_id}"
            item["note"] = "تم إنشاء خطة الجدولة بنجاح (يرجى ربط OAuth2 للرفع الفعلي لقناتك)"
            results.append(item)
        else:
            upload_res = upload_and_schedule_video(
                video_path=clip_path,
                title=item.get("title", "Clip"),
                description=item.get("description", ""),
                tags=item.get("tags", []),
                publish_at_iso=item.get("publish_at"),
            )
            if upload_res.get("success"):
                item["status"] = "scheduled"
                item["video_id"] = upload_res.get("video_id")
                item["url"] = upload_res.get("url")
            else:
                item["status"] = "error"
                item["error"] = upload_res.get("error")
            results.append(item)

    history = load_scheduled_jobs()
    history.extend(results)
    save_scheduled_jobs(history)

    return {"success": True, "results": results}


@app.get("/api/youtube/scheduler/history")
async def youtube_scheduler_history():
    jobs = load_scheduled_jobs()
    return {"success": True, "jobs": jobs}


# Serve Frontend static assets
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            content = f.read()
        cache_buster = f"?v={int(time.time())}"
        content = content.replace('.js"', f'.js{cache_buster}"').replace('.css"', f'.css{cache_buster}"')
        content = content.replace("BUILD_TIMESTAMP_PLACEHOLDER", str(DEPLOY_TIMESTAMP))
        return HTMLResponse(
            content=content,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0",
                "Pragma": "no-cache",
                "Expires": "0",
                "Clear-Site-Data": '"cache"',
            },
        )
    return HTMLResponse("<h1>VideoPro Edit v2.0 Backend Active</h1>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
