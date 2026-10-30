/**
 * VideoPro Edit - Subtitles & Multilingual Translation Engine
 * Handles Speech-to-text, real-time styling (font, color, highlight, position), and export
 */
class SubtitlesManager {
  constructor() {
    this.modal = document.getElementById("subtitles-modal");
    this.subtitlesOverlay = document.getElementById("player-subtitles-overlay");
    this.cues = [];
    this.activeCueIndex = -1;
    this.styling = {
      fontFamily: "'Cairo', sans-serif",
      fontSize: "20px",
      textColor: "#facc15", // vibrant yellow (standard viral caption style)
      bgColor: "rgba(0, 0, 0, 0.75)",
      bottomPos: "12%",
    };

    this.init();
  }

  init() {
    const btn = document.getElementById("tool-subtitles-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-subtitles-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    // Generate Subtitles Button
    const genBtn = document.getElementById("generate-subtitles-btn");
    if (genBtn) genBtn.addEventListener("click", () => this.generateAutoSubtitles());

    // Font styling listeners
    const fontSelect = document.getElementById("sub-font-select");
    if (fontSelect) {
      fontSelect.addEventListener("change", (e) => {
        this.styling.fontFamily = e.target.value;
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
    if (sizeRange) {
      sizeRange.addEventListener("input", (e) => {
        this.styling.fontSize = `${e.target.value}px`;
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
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  applySubtitleStyling() {
    if (!this.subtitlesOverlay) return;
    this.subtitlesOverlay.style.fontFamily = this.styling.fontFamily;
    this.subtitlesOverlay.style.fontSize = this.styling.fontSize;
    this.subtitlesOverlay.style.color = this.styling.textColor;
    this.subtitlesOverlay.style.bottom = this.styling.bottomPos;
  }

  renderActiveSubtitle(currentTime) {
    if (!this.subtitlesOverlay || this.cues.length === 0) return;

    const activeCue = this.cues.find((c) => currentTime >= c.start_sec && currentTime <= c.end_sec);
    if (activeCue) {
      this.subtitlesOverlay.innerText = activeCue.text;
      this.subtitlesOverlay.classList.remove("hidden");
    } else {
      this.subtitlesOverlay.innerText = "";
      this.subtitlesOverlay.classList.add("hidden");
    }
  }

  async generateAutoSubtitles() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً للبدء");
      this.closeModal();
      document.getElementById("video-file-input")?.click();
      return;
    }

    const langSelect = document.getElementById("sub-lang-select");
    const targetLang = langSelect ? langSelect.value : "ar";
    const vidId = window.currentVideoId;

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "subtitles",
        title: `توليد ترجمة فورية تلقائية (${targetLang === "ar" ? "العربية" : targetLang})`,
        icon: "📝",
        dismissModalId: "subtitles-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("language", targetLang);

          const resp = await fetch("/api/video/subtitles", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) throw new Error(data.error || "فشل توليد الترجمة");
          return data;
        },
        onSuccess: (data) => {
          this.cues = data.cues || [];
          this.updateTimelineSubtitleBlocks();
        },
      });
      return;
    }

    const statusText = document.getElementById("subtitles-status-text");
    const cuesList = document.getElementById("subtitles-cues-list");

    if (statusText) statusText.innerText = "جاري تحويل الصوت إلى نص وتوليد الترجمة بدقة عالية...";

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("language", targetLang);

      const resp = await fetch("/api/video/subtitles", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "فشل توليد الترجمة");

      this.cues = data.cues || [];
      if (statusText) statusText.innerText = `تم توليد ${this.cues.length} سطور ترجمة بتوقيت دقيق!`;

      // Render cues in modal
      if (cuesList) {
        cuesList.innerHTML = "";
        this.cues.forEach((cue, idx) => {
          const item = document.createElement("div");
          item.className = "p-3 rounded-lg bg-gray-900 border border-gray-800 text-xs flex flex-col gap-1.5";
          item.innerHTML = `
            <div class="flex items-center justify-between text-gray-400 font-mono text-[11px]">
              <span class="text-purple-400 font-bold">#${idx + 1}</span>
              <span>${cue.start} ➜ ${cue.end}</span>
            </div>
            <input type="text" value="${cue.text}" class="w-full bg-black/40 border border-gray-700/60 rounded px-2.5 py-1 text-gray-100 font-medium text-xs focus:border-purple-500 focus:outline-none" oninput="window.updateCueText(${idx}, this.value)" />
          `;
          cuesList.appendChild(item);
        });
      }

      // Download buttons
      const dlSrt = document.getElementById("download-srt-btn");
      if (dlSrt && data.srt) {
        const blob = new Blob([data.srt], { type: "text/plain;charset=utf-8" });
        dlSrt.href = URL.createObjectURL(blob);
        dlSrt.classList.remove("hidden");
      }

      // Update timeline track blocks
      this.updateTimelineSubtitleBlocks();
    } catch (err) {
      if (statusText) statusText.innerText = `خطأ: ${err.message}`;
    }
  }

  updateTimelineSubtitleBlocks() {
    const track = document.getElementById("subtitles-timeline-track");
    if (!track) return;
    track.innerHTML = "";

    const video = document.getElementById("main-video");
    const totalDuration = (video && video.duration > 0) ? video.duration : 84;

    this.cues.forEach((cue) => {
      const leftPct = (cue.start_sec / totalDuration) * 100;
      const widthPct = Math.max(5, ((cue.end_sec - cue.start_sec) / totalDuration) * 100);

      const block = document.createElement("div");
      block.className = "subtitle-block";
      block.style.left = `${leftPct}%`;
      block.style.width = `${widthPct}%`;
      block.innerText = cue.text;
      block.title = `${cue.start} - ${cue.end}`;
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
