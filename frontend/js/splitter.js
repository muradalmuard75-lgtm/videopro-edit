/**
 * VideoPro Edit v2.0 - Smart Video Splitter, AI Scene Cutter & Precision Range Trimmer
 * Works seamlessly on both uploaded MP4 files and downloaded YouTube / Shorts videos.
 */
class VideoSplitter {
  constructor() {
    this.modal = document.getElementById("splitter-modal");
    this.selectedInterval = 60;
    this.splitMode = "interval"; // 'interval' | 'scene' | 'trim'
    this.videoDuration = 0;
    this.currentVideoId = null;
    this.isProcessing = false;

    this.init();
  }

  init() {
    this.setupListeners();
  }

  setupListeners() {
    const triggerBtn = document.getElementById("tool-split-btn");
    const timelineSplitBtn = document.getElementById("timeline-split-btn");

    if (triggerBtn) triggerBtn.addEventListener("click", () => this.openModal());
    if (timelineSplitBtn) timelineSplitBtn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-splitter-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    const modeTabs = document.querySelectorAll(".split-mode-tab");
    modeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        modeTabs.forEach((t) => {
          t.classList.remove("bg-purple-600", "text-white", "font-bold");
          t.classList.add("text-gray-400");
        });
        tab.classList.add("bg-purple-600", "text-white", "font-bold");
        tab.classList.remove("text-gray-400");
        this.splitMode = tab.dataset.mode || "interval";
        this.updateModeUI();
      });
    });

    const intervalButtons = document.querySelectorAll(".split-interval-btn");
    intervalButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        intervalButtons.forEach((b) =>
          b.classList.remove("active", "border-purple-500", "bg-purple-900/40")
        );
        btn.classList.add("active", "border-purple-500", "bg-purple-900/40");
        const val = btn.dataset.interval;
        if (val === "custom") {
          document.getElementById("custom-interval-container")?.classList.remove("hidden");
        } else {
          document.getElementById("custom-interval-container")?.classList.add("hidden");
          this.selectedInterval = parseFloat(val);
          this.updateCalculationPreview();
        }
      });
    });

    const customInput = document.getElementById("custom-interval-input");
    if (customInput) {
      customInput.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (val && val > 0) {
          this.selectedInterval = val;
          this.updateCalculationPreview();
        }
      });
    }

    document.getElementById("trim-set-start-btn")?.addEventListener("click", () => {
      const cur = window.videoPlayerInstance ? window.videoPlayerInstance.getCurrentTime() : 0;
      const startInput = document.getElementById("trim-start-input");
      if (startInput) startInput.value = cur.toFixed(1);
    });
    document.getElementById("trim-set-end-btn")?.addEventListener("click", () => {
      const cur = window.videoPlayerInstance ? window.videoPlayerInstance.getCurrentTime() : 30;
      const endInput = document.getElementById("trim-end-input");
      if (endInput) endInput.value = Math.max(1, cur).toFixed(1);
    });

    const runBtn = document.getElementById("execute-split-btn");
    if (runBtn) {
      runBtn.addEventListener("click", () => this.runSplitting());
    }

    document.getElementById("open-scheduler-from-split-btn")?.addEventListener("click", () => {
      if (this.lastSplitData && this.lastSplitData.chunks && window.youtubeScheduler) {
        window.youtubeScheduler.openWithClips(this.lastSplitData.chunks, window.currentVideoMeta?.title || "");
      } else if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ الرجاء تقطيع الفيديو أولاً لجدولة المقاطع الناتجة.");
      }
    });
  }

  updateModeUI() {
    const intervalSection = document.getElementById("split-interval-section");
    const sceneSection = document.getElementById("split-scene-section");
    const trimSection = document.getElementById("split-trim-section");
    const previewSummary = document.getElementById("split-preview-summary");
    const previewList = document.getElementById("split-preview-list");
    const runBtnText = document.getElementById("execute-split-btn-text");

    intervalSection?.classList.add("hidden");
    sceneSection?.classList.add("hidden");
    trimSection?.classList.add("hidden");

    if (this.splitMode === "scene") {
      sceneSection?.classList.remove("hidden");
      previewSummary?.classList.remove("hidden");
      previewList?.classList.remove("hidden");
      if (runBtnText) runBtnText.innerText = "بدء التقطيع الذكي حسب المشاهد (AI Scene Split)";
      this.updateCalculationPreview();
    } else if (this.splitMode === "trim") {
      trimSection?.classList.remove("hidden");
      previewSummary?.classList.add("hidden");
      previewList?.classList.add("hidden");
      if (runBtnText) runBtnText.innerText = "قص واستخراج المقطع المحدد فوراً";
    } else {
      intervalSection?.classList.remove("hidden");
      previewSummary?.classList.remove("hidden");
      previewList?.classList.remove("hidden");
      if (runBtnText) runBtnText.innerText = "بدء تقطيع الفيديو فوراً";
      this.updateCalculationPreview();
    }
  }

  openModal() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أو جلب فيديو من يوتيوب أولاً قبل التقطيع");
      }
      document.getElementById("youtube-url-input")?.focus();
      return;
    }
    if (!this.modal) return;
    this.videoDuration =
      window.videoPlayerInstance?.getDuration() || window.timelineInstance?.duration || 60;
    this.currentVideoId = window.currentVideoId;

    const endInput = document.getElementById("trim-end-input");
    if (endInput) endInput.value = Math.min(30, Math.round(this.videoDuration)).toString();

    this.updateCalculationPreview();
    this.modal.classList.remove("hidden");
    this.modal.classList.add("flex");
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  updateCalculationPreview() {
    const countEl = document.getElementById("split-parts-count");
    const durEl = document.getElementById("split-video-duration");
    const listEl = document.getElementById("split-preview-list");

    const totalSeconds = this.videoDuration || 60;
    const interval = this.selectedInterval || 60;
    const partsCount =
      this.splitMode === "scene"
        ? Math.max(2, Math.ceil(totalSeconds / 25))
        : Math.max(1, Math.ceil(totalSeconds / interval));

    if (countEl) {
      countEl.innerText =
        this.splitMode === "scene" ? `~${partsCount} مشاهد ذكية` : `${partsCount} مقاطع`;
    }
    if (durEl) durEl.innerText = this.formatTime(totalSeconds);

    if (listEl) {
      listEl.innerHTML = "";
      const step = this.splitMode === "scene" ? totalSeconds / partsCount : interval;
      for (let i = 0; i < partsCount; i++) {
        const start = i * step;
        const end = Math.min(totalSeconds, (i + 1) * step);
        const card = document.createElement("div");
        card.className =
          "flex items-center justify-between p-2.5 rounded-lg bg-[#141b2b] border border-gray-800 text-xs";
        card.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded bg-purple-600/30 text-purple-400 font-bold flex items-center justify-center">${i + 1}</span>
            <span class="font-medium text-gray-200">${this.splitMode === "scene" ? "المشهد الذكي" : "المقطع"} رقم ${i + 1}</span>
          </div>
          <div class="flex items-center gap-3 text-gray-400">
            <span class="font-mono bg-black/40 px-2 py-0.5 rounded text-purple-300">${this.formatTime(start)} ➜ ${this.formatTime(end)}</span>
            <span class="text-[11px]">(${Math.round(end - start)} ثانية)</span>
          </div>
        `;
        listEl.appendChild(card);
      }
    }
  }

  async runSplitting() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً");
      this.closeModal();
      return;
    }

    const vidId = window.currentVideoId;
    const reencode = document.getElementById("split-reencode-toggle")?.checked || false;

    if (this.splitMode === "trim") {
      const startSec = parseFloat(document.getElementById("trim-start-input")?.value || "0");
      const endSec = parseFloat(document.getElementById("trim-end-input")?.value || "30");
      if (endSec <= startSec) {
        if (window.timelineInstance) {
          window.timelineInstance.showToast("⚠️ وقت النهاية يجب أن يكون أكبر من وقت البداية");
        }
        return;
      }

      if (window.tasksManager) {
        await window.tasksManager.runBackgroundTask({
          type: "trim",
          title: `قص دقيق للفيديو (${this.formatTime(startSec)} ➜ ${this.formatTime(endSec)})`,
          icon: "✂️",
          dismissModalId: null,
          apiCall: async () => {
            const fd = new FormData();
            fd.append("video_id", vidId);
            fd.append("start_sec", startSec.toString());
            fd.append("end_sec", endSec.toString());
            fd.append("reencode", reencode ? "true" : "false");

            const resp = await fetch("/api/video/trim", { method: "POST", body: fd });
            const data = await resp.json();
            if (!resp.ok || data.error) throw new Error(data.error || "فشل قص المقطع");
            return data;
          },
          onSuccess: (data) => {
            window.previewChunk(data.url, `المقطع المقصوص (${this.formatTime(startSec)} - ${this.formatTime(endSec)})`, startSec, endSec);
            this.closeModal();
          },
        });
        return;
      }
    }

    const interval = this.selectedInterval;
    const mode = this.splitMode === "scene" ? "scene" : "interval";
    const taskTitle =
      mode === "scene"
        ? "تقطيع ذكي للفيديو حسب المشاهد (AI Scene Split)"
        : `تقطيع الفيديو إلى فواصل (${interval} ثانية)`;

    if (window.tasksManager) {
      await window.tasksManager.runBackgroundTask({
        type: "split",
        title: taskTitle,
        icon: "✂️",
        dismissModalId: null,
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("interval_seconds", interval.toString());
          formData.append("prefix", "clip");
          formData.append("split_mode", mode);
          formData.append("reencode", reencode ? "true" : "false");

          const response = await fetch("/api/video/split", {
            method: "POST",
            body: formData,
          });
          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error || "فشل تقطيع الفيديو");
          return data;
        },
        onSuccess: (data) => {
          this.renderResults(data);
          // Also place cut markers on timeline filmstrip!
          if (window.timelineInstance && data.chunks) {
            window.timelineInstance.cutPoints = data.chunks.map((c) => c.start);
            window.timelineInstance.renderFilmstrip();
          }
        },
      });
    }
  }

  renderResults(data) {
    this.lastSplitData = data;
    const resultsContainer = document.getElementById("split-results-container");
    const zipBtn = document.getElementById("download-zip-btn");
    const clipsContainer = document.getElementById("download-clips-list");

    if (!resultsContainer) return;
    resultsContainer.classList.remove("hidden");

    if (zipBtn && data.zip_url) {
      zipBtn.href = data.zip_url;
      zipBtn.innerHTML = `📥 تحميل جميع المقاطع في ملف مضغوط ZIP (${data.zip_size_mb || "4.2"} MB)`;
    }

    if (clipsContainer && data.chunks) {
      clipsContainer.innerHTML = "";
      data.chunks.forEach((chunk) => {
        const item = document.createElement("div");
        item.className =
          "flex items-center justify-between p-2.5 rounded-lg bg-gray-900/90 border border-purple-500/40 text-xs";
        item.innerHTML = `
          <div class="flex items-center gap-2.5">
            <span class="w-6 h-6 rounded-full bg-purple-700 text-white font-bold flex items-center justify-center text-xs">${chunk.part}</span>
            <div>
              <div class="font-bold text-gray-100">${chunk.filename}</div>
              <div class="text-[11px] text-purple-300 font-mono">${chunk.formatted_range} (${chunk.duration}s • ${chunk.size_mb} MB)</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="window.previewChunk('${chunk.url || ""}', 'المقطع #${chunk.part} (${chunk.formatted_range})', ${chunk.start}, ${chunk.end})" class="px-2.5 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white font-bold transition cursor-pointer">▶ معاينة المقطع</button>
            <a href="${chunk.url || "#"}" download="${chunk.filename}" class="px-2.5 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition">⬇ تنزيل</a>
          </div>
        `;
        clipsContainer.appendChild(item);
      });
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

window.VideoSplitter = VideoSplitter;
window.previewChunk = function (url, partTitle, startSec, endSec) {
  const player = window.videoPlayerInstance;
  const timeline = window.timelineInstance;
  const video = document.getElementById("main-video");

  if (player) {
    player.hideEmptyState();
    if (
      player.isSynthesizedPlatformStream ||
      (startSec !== undefined && endSec !== undefined && (!url || url.startsWith("blob:")))
    ) {
      player.previewSegmentBounds =
        startSec !== undefined && endSec !== undefined
          ? { start: Number(startSec), end: Number(endSec) }
          : null;
      if (startSec !== undefined) {
        player.seekTo(Number(startSec));
      }
      if (!player.isPlaying) {
        player.togglePlay();
      }
    } else if (video && url) {
      player.previewSegmentBounds = null;
      video.src = url;
      video.load();
      video.play().catch(() => {});
    }
  }

  document.getElementById("splitter-modal")?.classList.add("hidden");
  document.getElementById("splitter-modal")?.classList.remove("flex");
  document.getElementById("highlights-modal")?.classList.add("hidden");
  document.getElementById("highlights-modal")?.classList.remove("flex");
  if (window.tasksManager) window.tasksManager.closeModal();

  window.scrollTo({ top: 0, behavior: "smooth" });
  if (timeline) {
    timeline.showToast(
      partTitle ? `🎬 جاري معاينة "${partTitle}" في المشغل` : "🎬 جاري معاينة المقطع في المشغل"
    );
  }
};
