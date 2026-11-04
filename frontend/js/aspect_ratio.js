/**
 * VideoPro Edit v2.0 - Aspect Ratio & Smart Auto-Reframe (9:16, 16:9, 1:1, 4:5)
 * Visually reframes the active platform player and processes backend FFmpeg reframe.
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

    const ratioBtns = document.querySelectorAll(".ratio-choice-btn");
    ratioBtns.forEach((b) => {
      b.addEventListener("click", () => {
        ratioBtns.forEach((item) =>
          item.classList.remove("active", "border-purple-500", "bg-purple-900/40")
        );
        b.classList.add("active", "border-purple-500", "bg-purple-900/40");
        this.selectedRatio = b.dataset.ratio;
        this.updatePreviewShape();
      });
    });

    const modeBtns = document.querySelectorAll(".mode-choice-btn");
    modeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        modeBtns.forEach((item) =>
          item.classList.remove("active", "border-purple-500", "bg-purple-900/40")
        );
        b.classList.add("active", "border-purple-500", "bg-purple-900/40");
        this.selectedMode = b.dataset.mode;
      });
    });

    const runBtn = document.getElementById("execute-reframe-btn");
    if (runBtn) runBtn.addEventListener("click", () => this.executeReframe());
  }

  openModal() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لتغيير المقاس");
      }
      document.getElementById("youtube-url-input")?.focus();
      return;
    }
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

    const img = box.querySelector("img");
    if (img && window.currentYtId) {
      img.src = `https://i.ytimg.com/vi/${window.currentYtId}/hqdefault.jpg`;
    }

    if (this.selectedRatio === "9:16") {
      box.style.aspectRatio = "9/16";
      box.style.height = "220px";
    } else if (this.selectedRatio === "16:9") {
      box.style.aspectRatio = "16/9";
      box.style.height = "150px";
    } else if (this.selectedRatio === "1:1") {
      box.style.aspectRatio = "1/1";
      box.style.height = "190px";
    } else if (this.selectedRatio === "4:5") {
      box.style.aspectRatio = "4/5";
      box.style.height = "205px";
    }
  }

  applyLivePlayerReframe(ratio) {
    const container = document.getElementById("player-container");
    const badgeText = document.getElementById("player-badge-text");
    const mainVid = document.getElementById("main-video");
    const movingImg = document.getElementById("moving-video-stream-img");
    if (!container) return;

    container.classList.remove("aspect-video");

    if (ratio === "9:16") {
      container.style.aspectRatio = "9 / 16";
      container.style.maxHeight = "560px";
      container.style.maxWidth = "315px";
      container.style.margin = "0 auto";
      if (mainVid) {
        mainVid.classList.remove("object-contain");
        mainVid.classList.add("object-cover");
      }
      if (movingImg) {
        movingImg.classList.remove("object-contain");
        movingImg.classList.add("object-cover");
      }
    } else if (ratio === "1:1") {
      container.style.aspectRatio = "1 / 1";
      container.style.maxHeight = "440px";
      container.style.maxWidth = "440px";
      container.style.margin = "0 auto";
      if (mainVid) {
        mainVid.classList.remove("object-contain");
        mainVid.classList.add("object-cover");
      }
    } else if (ratio === "4:5") {
      container.style.aspectRatio = "4 / 5";
      container.style.maxHeight = "480px";
      container.style.maxWidth = "384px";
      container.style.margin = "0 auto";
      if (mainVid) {
        mainVid.classList.remove("object-contain");
        mainVid.classList.add("object-cover");
      }
    } else {
      container.style.aspectRatio = "16 / 9";
      container.style.maxHeight = "none";
      container.style.maxWidth = "100%";
      container.style.margin = "0";
      if (mainVid) {
        mainVid.classList.remove("object-cover");
        mainVid.classList.add("object-contain");
      }
      if (movingImg) {
        movingImg.classList.remove("object-cover");
        movingImg.classList.add("object-contain");
      }
    }

    if (badgeText) {
      badgeText.innerText = `${ratio} HD`;
    }
  }

  async executeReframe() {
    if (!window.currentVideoId) return;

    const ratio = this.selectedRatio;
    const mode = this.selectedMode;
    const ratioTitle = `تحويل مقاس الكادر إلى ${ratio} (${mode === "smart_blur" ? "بلور ذكي" : "قص الكادر"})`;
    const vidId = window.currentVideoId;

    // Immediately reframe the live studio player so the user sees the transformation!
    this.applyLivePlayerReframe(ratio);

    const statusText = document.getElementById("reframe-status-text");
    const resultBox = document.getElementById("reframe-result-box");
    const downloadLink = document.getElementById("reframe-download-link");

    if (window.tasksManager) {
      await window.tasksManager.runBackgroundTask({
        type: "reframe",
        title: ratioTitle,
        icon: "📱",
        dismissModalId: "reframe-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("target_ratio", ratio);
          formData.append("mode", mode);

          const resp = await fetch("/api/video/reframe", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) throw new Error(data.error || "فشل تحويل المقاس");
          return data;
        },
        onSuccess: (data) => {
          if (statusText) {
            statusText.innerText = `✅ تم تحويل الفيديو إلى مقاس ${data.target_ratio} (${data.resolution})!`;
          }
          if (resultBox) resultBox.classList.remove("hidden");
          if (downloadLink && data.url) {
            downloadLink.href = data.url;
            downloadLink.innerText = `تحميل الفيديو بمقاس ${data.target_ratio} (${data.file_size_mb} MB)`;
          }
          if (!window.videoPlayerInstance?.isSynthesizedPlatformStream && data.url && !data.url.startsWith("blob:")) {
            const mainVid = document.getElementById("main-video");
            if (mainVid) {
              mainVid.src = data.url;
              mainVid.play().catch(() => {});
            }
          }
        },
      });
    }
  }
}

window.AspectRatioManager = AspectRatioManager;
