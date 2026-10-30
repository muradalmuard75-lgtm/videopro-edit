/**
 * VideoPro Edit - Interactive Multi-Track Timeline Engine
 */
class TimelineEngine {
  constructor(videoElement, containerElement) {
    this.video = videoElement;
    this.container = containerElement;
    this.currentTime = 0;
    this.duration = 0; // Starts empty until user uploads video
    this.zoom = 1.0;
    this.isPlaying = false;
    this.isDraggingPlayhead = false;
    this.cutPoints = [0];

    // Undo / Redo history stacks
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
    // Playhead drag (Mouse & Touch support)
    const handle = document.getElementById("playhead-handle");
    if (handle) {
      handle.addEventListener("mousedown", (e) => {
        this.isDraggingPlayhead = true;
        document.body.style.cursor = "grabbing";
        e.preventDefault();
      });

      handle.addEventListener("touchstart", (e) => {
        this.isDraggingPlayhead = true;
        e.preventDefault();
      }, { passive: false });
    }

    window.addEventListener("mousemove", (e) => {
      if (!this.isDraggingPlayhead) return;
      this.handleTimelineSeek(e.clientX);
    });

    window.addEventListener("touchmove", (e) => {
      if (!this.isDraggingPlayhead || !e.touches[0]) return;
      this.handleTimelineSeek(e.touches[0].clientX);
    }, { passive: false });

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

    // Click or tap anywhere on timeline tracks to seek
    if (this.tracksWrapper) {
      this.tracksWrapper.addEventListener("click", (e) => {
        this.handleTimelineSeek(e.clientX);
      });

      this.tracksWrapper.addEventListener("touchstart", (e) => {
        if (e.touches[0]) {
          this.handleTimelineSeek(e.touches[0].clientX);
        }
      }, { passive: true });
    }

    // Video timeupdate sync
    if (this.video) {
      this.video.addEventListener("timeupdate", () => {
        if (!this.isDraggingPlayhead) {
          this.setTime(this.video.currentTime);
        }
      });
      this.video.addEventListener("loadedmetadata", () => {
        this.duration = this.video.duration || 84;
        this.renderRuler();
        this.drawAudioWaveform();
        this.renderFilmstrip();
      });
    }

    // Zoom slider
    const zoomSlider = document.getElementById("timeline-zoom-slider");
    if (zoomSlider) {
      zoomSlider.addEventListener("input", (e) => {
        this.setZoom(parseFloat(e.target.value));
      });
    }

    // Zoom In / Out buttons
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

    // Undo / Redo Buttons
    document.getElementById("timeline-undo-btn")?.addEventListener("click", () => {
      this.undo();
    });
    document.getElementById("timeline-redo-btn")?.addEventListener("click", () => {
      this.redo();
    });

    // Cut at playhead
    document.getElementById("timeline-cut-btn")?.addEventListener("click", () => {
      this.cutAtPlayhead();
    });

    // Delete video from studio (or active cut)
    document.getElementById("timeline-delete-btn")?.addEventListener("click", () => {
      if (window.deleteCurrentVideo) {
        window.deleteCurrentVideo();
      } else {
        this.deleteActiveCut();
      }
    });

    // Timecode box click -> jump modal
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

    seconds = Math.max(0, Math.min(this.duration, seconds));
    this.setTime(seconds);
    if (this.video) this.video.currentTime = seconds;
    this.showToast(`تم الانتقال إلى التوقيت: ${this.formatSimpleTime(seconds)}`);
  }

  cutAtPlayhead() {
    const cur = parseFloat(this.currentTime.toFixed(2));
    if (this.cutPoints.includes(cur)) return;

    this.undoStack.push({ type: "cut", cutPoints: [...this.cutPoints] });
    this.redoStack = [];

    this.cutPoints.push(cur);
    this.cutPoints.sort((a, b) => a - b);

    this.renderFilmstrip();
    this.showToast(`✂️ تم وضع نقطة قطع عند ${this.formatSimpleTime(cur)}`);
  }

