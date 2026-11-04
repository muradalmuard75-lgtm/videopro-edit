import os
import json
import time
import datetime
import urllib.request
import urllib.parse
from typing import List, Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "youtube_credentials.json")
SCHEDULED_JOBS_FILE = os.path.join(BASE_DIR, "youtube_scheduled_jobs.json")


def load_credentials() -> Dict[str, Any]:
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_credentials(data: Dict[str, Any]) -> bool:
    try:
        existing = load_credentials()
        existing.update(data)
        with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving credentials: {e}")
        return False


def load_scheduled_jobs() -> List[Dict[str, Any]]:
    if os.path.exists(SCHEDULED_JOBS_FILE):
        try:
            with open(SCHEDULED_JOBS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_scheduled_jobs(jobs: List[Dict[str, Any]]) -> bool:
    try:
        with open(SCHEDULED_JOBS_FILE, "w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving scheduled jobs: {e}")
        return False


def get_oauth_auth_url(client_id: str, redirect_uri: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
        "access_type": "offline",
        "prompt": "consent",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)


def exchange_code_for_tokens(client_id: str, client_secret: str, code: str, redirect_uri: str) -> Dict[str, Any]:
    token_url = "https://oauth2.googleapis.com/token"
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            tokens = json.loads(resp.read().decode("utf-8"))
            tokens["token_expiry"] = time.time() + tokens.get("expires_in", 3600) - 60
            return {"success": True, "tokens": tokens}
    except Exception as e:
        return {"success": False, "error": str(e)}


def refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> Dict[str, Any]:
    token_url = "https://oauth2.googleapis.com/token"
    data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            tokens = json.loads(resp.read().decode("utf-8"))
            tokens["token_expiry"] = time.time() + tokens.get("expires_in", 3600) - 60
            tokens["refresh_token"] = refresh_token
            save_credentials(tokens)
            return {"success": True, "access_token": tokens.get("access_token"), "tokens": tokens}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_valid_access_token() -> Optional[str]:
    creds = load_credentials()
    access_token = creds.get("access_token")
    token_expiry = creds.get("token_expiry", 0)
    refresh_token = creds.get("refresh_token")
    client_id = creds.get("client_id")
    client_secret = creds.get("client_secret")

    if access_token and time.time() < token_expiry:
        return access_token

    if refresh_token and client_id and client_secret:
        res = refresh_access_token(client_id, client_secret, refresh_token)
        if res.get("success"):
            return res.get("access_token")

    return access_token if access_token else None


def fetch_channel_info(access_token: Optional[str] = None, api_key: Optional[str] = None) -> Dict[str, Any]:
    token = access_token or get_valid_access_token()
    if token:
        url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                items = data.get("items", [])
                if items:
                    item = items[0]
                    snippet = item.get("snippet", {})
                    stats = item.get("statistics", {})
                    info = {
                        "authenticated": True,
                        "channel_id": item.get("id"),
                        "title": snippet.get("title"),
                        "description": snippet.get("description"),
                        "custom_url": snippet.get("customUrl"),
                        "avatar": snippet.get("thumbnails", {}).get("default", {}).get("url"),
                        "subscriber_count": stats.get("subscriberCount"),
                        "video_count": stats.get("videoCount"),
                    }
                    save_credentials({"channel_info": info})
                    return {"success": True, "channel": info}
        except Exception as e:
            return {"success": False, "error": f"تعذر استرجاع بيانات القناة: {e}"}

    creds = load_credentials()
    saved_key = api_key or creds.get("api_key")
    if saved_key:
        return {
            "success": True,
            "channel": {
                "authenticated": False,
                "api_key_configured": True,
                "title": "مفتاح YouTube API متصل (يرجى ربط OAuth للنشر التلقائي)",
            }
        }

    return {"success": False, "error": "لم يتم ربط القناة بعد. يرجى إدخال بيانات الاعتماد."}


def upload_and_schedule_video(
    video_path: str,
    title: str,
    description: str,
    tags: List[str],
    publish_at_iso: Optional[str] = None,
    category_id: str = "22",
    privacy_status: str = "private",
    access_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Uploads a video to YouTube Data API v3 using the official Resumable Upload protocol
    and configures automatic scheduling via status.publishAt.
    """
    token = access_token or get_valid_access_token()
    if not token:
        return {"success": False, "error": "غير مصرح: يرجى ربط حساب يوتيوب أولاً (OAuth2 / Access Token)"}

    if not os.path.exists(video_path):
        return {"success": False, "error": f"ملف الفيديو غير موجود: {video_path}"}

    file_size = os.path.getsize(video_path)

    # Prepare status block
    status_block: Dict[str, Any] = {
        "selfDeclaredMadeForKids": False,
    }
    if publish_at_iso:
        # YouTube requires scheduled videos to have privacyStatus="private" and publishAt in RFC 3339 UTC
        status_block["privacyStatus"] = "private"
        status_block["publishAt"] = publish_at_iso
    else:
        status_block["privacyStatus"] = privacy_status

    metadata = {
        "snippet": {
            "title": title[:100],
            "description": description[:5000],
            "tags": tags[:50] if tags else ["VideoPro", "Shorts"],
            "categoryId": category_id,
        },
        "status": status_block,
    }

    # Step 1: Initiate Resumable Upload
    init_url = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
    meta_bytes = json.dumps(metadata, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(init_url, data=meta_bytes, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json; charset=UTF-8")
    req.add_header("X-Upload-Content-Type", "video/mp4")
    req.add_header("X-Upload-Content-Length", str(file_size))

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            upload_url = resp.headers.get("Location")
            if not upload_url:
                return {"success": False, "error": "لم يستجب يوتيوب برابط الرفع المستأنف (Location Header Missing)"}
    except Exception as e:
        return {"success": False, "error": f"فشل بدء عملية الرفع إلى يوتيوب: {e}"}

    # Step 2: Upload Video Binary File
    try:
        with open(video_path, "rb") as fp:
            video_bytes = fp.read()

        put_req = urllib.request.Request(upload_url, data=video_bytes, method="PUT")
        put_req.add_header("Content-Type", "video/mp4")
        put_req.add_header("Content-Length", str(file_size))

        with urllib.request.urlopen(put_req, timeout=300) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            yt_id = resp_data.get("id")
            if yt_id:
                yt_url = f"https://youtu.be/{yt_id}"
                return {
                    "success": True,
                    "video_id": yt_id,
                    "url": yt_url,
                    "title": title,
                    "publish_at": publish_at_iso,
                    "privacy": "scheduled" if publish_at_iso else privacy_status,
                    "response": resp_data,
                }
            return {"success": False, "error": "لم يتم إرجاع معرف الفيديو من يوتيوب", "details": resp_data}
    except Exception as e:
        return {"success": False, "error": f"فشل أثناء رفع ملف الفيديو: {e}"}


def calculate_schedule_plan(
    clips: List[Dict[str, Any]],
    start_time_iso: str,
    interval_minutes: int,
    base_title: str,
    base_description: str,
    tags: List[str],
) -> List[Dict[str, Any]]:
    """
    Computes scheduled publishing times and video metadata for each clip.
    """
    try:
        # Parse ISO or fallback to now
        if start_time_iso.endswith("Z"):
            start_dt = datetime.datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
        else:
            start_dt = datetime.datetime.fromisoformat(start_time_iso)
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=datetime.timezone.utc)
    except Exception:
        start_dt = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15)

    plan = []
    total_clips = len(clips)

    for idx, clip in enumerate(clips):
        part_num = idx + 1
        clip_publish_dt = start_dt + datetime.timedelta(minutes=idx * interval_minutes)
        publish_at_rfc3339 = clip_publish_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

        # Format title
        clip_title = base_title
        if "{part}" in clip_title:
            clip_title = clip_title.replace("{part}", str(part_num)).replace("{total}", str(total_clips))
        else:
            clip_title = f"{base_title} | جزء {part_num}/{total_clips}"

        plan.append({
            "part": part_num,
            "total_parts": total_clips,
            "filename": clip.get("filename"),
            "path": clip.get("path") or clip.get("file_path"),
            "url": clip.get("url"),
            "duration": clip.get("duration"),
            "title": clip_title,
            "description": f"{base_description}\n\nالمقطع رقم {part_num} من أصل {total_clips}.",
            "tags": tags,
            "publish_at": publish_at_rfc3339,
            "publish_at_formatted": clip_publish_dt.strftime("%Y-%m-%d %H:%M UTC"),
            "status": "pending",
        })

    return plan
