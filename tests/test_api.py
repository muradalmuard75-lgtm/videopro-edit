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

if __name__ == "__main__":
    unittest.main()
