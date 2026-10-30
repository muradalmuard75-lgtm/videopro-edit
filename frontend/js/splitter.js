/**
 * VideoPro Edit - Smart Video Splitter Module
 * Handles 30s, 60s, 120s, custom intervals, and multi-part downloads (ZIP)
 */
class VideoSplitter {
  constructor() {
    this.modal = document.getElementById("splitter-modal");
    this.selectedInterval = 60; // default 1 min
    this.videoDuration = 84; // default
    this.currentVideoId = "sample";
    this.isProcessing = false;

    this.init();
  }

  init() {
    this.setupListeners();
  }

  setupListeners() {
    // Open modal buttons
    const triggerBtn = document.getElementById("tool-split-btn");
    const timelineSplitBtn = document.getElementById("timeline-split-btn");

    if (triggerBtn) {
      triggerBtn.addEventListener("click", () => this.openModal());
    }
    if (timelineSplitBtn) {
      timelineSplitBtn.addEventListener("click", () => this.openModal());
    }

    // Close modal
    const closeBtn = document.getElementById("close-splitter-modal");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.closeModal());
    }

    // Interval selection buttons
    const intervalButtons = document.querySelectorAll(".split-interval-btn");
    intervalButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        intervalButtons.forEach((b) => b.classList.remove("active", "border-purple-500", "bg-purple-900/40"));
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

    // Custom input change
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

    // Execute split button
    const runBtn = document.getElementById("execute-split-btn");
    if (runBtn) {
      runBtn.addEventListener("click", () => this.runSplitting());
    }
  }

  openModal() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً قبل تقطيع الفواصل");
      }
      document.getElementById("video-file-input")?.click();
      return;
    }
    if (!this.modal) return;
    const video = document.getElementById("main-video");
    this.videoDuration = (video && video.duration > 0) ? video.duration : (window.timelineInstance?.duration || 60);
    this.currentVideoId = window.currentVideoId;
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

    const totalSeconds = this.videoDuration;
    const interval = this.selectedInterval || 60;
    const partsCount = Math.max(1, Math.ceil(totalSeconds / interval));

    if (countEl) countEl.innerText = `${partsCount} مقاطع`;
    if (durEl) durEl.innerText = this.formatTime(totalSeconds);

    if (listEl) {
      listEl.innerHTML = "";
      for (let i = 0; i < partsCount; i++) {
        const start = i * interval;
        const end = Math.min(totalSeconds, (i + 1) * interval);
        const card = document.createElement("div");
        card.className = "flex items-center justify-between p-2.5 rounded-lg bg-[#141b2b] border border-gray-800 text-xs";
        card.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded bg-purple-600/30 text-purple-400 font-bold flex items-center justify-center">${i + 1}</span>
            <span class="font-medium text-gray-200">المقطع رقم ${i + 1}</span>
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
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً للبدء");
      this.closeModal();
      document.getElementById("video-file-input")?.click();
      return;
    }

    const interval = this.selectedInterval;
    const vidId = window.currentVideoId;
    const taskTitle = `تقطيع الفيديو إلى فواصل (${interval} ثانية)`;

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "split",
        title: taskTitle,
        icon: "✂️",
        dismissModalId: "splitter-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("interval_seconds", interval.toString());
          formData.append("prefix", "clip");

          const response = await fetch("/api/video/split", {
            method: "POST",
            body: formData,
          });
          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error || "فشل تقطيع الفيديو");
          return data;
        },
      });
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;

    const progressContainer = document.getElementById("split-progress-container");
    const progressBar = document.getElementById("split-progress-bar");
    const statusText = document.getElementById("split-status-text");
    const resultsContainer = document.getElementById("split-results-container");

    if (progressContainer) progressContainer.classList.remove("hidden");
    if (resultsContainer) resultsContainer.classList.add("hidden");
    if (statusText) statusText.innerText = "جاري تقطيع الفيديو بسرعة فائقة وبدون فقدان جودة...";
    if (progressBar) progressBar.style.width = "40%";

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("interval_seconds", this.selectedInterval.toString());
      formData.append("prefix", "clip");

      const response = await fetch("/api/video/split", {
        method: "POST",
        body: formData,
      });

      if (progressBar) progressBar.style.width = "85%";

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "فشل تقطيع الفيديو");
      }

      if (progressBar) progressBar.style.width = "100%";
      if (statusText) statusText.innerText = `تم تقطيع الفيديو بنجاح إلى ${data.total_chunks} مقطع!`;

      // Render results
      this.renderResults(data);
    } catch (err) {
      console.error(err);
      if (statusText) statusText.innerText = `خطأ: ${err.message}`;
    } finally {
      this.isProcessing = false;
    }
  }

  renderResults(data) {
    const resultsContainer = document.getElementById("split-results-container");
    const zipBtn = document.getElementById("download-zip-btn");
    const clipsContainer = document.getElementById("download-clips-list");

    if (!resultsContainer) return;
    resultsContainer.classList.remove("hidden");

    if (zipBtn && data.zip_url) {
      zipBtn.href = data.zip_url;
      zipBtn.innerHTML = `
        <svg class="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        تحميل جميع المقاطع في ملف مضغوط ZIP (${data.zip_size_mb || "0"} MB)
      `;
    }

    if (clipsContainer && data.chunks) {
      clipsContainer.innerHTML = "";
      data.chunks.forEach((chunk) => {
        const item = document.createElement("div");
        item.className = "flex items-center justify-between p-3 rounded-lg bg-gray-900/80 border border-gray-700/60";
        item.innerHTML = `
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-full bg-purple-700 text-white font-bold flex items-center justify-center text-xs">${chunk.part}</span>
            <div>
              <div class="text-sm font-semibold text-gray-100">${chunk.filename}</div>
              <div class="text-xs text-gray-400 font-mono">${chunk.formatted_range} (${chunk.duration}s • ${chunk.size_mb} MB)</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.previewChunk('${chunk.url}')" class="px-2.5 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition">معاينة</button>
            <a href="${chunk.url}" download="${chunk.filename}" class="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center gap-1 transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              تنزيل
            </a>
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
window.previewChunk = function(url) {
  const video = document.getElementById("main-video");
  if (video) {
    video.src = url;
    video.play().catch(() => {});
  }
};
