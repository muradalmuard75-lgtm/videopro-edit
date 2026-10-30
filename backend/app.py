import os
import time
import uuid
import shutil
import asyncio
import subprocess
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

DEPLOY_TIMESTAMP = int(time.time())

from video_engine import (
    get_video_info,
    split_video_by_interval,
    auto_reframe_aspect_ratio,
    auto_remove_silence,
    extract_video_highlights,
    export_final_video,
    add_audio_to_video,
    merge_video_clips,
    add_text_to_video,
    burn_subtitles_into_video,
    is_valid_youtube_url,
    download_youtube_video,
)
from ai_subtitles import generate_subtitles


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

# Background warm-up for Whisper so first user subtitle extraction is immediate (<2s)
import threading
def _background_whisper_warmup():
    try:
        from ai_subtitles import get_whisper_model
        m = get_whisper_model()
        if m is not None:
            import numpy as np
            list(m.transcribe(np.zeros(8000, dtype=np.float32), language="ar", beam_size=1)[0])
            print("Whisper tiny speech engine pre-warmed successfully.")
    except Exception as warmup_err:
        print(f"Whisper warmup notice: {warmup_err}")

threading.Thread(target=_background_whisper_warmup, daemon=True).start()

app = FastAPI(title="VideoPro Edit API", description="Smart Video Editing & Auto-Splitting Suite")

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
    # Eradicate caching on mobile and desktop browsers so updates appear instantly
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
        content={"version": DEPLOY_TIMESTAMP},
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

def resolve_video_path(video_id: str) -> str:
    """Resolve video_id to actual file on disk."""
    if not video_id or video_id in ("sample", "demo", "default"):
        sample_path = os.path.join(UPLOADS_DIR, "sample.mp4")
        if os.path.exists(sample_path):
            return sample_path
        # Fallback to frontend assets demo
        frontend_demo = os.path.join(FRONTEND_DIR, "assets", "demo_video.mp4")
        if os.path.exists(frontend_demo):
            return frontend_demo

    target = os.path.join(UPLOADS_DIR, f"{video_id}.mp4")
    if os.path.exists(target):
        return target

    # Try exact match with extension
    target_exact = os.path.join(UPLOADS_DIR, video_id)
    if os.path.exists(target_exact):
        return target_exact

    # Check exports directory for processed / reframed / exported videos
    export_target = os.path.join(EXPORTS_DIR, f"{video_id}.mp4")
    if os.path.exists(export_target):
        return export_target

    export_exact = os.path.join(EXPORTS_DIR, video_id)
    if os.path.exists(export_exact):
        return export_exact

    # Recursively check subdirectories of EXPORTS_DIR (e.g. for split or highlight parts)
    for root, dirs, files in os.walk(EXPORTS_DIR):
        if video_id in files:
            return os.path.join(root, video_id)
        if f"{video_id}.mp4" in files:
            return os.path.join(root, f"{video_id}.mp4")

    raise HTTPException(status_code=404, detail="Video file not found")

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "VideoPro Edit", "version": "1.0.0"}

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
        "info": info
    }

@app.post("/api/video/import-youtube")
async def import_youtube_video(
    url: str = Form(...),
    quality: str = Form("720p")
):
    """
    Download and import any YouTube video (Standard watch videos, Shorts, mobile links).
    Capped to 720p or 1080p, saved into uploads/, and loaded into studio player & timeline.
    """
    clean_url = (url or "").strip()
    if not clean_url:
        raise HTTPException(status_code=400, detail="يرجى إدخال رابط فيديو YouTube")

    if not is_valid_youtube_url(clean_url):
        raise HTTPException(
            status_code=400,
            detail="رابط YouTube غير صالح. يرجى توفير رابط صحيح (مثل: youtube.com/watch أو youtube.com/shorts أو youtu.be)"
        )

    try:
        # Run yt-dlp in threadpool to keep async event loop responsive
        res = await asyncio.to_thread(
            download_youtube_video,
            url=clean_url,
            output_dir=UPLOADS_DIR,
            quality=quality
        )
        return res
    except Exception as e:
        err_msg = str(e)
        print(f"YouTube import error: {err_msg}")
        if "Private video" in err_msg or "Sign in" in err_msg:
            detail = "هذا الفيديو خاص أو مقيد بحساب، يرجى استخدام فيديو متاح للعامة."
        elif "Video unavailable" in err_msg or "not found" in err_msg.lower():
            detail = "فيديو YouTube غير متاح أو تم حذفه."
        else:
            detail = f"تعذر تنزيل فيديو YouTube: {err_msg[:120]}"
        raise HTTPException(status_code=400, detail=detail)

@app.get("/api/video/info")

async def video_info(video_id: str = "sample"):
    """Get video technical specifications."""
    file_path = resolve_video_path(video_id)
    info = get_video_info(file_path)
    return {"video_id": video_id, "info": info}

@app.post("/api/video/split")
async def split_video(
    video_id: str = Form("sample"),
    interval_seconds: float = Form(60.0),
    prefix: str = Form("videopro")
):
    """
    Split video by interval (e.g. 30s for Shorts/Reels/TikTok, 60s for WhatsApp/Instagram, or 120s).
    Returns all separate clips and a ready-to-download ZIP file.
    """
    file_path = resolve_video_path(video_id)
    job_id = f"split_{uuid.uuid4().hex[:8]}"
    out_dir = os.path.join(EXPORTS_DIR, job_id)

    result = split_video_by_interval(
        file_path=file_path,
        output_dir=out_dir,
        interval_sec=interval_seconds,
        prefix=prefix
    )
    result["job_id"] = job_id
    result["video_id"] = job_id
    if result.get("chunks") and len(result["chunks"]) > 0:
        result["url"] = result["chunks"][0]["url"]
        result["filename"] = result["chunks"][0]["filename"]
    return result

