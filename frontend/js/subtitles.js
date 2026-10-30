/**
 * VideoPro Edit - Subtitles & Multilingual Translation Engine
 * Handles Speech-to-text (Web Speech & Gemini AI), real-time styling,
 * translation, and burning subtitles permanently into the video file.
 */
class SubtitlesManager {
  constructor() {
    this.modal = document.getElementById("subtitles-modal");
    this.subtitlesOverlay = document.getElementById("player-subtitles-overlay");
    this.cues = [];
    this.activeCueIndex = -1;
    this.styling = {
      fontFamily: "Amiri",
      fontSize: 36,
      textColor: "#facc15",
      position: "bottom",
    };
    this.isListening = false;
    this.recognition = null;

    this.init();
  }

  init() {
    const btn = document.getElementById("tool-subtitles-btn");
    if (btn) btn.addEventListener("click", () => this.openModal());

    const closeBtn = document.getElementById("close-subtitles-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());

    // Mode Selector Tabs (Browser Web Speech vs Gemini AI)
    const browserTabBtn = document.getElementById("sub-mode-browser-btn");
    const geminiTabBtn = document.getElementById("sub-mode-gemini-btn");
    const browserPanel = document.getElementById("sub-panel-browser");
    const geminiPanel = document.getElementById("sub-panel-gemini");

    if (browserTabBtn && geminiTabBtn) {
      browserTabBtn.addEventListener("click", () => {
        browserTabBtn.className = "flex-1 py-1.5 px-2 rounded-lg font-bold text-center transition bg-purple-600 text-white shadow";
        geminiTabBtn.className = "flex-1 py-1.5 px-2 rounded-lg font-bold text-center transition text-gray-400 hover:text-white";
        browserPanel?.classList.remove("hidden");
        browserPanel?.classList.add("flex");
        geminiPanel?.classList.add("hidden");
        geminiPanel?.classList.remove("flex");
      });

      geminiTabBtn.addEventListener("click", () => {
        geminiTabBtn.className = "flex-1 py-1.5 px-2 rounded-lg font-bold text-center transition bg-blue-600 text-white shadow";
        browserTabBtn.className = "flex-1 py-1.5 px-2 rounded-lg font-bold text-center transition text-gray-400 hover:text-white";
        geminiPanel?.classList.remove("hidden");
        geminiPanel?.classList.add("flex");
        browserPanel?.classList.add("hidden");
        browserPanel?.classList.remove("flex");
      });
    }

    // Load persisted Gemini API Key
    const keyInput = document.getElementById("gemini-api-key-input");
    if (keyInput) {
      const savedKey = localStorage.getItem("videopro_gemini_key") || "";
      if (savedKey) keyInput.value = savedKey;
      keyInput.addEventListener("input", (e) => {
        localStorage.setItem("videopro_gemini_key", e.target.value.trim());
      });
    }

    // Start / Stop Browser Speech Recognition Buttons
    const startRecBtn = document.getElementById("start-speech-rec-btn");
    const stopRecBtn = document.getElementById("stop-speech-rec-btn");
    if (startRecBtn) startRecBtn.addEventListener("click", () => this.startBrowserSpeechRecognition());
    if (stopRecBtn) stopRecBtn.addEventListener("click", () => this.stopBrowserSpeechRecognition());

    // Generate Subtitles Button (Gemini AI)
    const genBtn = document.getElementById("generate-subtitles-btn");
    if (genBtn) genBtn.addEventListener("click", () => this.generateGeminiSubtitles());

    // Burn Subtitles Button (Hardcode into MP4 frames)
    const burnBtn = document.getElementById("burn-subtitles-btn");
    if (burnBtn) burnBtn.addEventListener("click", () => this.burnSubtitlesIntoVideo());

    // Preview Subtitles on Screen Button
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
          window.timelineInstance.showToast("👁️ يتم الآن تشغيل الفيديو مع ظهور الترجمة على الشاشة");
        }
      });
    }

    // Add manual cue button
    const addCueBtn = document.getElementById("add-manual-cue-btn");
    if (addCueBtn) addCueBtn.addEventListener("click", () => this.addManualCue());

    // Styling listeners
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
        this.styling.fontSize = parseInt(e.target.value, 10) || 36;
        if (sizeVal) sizeVal.innerText = this.styling.fontSize;
        this.applySubtitleStyling();
      });
    }

    // Video timeupdate sync for overlay captions
    const video = document.getElementById("main-video");
    if (video) {
      video.addEventListener("timeupdate", () => {
        this.renderActiveSubtitle(video.currentTime);
      });
    }

    window.subtitlesInstance = this;
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
    if (this.isListening) {
      this.stopBrowserSpeechRecognition();
    }
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  applySubtitleStyling() {
    if (!this.subtitlesOverlay) return;
    this.subtitlesOverlay.style.fontFamily = this.styling.fontFamily.includes("Amiri") ? "'Amiri', serif" : this.styling.fontFamily;
    this.subtitlesOverlay.style.fontSize = `${Math.round(this.styling.fontSize * 0.75)}px`;
    this.subtitlesOverlay.style.color = this.styling.textColor;
    this.subtitlesOverlay.style.textShadow = "0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)";

    if (this.styling.position === "top") {
      this.subtitlesOverlay.style.top = "10%";
      this.subtitlesOverlay.style.bottom = "auto";
    } else if (this.styling.position === "middle") {
      this.subtitlesOverlay.style.top = "45%";
      this.subtitlesOverlay.style.bottom = "auto";
    } else {
      this.subtitlesOverlay.style.top = "auto";
      this.subtitlesOverlay.style.bottom = "12%";
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
   * 1. Browser Speech Recognition (Web Speech API)
   * 100% Free, runs in client browser (Chrome/Edge/Android), zero server costs.
   */
  startBrowserSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const statusText = document.getElementById("subtitles-status-text");

    if (!SpeechRecognition) {
      if (statusText) {
        statusText.innerText = "متصفحك لا يدعم التعرف الصوتي المباشر. يرجى استخدام متصفح Chrome أو إدخال مفتاح Gemini المجاني.";
      }
      return;
    }

    const video = document.getElementById("main-video");
    if (!video) return;

    const speechLangSelect = document.getElementById("sub-speech-lang-select");
    const chosenLang = speechLangSelect ? speechLangSelect.value : "ar-SA";

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = chosenLang;

      const startRecBtn = document.getElementById("start-speech-rec-btn");
      const stopRecBtn = document.getElementById("stop-speech-rec-btn");
      const speechLabel = document.getElementById("speech-rec-label");
      const speechIcon = document.getElementById("speech-rec-icon");

      this.isListening = true;
      if (startRecBtn) startRecBtn.classList.add("hidden");
      if (stopRecBtn) stopRecBtn.classList.remove("hidden");
      if (speechIcon) speechIcon.innerText = "🔴";
      if (statusText) statusText.innerText = "🔴 جاري الاستماع إلى كلام الفيديو وتحويله إلى نصوص...";

      // Clear existing cues for fresh transcription
      this.cues = [];
      this.renderCuesList();

      // Start playing video from the beginning with volume unmuted
      video.currentTime = 0;
      video.muted = false;
      video.volume = 1.0;
      video.play().catch(() => {});

      let lastStartTime = 0.0;

      this.recognition.onresult = async (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            let spokenText = event.results[i][0].transcript.trim();
            if (!spokenText) continue;

            const currentSec = Math.max(0.5, video.currentTime);
            const cueStart = Math.max(0.0, lastStartTime);
            const cueEnd = currentSec;
            lastStartTime = currentSec;

            // If audio was English, translate to Arabic in real time
            if (chosenLang.startsWith("en")) {
              try {
                const transRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(spokenText)}&langpair=en|ar`);
                const transData = await transRes.json();
                if (transData?.responseData?.translatedText) {
                  spokenText = transData.responseData.translatedText;
                }
              } catch (e) {
                console.warn("Translation fallback error:", e);
              }
            }

            this.cues.push({
              id: this.cues.length + 1,
              start_sec: parseFloat(cueStart.toFixed(2)),
              end_sec: parseFloat(cueEnd.toFixed(2)),
              start: this.formatTimecode(cueStart),
              end: this.formatTimecode(cueEnd),
              text: spokenText,
            });

            this.renderCuesList();
            this.updateTimelineSubtitleBlocks();
            if (statusText) statusText.innerText = `تم استخراج ${this.cues.length} أسطر كلام متزامنة بنجاح!`;
          }
        }
      };

      this.recognition.onerror = (e) => {
        console.warn("Speech recognition error:", e);
        if (e.error === "no-speech") return;
        if (statusText) statusText.innerText = `تنبيه في التعرف الصوتي: ${e.error}`;
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          // If video still playing, restart recognition
          if (!video.paused && !video.ended) {
            try { this.recognition.start(); } catch (err) {}
          } else {
            this.stopBrowserSpeechRecognition();
          }
        }
      };

      video.onended = () => {
        this.stopBrowserSpeechRecognition();
      };

      this.recognition.start();
    } catch (err) {
      if (statusText) statusText.innerText = `خطأ في بدء التعرف الصوتي: ${err.message}`;
      this.stopBrowserSpeechRecognition();
    }
  }

  stopBrowserSpeechRecognition() {
    this.isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }

    const startRecBtn = document.getElementById("start-speech-rec-btn");
    const stopRecBtn = document.getElementById("stop-speech-rec-btn");
    const speechIcon = document.getElementById("speech-rec-icon");
    const statusText = document.getElementById("subtitles-status-text");

    if (startRecBtn) startRecBtn.classList.remove("hidden");
    if (stopRecBtn) stopRecBtn.classList.add("hidden");
    if (speechIcon) speechIcon.innerText = "🎙️";

    if (statusText && this.cues.length > 0) {
      statusText.innerText = `✅ اكتمل التفريغ! تم تسجيل ${this.cues.length} سطر كلام. يمكنك التعديل عليها أو حرقها داخل الفيديو الآن.`;
    }
  }

  /**
   * 2. Gemini AI Speech-to-Text & Translation
   * State-of-the-art multilingual audio comprehension and translation.
   */
  async generateGeminiSubtitles() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً للبدء");
      this.closeModal();
      document.getElementById("video-file-input")?.click();
      return;
    }

    const langSelect = document.getElementById("sub-lang-select");
    const targetLang = langSelect ? langSelect.value : "ar";
    const vidId = window.currentVideoId;

    const keyInput = document.getElementById("gemini-api-key-input");
    const geminiKey = keyInput ? keyInput.value.trim() : (localStorage.getItem("videopro_gemini_key") || "");

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "subtitles",
        title: `تفريغ وترجمة بالذكاء الاصطناعي (${targetLang === "ar" ? "العربية" : targetLang})`,
        icon: "✨",
        dismissModalId: "subtitles-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("language", targetLang);
          if (geminiKey) formData.append("gemini_key", geminiKey);

          const resp = await fetch("/api/video/subtitles", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) {
            throw new Error(data.error || "فشل تفريغ الترجمة بالذكاء الاصطناعي");
          }
          return data;
        },
        onSuccess: (data) => {
          this.cues = data.cues || [];
          this.renderCuesList();
          this.updateTimelineSubtitleBlocks();

          const statusText = document.getElementById("subtitles-status-text");
          if (statusText) {
            statusText.innerText = `🎉 تم استخراج ${this.cues.length} سطر ترجمة بنجاح! يمكنك الآن حرقها داخل الفيديو.`;
          }
          if (window.timelineInstance) {
            window.timelineInstance.showToast(`✨ تم استخراج ${this.cues.length} أسطر ترجمة بالذكاء الاصطناعي!`);
          }
        },
      });
      return;
    }
  }

  /**
   * 3. Burn Subtitles permanently into MP4 frames ("ويحطو بالفيديو")
   */
  async burnSubtitlesIntoVideo() {
    if (!window.currentVideoId) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ يرجى رفع فيديو أولاً");
      return;
    }

    if (!this.cues || this.cues.length === 0) {
      const statusText = document.getElementById("subtitles-status-text");
      if (statusText) statusText.innerText = "⚠️ يرجى تفريغ كلام الفيديو أولاً أو إضافة أسطر ترجمة قبل الحرق.";
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ لا توجد أسطر ترجمة لحرقها داخل الفيديو");
      return;
    }

    const vidId = window.currentVideoId;
    const fontName = this.styling.fontFamily || "Amiri";
    const fontSize = this.styling.fontSize || 36;
    const textColor = this.styling.textColor || "#facc15";
    const position = this.styling.position || "bottom";
    const cuesJson = JSON.stringify(this.cues);

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "burn_subtitles",
        title: `حرق وتثبيت الترجمة داخل الفيديو (${this.cues.length} سطر)`,
        icon: "🎬",
        dismissModalId: "subtitles-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("cues_json", cuesJson);
          formData.append("font_name", fontName);
          formData.append("font_size", fontSize);
          formData.append("text_color", textColor);
          formData.append("position", position);

          const resp = await fetch("/api/video/burn-subtitles", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || data.error) {
            throw new Error(data.error || "فشل حرق الترجمة داخل الفيديو");
          }
          return data;
        },
        onSuccess: (data) => {
          if (window.playerInstance && data.url) {
            window.playerInstance.loadVideo(data.url, data.video_id);
          }
          // Hide text overlay since subtitles are now permanently inside video frames
          if (this.subtitlesOverlay) {
            this.subtitlesOverlay.classList.add("hidden");
            this.subtitlesOverlay.innerText = "";
          }
          if (window.timelineInstance) {
            window.timelineInstance.showToast("🎉 تم حرق وتثبيت الترجمة داخل الفيديو بنجاح!");
          }
        },
      });
    }
  }

  addManualCue() {
    const video = document.getElementById("main-video");
    const currentSec = (video && video.currentTime > 0) ? video.currentTime : 0.0;
    const startSec = parseFloat(currentSec.toFixed(2));
    const endSec = parseFloat((currentSec + 3.0).toFixed(2));

    this.cues.push({
      id: this.cues.length + 1,
      start_sec: startSec,
      end_sec: endSec,
      start: this.formatTimecode(startSec),
      end: this.formatTimecode(endSec),
      text: "اكتب نص الترجمة هنا...",
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
        <div class="text-center text-gray-500 text-xs py-4">
          لا توجد أسطر ترجمة حالياً. اضغط "بدء الاستماع" أو "تفريغ بالذكاء الاصطناعي" لتفريغ كلام الفيديو.
        </div>
      `;
      return;
    }

    cuesList.innerHTML = "";
    this.cues.forEach((cue, idx) => {
      const item = document.createElement("div");
      item.className = "p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-xs flex flex-col gap-1.5 transition hover:border-purple-500/50";
      item.innerHTML = `
        <div class="flex items-center justify-between text-gray-400 font-mono text-[11px]">
          <span class="text-purple-400 font-bold">#${idx + 1}</span>
          <div class="flex items-center gap-2">
            <span>${cue.start} ➜ ${cue.end}</span>
            <button type="button" class="text-red-400 hover:text-red-300 text-sm px-1" title="حذف هذا السطر" onclick="window.subtitlesInstance.removeCue(${idx})">🗑️</button>
          </div>
        </div>
        <input type="text" value="${cue.text.replace(/"/g, '&quot;')}" class="w-full bg-black/60 border border-gray-700/80 rounded px-2.5 py-1 text-gray-100 font-medium text-xs focus:border-purple-500 focus:outline-none" oninput="window.updateCueText(${idx}, this.value)" />
      `;
      cuesList.appendChild(item);
    });

    // Update SRT download button if cues exist
    const dlSrt = document.getElementById("download-srt-btn");
    if (dlSrt) {
      const srtText = this.buildSrtClient(this.cues);
      const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
      dlSrt.href = URL.createObjectURL(blob);
      dlSrt.classList.remove("hidden");
    }
  }

  buildSrtClient(cues) {
    const lines = [];
    cues.forEach((cue, i) => {
      const start = cue.start.replace(".", ",");
      const end = cue.end.replace(".", ",");
      lines.push(`${i + 1}\n${start} --> ${end}\n${cue.text}\n`);
    });
    return lines.join("\n");
  }

  formatTimecode(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  updateTimelineSubtitleBlocks() {
    const track = document.getElementById("subtitles-timeline-track");
    if (!track) return;
    track.innerHTML = "";

    const video = document.getElementById("main-video");
    const totalDuration = (video && video.duration > 0) ? video.duration : (window.timelineInstance?.duration || 60);

    this.cues.forEach((cue) => {
      const leftPct = (cue.start_sec / totalDuration) * 100;
      const widthPct = Math.max(4, ((cue.end_sec - cue.start_sec) / totalDuration) * 100);

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
window.updateCueText = function(idx, text) {
  if (window.subtitlesInstance && window.subtitlesInstance.cues[idx]) {
    window.subtitlesInstance.cues[idx].text = text;
  }
};
