"""
السكريبت الثاني (Script 2): تفريغ وترجمة الفيديو وإضافة الشرح/الترجمة أسفل الفيديو وحرقها (FFmpeg ASS/SRT)
"""
from ai_subtitles import (
    generate_subtitles,
    translate_cues_list,
    self_reliant_translate,
    build_srt,
    build_vtt,
)
from video_engine import burn_subtitles_into_video

__all__ = [
    "generate_subtitles",
    "translate_cues_list",
    "self_reliant_translate",
    "build_srt",
    "build_vtt",
    "burn_subtitles_into_video",
]
