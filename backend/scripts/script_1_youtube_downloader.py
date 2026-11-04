"""
السكريبت الأول (Script 1): تحميل الفيديو الأصلي من يوتيوب أو Shorts ووضعه في الموقع بكامل جودته وصوته
- يدعم الفيديوهات العادية (16:9) وفيديوهات YouTube Shorts العمودية (9:16) بدقة 1080p / 720p كاملة.
- يعتمد على سلسلة سحب متدرجة:
  1. yt-dlp بعملاء متعددين (ios, android_vr, tv, web) مع دمج الصوت والفيديو عبر FFmpeg بصيغة H.264/AAC MP4.
  2. التحميل المباشر عبر خوادم Piped API الرسمية ودمج مسار الفيديو عالي الدقة مع الصوت الأصلي بـ FFmpeg.
  3. استخراج الكلام المنطوق والترجمة الأصلية للفيديو (Captions / ASR) تلقائياً وإرفاقها مع الفيديو.
"""
import os
import re
import json
import uuid
import shutil
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional, List

from video_engine import get_video_info, run_command
from ai_subtitles import fetch_youtube_captions_by_id, chunk_cues_for_reels, build_vtt

YOUTUBE_REGEX = re.compile(
    r"(?:https?://)?(?:www\.|m\.)?"
    r"(?:youtube\.com/(?:watch\?.*v=|shorts/|embed/|live/|v/)|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})"
)

PIPED_API_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.leptons.xyz",
    "https://pipedapi.nosebs.ru",
    "https://pipedapi-libre.kavin.rocks",
    "https://piped-api.privacy.com.de",
    "https://pipedapi.adminforge.de",
    "https://api.piped.yt",
    "https://pipedapi.drgns.space",
    "https://pipedapi.ducks.party",
    "https://api.piped.private.coffee",
]

INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yt.chocolatemoo53.com",
    "https://invidious.tiekoetter.com",
]


def parse_youtube_url(url: str) -> Dict[str, Any]:
    raw_url = (url or "").strip()
    if not raw_url:
        return {"valid": False, "error": "يرجى إدخال رابط فيديو يوتيوب أو Shorts صالح"}

    is_short = "/shorts/" in raw_url.lower()
    match = YOUTUBE_REGEX.search(raw_url)
    if match:
        yt_id = match.group(1)
        canonical_url = (
            f"https://www.youtube.com/shorts/{yt_id}"
            if is_short
            else f"https://www.youtube.com/watch?v={yt_id}"
        )
        return {
            "valid": True,
            "yt_id": yt_id,
            "is_short": is_short,
            "canonical_url": canonical_url,
            "original_url": raw_url,
        }

    if re.fullmatch(r"[A-Za-z0-9_-]{11}", raw_url):
        return {
            "valid": True,
            "yt_id": raw_url,
            "is_short": False,
            "canonical_url": f"https://www.youtube.com/watch?v={raw_url}",
            "original_url": raw_url,
        }

    return {
        "valid": False,
        "error": "الرابط المدخل ليس رابط يوتيوب صالحاً (يدعم الفيديوهات العادية و YouTube Shorts)",
    }


def get_youtube_metadata(url: str) -> Dict[str, Any]:
    parsed = parse_youtube_url(url)
    if not parsed.get("valid"):
        return {"success": False, "error": parsed.get("error")}

    yt_id = parsed["yt_id"]
    is_short = parsed["is_short"]
    canonical = parsed["canonical_url"]

    try:
        import yt_dlp  # type: ignore

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
            "socket_timeout": 10,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(canonical, download=False)
            if info:
                duration = float(info.get("duration") or (30.0 if is_short else 90.0))
                width = int(info.get("width") or (1080 if is_short else 1920))
                height = int(info.get("height") or (1920 if is_short else 1080))
                if height > width:
                    is_short = True
                return {
                    "success": True,
                    "yt_id": yt_id,
                    "title": info.get("title") or f"YouTube ({yt_id})",
                    "uploader": info.get("uploader") or info.get("channel") or "YouTube",
                    "duration": duration,
                    "is_short": is_short,
                    "width": width,
                    "height": height,
                    "aspect_ratio": "9:16" if is_short else "16:9",
                    "thumbnail": info.get("thumbnail") or f"https://i.ytimg.com/vi/{yt_id}/hqdefault.jpg",
                    "canonical_url": canonical,
                }
    except Exception:
        pass

    try:
        oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(canonical)}&format=json"
        req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "success": True,
                "yt_id": yt_id,
                "title": data.get("title") or f"YouTube ({yt_id})",
                "uploader": data.get("author_name") or "YouTube",
                "duration": 30.0 if is_short else 90.0,
                "is_short": is_short,
                "width": 1080 if is_short else 1920,
                "height": 1920 if is_short else 1080,
                "aspect_ratio": "9:16" if is_short else "16:9",
                "thumbnail": data.get("thumbnail_url") or f"https://i.ytimg.com/vi/{yt_id}/hqdefault.jpg",
                "canonical_url": canonical,
            }
    except Exception:
        pass

    return {
        "success": True,
        "yt_id": yt_id,
        "title": f"YouTube ({yt_id})",
        "uploader": "YouTube",
        "duration": 30.0 if is_short else 90.0,
        "is_short": is_short,
        "width": 1080 if is_short else 1920,
        "height": 1920 if is_short else 1080,
        "aspect_ratio": "9:16" if is_short else "16:9",
        "thumbnail": f"https://i.ytimg.com/vi/{yt_id}/hqdefault.jpg",
        "canonical_url": canonical,
    }


