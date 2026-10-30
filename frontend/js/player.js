/**
 * VideoPro Edit - Custom Video Player Engine
 */
class VideoPlayer {
  constructor(videoEl) {
    this.video = videoEl;
    this.isPlaying = false;
    this.centerPlayBtn = document.getElementById("center-play-btn");
    this.timelinePlayBtn = document.getElementById("timeline-play-btn");
    this.timeDisplay = document.getElementById("player-time-display");
    this.volumeBtn = document.getElementById("player-volume-btn");
    this.fullscreenBtn = document.getElementById("player-fullscreen-btn");
    this.subtitlesOverlay = document.getElementById("player-subtitles-overlay");

    this.filters = {
      brightness: 1.0,
      contrast: 1.0,
      saturation: 1.0,
      sepia: 0,
      blur: 0
    };

    this.init();
  }

  init() {
    if (!this.video) return;

    // Toggle play on center button or video click
    if (this.centerPlayBtn) {
      this.centerPlayBtn.addEventListener("click", () => this.togglePlay());
    }
    if (this.timelinePlayBtn) {
      this.timelinePlayBtn.addEventListener("click", () => this.togglePlay());
    }
    this.video.addEventListener("click", () => this.togglePlay());

    // Update play state
    this.video.addEventListener("play", () => {
      this.isPlaying = true;
      if (this.centerPlayBtn) this.centerPlayBtn.classList.add("opacity-0", "pointer-events-none");
      this.updatePlayBtnIcons(true);
    });

    this.video.addEventListener("pause", () => {
      this.isPlaying = false;
      if (this.centerPlayBtn) this.centerPlayBtn.classList.remove("opacity-0", "pointer-events-none");
      this.updatePlayBtnIcons(false);
    });

    // Time display update
    this.video.addEventListener("timeupdate", () => {
      this.updateTimeDisplay();
    });

    // Fullscreen toggle
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
    }

    // Step backward/forward
    const stepBackBtn = document.getElementById("timeline-step-back");
    if (stepBackBtn) {
      stepBackBtn.addEventListener("click", () => {
        this.video.currentTime = Math.max(0, this.video.currentTime - 1);
      });
    }

    const stepForwardBtn = document.getElementById("timeline-step-forward");
    if (stepForwardBtn) {
      stepForwardBtn.addEventListener("click", () => {
        this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 1);
      });
    }
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }

  updatePlayBtnIcons(isPlaying) {
    if (this.timelinePlayBtn) {
      this.timelinePlayBtn.innerHTML = isPlaying
        ? `<svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
        : `<svg class="w-5 h-5 text-white fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }
  }

  updateTimeDisplay() {
    if (!this.timeDisplay) return;
    const cur = this.formatTime(this.video.currentTime);
    const dur = this.formatTime(this.video.duration || 84);
    this.timeDisplay.innerText = `${cur} / ${dur}`;
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  toggleFullscreen() {
    const container = document.getElementById("player-container");
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  applyFilter(type, value) {
    this.filters[type] = value;
    const filterString = `
      brightness(${this.filters.brightness})
      contrast(${this.filters.contrast})
      saturate(${this.filters.saturation})
      sepia(${this.filters.sepia}%)
      blur(${this.filters.blur}px)
    `;
    this.video.style.filter = filterString;
  }

  resetFilters() {
    this.filters = { brightness: 1.0, contrast: 1.0, saturation: 1.0, sepia: 0, blur: 0 };
    this.video.style.filter = "none";
  }
}

window.VideoPlayer = VideoPlayer;
