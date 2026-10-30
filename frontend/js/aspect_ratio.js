/**
 * VideoPro Edit - Aspect Ratio & Smart Auto-Reframe (9:16, 16:9, 1:1, 4:5)
 */
class AspectRatioManager {
  constructor() {
    this.modal = document.getElementById("reframe-modal");
    this.selectedRatio = "9:16";
    this.selectedMode = "smart_blur";
    this.isProcessing = false;

    this.init();
  }

  init() {
    const btn = document.getElementById("tool-reframe-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-reframe-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    // Ratio selectors
    const ratioBtns = document.querySelectorAll(".ratio-choice-btn");
    ratioBtns.forEach((b) => {
      b.addEventListener("click", () => {
        ratioBtns.forEach((item) => item.classList.remove("active", "border-purple-500", "bg-purple-900/40"));
        b.classList.add("active", "border-purple-500", "bg-purple-900/40");
        this.selectedRatio = b.dataset.ratio;
        this.updatePreviewShape();
      });
    });

    // Mode selectors (blur vs crop)
    const modeBtns = document.querySelectorAll(".mode-choice-btn");
    modeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        modeBtns.forEach((item) => item.classList.remove("active", "border-purple-500", "bg-purple-900/40"));
        b.classList.add("active", "border-purple-500", "bg-purple-900/40");
        this.selectedMode = b.dataset.mode;
      });
    });

    const runBtn = document.getElementById("execute-reframe-btn");
    if (runBtn) runBtn.addEventListener("click", () => this.executeReframe());
  }

  openModal() {
    if (!this.modal) return;
    this.modal.classList.remove("hidden");
    this.modal.classList.add("flex");
    this.updatePreviewShape();
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  updatePreviewShape() {
    const box = document.getElementById("reframe-preview-box");
    if (!box) return;

    if (this.selectedRatio === "9:16") {
      box.style.aspectRatio = "9/16";
      box.style.height = "260px";
    } else if (this.selectedRatio === "16:9") {
      box.style.aspectRatio = "16/9";
      box.style.height = "160px";
    } else if (this.selectedRatio === "1:1") {
      box.style.aspectRatio = "1/1";
      box.style.height = "200px";
    } else if (this.selectedRatio === "4:5") {
      box.style.aspectRatio = "4/5";
      box.style.height = "220px";
    }
  }

  async executeReframe() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const statusText = document.getElementById("reframe-status-text");
    const resultBox = document.getElementById("reframe-result-box");
    const downloadLink = document.getElementById("reframe-download-link");

    if (statusText) statusText.innerText = "جاري إعادة ضبط الكادر وتطبيق التنسيق الذكي...";
    if (resultBox) resultBox.classList.add("hidden");

    try {
      const formData = new FormData();
      formData.append("video_id", window.currentVideoId || "sample");
      formData.append("target_ratio", this.selectedRatio);
      formData.append("mode", this.selectedMode);

      const resp = await fetch("/api/video/reframe", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "فشل تحويل المقاس");

      if (statusText) statusText.innerText = `تم تحويل الفيديو بنجاح إلى مقاس ${data.target_ratio} (${data.resolution})!`;
      if (resultBox) resultBox.classList.remove("hidden");
      if (downloadLink) {
        downloadLink.href = data.url;
        downloadLink.innerText = `تحميل الفيديو بمقاس ${data.target_ratio} (${data.file_size_mb} MB)`;
      }

      // Also set in main video for immediate viewing
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

window.AspectRatioManager = AspectRatioManager;
