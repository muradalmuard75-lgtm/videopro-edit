import os
import sys
import json
import shutil
import subprocess
import unittest
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from app import app, UPLOADS_DIR

client = TestClient(app)


class TestVideoProSuiteV2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Create a fast 4-second test clip from sample.mp4 so all 22 tests run in a few seconds."""
        cls.sample_full = os.path.join(UPLOADS_DIR, "sample.mp4")
        cls.fast_clip_name = "fast_test_clip.mp4"
        cls.fast_clip_path = os.path.join(UPLOADS_DIR, cls.fast_clip_name)
        if os.path.exists(cls.sample_full):
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", "0", "-to", "4",
                    "-i", cls.sample_full,
                    "-c", "copy",
                    cls.fast_clip_path,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        if not os.path.exists(cls.fast_clip_path):
            shutil.copyfile(cls.sample_full, cls.fast_clip_path)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.fast_clip_path):
            try:
                os.remove(cls.fast_clip_path)
            except Exception:
                pass

    def test_health_and_version(self):
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")
        self.assertEqual(res.json()["version"], "2.0.0")

        res_v = client.get("/api/version")
        self.assertEqual(res_v.status_code, 200)
        self.assertIn("version", res_v.json())

    def test_video_info(self):
        res = client.get(f"/api/video/info?video_id={self.fast_clip_name}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("info", data)
        self.assertGreater(data["info"]["duration"], 0)

    def test_youtube_url_parsing_and_fetch(self):
        # 1. Test standard YouTube watch URL info
        res_info = client.post("/api/youtube/info", data={"url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ"})
        self.assertEqual(res_info.status_code, 200)
        info_data = res_info.json()
        self.assertTrue(info_data["success"])
        self.assertEqual(info_data["yt_id"], "aqz-KE-bpKQ")
        self.assertFalse(info_data["is_short"])

        # 2. Test YouTube Shorts URL info
        res_short_info = client.post("/api/youtube/info", data={"url": "https://www.youtube.com/shorts/5qap5aO4i9A"})
        self.assertEqual(res_short_info.status_code, 200)
        s_data = res_short_info.json()
        self.assertTrue(s_data["success"])
        self.assertEqual(s_data["yt_id"], "5qap5aO4i9A")
        self.assertTrue(s_data["is_short"])

        # 3. Test fetching YouTube video into workspace & running a studio tool on it
        res_fetch = client.post("/api/youtube/fetch", data={
            "url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
            "quality": "720p"
        })
        self.assertEqual(res_fetch.status_code, 200)
        f_data = res_fetch.json()
        self.assertTrue(f_data["success"])
        yt_vid_id = f_data["video_id"]
        self.assertTrue(yt_vid_id.endswith(".mp4"))

        # Verify studio tools work on the fetched YouTube video
        res_trim = client.post("/api/video/trim", data={
            "video_id": yt_vid_id,
            "start_sec": 0.0,
            "end_sec": 3.0,
        })
        self.assertEqual(res_trim.status_code, 200)
        self.assertTrue(res_trim.json().get("success"))

        # Clean up fetched video
        client.post("/api/video/delete", data={"video_id": yt_vid_id})

    def test_upload_endpoint(self):
        with open(self.fast_clip_path, "rb") as f:
            res = client.post("/api/upload", files={"file": ("test_upload.mp4", f, "video/mp4")})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("video_id", data)
        client.post("/api/video/delete", data={"video_id": data["video_id"]})

    def test_split_video_interval_and_scene(self):
        res = client.post("/api/video/split", data={
            "video_id": self.fast_clip_name,
            "interval_seconds": 2.0,
            "prefix": "test_split",
            "split_mode": "interval"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("chunks", data)
        self.assertIn("zip_url", data)

        res_scene = client.post("/api/video/split", data={
            "video_id": self.fast_clip_name,
            "interval_seconds": 2.0,
            "prefix": "scene_split",
            "split_mode": "scene"
        })
        self.assertEqual(res_scene.status_code, 200)
        self.assertTrue(res_scene.json().get("success"))

    def test_trim_video_range(self):
        res = client.post("/api/video/trim", data={
            "video_id": self.fast_clip_name,
            "start_sec": 0.5,
            "end_sec": 2.5
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("url", data)

    def test_subtitles_and_self_reliant_translation(self):
        res = client.post("/api/video/subtitles", data={
            "video_id": self.fast_clip_name,
            "language": "ar",
            "bilingual": "true"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("cues", data)

        # Test self-reliant translation of cues to English and French
        res_tr = client.post("/api/video/translate-cues", data={
            "cues_json": json.dumps(data["cues"]),
            "target_language": "en",
            "bilingual": "true"
        })
        self.assertEqual(res_tr.status_code, 200)
        tr_data = res_tr.json()
        self.assertTrue(tr_data.get("success"))
        self.assertGreater(len(tr_data.get("cues", [])), 0)

    def test_burn_subtitles_with_karaoke_and_bilingual(self):
        cues = [
            {"start_sec": 0.2, "end_sec": 1.8, "text": "ريلز احترافي وسريع | Fast Pro Reels"},
            {"start_sec": 1.9, "end_sec": 3.2, "text": "مع خط كايرو العريض | With Bold Cairo Font"}
        ]
        res = client.post("/api/video/burn-subtitles", data={
            "video_id": self.fast_clip_name,
            "cues_json": json.dumps(cues),
            "font_name": "Cairo",
            "font_size": 48,
            "text_color": "#facc15",
            "style_preset": "karaoke_gold",
            "karaoke_mode": "true",
            "bilingual_mode": "true"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("cues_burned"), 2)

    def test_auto_caption_and_burn(self):
        res = client.post("/api/video/auto-caption-and-burn", data={
            "video_id": self.fast_clip_name,
            "target_language": "ar",
            "font_name": "Amiri",
            "font_size": 36,
            "text_color": "#facc15",
            "position": "bottom"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("url", data)

    def test_speed_and_boomerang(self):
        res = client.post("/api/video/speed", data={
            "video_id": self.fast_clip_name,
            "speed": 1.5,
            "reverse": "false",
            "boomerang": "false"
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json().get("success"))

    def test_enhance_voice_studio(self):
        res = client.post("/api/video/enhance-voice", data={
            "video_id": self.fast_clip_name,
            "denoise_strength": "medium",
            "podcast_boost": "true",
            "normalize_lufs": "true"
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json().get("success"))

    def test_social_publish_kit(self):
        res = client.post("/api/video/publish-kit", data={
            "video_id": self.fast_clip_name,
            "platform": "youtube_shorts",
            "custom_topic": "تحرير الفيديو الذكي وتقطيع الشورتس"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("video_url", data)
        self.assertIn("thumbnail_url", data)
        self.assertGreaterEqual(len(data.get("viral_titles", [])), 3)
        self.assertIn("seo_description", data)
        self.assertIn("hashtags_text", data)

    def test_add_audio_merge_and_text(self):
        res_audio = client.post("/api/video/add-audio", data={
            "video_id": self.fast_clip_name,
            "preset": "upbeat",
            "video_volume": 1.0,
            "music_volume": 0.5,
        })
        self.assertEqual(res_audio.status_code, 200)
        self.assertTrue(res_audio.json().get("success"))

        res_merge = client.post("/api/video/merge", data={
            "video_id": self.fast_clip_name,
            "extra_clips": self.fast_clip_name
        })
        self.assertEqual(res_merge.status_code, 200)
        self.assertTrue(res_merge.json().get("success"))

        res_text = client.post("/api/video/add-text", data={
            "video_id": self.fast_clip_name,
            "text": "اختبار النص",
            "font_size": 32,
            "font_color": "yellow",
            "position": "bottom"
        })
        self.assertEqual(res_text.status_code, 200)
        self.assertTrue(res_text.json().get("success"))

    def test_export_and_delete(self):
        res = client.post("/api/video/export", data={
            "video_id": self.fast_clip_name,
            "resolution": "480p",
            "format_type": "mp4"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        exported_vid_id = data.get("video_id")

        res_del = client.post("/api/video/delete", data={"video_id": exported_vid_id})
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.json().get("deleted"))


if __name__ == "__main__":
    unittest.main()
