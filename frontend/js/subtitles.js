/**
 * VideoPro Edit - TikTok & Reels Automated Subtitles & Burning Engine (ASS & FFmpeg)
 * 1. Automatically extracts audio track from video on the server.
 * 2. Transcribes speech (Arabic/English) with precise timestamps.
 * 3. Translates foreign speech to natural Arabic.
 * 4. Chunks lines into punchy 2-4 word Reels phrases.
 * 5. Burns/hardcodes subtitles using ASS format with vibrant viral styling and pop-in animation.
 */
class SubtitlesManager {
  constructor() {
    this.modal = document.getElementById("subtitles-modal");
    this.subtitlesOverlay = document.getElementById("player-subtitles-overlay");
    this.cues = [];
    this.activeCueIndex = -1;
    this.styling = {
      preset: "tiktok_yellow",
      fontFamily: "Cairo",
      fontSize: 46,
      textColor: "#facc15",
      borderStyle: 1, // 1 = Stroke outline, 3 = Bounding box
      position: "bottom",
      chunkForReels: true,
      popAnimation: true,
    };

    this.init();
  }

  init() {
    const btn = document.getElementById("tool-subtitles-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-subtitles-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    // 1. MAIN ONE-CLICK BUTTON: Auto-Caption & Burn Directly into Video
    const autoCaptionBtn = document.getElementById("auto-caption-and-burn-btn");
    if (autoCaptionBtn) {
      autoCaptionBtn.addEventListener("click", () => this.autoCaptionAndBurn());
    }

    // 2. Extract Cues Only (for manual inspection/editing before burning)
    const extractCuesBtn = document.getElementById("extract-cues-only-btn");
    if (extractCuesBtn) {
      extractCuesBtn.addEventListener("click", () => this.extractCuesOnly());
    }

    // 3. Burn Edited Cues (after manual editing)
    const burnEditedBtn = document.getElementById("burn-edited-cues-btn");
    if (burnEditedBtn) {
      burnEditedBtn.addEventListener("click", () => this.burnEditedCues());
    }

    // 4. Add Manual Cue
    const addCueBtn = document.getElementById("add-manual-cue-btn");
    if (addCueBtn) {
      addCueBtn.addEventListener("click", () => this.addManualCue());
    }

    // 5. Preview Overlay on Screen
    const previewBtn = document.getElementById("preview-subtitles-overlay-btn");
    if (previewBtn) {
      previewBtn.addEventListener("click", () => {
        this.closeModal();
        const video = document.getElementById("main-video");
        if (video) {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
        if (window.timelineInstance) {
          window.timelineInstance.showToast("👁️ يتم الآن تشغيل الفيديو مع معاينة الترجمة بنمط الريلز على الشاشة");
        }
      });
    }

    // Preset buttons
    const presetButtons = document.querySelectorAll(".sub-preset-btn");
    presetButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const targetBtn = e.currentTarget;
        presetButtons.forEach((b) => b.classList.remove("active", "border-yellow-400/60", "bg-yellow-400/10"));
        targetBtn.classList.add("active", "border-yellow-400/60", "bg-yellow-400/10");

        const presetKey = targetBtn.getAttribute("data-preset") || "tiktok_yellow";
        this.applyPreset(presetKey);
      });
    });

    // Font select
    const fontSelect = document.getElementById("sub-font-select");
    if (fontSelect) {
      fontSelect.addEventListener("change", (e) => {
        this.styling.fontFamily = e.target.value;
        this.applySubtitleStyling();
      });
    }

    // Position select
    const posSelect = document.getElementById("sub-pos-select");
    if (posSelect) {
      posSelect.addEventListener("change", (e) => {
        this.styling.position = e.target.value;
        this.applySubtitleStyling();
      });
    }

    // Border style select
    const borderSelect = document.getElementById("sub-border-style-select");
    if (borderSelect) {
      borderSelect.addEventListener("change", (e) => {
        this.styling.borderStyle = parseInt(e.target.value, 10) || 1;
        this.applySubtitleStyling();
      });
    }

    // Color picker
    const colorPicker = document.getElementById("sub-color-picker");
    if (colorPicker) {
      colorPicker.addEventListener("input", (e) => {
        this.styling.textColor = e.target.value;
        this.applySubtitleStyling();
      });
    }

    // Size range
    const sizeRange = document.getElementById("sub-size-range");
    const sizeVal = document.getElementById("sub-size-val");
    if (sizeRange) {
      sizeRange.addEventListener("input", (e) => {
        this.styling.fontSize = parseInt(e.target.value, 10) || 46;
        if (sizeVal) sizeVal.innerText = this.styling.fontSize;
        this.applySubtitleStyling();
      });
    }

    // Reels chunk toggle
    const chunkToggle = document.getElementById("sub-chunk-reels-toggle");
    if (chunkToggle) {
      chunkToggle.addEventListener("change", (e) => {
        this.styling.chunkForReels = e.target.checked;
      });
    }

    // Pop animation toggle
    const popToggle = document.getElementById("sub-pop-anim-toggle");
    if (popToggle) {
      popToggle.addEventListener("change", (e) => {
        this.styling.popAnimation = e.target.checked;
      });
    }

    // Video timeupdate sync for overlay captions
    const video = document.getElementById("main-video");
    if (video) {
      video.addEventListener("timeupdate", () => {
        this.renderActiveSubtitle(video.currentTime);
      });
    }

    this.applySubtitleStyling();
    window.subtitlesInstance = this;
  }

  applyPreset(presetKey) {
    this.styling.preset = presetKey;
    const fontSelect = document.getElementById("sub-font-select");
    const colorPicker = document.getElementById("sub-color-picker");
    const borderSelect = document.getElementById("sub-border-style-select");
    const sizeRange = document.getElementById("sub-size-range");
    const sizeVal = document.getElementById("sub-size-val");

    if (presetKey === "tiktok_yellow") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#facc15";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 48;
    } else if (presetKey === "tiktok_box") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#ffffff";
      this.styling.borderStyle = 3;
      this.styling.fontSize = 44;
    } else if (presetKey === "tiktok_green") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#22c55e";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 48;
    } else if (presetKey === "tiktok_cyan") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#06b6d4";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 48;
    } else if (presetKey === "tiktok_fire") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#ff781f";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 48;
    } else if (presetKey === "classic_white") {
      this.styling.fontFamily = "Amiri";
      this.styling.textColor = "#ffffff";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 44;
    }

    if (fontSelect) fontSelect.value = this.styling.fontFamily;
    if (colorPicker) colorPicker.value = this.styling.textColor;
    if (borderSelect) borderSelect.value = String(this.styling.borderStyle);
    if (sizeRange) sizeRange.value = this.styling.fontSize;
    if (sizeVal) sizeVal.innerText = this.styling.fontSize;

    this.applySubtitleStyling();
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
    this.renderCuesList();
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  applySubtitleStyling() {
    if (!this.subtitlesOverlay) return;

    const font = this.styling.fontFamily.includes("Amiri")
      ? "'Amiri', serif"
      : this.styling.fontFamily.includes("Cairo")
      ? "'Cairo', sans-serif"
      : this.styling.fontFamily;

    this.subtitlesOverlay.style.fontFamily = font;
    this.subtitlesOverlay.style.fontSize = `${Math.round(this.styling.fontSize * 0.72)}px`;
    this.subtitlesOverlay.style.fontWeight = "800";
    this.subtitlesOverlay.style.color = this.styling.textColor;
    this.subtitlesOverlay.style.textAlign = "center";
    this.subtitlesOverlay.style.letterSpacing = "0.5px";

    if (this.styling.borderStyle === 3) {
      // TikTok Bounding Box style
      this.subtitlesOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.78)";
      this.subtitlesOverlay.style.padding = "4px 14px";
      this.subtitlesOverlay.style.borderRadius = "8px";
      this.subtitlesOverlay.style.textShadow = "none";
      this.subtitlesOverlay.style.display = "inline-flex";
      this.subtitlesOverlay.style.maxWidth = "85%";
    } else {
      // Bold Stroke Outline style
      this.subtitlesOverlay.style.backgroundColor = "transparent";
      this.subtitlesOverlay.style.padding = "0px";
      this.subtitlesOverlay.style.borderRadius = "0px";
      this.subtitlesOverlay.style.textShadow = `
        -2px -2px 0 #000,
         2px -2px 0 #000,
        -2px  2px 0 #000,
         2px  2px 0 #000,
         0px  3px 6px rgba(0,0,0,0.9)
      `;
    }

    if (this.styling.position === "top") {
      this.subtitlesOverlay.style.top = "10%";
      this.subtitlesOverlay.style.bottom = "auto";
    } else if (this.styling.position === "middle") {
      this.subtitlesOverlay.style.top = "46%";
      this.subtitlesOverlay.style.bottom = "auto";
    } else {
      this.subtitlesOverlay.style.top = "auto";
      this.subtitlesOverlay.style.bottom = "14%";
    }
  }

  renderActiveSubtitle(currentTime) {
    if (!this.subtitlesOverlay || this.cues.length === 0) return;

    const activeCue = this.cues.find((c) => currentTime >= c.start_sec && currentTime <= c.end_sec);
    if (activeCue && activeCue.text.trim()) {
      this.subtitlesOverlay.innerText = activeCue.text;
      this.subtitlesOverlay.classList.remove("hidden");
      this.subtitlesOverlay.classList.add("flex");
    } else {
      this.subtitlesOverlay.innerText = "";
      this.subtitlesOverlay.classList.add("hidden");
      this.subtitlesOverlay.classList.remove("flex");
    }
  }

  /**
   * One-Click Auto-Caption & Burn (TikTok/Reels ASS style)
   * Progressive Two-Stage Execution:
   * 1. Fast speech-to-text extraction (~1-2s): immediately displays high-accuracy cues in UI.
   * 2. Ultrafast FFmpeg subtitle burning: burns text permanently with 720p optimization.
   */
  async autoCaptionAndBurn() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً");
      return;
    }

    const vidId = window.currentVideoId;
    const fontName = this.styling.fontFamily || "Cairo";
    const fontSize = this.styling.fontSize || 46;
    const textColor = this.styling.textColor || "#facc15";
    const position = this.styling.position || "bottom";
    const borderStyle = this.styling.borderStyle || 1;
    const preset = this.styling.preset || "tiktok_yellow";
    const chunkForReels = this.styling.chunkForReels !== false;
    const popAnim = this.styling.popAnimation !== false;

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "autocaption",
        title: "حرق نصوص الريلز والتيك توك (ASS)",
        icon: "✨",
        details: "[1/2] جاري استخراج الكلام العربي بدقة عالية...",
        dismissModalId: "subtitles-modal",
        apiCall: async () => {
          // STAGE 1: Extract Arabic Speech-to-Text rapidly
          const currentTask = window.tasksManager?.tasks?.find((t) => t.type === "autocaption" && t.status === "running");
          if (currentTask) {
            currentTask.details = "[1/2] جاري استخراج الكلام العربي بدقة عالية...";
            window.tasksManager.render();
          }

          const extractFormData = new FormData();
          extractFormData.append("video_id", vidId);
          extractFormData.append("language", "ar");
          extractFormData.append("chunk_reels", chunkForReels ? "true" : "false");
          extractFormData.append("max_words", "4");

          const extractResp = await fetch("/api/video/subtitles", {
            method: "POST",
            body: extractFormData,
          });
          const extractData = await extractResp.json();
          if (!extractResp.ok || !extractData.success || !extractData.cues || extractData.cues.length === 0) {
            throw new Error(extractData.error || "لم يتم رصد كلام واضح في مقطع الصوت لاستخراجه");
          }

          // Immediately display cues in the UI so the user sees their speech captured accurately!
          this.cues = extractData.cues;
          this.renderCuesList();
          this.updateTimelineSubtitleBlocks();

          // STAGE 2: Burn subtitles into video frames with optimized ultrafast FFmpeg
          if (currentTask) {
            currentTask.details = `[2/2] تم استخراج ${this.cues.length} سطر كلام! جاري حرق النصوص بنمط الريلز والتيك توك داخل الفيديو...`;
            window.tasksManager.render();
          }

          const burnFormData = new FormData();
          burnFormData.append("video_id", vidId);
          burnFormData.append("cues_json", JSON.stringify(this.cues));
          burnFormData.append("font_name", fontName);
          burnFormData.append("font_size", fontSize);
          burnFormData.append("text_color", textColor);
          burnFormData.append("outline_color", "#000000");
          burnFormData.append("outline_width", "3.5");
          burnFormData.append("position", position);
          burnFormData.append("border_style", borderStyle);
          burnFormData.append("style_preset", preset);
          burnFormData.append("pop_animation", popAnim ? "true" : "false");
          burnFormData.append("chunk_for_reels", "false"); // already chunked in stage 1

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s generous timeout

          try {
            const burnResp = await fetch("/api/video/burn-subtitles", {
              method: "POST",
              body: burnFormData,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const burnData = await burnResp.json();
            if (!burnResp.ok || burnData.error) {
              throw new Error(burnData.detail || burnData.error || "فشل حرق النصوص داخل الفيديو");
            }
            burnData.cues = this.cues;
            burnData.srt = extractData.srt || "";
            return burnData;
          } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === "AbortError") {
              throw new Error("استغرقت المعالجة وقتاً أطول من المتوقع، يرجى المحاولة مرة أخرى.");
            }
            throw err;
          }
        },
        onSuccess: (data) => {
          if (window.playerInstance && data.url) {
            window.playerInstance.loadVideo(data.url, data.video_id);
          }
          this.cues = data.cues || [];
          this.renderCuesList();
          this.updateTimelineSubtitleBlocks();

          if (this.subtitlesOverlay) {
            this.subtitlesOverlay.classList.add("hidden");
            this.subtitlesOverlay.innerText = "";
          }

          if (window.timelineInstance) {
            window.timelineInstance.showToast("🎉 تم استخراج وترجمة وحرق نصوص الريلز داخل الفيديو بنجاح!");
          }
        },
      });
    }
  }

  /**
   * Burn manually edited cues
   */
  async burnEditedCues() {
    if (!window.currentVideoId) return;
    if (!this.cues || this.cues.length === 0) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ لا توجد أسطر نصوص لحرقها، قم باستخراج النصوص أولاً");
      }
      return;
    }

    const vidId = window.currentVideoId;
    const fontName = this.styling.fontFamily || "Cairo";
    const fontSize = this.styling.fontSize || 46;
    const textColor = this.styling.textColor || "#facc15";
    const position = this.styling.position || "bottom";
    const borderStyle = this.styling.borderStyle || 1;
    const preset = this.styling.preset || "tiktok_yellow";
    const popAnim = this.styling.popAnimation !== false;

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "burn_subtitles",
        title: "حرق النصوص المعدلة (نمط الريلز)",
        icon: "🎬",
        dismissModalId: "subtitles-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("cues_json", JSON.stringify(this.cues));
          formData.append("font_name", fontName);
          formData.append("font_size", fontSize);
          formData.append("text_color", textColor);
          formData.append("outline_color", "#000000");
          formData.append("position", position);
          formData.append("border_style", borderStyle);
          formData.append("style_preset", preset);
          formData.append("pop_animation", popAnim ? "true" : "false");
          formData.append("chunk_for_reels", "false"); // already in user-edited state

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000);

          try {
            const resp = await fetch("/api/video/burn-subtitles", {
              method: "POST",
              body: formData,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const data = await resp.json();
            if (!resp.ok || data.error) {
              throw new Error(data.detail || data.error || "فشل حرق النصوص داخل الفيديو");
            }
            return data;
          } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === "AbortError") {
              throw new Error("استغرقت المعالجة وقتاً أطول من المتوقع، يرجى المحاولة مرة أخرى");
            }
            throw err;
          }
        },
        onSuccess: (data) => {
          if (window.playerInstance && data.url) {
            window.playerInstance.loadVideo(data.url, data.video_id);
          }
          if (this.subtitlesOverlay) {
            this.subtitlesOverlay.classList.add("hidden");
            this.subtitlesOverlay.innerText = "";
          }
          if (window.timelineInstance) {
            window.timelineInstance.showToast("🎉 تم حرق النصوص المعدلة بنجاح داخل الفيديو!");
          }
        },
      });
    }
  }

  /**
   * Extract Cues Only (without burning yet) for inspection or editing
   */
  async extractCuesOnly() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ يرجى اختيار أو رفع فيديو أولاً");
      }
      return;
    }
    const vidId = window.currentVideoId;
    const statusText = document.getElementById("subtitles-status-text");
    const extractBtn = document.getElementById("extract-cues-only-btn");
    const originalBtnHtml = extractBtn ? extractBtn.innerHTML : "";

    if (extractBtn) {
      extractBtn.disabled = true;
      extractBtn.classList.add("opacity-60", "cursor-not-allowed");
      extractBtn.innerHTML = `⏳ جاري الاستخراج...`;
    }

    if (statusText) {
      statusText.innerText = "⏳ جاري سحب مقطع الصوت وتفريغ الكلام العربي بسرعة فائقة...";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s safety client timeout

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("language", "ar");
      formData.append("chunk_reels", this.styling.chunkForReels !== false ? "true" : "false");
      formData.append("max_words", "4");

      const resp = await fetch("/api/video/subtitles", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await resp.json();
      if (!resp.ok || !data.success || !data.cues || data.cues.length === 0) {
        throw new Error(data.error || "لم يتم رصد كلام واضح في مقطع الصوت");
      }

      this.cues = data.cues || [];
      this.renderCuesList();
      this.updateTimelineSubtitleBlocks();
      if (statusText) {
        statusText.innerText = `✅ تم استخراج ${this.cues.length} سطر كلام بنمط الريلز بدقة عالية وخلال ثوانٍ! اضغط "حرق النصوص المعدلة" لحرقها.`;
      }
      if (window.timelineInstance) {
        window.timelineInstance.showToast(`✅ تم استخراج ${this.cues.length} سطر كلام بنمط الريلز بدقة عالية!`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const errMsg = err.name === "AbortError"
        ? "استغرقت معالجة الصوت وقتاً أطول من المتوقع، يرجى المحاولة مرة أخرى أو فحص المقطع"
        : (err.message || "فشل استخراج النصوص");
      if (statusText) statusText.innerText = `⚠️ ${errMsg}`;
      if (window.timelineInstance) {
        window.timelineInstance.showToast(`⚠️ ${errMsg}`);
      }
    } finally {
      if (extractBtn) {
        extractBtn.disabled = false;
        extractBtn.classList.remove("opacity-60", "cursor-not-allowed");
        extractBtn.innerHTML = originalBtnHtml;
      }
    }
  }


  addManualCue() {
    const video = document.getElementById("main-video");
    const currentSec = video && video.currentTime > 0 ? video.currentTime : 0.0;
    const startSec = parseFloat(currentSec.toFixed(2));
    const endSec = parseFloat((currentSec + 2.5).toFixed(2));

    this.cues.push({
      id: this.cues.length + 1,
      start_sec: startSec,
      end_sec: endSec,
      start: this.formatTimecode(startSec),
      end: this.formatTimecode(endSec),
      text: "نص الريلز هنا...",
    });

    this.renderCuesList();
    this.updateTimelineSubtitleBlocks();
  }

  removeCue(idx) {
    if (this.cues[idx]) {
      this.cues.splice(idx, 1);
      this.renderCuesList();
      this.updateTimelineSubtitleBlocks();
    }
  }

  renderCuesList() {
    const cuesList = document.getElementById("subtitles-cues-list");
    if (!cuesList) return;

    if (this.cues.length === 0) {
      cuesList.innerHTML = `
        <div class="text-center text-gray-500 text-xs py-3">
          اضغط زر استخراج النصوص أو التوليد التلقائي بالأعلى لقراءة الصوت وحرق الترجمة!
        </div>
      `;
      return;
    }

    cuesList.innerHTML = "";
    this.cues.forEach((cue, idx) => {
      const item = document.createElement("div");
      item.className = "p-2 rounded-lg bg-gray-900 border border-gray-800 text-xs flex flex-col gap-1 transition hover:border-purple-500/50";
      item.innerHTML = `
        <div class="flex items-center justify-between text-gray-400 font-mono text-[11px]">
          <span class="text-yellow-400 font-bold">#${idx + 1}</span>
          <div class="flex items-center gap-2">
            <span>${cue.start} ➜ ${cue.end}</span>
            <button type="button" class="text-red-400 hover:text-red-300 text-sm px-1" title="حذف" onclick="window.subtitlesInstance.removeCue(${idx})">🗑️</button>
          </div>
        </div>
        <input type="text" value="${cue.text.replace(/"/g, "&quot;")}" class="w-full bg-black/60 border border-gray-700/80 rounded px-2.5 py-1 text-gray-100 font-bold text-xs focus:border-yellow-400 focus:outline-none" oninput="window.updateCueText(${idx}, this.value)" />
      `;
      cuesList.appendChild(item);
    });

    // Download SRT
    const dlSrt = document.getElementById("download-srt-btn");
    if (dlSrt) {
      const srtText = this.buildSrtClient(this.cues);
      const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
      dlSrt.href = URL.createObjectURL(blob);
      dlSrt.classList.remove("hidden");
    }

    // Download ASS
    const dlAss = document.getElementById("download-ass-btn");
    if (dlAss) {
      const assText = this.buildAssClient(this.cues);
      const blobAss = new Blob([assText], { type: "text/plain;charset=utf-8" });
      dlAss.href = URL.createObjectURL(blobAss);
      dlAss.classList.remove("hidden");
    }
  }

  buildSrtClient(cues) {
    const lines = [];
    cues.forEach((cue, i) => {
      const start = (cue.start || "00:00:00.000").replace(".", ",");
      const end = (cue.end || "00:00:02.000").replace(".", ",");
      lines.push(`${i + 1}\n${start} --> ${end}\n${cue.text}\n`);
    });
    return lines.join("\n");
  }

  buildAssClient(cues) {
    const font = this.styling.fontFamily || "Cairo";
    const size = this.styling.fontSize || 46;
    const border = this.styling.borderStyle || 1;
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: VideoProReels,${font},${size},&H0015ccfa,&H00000000,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${border},3.5,1,2,40,40,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    const events = [];
    cues.forEach((cue) => {
      const s = cue.start_sec || 0;
      const e = cue.end_sec || s + 2;
      const fmt = (sec) => {
        const totalCs = Math.round(Math.max(0, Number(sec)) * 100);
        const cs = totalCs % 100;
        const totalS = Math.floor(totalCs / 100);
        const sc = totalS % 60;
        const totalM = Math.floor(totalS / 60);
        const m = totalM % 60;
        const h = Math.floor(totalM / 60);
        return `${h}:${String(m).padStart(2, "0")}:${String(sc).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
      };
      events.push(`Dialogue: 0,${fmt(s)},${fmt(e)},VideoProReels,,0,0,0,,${cue.text}`);
    });
    return header + events.join("\n") + "\n";
  }

  formatTimecode(sec) {
    const totalMs = Math.round(Math.max(0, Number(sec)) * 1000);
    const ms = totalMs % 1000;
    const totalS = Math.floor(totalMs / 1000);
    const s = totalS % 60;
    const totalM = Math.floor(totalS / 60);
    const m = totalM % 60;
    const h = Math.floor(totalM / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  updateTimelineSubtitleBlocks() {
    const track = document.getElementById("subtitles-timeline-track");
    if (!track) return;
    track.innerHTML = "";

    const video = document.getElementById("main-video");
    const totalDuration = video && video.duration > 0 ? video.duration : window.timelineInstance?.duration || 60;

    this.cues.forEach((cue) => {
      const leftPct = (cue.start_sec / totalDuration) * 100;
      const widthPct = Math.max(3, ((cue.end_sec - cue.start_sec) / totalDuration) * 100);

      const block = document.createElement("div");
      block.className = "subtitle-block";
      block.style.left = `${leftPct}%`;
      block.style.width = `${widthPct}%`;
      block.innerText = cue.text;
      block.title = `${cue.start} - ${cue.end}: ${cue.text}`;
      block.addEventListener("click", () => {
        if (video) video.currentTime = cue.start_sec;
      });
      track.appendChild(block);
    });
  }
}

window.SubtitlesManager = SubtitlesManager;
window.updateCueText = function (idx, text) {
  if (window.subtitlesInstance && window.subtitlesInstance.cues[idx]) {
    window.subtitlesInstance.cues[idx].text = text;
  }
};
