import os
import sys
import unittest
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from app import app

client = TestClient(app)

class TestVideoProSuite(unittest.TestCase):
    def test_health_and_version(self):
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")

        res_v = client.get("/api/version")
        self.assertEqual(res_v.status_code, 200)
        self.assertIn("version", res_v.json())

    def test_video_info(self):
        res = client.get("/api/video/info?video_id=sample")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("info", data)
        self.assertGreater(data["info"]["duration"], 0)

    def test_upload_endpoint(self):
        sample_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "uploads", "sample.mp4")
        with open(sample_path, "rb") as f:
            res = client.post("/api/upload", files={"file": ("test_upload.mp4", f, "video/mp4")})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("video_id", data)

    def test_add_audio(self):
        res = client.post("/api/video/add-audio", data={
            "video_id": "sample",
            "preset": "upbeat",
            "video_volume": 1.0,
            "music_volume": 0.5,
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("url", data)

    def test_merge_clips(self):
        res = client.post("/api/video/merge", data={
            "video_id": "sample",
            "extra_clips": "sample"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("url", data)

    def test_add_text(self):
        res = client.post("/api/video/add-text", data={
            "video_id": "sample",
            "text": "اختبار النص",
            "font_size": 32,
            "font_color": "yellow",
            "position": "bottom"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("url", data)

    def test_split_video(self):
        res = client.post("/api/video/split", data={
            "video_id": "sample",
            "interval_seconds": 30.0,
            "prefix": "test_split"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("chunks", data)
        self.assertIn("zip_url", data)

    def test_subtitles(self):
        res = client.post("/api/video/subtitles", data={
            "video_id": "sample",
            "language": "ar"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("cues", data)

    def test_burn_subtitles(self):
        import json
        cues = [
            {"start_sec": 0.5, "end_sec": 2.5, "text": "تجربة حرق الترجمة داخل الفيديو"}
        ]
        res = client.post("/api/video/burn-subtitles", data={
            "video_id": "sample",
            "cues_json": json.dumps(cues),
            "font_name": "Amiri",
            "font_size": 36,
            "text_color": "#facc15",
            "position": "bottom"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("url", data)
        self.assertIn("filename", data)

    def test_auto_caption_and_burn(self):
        res = client.post("/api/video/auto-caption-and-burn", data={
            "video_id": "sample",
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
        self.assertIn("cues", data)

    def test_reels_chunking_and_ass_presets(self):
        from ai_subtitles import chunk_cues_for_reels, build_ass
        cues = [
            {
                "id": 1,
                "start_sec": 0.0,
                "end_sec": 4.0,
                "text": "هذا اختبار تجريبي لتقطيع جمل التيك توك والريلز الطويلة باحترافية"
            }
        ]
        chunked = chunk_cues_for_reels(cues, max_words_per_cue=3)
        self.assertGreater(len(chunked), 1)
        for c in chunked:
            self.assertLessEqual(len(c["text"].split()), 3)
            self.assertGreaterEqual(c["end_sec"], c["start_sec"])

        # Test build_ass with tiktok_yellow
        ass_yellow = build_ass(chunked, style_preset="tiktok_yellow", font_name="Cairo")
        self.assertIn("[Script Info]", ass_yellow)
        self.assertIn("VideoProReels", ass_yellow)
        self.assertIn("Cairo", ass_yellow)
        self.assertIn("&H0015ccfa", ass_yellow)

        # Test build_ass with tiktok_box (BorderStyle=3)
        ass_box = build_ass(chunked, style_preset="tiktok_box", font_name="Cairo")
        self.assertIn(",3,", ass_box) # BorderStyle=3
        self.assertIn("&H00ffffff", ass_box)

        # Test build_ass with classic_white and Amiri
        ass_amiri = build_ass(chunked, style_preset="classic_white", font_name="Amiri")
        self.assertIn("Amiri", ass_amiri)
        self.assertIn("&H00ffffff", ass_amiri)

        # Test boundary timestamps
        from ai_subtitles import format_timecode
        tc = format_timecode(59.999)
        self.assertEqual(tc, "00:01:00.000")
        self.assertNotIn("60", tc)

    def test_burn_subtitles_with_tiktok_reels_styling(self):
        import json
        cues = [
            {"start_sec": 0.2, "end_sec": 1.8, "text": "ريلز احترافي وسريع"},
            {"start_sec": 1.9, "end_sec": 3.2, "text": "مع خط كايرو العريض"}
        ]
        res = client.post("/api/video/burn-subtitles", data={
            "video_id": "sample",
            "cues_json": json.dumps(cues),
            "font_name": "Cairo",
            "font_size": 48,
            "text_color": "#facc15",
            "outline_color": "#000000",
            "outline_width": 3.5,
            "border_style": 1,
            "position": "bottom",
            "style_preset": "tiktok_yellow",
            "pop_animation": "true",
            "chunk_for_reels": "false"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("cues_burned"), 2)
        self.assertIn("url", data)

    def test_export_video(self):
        res = client.post("/api/video/export", data={
            "video_id": "sample",
            "resolution": "480p",
            "format_type": "mp4",
            "brightness": 0.0,
            "contrast": 1.0,
            "saturation": 1.0
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("url", data)

    def test_delete_video(self):
        res = client.post("/api/video/delete", data={"video_id": "sample"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json().get("success"))

        res_del = client.delete("/api/video/delete?video_id=non_existent_12345")
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.json().get("success"))

    def test_export_resolution_and_cleanup(self):
        # 1. Export a small 480p clip
        res = client.post("/api/video/export", data={
            "video_id": "sample",
            "resolution": "480p",
            "format_type": "mp4"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        exported_vid_id = data.get("video_id")
        self.assertIsNotNone(exported_vid_id)

        # 2. Verify resolve_video_path finds it in EXPORTS_DIR
        res_info = client.get(f"/api/video/info?video_id={exported_vid_id}")
        self.assertEqual(res_info.status_code, 200)
        self.assertIn("info", res_info.json())

        # 3. Delete it via /api/video/delete
        res_del = client.post("/api/video/delete", data={"video_id": exported_vid_id})
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.json().get("success"))
        self.assertTrue(res_del.json().get("deleted"))

if __name__ == "__main__":
    unittest.main()
