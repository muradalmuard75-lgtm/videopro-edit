/**
 * VideoPro Edit v2.0 - Interactive Multi-Track Timeline Engine
 * Synchronizes seamlessly with both HTML5 <video> and Native Platform Video Engine,
 * supports long-form videos (9m, 30m, 60m+) with adaptive ruler ticks,
 * and renders real YouTube thumbnails / video frames on the filmstrip.
 */
class TimelineEngine {
  constructor(videoElement, containerElement) {
    this.video = videoElement;
    this.container = containerElement;
    this.currentTime = 0;
    this.duration = 0;
    this.zoom = 1.0;
    this.isPlaying = false;
    this.isDraggingPlayhead = false;
    this.cutPoints = [0];

    this.undoStack = [];
    this.redoStack = [];

    this.playheadEl = document.getElementById("timeline-playhead");
    this.timecodeDisplay = document.getElementById("timecode-display");
    this.tracksWrapper = document.getElementById("tracks-wrapper");
    this.audioCanvas = document.getElementById("audio-wave-canvas");

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.renderRuler();
    this.drawAudioWaveform();
    this.renderFilmstrip();
  }

  setupEventListeners() {
    const handle = document.getElementById("playhead-handle");
    if (handle) {
      handle.addEventListener("mousedown", (e) => {
        this.isDraggingPlayhead = true;
        document.body.style.cursor = "grabbing";
        e.preventDefault();
      });

      handle.addEventListener(
        "touchstart",
        (e) => {
          this.isDraggingPlayhead = true;
          e.preventDefault();
        },
        { passive: false }
      );
    }

    window.addEventListener("mousemove", (e) => {
      if (!this.isDraggingPlayhead) return;
      this.handleTimelineSeek(e.clientX);
    });

    window.addEventListener(
      "touchmove",
      (e) => {
        if (!this.isDraggingPlayhead || !e.touches[0]) return;
        this.handleTimelineSeek(e.touches[0].clientX);
      },
      { passive: false }
    );

    window.addEventListener("mouseup", () => {
      if (this.isDraggingPlayhead) {
        this.isDraggingPlayhead = false;
        document.body.style.cursor = "default";
      }
    });

    window.addEventListener("touchend", () => {
      if (this.isDraggingPlayhead) {
        this.isDraggingPlayhead = false;
      }
    });

    if (this.tracksWrapper) {
      this.tracksWrapper.addEventListener("click", (e) => {
        this.handleTimelineSeek(e.clientX);
      });

      this.tracksWrapper.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches[0]) {
            this.handleTimelineSeek(e.touches[0].clientX);
          }
        },
        { passive: true }
      );
    }

    if (this.video) {
      this.video.addEventListener("loadedmetadata", () => {
        // Do NOT overwrite virtualDuration when playing a synthesized platform stream!
        if (window.videoPlayerInstance && window.videoPlayerInstance.isSynthesizedPlatformStream) {
          return;
        }
        if (
          this.video &&
          this.video.duration &&
          !isNaN(this.video.duration) &&
          isFinite(this.video.duration) &&
          this.video.duration > 25
        ) {
          this.duration = this.video.duration;
          this.renderRuler();
          this.drawAudioWaveform();
          this.renderFilmstrip(window.currentYtId);
        }
      });
    }

    const zoomSlider = document.getElementById("timeline-zoom-slider");
    if (zoomSlider) {
      zoomSlider.addEventListener("input", (e) => {
        this.setZoom(parseFloat(e.target.value));
      });
    }

    document.getElementById("zoom-in-btn")?.addEventListener("click", () => {
      const newZoom = Math.min(2.5, this.zoom + 0.2);
      this.setZoom(newZoom);
      if (zoomSlider) zoomSlider.value = newZoom.toFixed(1);
    });

    document.getElementById("zoom-out-btn")?.addEventListener("click", () => {
      const newZoom = Math.max(0.5, this.zoom - 0.2);
      this.setZoom(newZoom);
      if (zoomSlider) zoomSlider.value = newZoom.toFixed(1);
    });

    document.getElementById("timeline-undo-btn")?.addEventListener("click", () => {
      this.undo();
    });
    document.getElementById("timeline-redo-btn")?.addEventListener("click", () => {
      this.redo();
    });

    document.getElementById("timeline-cut-btn")?.addEventListener("click", () => {
      this.cutAtPlayhead();
    });

    document.getElementById("timeline-delete-btn")?.addEventListener("click", () => {
      if (this.cutPoints.length > 1) {
        this.deleteActiveCut();
      } else if (window.deleteCurrentVideo) {
        window.deleteCurrentVideo();
      }
    });

    if (this.timecodeDisplay) {
      this.timecodeDisplay.addEventListener("click", () => {
        const modal = document.getElementById("timecode-modal");
        const input = document.getElementById("timecode-jump-input");
        if (modal) {
          modal.classList.remove("hidden");
          modal.classList.add("flex");
          if (input) {
            input.value = this.formatSimpleTime(this.currentTime);
            input.focus();
            input.select();
          }
        }
      });
    }

    document.getElementById("close-timecode-modal")?.addEventListener("click", () => {
      document.getElementById("timecode-modal")?.classList.add("hidden");
      document.getElementById("timecode-modal")?.classList.remove("flex");
    });

    document.getElementById("execute-timecode-jump-btn")?.addEventListener("click", () => {
      const input = document.getElementById("timecode-jump-input");
      if (input) {
        this.jumpToTime(input.value);
        document.getElementById("timecode-modal")?.classList.add("hidden");
        document.getElementById("timecode-modal")?.classList.remove("flex");
      }
    });
  }

  jumpToTime(timeStr) {
    let seconds = 0;
    if (timeStr.includes(":")) {
      const parts = timeStr.split(":").map(Number);
      if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    } else {
      seconds = parseFloat(timeStr) || 0;
    }

    seconds = Math.max(0, Math.min(this.duration || 60, seconds));
    this.setTime(seconds);
    if (window.videoPlayerInstance) {
      window.videoPlayerInstance.seekTo(seconds);
    } else if (this.video) {
      this.video.currentTime = seconds;
    }
    this.showToast(`تم الانتقال إلى التوقيت: ${this.formatSimpleTime(seconds)}`);
  }

  cutAtPlayhead() {
    if (!window.currentVideoId) {
      this.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لوضع نقاط القطع");
      return;
    }
    let cur = parseFloat(this.currentTime.toFixed(2));
    if (this.cutPoints.includes(cur)) {
      cur = parseFloat(
        Math.min(
          this.duration || 30,
          cur + 5.0 < (this.duration || 30) ? cur + 5.0 : (this.duration || 30) / 2
        ).toFixed(2)
      );
      this.setTime(cur);
    }

    this.undoStack.push({ type: "cut", cutPoints: [...this.cutPoints] });
    this.redoStack = [];

    this.cutPoints.push(cur);
    this.cutPoints.sort((a, b) => a - b);

    this.renderFilmstrip(window.videoPlayerInstance?.ytVideoId);
    this.showToast(`✂️ تم وضع نقطة قطع عند ${this.formatSimpleTime(cur)}`);
  }

  deleteActiveCut() {
    if (this.cutPoints.length <= 1) {
      this.showToast("لا توجد نقاط قطع لحذفها");
      return;
    }

    this.undoStack.push({ type: "cut", cutPoints: [...this.cutPoints] });
    this.redoStack = [];

    let closestIdx = 1;
    let minDiff = 999999;
    for (let i = 1; i < this.cutPoints.length; i++) {
      const diff = Math.abs(this.cutPoints[i] - this.currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const removed = this.cutPoints.splice(closestIdx, 1)[0];
    this.renderFilmstrip(window.videoPlayerInstance?.ytVideoId);
    this.showToast(`🗑️ تم حذف نقطة القطع عند ${this.formatSimpleTime(removed)}`);
  }

  undo() {
    if (this.undoStack.length === 0) {
      this.showToast("لا توجد عمليات سابقة للتراجع عنها");
      return;
    }

    const action = this.undoStack.pop();
    this.redoStack.push({ type: action.type, cutPoints: [...this.cutPoints] });

    if (action.type === "cut") {
      this.cutPoints = action.cutPoints;
      this.renderFilmstrip(window.videoPlayerInstance?.ytVideoId);
      this.showToast("↩️ تم التراجع عن العملية");
    }
  }

  redo() {
    if (this.redoStack.length === 0) {
      this.showToast("لا توجد عمليات للإعادة");
      return;
    }

    const action = this.redoStack.pop();
    this.undoStack.push({ type: action.type, cutPoints: [...this.cutPoints] });

    if (action.type === "cut") {
      this.cutPoints = action.cutPoints;
      this.renderFilmstrip(window.videoPlayerInstance?.ytVideoId);
      this.showToast("↪️ تمت إعادة العملية");
    }
  }

  showToast(msg) {
    let toast = document.getElementById("studio-quick-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "studio-quick-toast";
      toast.className =
        "fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-purple-900/95 border border-purple-500/60 text-white font-bold text-xs shadow-2xl z-50 transition duration-300 pointer-events-none text-center max-w-[92vw]";
      document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(10px)";
    }, 2800);
  }

  handleTimelineSeek(clientX) {
    if (!this.tracksWrapper || this.duration <= 0) return;
    const rect = this.tracksWrapper.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * this.duration;
    this.setTime(targetTime);
    if (window.videoPlayerInstance) {
      window.videoPlayerInstance.previewSegmentBounds = null;
      window.videoPlayerInstance.seekTo(targetTime);
    } else if (this.video) {
      this.video.currentTime = targetTime;
    }
  }

  setTime(seconds) {
    if (this.duration <= 0) {
      this.currentTime = 0;
      if (this.playheadEl) this.playheadEl.style.left = "0%";
      if (this.timecodeDisplay) this.timecodeDisplay.innerText = "00:00:00.00";
      return;
    }
    this.currentTime = Math.max(0, Math.min(seconds, this.duration));
    if (window.videoPlayerInstance && !window.videoPlayerInstance.isPlaying) {
      window.videoPlayerInstance.virtualCurrentTime = this.currentTime;
    }
    const percentage = (this.currentTime / this.duration) * 100;

    if (this.playheadEl) {
      this.playheadEl.style.left = `${percentage}%`;
    }

    if (this.timecodeDisplay) {
      this.timecodeDisplay.innerText = this.formatTimecode(this.currentTime);
    }
  }

  setZoom(zoomValue) {
    this.zoom = zoomValue;
    this.renderRuler();
    this.drawAudioWaveform();
  }

  formatSimpleTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  formatTimecode(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 100);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(2, "0")}`;
  }

  renderRuler() {
    const rulerEl = document.getElementById("timeline-ruler");
    if (!rulerEl) return;
    rulerEl.innerHTML = "";

    if (this.duration <= 0) {
      rulerEl.innerHTML = `
        <div class="absolute flex flex-col items-center text-[10px] text-gray-500 select-none" style="left: 2%;">
          <span class="leading-none mb-1 font-mono">00:00</span>
          <div class="w-[1px] h-2 bg-gray-700"></div>
        </div>
      `;
      return;
    }

    const totalSeconds = Math.ceil(this.duration);
    // Adaptive step so mobile & desktop rulers always have 5–7 non-overlapping ticks
    let step = 5;
    if (totalSeconds <= 35) step = 5;
    else if (totalSeconds <= 100) step = 15;
    else if (totalSeconds <= 210) step = 30;
    else if (totalSeconds <= 420) step = 60;
    else if (totalSeconds <= 720) step = 90;
    else if (totalSeconds <= 1200) step = 180;
    else step = Math.ceil(totalSeconds / 6 / 60) * 60;

    for (let t = 0; t <= totalSeconds; t += step) {
      const rawPos = (t / this.duration) * 100;
      const clampedPos = Math.min(96.5, Math.max(2.5, rawPos));
      const mark = document.createElement("div");
      mark.className =
        "absolute flex flex-col items-center -translate-x-1/2 text-[10px] text-gray-400 select-none";
      mark.style.left = `${clampedPos}%`;

      const mins = Math.floor(t / 60);
      const secs = t % 60;
      const label = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

      mark.innerHTML = `
        <span class="leading-none mb-1 font-mono">${label}</span>
        <div class="w-[1px] h-2 bg-gray-600"></div>
      `;
      rulerEl.appendChild(mark);
    }
  }

  renderFilmstrip(ytId) {
    const filmstripEl = document.getElementById("video-filmstrip");
    if (!filmstripEl) return;
    filmstripEl.innerHTML = "";

    if (this.duration <= 0 || !window.currentVideoId) {
      filmstripEl.innerHTML = `
        <div class="w-full h-full flex items-center justify-center text-[11px] text-gray-500 font-medium select-none">
          بانتظار رفع الفيديو أو جلب رابط يوتيوب لعرض شريط المشاهد...
        </div>
      `;
      return;
    }

    const activeYtId = ytId || window.videoPlayerInstance?.ytVideoId || window.currentYtId;
    const ytThumbs = activeYtId
      ? [
          `https://i.ytimg.com/vi/${activeYtId}/1.jpg`,
          `https://i.ytimg.com/vi/${activeYtId}/2.jpg`,
          `https://i.ytimg.com/vi/${activeYtId}/3.jpg`,
          `https://i.ytimg.com/vi/${activeYtId}/hqdefault.jpg`,
        ]
      : [];

    const frameCount = 10;
    for (let i = 0; i < frameCount; i++) {
      const frame = document.createElement("div");
      frame.className =
        "filmstrip-frame flex-1 border-r border-black/50 bg-center relative bg-gradient-to-b from-purple-950/40 to-indigo-950/30";
      if (ytThumbs.length > 0) {
        frame.style.backgroundImage = `url('${ytThumbs[i % ytThumbs.length]}')`;
        frame.style.backgroundSize = "100% 134%";
      }
      const frameTime = this.formatSimpleTime((i / frameCount) * this.duration);
      frame.innerHTML = `<div class="absolute bottom-0.5 right-1 px-1 rounded bg-black/75 text-[8px] text-gray-200 font-mono" dir="ltr">${frameTime}</div>`;
      filmstripEl.appendChild(frame);
    }

    this.cutPoints.forEach((cp) => {
      if (cp > 0 && cp < this.duration) {
        const marker = document.createElement("div");
        marker.className =
          "absolute top-0 bottom-0 w-[2px] bg-yellow-400 shadow-[0_0_8px_#facc15] z-30 pointer-events-none";
        marker.style.left = `${(cp / this.duration) * 100}%`;
        filmstripEl.appendChild(marker);
      }
    });
  }

  drawAudioWaveform(customPeaks) {
    if (!this.audioCanvas) return;
    const canvas = this.audioCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.parentElement?.clientWidth || 800;
    const height = 44;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (this.duration <= 0 || !window.currentVideoId) {
      ctx.strokeStyle = "rgba(75, 85, 99, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#34d399");
    gradient.addColorStop(0.5, "#06b6d4");
    gradient.addColorStop(1, "#10b981");

    ctx.fillStyle = gradient;

    const barWidth = 3;
    const gap = 2;
    const totalBars = Math.floor(width / (barWidth + gap));
    const centerY = height / 2;

    for (let i = 0; i < totalBars; i++) {
      const norm = i / totalBars;
      let val = 0.5;
      if (customPeaks && customPeaks.length > 0) {
        const idx = Math.min(customPeaks.length - 1, Math.floor(norm * customPeaks.length));
        val = customPeaks[idx];
      } else {
        const envelope = Math.sin(norm * Math.PI) * 0.7 + 0.3;
        const noise =
          Math.sin(i * 0.4) * 0.3 + Math.cos(i * 0.8) * 0.4 + Math.sin(i * 1.5) * 0.3;
        val = Math.abs(noise) * envelope;
      }
      const barHeight = Math.max(4, val * (height * 0.85));
      const x = i * (barWidth + gap);
      const y = centerY - barHeight / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    }
  }

  resetTimeline() {
    this.duration = 0;
    this.currentTime = 0;
    this.cutPoints = [0];
    this.undoStack = [];
    this.redoStack = [];
    this.setTime(0);
    this.renderRuler();
    this.drawAudioWaveform();
    this.renderFilmstrip();
    const track = document.getElementById("subtitles-timeline-track");
    if (track) track.innerHTML = "";
  }
}

window.TimelineEngine = TimelineEngine;