  deleteActiveCut() {
    if (this.cutPoints.length <= 1) {
      this.showToast("لا توجد نقاط قطع لحذفها");
      return;
    }

    this.undoStack.push({ type: "cut", cutPoints: [...this.cutPoints] });
    this.redoStack = [];

    // Remove the cut point closest to current time
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
    this.renderFilmstrip();
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
      this.renderFilmstrip();
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
      this.renderFilmstrip();
      this.showToast("↪️ تمت إعادة العملية");
    }
  }

  showToast(msg) {
    let toast = document.getElementById("studio-quick-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "studio-quick-toast";
      toast.className = "fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-purple-900/90 border border-purple-500/60 text-white font-bold text-xs shadow-2xl z-50 transition duration-300 pointer-events-none";
      document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(10px)";
    }, 2500);
  }

  handleTimelineSeek(clientX) {
    if (!this.tracksWrapper) return;
    const rect = this.tracksWrapper.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * this.duration;
    this.setTime(targetTime);
    if (this.video) {
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
        <div class="absolute flex flex-col items-center text-[10px] text-gray-500 select-none" style="left: 0%;">
          <span class="leading-none mb-1 font-mono">00:00</span>
          <div class="w-[1px] h-2 bg-gray-700"></div>
        </div>
      `;
      return;
    }

    const totalSeconds = Math.ceil(this.duration);
    const step = totalSeconds > 180 ? 30 : totalSeconds > 60 ? 15 : 5;

    for (let t = 0; t <= totalSeconds; t += step) {
      const pos = (t / this.duration) * 100;
      const mark = document.createElement("div");
      mark.className = "absolute flex flex-col items-center -translate-x-1/2 text-[10px] text-gray-400 select-none";
      mark.style.left = `${pos}%`;

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

  renderFilmstrip() {
    const filmstripEl = document.getElementById("video-filmstrip");
    if (!filmstripEl) return;
    filmstripEl.innerHTML = "";

    if (this.duration <= 0 || !window.currentVideoId) {
      filmstripEl.innerHTML = `
        <div class="w-full h-full flex items-center justify-center text-[11px] text-gray-500 font-medium select-none">
          بانتظار رفع الفيديو لعرض شريط المشاهد...
        </div>
      `;
      return;
    }

    const frameCount = 14;
    for (let i = 0; i < frameCount; i++) {
      const frame = document.createElement("div");
      frame.className = "filmstrip-frame flex-1 border-r border-black/40 bg-cover bg-center relative bg-gradient-to-b from-purple-950/30 to-indigo-950/20";
      frame.innerHTML = `<div class="w-full h-full flex items-center justify-center text-[9px] text-purple-400/40 font-mono">F${i + 1}</div>`;
      filmstripEl.appendChild(frame);
    }

    // Render cut markers on filmstrip
    this.cutPoints.forEach((cp) => {
      if (cp > 0 && cp < this.duration) {
        const marker = document.createElement("div");
        marker.className = "absolute top-0 bottom-0 w-[2px] bg-yellow-400 shadow-[0_0_8px_#facc15] z-30 pointer-events-none";
        marker.style.left = `${(cp / this.duration) * 100}%`;
        filmstripEl.appendChild(marker);
      }
    });
  }

  drawAudioWaveform() {
    if (!this.audioCanvas) return;
    const canvas = this.audioCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.parentElement.clientWidth || 800;
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
    gradient.addColorStop(0, "#34d399"); // emerald
    gradient.addColorStop(0.5, "#06b6d4"); // cyan
    gradient.addColorStop(1, "#10b981");

    ctx.fillStyle = gradient;

    const barWidth = 3;
    const gap = 2;
    const totalBars = Math.floor(width / (barWidth + gap));
    const centerY = height / 2;

    for (let i = 0; i < totalBars; i++) {
      const norm = i / totalBars;
      const envelope = Math.sin(norm * Math.PI) * 0.7 + 0.3;
      const noise = (Math.sin(i * 0.4) * 0.3 + Math.cos(i * 0.8) * 0.4 + Math.sin(i * 1.5) * 0.3);
      const barHeight = Math.max(4, (Math.abs(noise) * (height * 0.85) * envelope));

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
