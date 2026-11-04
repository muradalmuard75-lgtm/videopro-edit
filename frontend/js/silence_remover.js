/**
 * VideoPro Edit v2.0 - Silence Remover & Jump-Cut Engine
 * Detects silent pauses and activates live Jump-Cut skipping in the player!
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
    if (!window.currentVideoId) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لاكتشاف وحذف الصمت");
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

  async executeSilenceRemoval() {
    if (!window.currentVideoId) return;

    const threshold = document.getElementById("silence-threshold-select")?.value || "-30";
    const minDuration = document.getElementById("silence-duration-select")?.value || "0.4";
    const vidId = window.currentVideoId;

    const statusText = document.getElementById("silence-status-text");
    const resultBox = document.getElementById("silence-result-box");
    const downloadLink = document.getElementById("silence-download-link");
    const statsCut = document.getElementById("silence-stats-cut");
    const statsSaved = document.getElementById("silence-stats-saved");

    if (window.tasksManager) {
      await window.tasksManager.runBackgroundTask({
        type: "silence",
        title: "حذف فترات الصمت التلقائي (Jump-Cut)",
        icon: "🎙️",
        dismissModalId: null,
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("noise_threshold_db", threshold);
          formData.append("min_silence_duration", minDuration);

          const resp = await fetch("/api/video/remove-silence", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) throw new Error(data.error || "فشل حذف الصمت");
          return data;
        },
        onSuccess: (data) => {
          if (statusText) {
            statusText.innerText = "✅ تم حذف كافة فترات الصمت وتفعيل القفز التلقائي (Jump-Cut)!";
          }
          if (resultBox) resultBox.classList.remove("hidden");
          if (statsCut) statsCut.innerText = `✂️ ${data.silence_cut_seconds} ثانية صمت مقطوعة`;
          if (statsSaved) {
            statsSaved.innerText = `تم توفير ${data.silence_percentage}% من الوقت (${data.original_duration}s ➜ ${data.new_duration}s)`;
          }
          if (downloadLink && data.url) {
            downloadLink.href = data.url;
            downloadLink.innerText = `تحميل الفيديو بعد إزالة الصمت (${data.new_duration}s)`;
          }
          if (window.videoPlayerInstance && data.speech_segments) {
            window.videoPlayerInstance.jumpCutSegments = data.speech_segments;
          }
        },
      });
    }
  }
}

window.SilenceRemover = SilenceRemover;
