/**
 * VideoPro Edit - Interactive Multi-Track Timeline Engine
 */
class TimelineEngine {
  constructor(videoElement, containerElement) {
    this.video = videoElement;
    this.container = containerElement;
    this.currentTime = 0;
    this.duration = 84; // default demo
    this.zoom = 1.0;
    this.isPlaying = false;
    this.isDraggingPlayhead = false;
    this.cutPoints = [0, 15, 30, 45, 60, 75, 84];

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
    // Playhead drag
    const handle = document.getElementById("playhead-handle");
    if (handle) {
      handle.addEventListener("mousedown", (e) => {
        this.isDraggingPlayhead = true;
        document.body.style.cursor = "grabbing";
        e.preventDefault();
      });
    }

    window.addEventListener("mousemove", (e) => {
      if (!this.isDraggingPlayhead) return;
      this.handleTimelineSeek(e);
    });

    window.addEventListener("mouseup", () => {
      if (this.isDraggingPlayhead) {
        this.isDraggingPlayhead = false;
        document.body.style.cursor = "default";
      }
    });

    // Click anywhere on timeline tracks to seek
    if (this.tracksWrapper) {
      this.tracksWrapper.addEventListener("click", (e) => {
        this.handleTimelineSeek(e);
      });
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
  }

  handleTimelineSeek(e) {
    if (!this.tracksWrapper) return;
    const rect = this.tracksWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * this.duration;
    this.setTime(targetTime);
    if (this.video) {
      this.video.currentTime = targetTime;
    }
  }

  setTime(seconds) {
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

    const frameCount = 14;
    for (let i = 0; i < frameCount; i++) {
      const frame = document.createElement("div");
      frame.className = "filmstrip-frame flex-1 border-r border-black/40 bg-cover bg-center";
      frame.style.backgroundImage = "url('/static/assets/thumbnail.jpg')";
      filmstripEl.appendChild(frame);
    }
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

    // Realistic audio waveform drawing with vibrant cyan/emerald green gradient
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
      // Dynamic natural noise pattern mimicking speech and music rhythm
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
}

window.TimelineEngine = TimelineEngine;
