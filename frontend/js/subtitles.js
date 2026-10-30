/**
 * VideoPro Edit - Automated Server-Side Audio Captioning & Subtitle Engine
 * 1. Automatically extracts audio track from video on the server.
 * 2. Transcribes speech (Arabic/English) with precise timestamps.
 * 3. Translates foreign speech to Arabic.
 * 4. Burns/hardcodes Arabic subtitles permanently into the MP4 frames.
 */
class SubtitlesManager {
  constructor() {
    this.modal = document.getElementById("subtitles-modal");
    this.subtitlesOverlay = document.getElementById("player-subtitles-overlay");
    this.cues = [];
    this.activeCueIndex = -1;
    this.styling = {
      fontFamily: "Amiri",
      fontSize: 38,
      textColor: "#facc15",
      position: "bottom",
    };

    this.init();
  }

  init() {
    const btn = document.getElementById("tool-subtitles-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-subtitles-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    // 1. MAIN ONE-CLICK BUTTON: Auto-Caption & Burn Directly into Video
    const autoCaptionBtn = document.getElementById("auto-caption-and-burn-btn");
    if (autoCaptionBtn) {
      autoCaptionBtn.addEventListener("click", () => this.autoCaptionAndBurn());
    }

    // 2. Extract Cues Only (for manual inspection/editing before burning)
    const extractCuesBtn = document.getElementById("extract-cues-only-btn");
    if (extractCuesBtn) {
      extractCuesBtn.addEventListener("click", () => this.extractCuesOnly());
    }

    // 3. Add Manual Cue
    const addCueBtn = document.getElementById("add-manual-cue-btn");
    if (addCueBtn) {
      addCueBtn.addEventListener("click", () => this.addManualCue());
    }

    // 4. Preview Overlay on Screen
    const previewBtn = document.getElementById("preview-subtitles-overlay-btn");
    if (previewBtn) {
      previewBtn.addEventListener("click", () => {
        this.closeModal();
        const video = document.getElementById("main-video");
        if (video) {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
        if (window.timelineInstance) {
          window.timelineInstance.showToast("👁️ يتم الآن تشغيل الفيديو مع عرض الترجمة على الشاشة");
        }
      });
    }

    // Styling listeners
    const fontSelect = document.getElementById("sub-font-select");
    if (fontSelect) {
      fontSelect.addEventListener("change", (e) => {
        this.styling.fontFamily = e.target.value;
        this.applySubtitleStyling();
      });
    }

    const posSelect = document.getElementById("sub-pos-select");
    if (posSelect) {
      posSelect.addEventListener("change", (e) => {
        this.styling.position = e.target.value;
        this.applySubtitleStyling();
      });
    }

    const colorPicker = document.getElementById("sub-color-picker");
    if (colorPicker) {
      colorPicker.addEventListener("input", (e) => {
        this.styling.textColor = e.target.value;
        this.applySubtitleStyling();
      });
    }

    const sizeRange = document.getElementById("sub-size-range");
    const sizeVal = document.getElementById("sub-size-val");
    if (sizeRange) {
      sizeRange.addEventListener("input", (e) => {
        this.styling.fontSize = parseInt(e.target.value, 10) || 38;
        if (sizeVal) sizeVal.innerText = this.styling.fontSize;
        this.applySubtitleStyling();
      });
    }

    // Video timeupdate sync for overlay captions
    const video = document.getElementById("main-video");
    if (video) {
      video.addEventListener("timeupdate", () => {
        this.renderActiveSubtitle(video.currentTime);
      });
    }

    window.subtitlesInstance = this;
  }

  openModal() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً لتوليد الترجمة التلقائية");
      }
      document.getElementById("video-file-input")?.click();
      return;
    }
    if (!this.modal) return;
    this.modal.classList.remove("hidden");
    this.modal.classList.add("flex");
    this.renderCuesList();
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  applySubtitleStyling() {
    if (!this.subtitlesOverlay) return;
    this.subtitlesOverlay.style.fontFamily = this.styling.fontFamily.includes("Amiri") ? "'Amiri', serif" : this.styling.fontFamily;
    this.subtitlesOverlay.style.fontSize = `${Math.round(this.styling.fontSize * 0.75)}px`;
    this.subtitlesOverlay.style.color = this.styling.textColor;
    this.subtitlesOverlay.style.textShadow = "0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)";

    if (this.styling.position === "top") {
      this.subtitlesOverlay.style.top = "10%";
      this.subtitlesOverlay.style.bottom = "auto";
    } else if (this.styling.position === "middle") {
      this.subtitlesOverlay.style.top = "45%";
      this.subtitlesOverlay.style.bottom = "auto";
    } else {
      this.subtitlesOverlay.style.top = "auto";
      this.subtitlesOverlay.style.bottom = "12%";
    }
  }

