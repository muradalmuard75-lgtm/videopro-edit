/**
 * VideoPro Edit v2.0 - AI Highlights & Best Moments Extractor
 * Extracts top highlight clips and lets user preview each highlight directly in the player.
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
        window.timelineInstance.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لاستخراج أفضل اللقطات");
      }
      document.getElementById("youtube-url-input")?.focus();
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
    if (!window.currentVideoId) return;

    const count = document.getElementById("highlights-count-select")?.value || "3";
    const duration = document.getElementById("highlights-dur-select")?.value || "20";
    const vidId = window.currentVideoId;

    const statusText = document.getElementById("highlights-status-text");
    const container = document.getElementById("highlights-cards-container");
    if (statusText) statusText.innerText = "⏳ جاري تحليل المشاهد واستخراج أقوى اللقطات...";

    if (window.tasksManager) {
      await window.tasksManager.runBackgroundTask({
        type: "highlights",
        title: `استخراج أفضل ${count} لقطات بالذكاء الاصطناعي (AI)`,
        icon: "🎯",
        dismissModalId: null,
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
        onSuccess: (data) => {
          if (statusText) {
            statusText.innerText = `✅ تم استخراج ${data.count} من أفضل اللقطات جاهزة للمعاينة والتنزيل!`;
          }
          if (container && data.highlights) {
            container.innerHTML = "";
            data.highlights.forEach((h) => {
              const card = document.createElement("div");
              card.className =
                "p-3 rounded-xl bg-gray-900/90 border border-amber-500/40 flex items-center justify-between text-xs";
              card.innerHTML = `
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-bold text-black shadow">
                    #${h.index}
                  </div>
                  <div>
                    <h4 class="font-bold text-gray-100">${h.title}</h4>
                    <p class="text-[11px] text-amber-300 font-mono">المدة: ${h.duration} ثانية</p>
                  </div>
                </div>
                <div class="flex items-center gap-1.5">
                  <button type="button" onclick="window.previewChunk('${h.url || ""}', '${h.title}', ${h.start || 0}, ${h.end || 20})" class="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 font-bold text-white transition cursor-pointer">
                    ▶ معاينة
                  </button>
                  <a href="${h.url || "#"}" download="${h.filename}" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-white transition">
                    ⬇ تنزيل
                  </a>
                </div>
              `;
              container.appendChild(card);
            });
          }
        },
      });
    }
  }
}

window.HighlightsManager = HighlightsManager;
