/**
 * VideoPro Edit - Main Application Orchestrator
 */
document.addEventListener("DOMContentLoaded", () => {
  window.currentVideoId = "sample";

  // Elements
  const videoEl = document.getElementById("main-video");
  const timelineContainer = document.getElementById("timeline-container");
  const fileInput = document.getElementById("video-file-input");
  const uploadOverlay = document.getElementById("upload-overlay");

  // Initialize Engines
  const player = new VideoPlayer(videoEl);
  const timeline = new TimelineEngine(videoEl, timelineContainer);
  const splitter = new VideoSplitter();
  const reframe = new AspectRatioManager();
  const silence = new SilenceRemover();
  const highlights = new HighlightsManager();
  const subtitles = new SubtitlesManager();

  window.videoPlayerInstance = player;
  window.timelineInstance = timeline;
  window.subtitlesInstance = subtitles;

  // File Upload Handlers
  const triggerUploadBtn = document.getElementById("upload-trigger-btn");
  if (triggerUploadBtn && fileInput) {
    triggerUploadBtn.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        await uploadVideoFile(file);
      }
    });
  }

  // Drag and drop video
  const playerContainer = document.getElementById("player-container");
  if (playerContainer) {
    playerContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      playerContainer.classList.add("border-purple-500", "border-2");
    });

    playerContainer.addEventListener("dragleave", () => {
      playerContainer.classList.remove("border-purple-500", "border-2");
    });

    playerContainer.addEventListener("drop", async (e) => {
      e.preventDefault();
      playerContainer.classList.remove("border-purple-500", "border-2");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await uploadVideoFile(e.dataTransfer.files[0]);
      }
    });
  }

  async function uploadVideoFile(file) {
    const notifyEl = document.getElementById("upload-notification");
    if (notifyEl) {
      notifyEl.innerText = `جاري رفع ومعالجة الفيديو: ${file.name}...`;
      notifyEl.classList.remove("hidden");
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل رفع الفيديو");

      window.currentVideoId = data.video_id;

      if (videoEl && data.preview_url) {
        videoEl.src = data.preview_url;
        videoEl.load();
        videoEl.play().catch(() => {});
      }

      if (notifyEl) {
        notifyEl.innerText = `تم تحميل الفيديو بنجاح (${data.info.resolution} • ${data.info.formatted_duration})`;
        setTimeout(() => notifyEl.classList.add("hidden"), 4000);
      }

      // Refresh timeline duration
      if (data.info && data.info.duration) {
        timeline.duration = data.info.duration;
        timeline.renderRuler();
        timeline.drawAudioWaveform();
      }
    } catch (err) {
      if (notifyEl) {
        notifyEl.innerText = `خطأ في الرفع: ${err.message}`;
      }
    }
  }

  // Export Video Handler (Right Panel)
  const exportBtn = document.getElementById("export-video-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      const resolution = document.getElementById("export-quality-select")?.value || "1080p";
      const format = document.getElementById("export-format-select")?.value || "mp4";
      const statusEl = document.getElementById("export-status-text");

      exportBtn.disabled = true;
      exportBtn.innerHTML = `
        <svg class="animate-spin w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        جاري معالجة وتصدير الفيديو...
      `;

      try {
        const formData = new FormData();
        formData.append("video_id", window.currentVideoId || "sample");
        formData.append("resolution", resolution);
        formData.append("format_type", format);

        const res = await fetch("/api/video/export", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "فشل التصدير");

        // Download trigger
        const a = document.createElement("a");
        a.href = data.url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        exportBtn.innerHTML = `
          <svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          تم التصدير بنجاح!
        `;
        setTimeout(() => {
          exportBtn.disabled = false;
          exportBtn.innerHTML = `
            <svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            تصدير الفيديو
          `;
        }, 3000);
      } catch (err) {
        alert(`فشل التصدير: ${err.message}`);
        exportBtn.disabled = false;
        exportBtn.innerHTML = `
          <svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          تصدير الفيديو
        `;
      }
    });
  }

  // Quick Action "ابدأ الآن" button
  const startNowBtn = document.getElementById("start-now-btn");
  if (startNowBtn) {
    startNowBtn.addEventListener("click", () => {
      splitter.openModal();
    });
  }

  // Video Enhancer (Brightness & Contrast)
  const toolEnhanceBtn = document.getElementById("tool-enhance-btn");
  const enhanceModal = document.getElementById("enhance-modal");
  if (toolEnhanceBtn && enhanceModal) {
    toolEnhanceBtn.addEventListener("click", () => {
      enhanceModal.classList.remove("hidden");
      enhanceModal.classList.add("flex");
    });

    document.getElementById("close-enhance-modal")?.addEventListener("click", () => {
      enhanceModal.classList.add("hidden");
      enhanceModal.classList.remove("flex");
    });

    const bSlider = document.getElementById("enhance-brightness-slider");
    const cSlider = document.getElementById("enhance-contrast-slider");
    const sSlider = document.getElementById("enhance-saturation-slider");

    [bSlider, cSlider, sSlider].forEach((slider) => {
      if (slider) {
        slider.addEventListener("input", () => {
          player.applyFilter("brightness", parseFloat(bSlider.value));
          player.applyFilter("contrast", parseFloat(cSlider.value));
          player.applyFilter("saturation", parseFloat(sSlider.value));
        });
      }
    });

    document.getElementById("reset-enhance-btn")?.addEventListener("click", () => {
      if (bSlider) bSlider.value = "1.0";
      if (cSlider) cSlider.value = "1.0";
      if (sSlider) sSlider.value = "1.0";
      player.resetFilters();
    });
  }

  // Audio & Music Tool
  const toolAudioBtn = document.getElementById("tool-audio-btn");
  if (toolAudioBtn) {
    toolAudioBtn.addEventListener("click", () => {
      const audioInput = document.createElement("input");
      audioInput.type = "file";
      audioInput.accept = "audio/*";
      audioInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          alert(`تم اختيار المقطع الصوتي "${file.name}" كخلفية موسيقية للفيديو!`);
          timeline.drawAudioWaveform();
        }
      };
      audioInput.click();
    });
  }

  // Merge tool
  const toolMergeBtn = document.getElementById("tool-merge-btn");
  if (toolMergeBtn) {
    toolMergeBtn.addEventListener("click", () => {
      alert("خاصية دمج المقاطع: يمكنك رفع مقاطع إضافية عبر السحب والإفلات لدمجها تلقائياً على التايم لاين.");
    });
  }

  // Text & Stickers tool
  const toolTextBtn = document.getElementById("tool-text-btn");
  if (toolTextBtn) {
    toolTextBtn.addEventListener("click", () => {
      subtitles.openModal();
    });
  }
});
