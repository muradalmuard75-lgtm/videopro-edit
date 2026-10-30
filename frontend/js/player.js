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
    this.volumeSlider = document.getElementById("player-volume-slider");
    this.volumeIcon = document.getElementById("volume-icon");
    this.fullscreenBtn = document.getElementById("player-fullscreen-btn");
    this.settingsBtn = document.getElementById("player-settings-btn");
    this.qualityBadge = document.getElementById("player-quality-badge");
    this.subtitlesOverlay = document.getElementById("player-subtitles-overlay");

    this.filters = {
      brightness: 1.0,
      contrast: 1.0,
      saturation: 1.0,
      sepia: 0,
      blur: 0,
    };

    this.previousVolume = 1.0;
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

    // Volume button click: Mute/Unmute toggle + mobile slider toggle
    if (this.volumeBtn) {
      this.volumeBtn.addEventListener("click", () => {
        const sliderBox = document.getElementById("volume-slider-box");
        if (sliderBox && window.matchMedia("(hover: none)").matches) {
          sliderBox.classList.toggle("active");
        }
        this.toggleMute();
      });
    }

    // Volume slider input
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.setVolume(val);
      });
    }

    // Fullscreen toggle
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
    }

    // Settings Modal
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener("click", () => this.openSettingsModal());
    }
    document.getElementById("close-settings-modal")?.addEventListener("click", () => {
      document.getElementById("player-settings-modal")?.classList.add("hidden");
      document.getElementById("player-settings-modal")?.classList.remove("flex");
    });

    // Speed buttons in Settings modal
    const speedButtons = document.querySelectorAll(".speed-btn");
    speedButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        speedButtons.forEach((b) => b.classList.remove("active", "border", "border-purple-500", "bg-purple-900/50", "text-white", "font-bold"));
        btn.classList.add("active", "border", "border-purple-500", "bg-purple-900/50", "text-white", "font-bold");
        const speed = parseFloat(btn.dataset.speed || "1.0");
        this.video.playbackRate = speed;
      });
    });

    // Loop video toggle
    const loopToggle = document.getElementById("player-loop-toggle");
    if (loopToggle) {
      loopToggle.addEventListener("change", (e) => {
        this.video.loop = e.target.checked;
      });
    }

    // Picture in Picture
    const pipBtn = document.getElementById("pip-toggle-btn");
    if (pipBtn) {
      pipBtn.addEventListener("click", async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (this.video.requestPictureInPicture) {
            await this.video.requestPictureInPicture();
          }
        } catch (err) {
          console.warn("PiP error:", err);
        }
      });
    }

    // Quality Badge Click -> Video Info Modal
    if (this.qualityBadge) {
      this.qualityBadge.addEventListener("click", () => this.openVideoInfoModal());
    }
    document.getElementById("close-video-info-modal")?.addEventListener("click", () => {
      document.getElementById("video-info-modal")?.classList.add("hidden");
      document.getElementById("video-info-modal")?.classList.remove("flex");
    });

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
        this.video.currentTime = Math.min(this.video.duration || 84, this.video.currentTime + 1);
      });
    }

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      // Don't intercept when user is typing in an input
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === "KeyJ") {
        this.video.currentTime = Math.max(0, this.video.currentTime - 1);
      } else if (e.code === "KeyL") {
        this.video.currentTime = Math.min(this.video.duration || 84, this.video.currentTime + 1);
      } else if (e.code === "KeyF") {
        this.toggleFullscreen();
      } else if (e.code === "KeyM") {
        this.toggleMute();
      }
    });
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }

  toggleMute() {
    if (this.video.muted || this.video.volume === 0) {
      this.video.muted = false;
      this.setVolume(this.previousVolume || 1.0);
    } else {
      this.previousVolume = this.video.volume;
      this.video.muted = true;
      this.setVolume(0);
    }
  }

  setVolume(val) {
    val = Math.max(0, Math.min(1, val));
    this.video.volume = val;
    this.video.muted = val === 0;

    if (this.volumeSlider) {
      this.volumeSlider.value = val;
    }

    this.updateVolumeIcon(val);
  }

  updateVolumeIcon(val) {
    if (!this.volumeBtn) return;
    if (val === 0 || this.video.muted) {
      this.volumeBtn.innerHTML = `
        <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
        </svg>
      `;
    } else if (val < 0.5) {
      this.volumeBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
        </svg>
      `;
    } else {
      this.volumeBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
        </svg>
      `;
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
      if (container && container.requestFullscreen) {
        container.requestFullscreen();
      } else if (this.video && this.video.webkitEnterFullscreen) {
        this.video.webkitEnterFullscreen(); // iOS Safari fallback
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  openSettingsModal() {
    const modal = document.getElementById("player-settings-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  }

  async openVideoInfoModal() {
    const modal = document.getElementById("video-info-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const resEl = document.getElementById("spec-resolution");
    const durEl = document.getElementById("spec-duration");
    const fpsEl = document.getElementById("spec-fps");

    if (this.video) {
      const w = this.video.videoWidth || 1920;
      const h = this.video.videoHeight || 1080;
      if (resEl) resEl.innerText = `${w}x${h} (${h >= 1080 ? '1080p Full HD' : h >= 720 ? '720p HD' : 'SD'})`;
      if (durEl) durEl.innerText = this.formatTime(this.video.duration || 84);
      if (fpsEl) fpsEl.innerText = "30.0 FPS";
    }

    try {
      const vid = window.currentVideoId || "sample";
      const res = await fetch(`/api/video/info?video_id=${vid}`);
      const data = await res.json();
      if (data && data.info) {
        const inf = data.info;
        if (resEl && inf.resolution) resEl.innerText = `${inf.resolution} (${inf.height >= 1080 ? '1080p HD' : 'HD'})`;
        if (durEl && inf.duration) durEl.innerText = this.formatTime(inf.duration);
        if (fpsEl && inf.fps) fpsEl.innerText = `${inf.fps} FPS`;
      }
    } catch (e) {}
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