  renderActiveSubtitle(currentTime) {
    if (!this.subtitlesOverlay || this.cues.length === 0) return;

    const activeCue = this.cues.find((c) => currentTime >= c.start_sec && currentTime <= c.end_sec);
    if (activeCue && activeCue.text.trim()) {
      this.subtitlesOverlay.innerText = activeCue.text;
      this.subtitlesOverlay.classList.remove("hidden");
      this.subtitlesOverlay.classList.add("flex");
    } else {
      this.subtitlesOverlay.innerText = "";
      this.subtitlesOverlay.classList.add("hidden");
      this.subtitlesOverlay.classList.remove("flex");
    }
  }

  /**
   * Automated All-in-One:
   * 1. Extracts audio track directly on server.
   * 2. Reads & translates speech into Arabic.
   * 3. Burns Arabic captions directly into the MP4 frames.
   */
  async autoCaptionAndBurn() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً");
      return;
    }

    const vidId = window.currentVideoId;
    const fontName = this.styling.fontFamily || "Amiri";
    const fontSize = this.styling.fontSize || 38;
    const textColor = this.styling.textColor || "#facc15";
    const position = this.styling.position || "bottom";

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "autocaption",
        title: "سحب الصوت وترجمته وكتابته داخل الفيديو 🎬",
        icon: "🎙️",
        dismissModalId: "subtitles-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("target_language", "ar");
          formData.append("font_name", fontName);
          formData.append("font_size", fontSize);
          formData.append("text_color", textColor);
          formData.append("position", position);

          const resp = await fetch("/api/video/auto-caption-and-burn", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) {
            throw new Error(data.detail || data.error || "فشل استخراج الصوت وكتابة الترجمة");
          }
          return data;
        },
        onSuccess: (data) => {
          // Load new subtitled video into player
          if (window.playerInstance && data.url) {
            window.playerInstance.loadVideo(data.url, data.video_id);
          }
          // Update cues and timeline track
          this.cues = data.cues || [];
          this.renderCuesList();
          this.updateTimelineSubtitleBlocks();

          // Hide text overlay since subtitles are now permanently burned inside the video
          if (this.subtitlesOverlay) {
            this.subtitlesOverlay.classList.add("hidden");
            this.subtitlesOverlay.innerText = "";
          }

          if (window.timelineInstance) {
            window.timelineInstance.showToast("🎉 تم سحب الصوت وكتابة الترجمة داخل الفيديو بنجاح!");
          }
        },
      });
    }
  }

  /**
   * Extract Cues Only (without burning yet) for inspection or editing
   */
  async extractCuesOnly() {
    if (!window.currentVideoId) return;
    const vidId = window.currentVideoId;
    const statusText = document.getElementById("subtitles-status-text");

    if (statusText) statusText.innerText = "⏳ جاري سحب مقطع الصوت واستخراج نصوص الكلام...";

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("language", "ar");

      const resp = await fetch("/api/video/subtitles", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "لم يتم رصد كلام واضح في مقطع الصوت");
      }

      this.cues = data.cues || [];
      this.renderCuesList();
      this.updateTimelineSubtitleBlocks();
      if (statusText) statusText.innerText = `✅ تم استخراج ${this.cues.length} سطر كلام بنجاح! اضغط الزر الرئيسي بالأعلى لحرقها داخل الفيديو.`;
    } catch (err) {
      if (statusText) statusText.innerText = `⚠️ ${err.message}`;
    }
  }

  addManualCue() {
    const video = document.getElementById("main-video");
    const currentSec = (video && video.currentTime > 0) ? video.currentTime : 0.0;
    const startSec = parseFloat(currentSec.toFixed(2));
    const endSec = parseFloat((currentSec + 3.0).toFixed(2));

    this.cues.push({
      id: this.cues.length + 1,
      start_sec: startSec,
      end_sec: endSec,
      start: this.formatTimecode(startSec),
      end: this.formatTimecode(endSec),
      text: "اكتب النص هنا...",
    });

    this.renderCuesList();
    this.updateTimelineSubtitleBlocks();
  }

  removeCue(idx) {
    if (this.cues[idx]) {
      this.cues.splice(idx, 1);
      this.renderCuesList();
      this.updateTimelineSubtitleBlocks();
    }
  }

  renderCuesList() {
    const cuesList = document.getElementById("subtitles-cues-list");
    if (!cuesList) return;

    if (this.cues.length === 0) {
      cuesList.innerHTML = `
        <div class="text-center text-gray-500 text-xs py-3">
          اضغط الزر الرئيسي بالأعلى ليقوم السيرفر بسحب الصوت وترجمته وحرقه بالفيديو مباشرة!
        </div>
      `;
      return;
    }

    cuesList.innerHTML = "";
    this.cues.forEach((cue, idx) => {
      const item = document.createElement("div");
      item.className = "p-2 rounded-lg bg-gray-900 border border-gray-800 text-xs flex flex-col gap-1 transition hover:border-purple-500/50";
      item.innerHTML = `
        <div class="flex items-center justify-between text-gray-400 font-mono text-[11px]">
          <span class="text-purple-400 font-bold">#${idx + 1}</span>
          <div class="flex items-center gap-2">
            <span>${cue.start} ➜ ${cue.end}</span>
            <button type="button" class="text-red-400 hover:text-red-300 text-sm px-1" title="حذف" onclick="window.subtitlesInstance.removeCue(${idx})">🗑️</button>
          </div>
        </div>
        <input type="text" value="${cue.text.replace(/"/g, '&quot;')}" class="w-full bg-black/60 border border-gray-700/80 rounded px-2.5 py-1 text-gray-100 font-medium text-xs focus:border-purple-500 focus:outline-none" oninput="window.updateCueText(${idx}, this.value)" />
      `;
      cuesList.appendChild(item);
    });

    const dlSrt = document.getElementById("download-srt-btn");
    if (dlSrt) {
      const srtText = this.buildSrtClient(this.cues);
      const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
      dlSrt.href = URL.createObjectURL(blob);
      dlSrt.classList.remove("hidden");
    }
  }

  buildSrtClient(cues) {
    const lines = [];
    cues.forEach((cue, i) => {
      const start = cue.start.replace(".", ",");
      const end = cue.end.replace(".", ",");
      lines.push(`${i + 1}\n${start} --> ${end}\n${cue.text}\n`);
    });
    return lines.join("\n");
  }

  formatTimecode(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  updateTimelineSubtitleBlocks() {
    const track = document.getElementById("subtitles-timeline-track");
    if (!track) return;
    track.innerHTML = "";

    const video = document.getElementById("main-video");
    const totalDuration = (video && video.duration > 0) ? video.duration : (window.timelineInstance?.duration || 60);

    this.cues.forEach((cue) => {
      const leftPct = (cue.start_sec / totalDuration) * 100;
      const widthPct = Math.max(4, ((cue.end_sec - cue.start_sec) / totalDuration) * 100);

      const block = document.createElement("div");
      block.className = "subtitle-block";
      block.style.left = `${leftPct}%`;
      block.style.width = `${widthPct}%`;
      block.innerText = cue.text;
      block.title = `${cue.start} - ${cue.end}: ${cue.text}`;
      block.addEventListener("click", () => {
        if (video) video.currentTime = cue.start_sec;
      });
      track.appendChild(block);
    });
  }
}

window.SubtitlesManager = SubtitlesManager;
window.updateCueText = function(idx, text) {
  if (window.subtitlesInstance && window.subtitlesInstance.cues[idx]) {
    window.subtitlesInstance.cues[idx].text = text;
  }
};
