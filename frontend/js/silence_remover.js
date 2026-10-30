/**
 * VideoPro Edit - Silence Remover & Jump-Cut Engine
 */
class SilenceRemover {
  constructor() {
    this.modal = document.getElementById("silence-modal");
    this.isProcessing = false;
    this.init();
  }

  init() {
    const btn = document.getElementById("tool-silence-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-silence-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    const runBtn = document.getElementById("execute-silence-btn");
    if (runBtn) runBtn.addEventListener("click", () => this.executeSilenceRemoval());
  }

  openModal() {
    if (!this.modal) return;
    this.modal.classList.remove("hidden");
    this.modal.classList.add("flex");
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  async executeSilenceRemoval() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const statusText = document.getElementById("silence-status-text");
    const resultBox = document.getElementById("silence-result-box");
    const downloadLink = document.getElementById("silence-download-link");
    const statsCut = document.getElementById("silence-stats-cut");
    const statsSaved = document.getElementById("silence-stats-saved");

    if (statusText) statusText.innerText = "جاري مسح المقطع الصوتي واكتشاف فترات السكون وحذفها...";
    if (resultBox) resultBox.classList.add("hidden");

    try {
      const threshold = document.getElementById("silence-threshold-select")?.value || "-30";
      const minDuration = document.getElementById("silence-duration-select")?.value || "0.4";

      const formData = new FormData();
      formData.append("video_id", window.currentVideoId || "sample");
      formData.append("noise_threshold_db", threshold);
      formData.append("min_silence_duration", minDuration);

      const resp = await fetch("/api/video/remove-silence", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "فشل حذف الصمت");

      if (statusText) statusText.innerText = "تم حذف كافة فترات الصمت وتجميع مقاطع الكلام بنجاح!";
      if (resultBox) resultBox.classList.remove("hidden");

      if (statsCut) statsCut.innerText = `${data.silence_cut_seconds} ثانية مقطوعة`;
      if (statsSaved) statsSaved.innerText = `تم توفير ${data.silence_percentage}% من الوقت (${data.original_duration}s ➜ ${data.new_duration}s)`;

      if (downloadLink) {
        downloadLink.href = data.url;
        downloadLink.innerText = `تحميل الفيديو بعد إزالة الصمت (${data.new_duration}s)`;
      }

      const mainVid = document.getElementById("main-video");
      if (mainVid && data.url) {
        mainVid.src = data.url;
        mainVid.play().catch(() => {});
      }
    } catch (err) {
      if (statusText) statusText.innerText = `خطأ: ${err.message}`;
    } finally {
      this.isProcessing = false;
    }
  }
}

window.SilenceRemover = SilenceRemover;