def _download_stream_to_file(stream_url: str, dest_path: str, timeout: int = 25) -> bool:
    try:
        req = urllib.request.Request(
            stream_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "*/*",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest_path, "wb") as out_f:
            shutil.copyfileobj(resp, out_f)
        return os.path.exists(dest_path) and os.path.getsize(dest_path) > 15000
    except Exception:
        return False


def _try_piped_server_download(yt_id: str, saved_path: str, uploads_dir: str, max_dim: int) -> Optional[Dict[str, Any]]:
    for api_base in PIPED_API_INSTANCES:
        try:
            req = urllib.request.Request(
                f"{api_base}/streams/{yt_id}",
                headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            v_streams = data.get("videoStreams") or []
            a_streams = data.get("audioStreams") or []
            if not v_streams:
                continue

            def score_v(s: Dict[str, Any]) -> int:
                if not s.get("url"):
                    return -1
                codec = str(s.get("codec") or s.get("mimeType") or "").lower()
                if "av01" in codec:
                    return -10
                w = int(s.get("width") or 0)
                h = int(s.get("height") or 0)
                q = int(re.sub(r"[^\d]", "", str(s.get("quality") or "0")) or "0")
                long_side = max(w, h, q)
                short_side = min(w, h) if (w > 0 and h > 0) else q
                if short_side > 0 and short_side <= 260:
                    return 5
                if long_side > max_dim:
                    return 20
                sc = 500 if ("avc1" in codec or "mp4" in str(s.get("format") or "").lower()) else 300
                if q >= 1080 or long_side >= 1920:
                    sc += 1000
                elif q >= 720 or long_side >= 1280:
                    sc += 900
                elif q >= 480 or long_side >= 854:
                    sc += 700
                elif q >= 360:
                    sc += 500
                return sc

            ranked_v = sorted([s for s in v_streams if score_v(s) > 0], key=score_v, reverse=True)
            ranked_a = sorted(
                [a for a in a_streams if a.get("url")],
                key=lambda a: (1 if "mp4" in str(a.get("mimeType") or "") else 0, int(a.get("bitrate") or 0)),
                reverse=True,
            )

            for chosen_v in ranked_v[:2]:
                v_url = chosen_v["url"]
                is_video_only = bool(chosen_v.get("videoOnly", True))
                tmp_v = os.path.join(uploads_dir, f"tmp_v_{uuid.uuid4().hex[:6]}.mp4")
                if not _download_stream_to_file(v_url, tmp_v, timeout=30):
                    continue

                if not is_video_only or not ranked_a:
                    shutil.move(tmp_v, saved_path)
                    return data

                tmp_a = os.path.join(uploads_dir, f"tmp_a_{uuid.uuid4().hex[:6]}.m4a")
                if _download_stream_to_file(ranked_a[0]["url"], tmp_a, timeout=25):
                    merge_cmd = [
                        "ffmpeg", "-y",
                        "-i", tmp_v,
                        "-i", tmp_a,
                        "-c:v", "copy",
                        "-c:a", "aac",
                        "-movflags", "+faststart",
                        saved_path,
                    ]
                    run_command(merge_cmd)
                    try:
                        os.remove(tmp_v)
                        os.remove(tmp_a)
                    except Exception:
                        pass
                    if os.path.exists(saved_path) and os.path.getsize(saved_path) > 15000:
                        return data
                else:
                    shutil.move(tmp_v, saved_path)
                    return data
        except Exception:
            continue
    return None


def fetch_youtube_video(
    url: str,
    uploads_dir: str,
    quality: str = "1080p",
    fallback_sample_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Download a YouTube video or YouTube Short at full HD (1080p/720p) with original audio
    into uploads_dir as an H.264/AAC MP4 file, and extract its spoken captions/transcript.
    """
    parsed = parse_youtube_url(url)
    if not parsed.get("valid"):
        return {"success": False, "error": parsed.get("error")}

    yt_id = parsed["yt_id"]
    is_short = parsed["is_short"]
    canonical = parsed["canonical_url"]

    os.makedirs(uploads_dir, exist_ok=True)
    prefix = "ytshort" if is_short else "ytvideo"
    unique_tag = uuid.uuid4().hex[:6]
    saved_name = f"{prefix}_{yt_id}_{unique_tag}.mp4"
    saved_path = os.path.join(uploads_dir, saved_name)

    meta = get_youtube_metadata(url)
    title = meta.get("title") or f"YouTube ({yt_id})"

    # IMPORTANT: For vertical 9:16 Shorts, 1080p is 1080x1920 (height=1920)!
    # So use max_dim = 1920 for 1080p, 1280 for 720p, 854 for 480p so vertical Shorts are NEVER capped at 360p!
    max_dim = 1920
    if quality == "720p":
        max_dim = 1280
    elif quality == "480p":
        max_dim = 854
    elif quality == "4k":
        max_dim = 3840

    downloaded_ok = False

    # Tier 1: yt-dlp Python library with multi-client bypass & proper vertical/horizontal HD selector
    fmt_selector = (
        f"bestvideo[width<={max_dim}][height<={max_dim}][vcodec^=avc1]+bestaudio[ext=m4a]/"
        f"bestvideo[width<={max_dim}][height<={max_dim}][ext=mp4]+bestaudio/"
        f"bestvideo[width<={max_dim}][height<={max_dim}]+bestaudio/"
        f"best[width<={max_dim}][height<={max_dim}]/best"
    )

    client_configs: List[Optional[List[str]]] = [
        None,  # yt-dlp default modern clients (ios, android_vr, tv, web)
        ["ios", "web_creator"],
        ["android_vr", "tv_embedded"],
        ["mweb", "web"],
    ]

    try:
        import yt_dlp  # type: ignore

        for clients in client_configs:
            if downloaded_ok:
                break
            try:
                ydl_opts: Dict[str, Any] = {
                    "format": fmt_selector,
                    "outtmpl": saved_path,
                    "merge_output_format": "mp4",
                    "writesubtitles": False,
                    "writeautomaticsub": False,
                    "ignoreerrors": True,
                    "quiet": True,
                    "no_warnings": True,
                    "noplaylist": True,
                    "socket_timeout": 20,
                }
                if clients:
                    ydl_opts["extractor_args"] = {"youtube": {"player_client": clients}}
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([canonical])
                if os.path.exists(saved_path) and os.path.getsize(saved_path) > 20000:
                    downloaded_ok = True
                    break
            except Exception:
                continue
    except Exception:
        pass

    # Tier 2: yt-dlp CLI subprocess
    if not downloaded_ok and shutil.which("yt-dlp"):
        try:
            cmd = [
                "yt-dlp",
                "--no-playlist",
                "--socket-timeout", "15",
                "--write-sub",
                "--write-auto-sub",
                "--sub-lang", "ar,en",
                "-f", fmt_selector,
                "--merge-output-format", "mp4",
                "-o", saved_path,
                canonical,
            ]
            res = run_command(cmd)
            if res.returncode == 0 and os.path.exists(saved_path) and os.path.getsize(saved_path) > 20000:
                downloaded_ok = True
        except Exception:
            pass

    # Tier 3: Piped API Server-Side HD Video + Audio Downloader & FFmpeg Merger
    if not downloaded_ok:
        piped_meta = _try_piped_server_download(yt_id, saved_path, uploads_dir, max_dim)
        if piped_meta and os.path.exists(saved_path) and os.path.getsize(saved_path) > 20000:
            downloaded_ok = True
            if piped_meta.get("title"):
                title = piped_meta["title"]

    if not downloaded_ok:
        return {
            "success": False,
            "error": "تعذر تحميل الفيديو من السيرفر حالياً، جاري استخدام محرك التحميل المباشر في المتصفح",
        }

    # Extract spoken captions/transcript for this YouTube video so Script 2 has real spoken words immediately
    cues: List[Dict[str, Any]] = []
    try:
        raw_yt_cues = fetch_youtube_captions_by_id(yt_id, target_lang="ar")
        if raw_yt_cues:
            cues = chunk_cues_for_reels(raw_yt_cues, max_words_per_cue=6)
            with open(f"{saved_path}.vtt", "w", encoding="utf-8") as vf:
                vf.write(build_vtt(cues))
    except Exception:
        pass

    info = get_video_info(saved_path)
    if info.get("height", 0) > info.get("width", 0):
        is_short = True

    return {
        "success": True,
        "video_id": saved_name,
        "yt_id": yt_id,
        "is_short": is_short,
        "title": title,
        "uploader": meta.get("uploader", "YouTube"),
        "aspect_ratio": "9:16" if is_short else "16:9",
        "filename": f"{title}.mp4",
        "preview_url": f"/api/video/stream/{saved_name}",
        "download_url": f"/api/video/download/{saved_name}",
        "cues": cues,
        "info": info,
    }
