/**
 * VideoPro Edit - AI Highlights & Best Moments Extractor
 */
class HighlightsManager {
  constructor() {
    this.modal = document.getElementById("highlights-modal");
    this.isProcessing = false;
    this.init();
  }

  init() {
    const btn = document.getElementById("tool-highlights-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-highlights-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    const runBtn = document.getElementById("execute-highlights-btn");
    if (runBtn) runBtn.addEventListener("click", () => this.extractHighlights());
  }

  openModal() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً لاستخراج أفضل اللقطات");
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

  async extractHighlights() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً للبدء");
      this.closeModal();
      document.getElementById("video-file-input")?.click();
      return;
    }

    const count = document.getElementById("highlights-count-select")?.value || "3";
    const duration = document.getElementById("highlights-dur-select")?.value || "20";
    const vidId = window.currentVideoId;

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "highlights",
        title: `استخراج أفضل ${count} لقطات بالذكاء الاصطناعي (AI)`,
        icon: "🎯",
        dismissModalId: "highlights-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("count", count);
          formData.append("duration", duration);

          const resp = await fetch("/api/video/highlights", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) throw new Error(data.error || "فشل استخراج اللقطات");
          return data;
        },
      });
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;

    const statusText = document.getElementById("highlights-status-text");
    const container = document.getElementById("highlights-cards-container");

    if (statusText) statusText.innerText = "جاري تحليل المشاهد الأكثر إثارة وتغيراً عبر الذكاء الاصطناعي...";
    if (container) container.innerHTML = "";

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("count", count);
      formData.append("duration", duration);

      const resp = await fetch("/api/video/highlights", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "فشل استخراج اللقطات");

      if (statusText) statusText.innerText = `تم استخراج ${data.count} من أفضل اللقطات جاهزة للمشاركة!`;

      if (container && data.highlights) {
        data.highlights.forEach((h) => {
          const card = document.createElement("div");
          card.className = "p-4 rounded-xl bg-gray-900/90 border border-purple-500/30 flex items-center justify-between";
          card.innerHTML = `
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg">
                #${h.index}
              </div>
              <div>
                <h4 class="font-bold text-gray-100 text-sm">${h.title}</h4>
                <p class="text-xs text-gray-400 font-mono mt-0.5">المدة: ${h.duration} ثانية</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="window.previewChunk('${h.url}')" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-200 transition">
                معاينة
              </button>
              <a href="${h.url}" download="${h.filename}" class="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white flex items-center gap-1.5 shadow transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                تنزيل المقطع
              </a>
            </div>
          `;
          container.appendChild(card);
        });
      }
    } catch (err) {
      if (statusText) statusText.innerText = `خطأ: ${err.message}`;
    } finally {
      this.isProcessing = false;
    }
  }
}

window.HighlightsManager = HighlightsManager;
