/**
 * VideoPro Edit v2.0 - Real AI Subtitles, Live Speech-to-Text, Multi-Language Translator & Karaoke Engine
 * Extracts real captions/transcripts from YouTube videos & uploaded videos, translates via Google Translate GTX,
 * supports live browser Web Speech API dictation, and renders crisp, responsive cinema & Reels subtitle overlays!
 */
class SubtitlesManager {
  constructor() {
    this.modal = document.getElementById("subtitles-modal");
    this.subtitlesOverlay = document.getElementById("player-subtitles-overlay");
    this.cues = [];
    this.activeCueIndex = -1;
    this.isListeningMic = false;
    this.recognition = null;
    this.styling = {
      preset: "tiktok_yellow",
      targetLanguage: "ar",
      fontFamily: "Cairo",
      fontSize: 44,
      textColor: "#facc15",
      borderStyle: 1,
      position: "bottom",
      chunkForReels: true,
      popAnimation: true,
      karaokeMode: false,
      bilingualMode: false,
    };

    this.init();
  }

  init() {
    const btn = document.getElementById("tool-subtitles-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-subtitles-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    const autoCaptionBtn = document.getElementById("auto-caption-and-burn-btn");
    if (autoCaptionBtn) {
      autoCaptionBtn.addEventListener("click", () => this.autoCaptionAndBurn());
    }

    const extractCuesBtn = document.getElementById("extract-cues-only-btn");
    if (extractCuesBtn) {
      extractCuesBtn.addEventListener("click", () => this.extractCuesOnly());
    }

    const burnEditedBtn = document.getElementById("burn-edited-cues-btn");
    if (burnEditedBtn) {
      burnEditedBtn.addEventListener("click", () => this.burnEditedCues());
    }

    const addCueBtn = document.getElementById("add-manual-cue-btn");
    if (addCueBtn) {
      addCueBtn.addEventListener("click", () => this.addManualCue());
    }

    const translateCuesBtn = document.getElementById("translate-cues-btn");
    if (translateCuesBtn) {
      translateCuesBtn.addEventListener("click", () => this.translateExistingCues());
    }

    const liveMicBtn = document.getElementById("live-mic-dictate-btn");
    if (liveMicBtn) {
      liveMicBtn.addEventListener("click", () => this.toggleLiveSpeechRecognition());
    }

    const langSelect = document.getElementById("sub-target-lang-select");
    if (langSelect) {
      langSelect.addEventListener("change", (e) => {
        this.styling.targetLanguage = e.target.value;
      });
    }

    const karaokeToggle = document.getElementById("sub-karaoke-toggle");
    if (karaokeToggle) {
      karaokeToggle.addEventListener("change", (e) => {
        this.styling.karaokeMode = e.target.checked;
      });
    }

    const bilingualToggle = document.getElementById("sub-bilingual-toggle");
    if (bilingualToggle) {
      bilingualToggle.addEventListener("change", (e) => {
        this.styling.bilingualMode = e.target.checked;
      });
    }

    const importSrtInput = document.getElementById("import-srt-input");
    if (importSrtInput) {
      importSrtInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          this.importSrtFile(e.target.files[0]);
        }
      });
    }

    const previewBtn = document.getElementById("preview-subtitles-overlay-btn");
    if (previewBtn) {
      previewBtn.addEventListener("click", () => {
        this.closeModal();
        if (window.videoPlayerInstance) {
          window.videoPlayerInstance.seekTo(0);
          if (!window.videoPlayerInstance.isPlaying) {
            window.videoPlayerInstance.togglePlay();
          }
        }
        if (window.timelineInstance) {
          window.timelineInstance.showToast("👁️ يتم الآن تشغيل الفيديو مع معاينة الترجمة الحية على الشاشة");
        }
      });
    }

    const presetButtons = document.querySelectorAll(".sub-preset-btn");
    presetButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const targetBtn = e.currentTarget;
        presetButtons.forEach((b) =>
          b.classList.remove("active", "border-yellow-400/60", "bg-yellow-400/10")
        );
        targetBtn.classList.add("active", "border-yellow-400/60", "bg-yellow-400/10");

        const presetKey = targetBtn.getAttribute("data-preset") || "tiktok_yellow";
        this.applyPreset(presetKey);
      });
    });

    const fontSelect = document.getElementById("sub-font-select");
    if (fontSelect) {
      fontSelect.addEventListener("change", (e) => {
        this.styling.fontFamily = e.target.value;
        this.applySubtitleStyling();
      });
    }

    const posSelect = document.getElementById("sub-pos-select");
    if (posSelect) {
      posSelect.addEventListener("change", (e) => {
        this.styling.position = e.target.value;
        this.applySubtitleStyling();
      });
    }

    const borderSelect = document.getElementById("sub-border-style-select");
    if (borderSelect) {
      borderSelect.addEventListener("change", (e) => {
        this.styling.borderStyle = parseInt(e.target.value, 10) || 1;
        this.applySubtitleStyling();
      });
    }

    const colorPicker = document.getElementById("sub-color-picker");
    if (colorPicker) {
      colorPicker.addEventListener("input", (e) => {
        this.styling.textColor = e.target.value;
        this.applySubtitleStyling();
      });
    }

    const sizeRange = document.getElementById("sub-size-range");
    const sizeVal = document.getElementById("sub-size-val");
    if (sizeRange) {
      sizeRange.addEventListener("input", (e) => {
        this.styling.fontSize = parseInt(e.target.value, 10) || 44;
        if (sizeVal) sizeVal.innerText = this.styling.fontSize;
        this.applySubtitleStyling();
      });
    }

    const chunkToggle = document.getElementById("sub-chunk-reels-toggle");
    if (chunkToggle) {
      chunkToggle.addEventListener("change", (e) => {
        this.styling.chunkForReels = e.target.checked;
      });
    }

    const popToggle = document.getElementById("sub-pop-anim-toggle");
    if (popToggle) {
      popToggle.addEventListener("change", (e) => {
        this.styling.popAnimation = e.target.checked;
      });
    }

    this.applySubtitleStyling();
    window.subtitlesInstance = this;
  }

  toggleLiveSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const statusText = document.getElementById("subtitles-status-text");
    const micBtn = document.getElementById("live-mic-dictate-btn");

    if (!SpeechRec) {
      if (statusText) {
        statusText.innerText = "⚠️ متصفحك الحالي لا يدعم Web Speech API المباشر، استخدم زر استخراج النصوص التلقائي.";
      }
      return;
    }

    if (this.isListeningMic && this.recognition) {
      this.recognition.stop();
      this.isListeningMic = false;
      if (micBtn) micBtn.innerText = "🎤 التقاط صوتي حي";
      if (statusText) statusText.innerText = "✅ تم إيقاف الالتقاط الصوتي الحي وحفظ الأسطر.";
      return;
    }

    this.recognition = new SpeechRec();
    const targetLang = document.getElementById("sub-target-lang-select")?.value || "ar";
    this.recognition.lang =
      targetLang === "ar"
        ? "ar-SA"
        : targetLang === "fr"
        ? "fr-FR"
        : targetLang === "tr"
        ? "tr-TR"
        : targetLang === "es"
        ? "es-ES"
        : "en-US";
    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListeningMic = true;
      if (micBtn) micBtn.innerText = "⏹ إيقاف الالتقاط الحي";
      if (statusText) statusText.innerText = "🎙️ جاري الاستماع لصوت الفيديو/المايكروفون وتفريغ الكلام الحقيقي لحظياً...";
      if (window.videoPlayerInstance && !window.videoPlayerInstance.isPlaying) {
        window.videoPlayerInstance.togglePlay();
      }
    };

    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim();
          if (transcript) {
            const curSec = window.videoPlayerInstance
              ? window.videoPlayerInstance.getCurrentTime()
              : this.cues.length * 3;
            const startSec = Math.max(0, parseFloat((curSec - 2.2).toFixed(2)));
            const endSec = parseFloat(Math.max(startSec + 1.8, curSec + 0.3).toFixed(2));
            this.cues.push({
              id: this.cues.length + 1,
              start_sec: startSec,
              end_sec: endSec,
              start: this.formatTimecode(startSec),
              end: this.formatTimecode(endSec),
              text: transcript,
            });
            this.renderCuesList();
            this.updateTimelineSubtitleBlocks();
          }
        }
      }
    };

    this.recognition.onerror = () => {
      this.isListeningMic = false;
      if (micBtn) micBtn.innerText = "🎤 التقاط صوتي حي";
    };

    this.recognition.onend = () => {
      this.isListeningMic = false;
      if (micBtn) micBtn.innerText = "🎤 التقاط صوتي حي";
    };

    try {
      this.recognition.start();
    } catch (e) {}
  }

  applyPreset(presetKey) {
    this.styling.preset = presetKey;
    const fontSelect = document.getElementById("sub-font-select");
    const colorPicker = document.getElementById("sub-color-picker");
    const borderSelect = document.getElementById("sub-border-style-select");
    const sizeRange = document.getElementById("sub-size-range");
    const sizeVal = document.getElementById("sub-size-val");
    const karaokeToggle = document.getElementById("sub-karaoke-toggle");

    if (presetKey === "tiktok_yellow") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#facc15";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 44;
      this.styling.karaokeMode = false;
      if (karaokeToggle) karaokeToggle.checked = false;
    } else if (presetKey === "karaoke_gold") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#facc15";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 46;
      this.styling.karaokeMode = true;
      if (karaokeToggle) karaokeToggle.checked = true;
    } else if (presetKey === "tiktok_box") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#ffffff";
      this.styling.borderStyle = 3;
      this.styling.fontSize = 42;
    } else if (presetKey === "tiktok_green") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#22c55e";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 44;
    } else if (presetKey === "tiktok_cyan") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#06b6d4";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 44;
    } else if (presetKey === "tiktok_fire") {
      this.styling.fontFamily = "Cairo";
      this.styling.textColor = "#ff781f";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 44;
    } else if (presetKey === "classic_white") {
      this.styling.fontFamily = "Amiri";
      this.styling.textColor = "#ffffff";
      this.styling.borderStyle = 1;
      this.styling.fontSize = 42;
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
        window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أو جلب فيديو من يوتيوب أولاً لتوليد الترجمة");
      }
      document.getElementById("youtube-url-input")?.focus();
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

  /**
   * Surgically calibrated responsive subtitle styling:
   * - Scales font size proportionally to the actual #player-container width (13px-16px on mobile, 17px-22px on desktop)
   * - Enforces line-height: 1.55 so Arabic lines never overlap vertically
   * - Uses a sleek dark translucent cinema pill backdrop so text is 100% legible without covering the video
   */
  applySubtitleStyling() {
    if (!this.subtitlesOverlay) return;

    const font = this.styling.fontFamily.includes("Amiri")
      ? "'Amiri', serif"
      : this.styling.fontFamily.includes("Cairo")
      ? "'Cairo', sans-serif"
      : this.styling.fontFamily;

    const containerW = document.getElementById("player-container")?.clientWidth || window.innerWidth || 400;
    const isMobile = containerW < 500;
    const scale = isMobile ? 0.31 : 0.43;
    const pxSize = Math.round(Math.max(isMobile ? 13 : 15, Math.min(isMobile ? 16 : 22, this.styling.fontSize * scale)));

    this.subtitlesOverlay.style.fontFamily = font;
    this.subtitlesOverlay.style.fontSize = `${pxSize}px`;
    this.subtitlesOverlay.style.lineHeight = "1.55";
    this.subtitlesOverlay.style.fontWeight = "700";
    this.subtitlesOverlay.style.color = this.styling.textColor;
    this.subtitlesOverlay.style.textAlign = "center";
    this.subtitlesOverlay.style.letterSpacing = "0px";
    this.subtitlesOverlay.style.maxWidth = "88%";
    this.subtitlesOverlay.style.width = "fit-content";
    this.subtitlesOverlay.style.wordBreak = "break-word";

    if (this.styling.borderStyle === 3) {
      this.subtitlesOverlay.style.backgroundColor = "rgba(8, 12, 22, 0.88)";
      this.subtitlesOverlay.style.padding = isMobile ? "4px 10px" : "6px 16px";
      this.subtitlesOverlay.style.borderRadius = "8px";
      this.subtitlesOverlay.style.border = "1px solid rgba(255,255,255,0.12)";
      this.subtitlesOverlay.style.textShadow = "0 1px 2px rgba(0,0,0,0.9)";
    } else {
      this.subtitlesOverlay.style.backgroundColor = "rgba(6, 9, 18, 0.72)";
      this.subtitlesOverlay.style.padding = isMobile ? "3px 10px" : "5px 14px";
      this.subtitlesOverlay.style.borderRadius = "8px";
      this.subtitlesOverlay.style.border = "1px solid rgba(255,255,255,0.08)";
      this.subtitlesOverlay.style.textShadow =
        "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 2px 6px rgba(0,0,0,0.95)";
    }

    if (this.styling.position === "top") {
      this.subtitlesOverlay.style.top = "44px";
      this.subtitlesOverlay.style.bottom = "auto";
    } else if (this.styling.position === "middle") {
      this.subtitlesOverlay.style.top = "46%";
      this.subtitlesOverlay.style.bottom = "auto";
    } else {
      this.subtitlesOverlay.style.top = "auto";
      this.subtitlesOverlay.style.bottom = isMobile ? "38px" : "44px";
    }
  }

  /**
   * Renders the active subtitle cue at currentTime.
   * Automatically windows any long cue (>8 words) into proportional 7-word sub-phrases
   * so the screen NEVER displays more than 1–2 short, clean lines at once!
   */
  renderActiveSubtitle(currentTime) {
    if (!this.subtitlesOverlay || this.cues.length === 0) return;

    const activeCue = this.cues.find((c) => currentTime >= c.start_sec && currentTime <= c.end_sec);
    if (activeCue && activeCue.text.trim()) {
      let rawText = activeCue.text.trim();
      const cueDuration = Math.max(0.4, activeCue.end_sec - activeCue.start_sec);
      const cueProgress = Math.max(0, Math.min(0.999, (currentTime - activeCue.start_sec) / cueDuration));

      // If a single cue has more than 8 words (and is not bilingual), window it into 7-word chunks
      if (!rawText.includes("|")) {
        const allWords = rawText.split(/\s+/);
        if (allWords.length > 8) {
          const maxWordsPerScreen = 7;
          const totalWindows = Math.ceil(allWords.length / maxWordsPerScreen);
          const winIdx = Math.min(totalWindows - 1, Math.floor(cueProgress * totalWindows));
          rawText = allWords.slice(winIdx * maxWordsPerScreen, (winIdx + 1) * maxWordsPerScreen).join(" ");
        }
      }

      if (this.styling.karaokeMode && !rawText.includes("|")) {
        const words = rawText.split(/\s+/);
        const activeWordIdx = Math.floor(cueProgress * words.length);
        this.subtitlesOverlay.innerHTML = `<div class="flex flex-wrap items-center justify-center gap-1 leading-relaxed">${words
          .map((w, idx) =>
            idx === activeWordIdx
              ? `<span style="color:#ffffff; background:#7c3aed; padding:0px 5px; border-radius:5px; display:inline-block;">${w}</span>`
              : `<span>${w}</span>`
          )
          .join(" ")}</div>`;
      } else if (rawText.includes("|")) {
        const [line1, line2] = rawText.split("|").map((s) => s.trim());
        this.subtitlesOverlay.innerHTML = `<div class="flex flex-col items-center gap-0.5 leading-snug"><span>${line1}</span><span class="text-white text-[11px] sm:text-xs opacity-90 font-semibold">${line2}</span></div>`;
      } else {
        this.subtitlesOverlay.innerText = rawText;
      }
      this.subtitlesOverlay.classList.remove("hidden");
      this.subtitlesOverlay.classList.add("flex");
    } else {
      this.subtitlesOverlay.innerText = "";
      this.subtitlesOverlay.classList.add("hidden");
      this.subtitlesOverlay.classList.remove("flex");
    }
  }

  async translateExistingCues() {
    if (!this.cues || this.cues.length === 0) {
      await this.extractCuesOnly();
      if (!this.cues || this.cues.length === 0) return;
    }

    const statusText = document.getElementById("subtitles-status-text");
    const targetLang = document.getElementById("sub-target-lang-select")?.value || "en";
    const bilingual = document.getElementById("sub-bilingual-toggle")?.checked || false;

    if (statusText) {
      statusText.innerText = "🌐 جاري ترجمة نصوص الفيديو الحقيقية...";
    }

    try {
      const fd = new FormData();
      fd.append("cues_json", JSON.stringify(this.cues));
      fd.append("target_language", targetLang);
      fd.append("bilingual", bilingual ? "true" : "false");

      const resp = await fetch("/api/video/translate-cues", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.detail || "فشل ترجمة الأسطر");
      }

      this.cues = data.cues || [];
      this.renderCuesList();
      this.updateTimelineSubtitleBlocks();
      this.applySubtitleStyling();
      if (window.videoPlayerInstance) {
        this.renderActiveSubtitle(window.videoPlayerInstance.getCurrentTime());
      }
      if (statusText) {
        statusText.innerText = `✅ تمت ترجمة ${this.cues.length} سطر بنجاح إلى (${targetLang.toUpperCase()})${
          bilingual ? " بنمط ثنائي اللغة" : ""
        }!`;
      }
      if (window.timelineInstance) {
        window.timelineInstance.showToast("🌐 تمت ترجمة نصوص الفيديو بنجاح!");
      }
    } catch (err) {
      if (statusText) statusText.innerText = `⚠️ ${err.message}`;
    }
  }

  importSrtFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result || "";
      const blocks = content.trim().split(/\n\s*\n/);
      const parsedCues = [];
      blocks.forEach((b) => {
        const lines = b.trim().split("\n");
        if (lines.length >= 2) {
          const timeLine = lines.find((l) => l.includes("-->"));
          if (timeLine) {
            const [sStr, eStr] = timeLine.split("-->").map((s) => s.trim().replace(",", "."));
            const sSec = this.parseTimecodeToSec(sStr);
            const eSec = this.parseTimecodeToSec(eStr);
            const txtLines = lines.slice(lines.indexOf(timeLine) + 1).join(" ").trim();
            if (txtLines) {
              parsedCues.push({
                id: parsedCues.length + 1,
                start_sec: sSec,
                end_sec: eSec,
                start: this.formatTimecode(sSec),
                end: this.formatTimecode(eSec),
                text: txtLines,
              });
            }
          }
        }
      });
      if (parsedCues.length > 0) {
        this.cues = parsedCues;
        this.renderCuesList();
        this.updateTimelineSubtitleBlocks();
        if (window.timelineInstance) {
          window.timelineInstance.showToast(`📥 تم استيراد ${parsedCues.length} سطر ترجمة من ملف ${file.name}`);
        }
      }
    };
    reader.readAsText(file, "utf-8");
  }

  parseTimecodeToSec(tc) {
    const parts = tc.split(":");
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(tc) || 0;
  }

  async autoCaptionAndBurn() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً");
      return;
    }

    const vidId = window.currentVideoId;
    const targetLang = document.getElementById("sub-target-lang-select")?.value || "ar";
    const fontName = this.styling.fontFamily || "Cairo";
    const fontSize = this.styling.fontSize || 44;
    const textColor = this.styling.textColor || "#facc15";
    const position = this.styling.position || "bottom";
    const borderStyle = this.styling.borderStyle || 1;
    const preset = this.styling.preset || "tiktok_yellow";
    const chunkForReels = this.styling.chunkForReels !== false;
    const popAnim = this.styling.popAnimation !== false;
    const karaokeMode = document.getElementById("sub-karaoke-toggle")?.checked || false;
    const bilingualMode = document.getElementById("sub-bilingual-toggle")?.checked || false;

    const statusText = document.getElementById("subtitles-status-text");
    if (statusText) {
      statusText.innerText = "⏳ جاري استخراج الكلام والشرح الحقيقي من الفيديو وترجمته...";
    }

    if (window.tasksManager) {
      await window.tasksManager.runBackgroundTask({
        type: "autocaption",
        title: `توليد وترجمة وحرق نصوص الفيديو (${targetLang.toUpperCase()}${bilingualMode ? " مزدوجة" : ""})`,
        icon: "✨",
        details: "[1/2] جاري استخراج الكلام الحقيقي من الفيديو...",
        dismissModalId: null,
        apiCall: async () => {
          const extractFormData = new FormData();
          extractFormData.append("video_id", vidId);
          extractFormData.append("language", targetLang);
          extractFormData.append("chunk_reels", chunkForReels ? "true" : "false");
          extractFormData.append("max_words", "6");
          extractFormData.append("bilingual", bilingualMode ? "true" : "false");

          const extractResp = await fetch("/api/video/subtitles", {
            method: "POST",
            body: extractFormData,
          });
          const extractData = await extractResp.json();
          if (!extractResp.ok || !extractData.success || !extractData.cues || extractData.cues.length === 0) {
            throw new Error(extractData.error || "لم يتم رصد كلام واضح في مقطع الصوت لاستخراجه");
          }

          this.cues = extractData.cues;
          this.renderCuesList();
          this.updateTimelineSubtitleBlocks();

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
          burnFormData.append("chunk_for_reels", "false");
          burnFormData.append("karaoke_mode", karaokeMode ? "true" : "false");
          burnFormData.append("bilingual_mode", bilingualMode ? "true" : "false");

          const burnResp = await fetch("/api/video/burn-subtitles", {
            method: "POST",
            body: burnFormData,
          });
          const burnData = await burnResp.json();
          if (!burnResp.ok || burnData.error) {
            throw new Error(burnData.detail || burnData.error || "فشل حرق النصوص داخل الفيديو");
          }
          burnData.cues = this.cues;
          burnData.srt = extractData.srt || "";
          return burnData;
        },
        onSuccess: (data) => {
          this.cues = data.cues || [];
          this.renderCuesList();
          this.updateTimelineSubtitleBlocks();
          this.applySubtitleStyling();
          if (statusText) {
            statusText.innerText = `✅ تم استخراج وترجمة وتطبيق ${this.cues.length} سطر من محتوى الفيديو الحقيقي!`;
          }
          if (!window.videoPlayerInstance?.isSynthesizedPlatformStream && data.url && !data.url.startsWith("blob:")) {
            const vEl = document.getElementById("main-video");
            if (vEl) {
              vEl.src = data.url;
              vEl.play().catch(() => {});
            }
          } else if (window.videoPlayerInstance) {
            this.renderActiveSubtitle(window.videoPlayerInstance.getCurrentTime());
          }
        },
      });
    }
  }

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
    const fontSize = this.styling.fontSize || 44;
    const textColor = this.styling.textColor || "#facc15";
    const position = this.styling.position || "bottom";
    const borderStyle = this.styling.borderStyle || 1;
    const preset = this.styling.preset || "tiktok_yellow";
    const popAnim = this.styling.popAnimation !== false;
    const karaokeMode = document.getElementById("sub-karaoke-toggle")?.checked || false;
    const bilingualMode = document.getElementById("sub-bilingual-toggle")?.checked || false;

    if (window.tasksManager) {
      await window.tasksManager.runBackgroundTask({
        type: "burn_subtitles",
        title: "حرق النصوص المعدلة (نمط الريلز والكاريوكي)",
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
          formData.append("chunk_for_reels", "false");
          formData.append("karaoke_mode", karaokeMode ? "true" : "false");
          formData.append("bilingual_mode", bilingualMode ? "true" : "false");

          const resp = await fetch("/api/video/burn-subtitles", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) {
            throw new Error(data.detail || data.error || "فشل حرق النصوص داخل الفيديو");
          }
          return data;
        },
        onSuccess: (data) => {
          this.applySubtitleStyling();
          if (!window.videoPlayerInstance?.isSynthesizedPlatformStream && data.url && !data.url.startsWith("blob:")) {
            const vEl = document.getElementById("main-video");
            if (vEl) {
              vEl.src = data.url;
              vEl.play().catch(() => {});
            }
          } else if (window.videoPlayerInstance) {
            this.renderActiveSubtitle(window.videoPlayerInstance.getCurrentTime());
          }
        },
      });
    }
  }

  async extractCuesOnly() {
    if (!window.currentVideoId) return;
    const vidId = window.currentVideoId;
    const statusText = document.getElementById("subtitles-status-text");
    const targetLang = document.getElementById("sub-target-lang-select")?.value || "ar";
    const bilingualMode = document.getElementById("sub-bilingual-toggle")?.checked || false;

    if (statusText) {
      statusText.innerText = "⏳ جاري استخراج النص والشرح الحقيقي من الفيديو وترجمته...";
    }

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("language", targetLang);
      formData.append("chunk_reels", this.styling.chunkForReels !== false ? "true" : "false");
      formData.append("max_words", "6");
      formData.append("bilingual", bilingualMode ? "true" : "false");

      const resp = await fetch("/api/video/subtitles", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "لم يتم رصد كلام واضح في مقطع الصوت");
      }

      this.cues = data.cues || [];
      this.renderCuesList();
      this.updateTimelineSubtitleBlocks();
      this.applySubtitleStyling();
      if (window.videoPlayerInstance) {
        this.renderActiveSubtitle(window.videoPlayerInstance.getCurrentTime());
      }
      if (statusText) {
        statusText.innerText = `✅ تم استخراج ${this.cues.length} سطر من محتوى الفيديو الحقيقي! يمكنك معاينتها أو تعديلها أو حرقها.`;
      }
      if (window.timelineInstance) {
        window.timelineInstance.showToast(`✅ تم استخراج ${this.cues.length} سطر ترجمة من الفيديو!`);
      }
    } catch (err) {
      if (statusText) statusText.innerText = `⚠️ ${err.message}`;
    }
  }

  addManualCue() {
    const currentSec = window.videoPlayerInstance ? window.videoPlayerInstance.getCurrentTime() : 0.0;
    const startSec = parseFloat(currentSec.toFixed(2));
    const endSec = parseFloat((currentSec + 2.5).toFixed(2));

    this.cues.push({
      id: this.cues.length + 1,
      start_sec: startSec,
      end_sec: endSec,
      start: this.formatTimecode(startSec),
      end: this.formatTimecode(endSec),
      text: "أدخل نص الترجمة هنا...",
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
        <div class="text-center text-gray-400 text-xs py-3">
          اضغط زر "استخراج النصوص" أو "توليد وترجمة وحرق نصوص الريلز" بالأعلى لاستخراج الترجمة والشرح الحقيقي من الفيديو!
        </div>
      `;
      return;
    }

    cuesList.innerHTML = "";
    this.cues.forEach((cue, idx) => {
      const item = document.createElement("div");
      item.className =
        "p-2 rounded-lg bg-gray-900 border border-gray-800 text-xs flex flex-col gap-1 transition hover:border-purple-500/50";
      item.innerHTML = `
        <div class="flex items-center justify-between text-gray-400 font-mono text-[11px]">
          <button type="button" class="text-yellow-400 hover:underline font-bold cursor-pointer" onclick="window.videoPlayerInstance?.seekTo(${cue.start_sec})">#${
        idx + 1
      } (${cue.start} ➜ ${cue.end}) ▶</button>
          <button type="button" class="text-red-400 hover:text-red-300 text-sm px-1 cursor-pointer" title="حذف" onclick="window.subtitlesInstance.removeCue(${idx})">🗑️</button>
        </div>
        <input type="text" value="${String(cue.text || "").replace(
          /"/g,
          "&quot;"
        )}" class="w-full bg-black/60 border border-gray-700/80 rounded px-2.5 py-1 text-gray-100 font-bold text-xs focus:border-yellow-400 focus:outline-none" oninput="window.updateCueText(${idx}, this.value)" />
      `;
      cuesList.appendChild(item);
    });

    const dlSrt = document.getElementById("download-srt-btn");
    if (dlSrt) {
      const srtText = this.buildSrtClient(this.cues);
      const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
      dlSrt.href = URL.createObjectURL(blob);
      dlSrt.classList.remove("hidden");
    }

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
    const size = this.styling.fontSize || 44;
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
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
      ms
    ).padStart(3, "0")}`;
  }

  updateTimelineSubtitleBlocks() {
    const track = document.getElementById("subtitles-timeline-track");
    if (!track) return;
    track.innerHTML = "";

    const totalDuration =
      window.videoPlayerInstance?.getDuration() || window.timelineInstance?.duration || 60;

    // If there are many cues (e.g. 50-100 cues in a 9-minute video), render clean proportional blocks
    this.cues.forEach((cue) => {
      const leftPct = Math.min(98, Math.max(0, (cue.start_sec / totalDuration) * 100));
      const widthPct = Math.max(1.2, ((cue.end_sec - cue.start_sec) / totalDuration) * 100);

      const block = document.createElement("div");
      block.className = "subtitle-block";
      block.style.left = `${leftPct}%`;
      block.style.width = `${widthPct}%`;
      block.innerText = cue.text;
      block.title = `${cue.start} - ${cue.end}: ${cue.text}`;
      block.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.videoPlayerInstance) {
          window.videoPlayerInstance.seekTo(cue.start_sec);
        }
      });
      track.appendChild(block);
    });
  }
}

window.SubtitlesManager = SubtitlesManager;
window.updateCueText = function (idx, text) {
  if (window.subtitlesInstance && window.subtitlesInstance.cues[idx]) {
    window.subtitlesInstance.cues[idx].text = text;
    window.subtitlesInstance.updateTimelineSubtitleBlocks();
    if (window.videoPlayerInstance) {
      window.subtitlesInstance.renderActiveSubtitle(window.videoPlayerInstance.getCurrentTime());
    }
  }
};