@app.post("/api/video/reframe")
async def reframe_video(
    video_id: str = Form("sample"),
    target_ratio: str = Form("9:16"),
    mode: str = Form("smart_blur")
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
        mode=mode
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["video_id"] = out_name
    result["filename"] = out_name
    return result

@app.post("/api/video/remove-silence")
async def remove_silence(
    video_id: str = Form("sample"),
    noise_threshold_db: float = Form(-30.0),
    min_silence_duration: float = Form(0.5)
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
        min_silence_duration=min_silence_duration
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    result["url"] = f"/api/download/export/{out_name}"
    result["video_id"] = out_name
    result["filename"] = out_name
    return result

@app.post("/api/video/highlights")
async def get_highlights(
    video_id: str = Form("sample"),
    count: int = Form(3),
    duration: float = Form(20.0)
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
        highlight_duration=duration
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
    gemini_key: Optional[str] = Form(None)
):
    """
    Speech-to-text automated subtitles with multi-language translation and timestamps.
    Runs synchronously in threadpool to keep the event loop responsive.
    """
    file_path = resolve_video_path(video_id)
    result = generate_subtitles(
        video_path=file_path,
        target_language=language,
        gemini_api_key=gemini_key,
        chunk_for_reels=chunk_reels,
        max_words_per_cue=max_words
    )
    return result

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
    chunk_for_reels: bool = Form(True)
):
    """
    Burn subtitles directly and permanently into the video frames using viral ASS styling.
    """
    import json
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
        chunk_for_reels=chunk_for_reels
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
    max_words: int = Form(4)
):
    """
    All-in-one automated pipeline for TikTok / Reels:
    1. Extracts audio track directly on the server.
    2. Transcribes spoken speech (Arabic or English) with precise timestamps.
    3. If English, automatically translates speech to natural Arabic.
    4. Formats subtitles with ASS styling (Cairo/Amiri, bold stroke, box, pop animation).
    5. Burns text permanently into video frames using ultrafast FFmpeg.
    """
    file_path = resolve_video_path(video_id)
    sub_res = generate_subtitles(
        video_path=file_path,
        target_language=target_language,
        chunk_for_reels=chunk_for_reels,
        max_words_per_cue=max_words
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
        chunk_for_reels=False
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

@app.post("/api/video/export")
def export_video(
    video_id: str = Form("sample"),
    resolution: str = Form("1080p"),
    format_type: str = Form("mp4"),
    brightness: float = Form(0.0),
    contrast: float = Form(1.0),
    saturation: float = Form(1.0)
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
        saturation=saturation
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
    audio_file: Optional[UploadFile] = File(None)
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
        # Generate clean royalty-free harmonic audio track matching video duration
        v_info = get_video_info(file_path)
        dur = max(5.0, v_info.get("duration", 30.0))
        audio_name = f"preset_{preset}_{uuid.uuid4().hex[:6]}.mp3"
        audio_path = os.path.join(UPLOADS_DIR, audio_name)
        
        freq = 440 if preset == "upbeat" else 330 if preset == "calm" else 520
        gen_cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={dur}",
            "-c:a", "libmp3lame", "-b:a", "128k",
            audio_path
        ]
        subprocess.run(gen_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    out_name = f"videopro_audio_{uuid.uuid4().hex[:6]}.mp4"
    out_path = os.path.join(EXPORTS_DIR, out_name)

    result = add_audio_to_video(
        video_path=file_path,
        audio_path=audio_path,
        output_path=out_path,
        video_vol=video_volume,
        audio_vol=music_volume
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
    clip_files: Optional[List[UploadFile]] = File(None)
):
    """
    Merge multiple video clips together into a single continuous video.
    """
    primary_path = resolve_video_path(video_id)
    all_paths = [primary_path]

    # Process extra uploaded files if provided
    if clip_files:
        for f in clip_files:
            if f.filename:
                extra_name = f"clip_{uuid.uuid4().hex[:6]}_{f.filename}"
                extra_path = os.path.join(UPLOADS_DIR, extra_name)
                with open(extra_path, "wb") as out_f:
                    shutil.copyfileobj(f.file, out_f)
                all_paths.append(extra_path)

    # Process extra clip IDs if provided
    if extra_clips:
        ids = [cid.strip() for cid in extra_clips.split(",") if cid.strip()]
        for cid in ids:
            try:
                p = resolve_video_path(cid)
                if p not in all_paths:
                    all_paths.append(p)
            except Exception:
                pass

    # If only 1 video provided, duplicate it for a demonstration merge
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
    position: str = Form("bottom")
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
        position=position
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
    return FileResponse(file_path, filename=filename, media_type="video/mp4")

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
    vid_param: Optional[str] = Query(None, alias="video_id")
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

# Serve Frontend static assets
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/", response_class=HTMLResponse)
async def root():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            content = f.read()
        # Dynamic cache-busting timestamp injected into scripts and stylesheets
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
    return HTMLResponse("<h1>VideoPro Edit Backend Active</h1>")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
