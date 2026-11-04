/**
 * VideoPro Edit v2.0 - Stutter-Free Original Audio & Real YouTube Video Player
 * - Makes original audio (ytAudioEl) the uninterrupted master clock (NEVER paused or seeked during playback!).
 * - Adjusts muted <video> playbackRate gently to follow the audio clock with 0% audio buffer flushes or cutouts.
 * - Includes built-in inline Play/Pause button and interactive Seek Slider inside the player bottom bar.
 */
class VideoPlayer {
  constructor(videoEl) {
    this.video = videoEl;
    this.loadSessionId = 0;
    this.isPlaying = false;
    this.isScrubbingSlider = false;
    this.isSynthesizedPlatformStream = false;
    this.isChromelessStream = false;
    this.isRealFullVideoLoaded = false;
    this.isVideoOnlyStream = false;
    this.hasRealExternalAudio = false;
    this.hlsInstance = null;
    this.ytPlayer = null;
    this.ytPollTimer = null;
    this.ytVideoId = null;
    this.virtualCurrentTime = 0;
    this.virtualDuration = 0;
    this.playbackSpeed = 1.0;
    this.previewSegmentBounds = null;
    this.jumpCutSegments = null;
    this.sceneImages = [];
    this.candidateHlsUrls = [];
    this.candidateMp4Urls = [];
    this.candidateVideoOnlyUrls = [];
    this.candidateAudioUrls = [];
    this.triedVideoUrls = new Set();
    this.triedAudioUrls = new Set();
    this.isProbingVideo = false;
    this.isProbingAudio = false;
    this.directAudioUrl = "";
    this.currentSourceIndex = 0;
    this.videoTitle = "";
    this.videoUploader = "";
    this.isShortVideo = false;
    this.fallbackBlobUrl = "";
    this.rafId = null;
    this.lastTickMs = 0;

    this.ytAudioEl = null;

    this.movingStreamImg = document.getElementById("moving-video-stream-img");
    this.unmutePromptBtn = document.getElementById("unmute-original-audio-btn");
    this.centerPlayBtn = document.getElementById("center-play-btn");
    this.inlinePlayBtn = document.getElementById("player-inline-play-btn");
    this.seekSlider = document.getElementById("player-seek-slider");
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

    this.audioVolume = 1.0;
    this.isAudioMuted = false;
    this.previousVolume = 1.0;
    this.init();
  }

  // No-op safeguard for backward compatibility
  renderSynthesizedFrame() {}

  init() {
    if (this.timeDisplay) {
      this.timeDisplay.setAttribute("dir", "ltr");
    }

    const onUserInteractionUnlock = () => {
      this.unlockAudioOnUserGesture();
    };
    ["pointerdown", "touchstart", "click"].forEach((evt) => {
      document.addEventListener(evt, onUserInteractionUnlock, { passive: true });
    });

    if (this.unmutePromptBtn) {
      this.unmutePromptBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.isAudioMuted = false;
        this.setVolume(this.previousVolume || 1.0);
        this.unlockAudioOnUserGesture(true);
        this.hideUnmutePrompt();
      });
    }

    document.getElementById("player-delete-video-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.deleteCurrentVideo) {
        window.deleteCurrentVideo();
      }
    });

    document.getElementById("empty-state-upload-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("video-file-input")?.click();
    });
    document.getElementById("empty-player-state")?.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      document.getElementById("video-file-input")?.click();
    });

    if (!window.currentVideoId) {
      this.showEmptyState();
    }

    if (this.centerPlayBtn) {
      this.centerPlayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.togglePlay();
      });
    }
    if (this.inlinePlayBtn) {
      this.inlinePlayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.togglePlay();
      });
    }
    if (this.timelinePlayBtn) {
      this.timelinePlayBtn.addEventListener("click", () => this.togglePlay());
    }
    if (this.video) {
      this.video.addEventListener("click", () => this.togglePlay());
    }
    if (this.movingStreamImg) {
      this.movingStreamImg.addEventListener("click", () => this.togglePlay());
    }

    // Interactive Seek Slider inside Player Bottom Controls
    if (this.seekSlider) {
      this.seekSlider.addEventListener("pointerdown", () => {
        this.isScrubbingSlider = true;
      });
      this.seekSlider.addEventListener("touchstart", () => {
        this.isScrubbingSlider = true;
      }, { passive: true });
      this.seekSlider.addEventListener("input", (e) => {
        this.isScrubbingSlider = true;
        const pct = parseFloat(e.target.value) || 0;
        const dur = this.getDuration() || 60;
        const targetSec = (pct / 100) * dur;
        this.updateTimeDisplay(targetSec, dur, false);
        if (window.subtitlesInstance) {
          window.subtitlesInstance.renderActiveSubtitle(targetSec);
        }
      });
      const finishScrub = (e) => {
        const pct = parseFloat(e.target.value) || 0;
        const dur = this.getDuration() || 60;
        this.isScrubbingSlider = false;
        this.seekTo((pct / 100) * dur);
      };
      this.seekSlider.addEventListener("change", finishScrub);
      this.seekSlider.addEventListener("pointerup", () => {
        this.isScrubbingSlider = false;
      });
      this.seekSlider.addEventListener("touchend", () => {
        this.isScrubbingSlider = false;
      });
    }

    // Smooth, Stutter-Free Media Listeners:
    // NEVER pause or seek ytAudioEl during video micro-buffering or timeupdate!
    this.video.addEventListener("play", () => {
      if (!this.isSynthesizedPlatformStream && !this.isChromelessStream) {
        this.isPlaying = true;
        if (this.centerPlayBtn) this.centerPlayBtn.classList.add("opacity-0", "pointer-events-none");
        this.updatePlayBtnIcons(true);
        if (this.isVideoOnlyStream && this.ytAudioEl && this.hasRealExternalAudio && this.ytAudioEl.paused) {
          this.ytAudioEl.play().then(() => this.hideUnmutePrompt()).catch(() => this.showUnmutePrompt());
        }
      }
    });

    this.video.addEventListener("pause", () => {
      // Only pause ytAudioEl if the user intentionally paused (not when video reached end of buffer)
      if (!this.isSynthesizedPlatformStream && !this.isChromelessStream && !this.isPlaying) {
        if (this.centerPlayBtn) this.centerPlayBtn.classList.remove("opacity-0", "pointer-events-none");
        this.updatePlayBtnIcons(false);
        if (this.ytAudioEl && !this.ytAudioEl.paused) {
          try {
            this.ytAudioEl.pause();
          } catch (e) {}
        }
      }
    });

    this.video.addEventListener("timeupdate", () => {
      if (!this.isSynthesizedPlatformStream && !this.isChromelessStream && this.isRealFullVideoLoaded) {
        const dur =
          this.video.duration && !isNaN(this.video.duration) && isFinite(this.video.duration) && this.video.duration > 2
            ? this.video.duration
            : this.virtualDuration || 60;

        // If external audio (ytAudioEl) is playing, use ytAudioEl as the UNINTERRUPTED master clock
        // and gently adjust the muted <video>'s playbackRate so audio NEVER stutters!
        if (this.isVideoOnlyStream && this.ytAudioEl && this.hasRealExternalAudio && !this.ytAudioEl.paused) {
          const masterAudioTime = this.ytAudioEl.currentTime;
          this.virtualCurrentTime = masterAudioTime;
          const drift = this.video.currentTime - masterAudioTime;
          const baseRate = this.playbackSpeed || 1.0;

          if (Math.abs(drift) > 2.4) {
            // Seek the muted video element (never the audio element!)
            try {
              this.video.currentTime = masterAudioTime;
              this.video.playbackRate = baseRate;
            } catch (e) {}
          } else if (drift < -0.35) {
            // Video is slightly behind audio -> speed up muted video by 6%
            try {
              this.video.playbackRate = baseRate * 1.06;
            } catch (e) {}
          } else if (drift > 0.35) {
            // Video is slightly ahead of audio -> slow down muted video by 6%
            try {
              this.video.playbackRate = baseRate * 0.94;
            } catch (e) {}
          } else if (this.video.playbackRate !== baseRate) {
            try {
              this.video.playbackRate = baseRate;
            } catch (e) {}
          }
          this.handleTimeTick(masterAudioTime, dur);
        } else {
          this.virtualCurrentTime = this.video.currentTime;
          this.handleTimeTick(this.video.currentTime, dur);
        }
      }
    });

    if (this.volumeBtn) {
      this.volumeBtn.addEventListener("click", () => {
        const sliderBox = document.getElementById("volume-slider-box");
        if (sliderBox && window.matchMedia("(hover: none)").matches) {
          sliderBox.classList.toggle("active");
        }
        this.toggleMute();
      });
    }

    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.setVolume(val);
      });
    }

    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
    }

    if (this.settingsBtn) {
      this.settingsBtn.addEventListener("click", () => this.openSettingsModal());
    }
    document.getElementById("close-settings-modal")?.addEventListener("click", () => {
      document.getElementById("player-settings-modal")?.classList.add("hidden");
      document.getElementById("player-settings-modal")?.classList.remove("flex");
    });

    const speedButtons = document.querySelectorAll(".speed-btn");
    speedButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        speedButtons.forEach((b) =>
          b.classList.remove("active", "border", "border-purple-500", "bg-purple-900/50", "text-white", "font-bold")
        );
        btn.classList.add("active", "border", "border-purple-500", "bg-purple-900/50", "text-white", "font-bold");
        const speed = parseFloat(btn.dataset.speed || "1.0");
        this.setPlaybackSpeed(speed);
      });
    });

    const loopToggle = document.getElementById("player-loop-toggle");
    if (loopToggle) {
      loopToggle.addEventListener("change", (e) => {
        this.video.loop = e.target.checked;
      });
    }

    const pipBtn = document.getElementById("pip-toggle-btn");
    if (pipBtn) {
      pipBtn.addEventListener("click", async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (this.video && this.video.requestPictureInPicture) {
            await this.video.requestPictureInPicture();
          }
        } catch (err) {
          console.warn("PiP error:", err);
        }
      });
    }

    if (this.qualityBadge) {
      this.qualityBadge.addEventListener("click", () => this.openVideoInfoModal());
    }
    document.getElementById("close-video-info-modal")?.addEventListener("click", () => {
      document.getElementById("video-info-modal")?.classList.add("hidden");
      document.getElementById("video-info-modal")?.classList.remove("flex");
    });

    window.addEventListener("resize", () => {
      if (window.subtitlesInstance) {
        window.subtitlesInstance.applySubtitleStyling();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === "KeyJ") {
        this.seekTo(Math.max(0, this.getCurrentTime() - 5));
      } else if (e.code === "KeyL") {
        this.seekTo(Math.min(this.getDuration() || 60, this.getCurrentTime() + 5));
      } else if (e.code === "KeyF") {
        this.toggleFullscreen();
      } else if (e.code === "KeyM") {
        this.toggleMute();
      }
    });
  }

  showUnmutePrompt() {
    if (this.unmutePromptBtn && window.currentVideoId) {
      this.unmutePromptBtn.classList.remove("hidden");
      this.unmutePromptBtn.classList.add("flex");
    }
  }

  hideUnmutePrompt() {
    if (this.unmutePromptBtn) {
      this.unmutePromptBtn.classList.add("hidden");
      this.unmutePromptBtn.classList.remove("flex");
    }
  }

  unlockAudioOnUserGesture(forcePlay = false) {
    try {
      if (this.video) {
        this.video.defaultMuted = false;
        this.video.removeAttribute("muted");
        if (!this.isAudioMuted) {
          this.video.muted = false;
          this.video.volume = this.audioVolume > 0 ? this.audioVolume : 1.0;
        }
        if ((this.isPlaying || forcePlay) && this.video.paused) {
          this.video.play().then(() => this.hideUnmutePrompt()).catch(() => {});
        } else if (!this.video.paused && !this.isAudioMuted && this.video.muted) {
          this.video.muted = false;
          this.hideUnmutePrompt();
        }
      }

      const ytAud = this.getOrCreateYtAudio();
      ytAud.muted = this.isAudioMuted;
      ytAud.volume = this.isAudioMuted ? 0 : this.audioVolume;
      if ((this.isPlaying || forcePlay) && ytAud.src && this.hasRealExternalAudio && (this.isVideoOnlyStream || this.isSynthesizedPlatformStream)) {
        if (ytAud.paused) {
          ytAud.play().then(() => this.hideUnmutePrompt()).catch(() => {});
        }
      }
    } catch (e) {}
  }

  getOrCreateYtAudio() {
    if (!this.ytAudioEl) {
      this.ytAudioEl = document.createElement("audio");
      this.ytAudioEl.id = "studio-yt-audio";
      this.ytAudioEl.preload = "auto";
      // Also drive timeline & subtitle ticks smoothly from ytAudioEl when playing
      this.ytAudioEl.addEventListener("timeupdate", () => {
        if (this.isPlaying && this.hasRealExternalAudio && !this.ytAudioEl.paused && (this.isVideoOnlyStream || this.isSynthesizedPlatformStream)) {
          const dur = this.getDuration() || 60;
          this.virtualCurrentTime = this.ytAudioEl.currentTime;
          this.handleTimeTick(this.ytAudioEl.currentTime, dur);
        }
      });
      document.body.appendChild(this.ytAudioEl);
    }
    return this.ytAudioEl;
  }

  getCurrentTime() {
    if (this.isVideoOnlyStream && this.ytAudioEl && this.hasRealExternalAudio && !this.ytAudioEl.paused) {
      return this.ytAudioEl.currentTime || 0;
    }
    if (this.isRealFullVideoLoaded && this.video) {
      return this.video.currentTime || 0;
    }
    return this.virtualCurrentTime || 0;
  }

  getDuration() {
    if (this.isRealFullVideoLoaded && this.video && this.video.duration && isFinite(this.video.duration) && this.video.duration > 2) {
      return this.video.duration;
    }
    return this.virtualDuration || window.timelineInstance?.duration || 60;
  }

  seekTo(seconds) {
    const dur = this.getDuration() || 60;
    const target = Math.max(0, Math.min(dur, seconds));
    this.virtualCurrentTime = target;

    if (this.isRealFullVideoLoaded && this.video) {
      try {
        this.video.currentTime = target;
      } catch (e) {}
    }
    if (this.ytAudioEl && this.hasRealExternalAudio && this.ytAudioEl.duration > 2) {
      try {
        this.ytAudioEl.currentTime = target;
      } catch (e) {}
    }
    this.handleTimeTick(target, dur);
  }

  setPlaybackSpeed(speed) {
    this.playbackSpeed = speed || 1.0;
    if (this.video) {
      try {
        this.video.playbackRate = this.playbackSpeed;
      } catch (e) {}
    }
    if (this.ytAudioEl) {
      try {
        this.ytAudioEl.playbackRate = this.playbackSpeed;
      } catch (e) {}
    }
  }

  /**
   * Probes a single video URL on an OFFSCREEN <video> element so the main player is NEVER reset or glitched!
   */
  probeSingleVideoCandidateOffscreen(url, isVideoOnly, minLongSide = 0, timeoutMs = 3800) {
    return new Promise((resolve, reject) => {
      if (!url || url.startsWith("blob:")) return reject(new Error("empty"));
      const probeVid = document.createElement("video");
      probeVid.muted = true;
      probeVid.playsInline = true;
      probeVid.preload = "metadata";
      let done = false;

      const finish = (ok, resObj) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        probeVid.onloadedmetadata = null;
        probeVid.onloadeddata = null;
        probeVid.onerror = null;
        try {
          probeVid.removeAttribute("src");
          probeVid.load();
        } catch (e) {}
        if (ok) resolve(resObj);
        else reject(new Error("probe failed"));
      };

      const timer = setTimeout(() => finish(false), timeoutMs);
      const onMeta = () => {
        const w = probeVid.videoWidth || 0;
        const h = probeVid.videoHeight || 0;
        const longSide = Math.max(w, h);
        if (probeVid.duration && probeVid.duration > 2 && w > 0 && longSide >= minLongSide) {
          finish(true, {
            url,
            isVideoOnly,
            duration: probeVid.duration,
            width: w,
            height: h,
            pixels: w * h,
          });
        } else if (w > 0 && longSide < minLongSide) {
          // Reject blurry low-res stream (e.g. 144x256 = 256p) when looking for HD!
          finish(false);
        }
      };
      probeVid.onloadedmetadata = onMeta;
      probeVid.onloadeddata = onMeta;
      probeVid.onerror = () => finish(false);
      probeVid.src = url;
      probeVid.load();
    });
  }

  /**
   * Probes a single audio URL on an OFFSCREEN <audio> element.
   */
  probeSingleAudioCandidateOffscreen(url, timeoutMs = 3500) {
    return new Promise((resolve, reject) => {
      if (!url) return reject(new Error("empty"));
      const probeAud = document.createElement("audio");
      probeAud.preload = "metadata";
      let done = false;

      const finish = (ok, resObj) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        probeAud.onloadedmetadata = null;
        probeAud.oncanplay = null;
        probeAud.onerror = null;
        try {
          probeAud.removeAttribute("src");
          probeAud.load();
        } catch (e) {}
        if (ok) resolve(resObj);
        else reject(new Error("audio probe failed"));
      };

      const timer = setTimeout(() => finish(false), timeoutMs);
      const onMeta = () => {
        if (probeAud.duration && probeAud.duration > 2) {
          finish(true, { url, duration: probeAud.duration });
        }
      };
      probeAud.onloadedmetadata = onMeta;
      probeAud.oncanplay = onMeta;
      probeAud.onerror = () => finish(false);
      probeAud.src = url;
      probeAud.load();
    });
  }

  /**
   * Hot-attaches real video (.mp4 / .webm / .m3u8) and real original audio (.m4a / .opus) streams
   * by racing the top HD candidates first!
   */
  attachDiscoveredRealStreams(streamData) {
    if (!streamData) return;
    const sessionId = this.loadSessionId;
    const addUnique = (arr, u) => {
      if (u && typeof u === "string" && (u.startsWith("http") || u.startsWith("/api/")) && !arr.includes(u)) arr.push(u);
    };

    if (streamData.hlsUrl) addUnique(this.candidateHlsUrls, streamData.hlsUrl);
    if (Array.isArray(streamData.candidateHlsUrls)) {
      streamData.candidateHlsUrls.forEach((u) => addUnique(this.candidateHlsUrls, u));
    }
    if (Array.isArray(streamData.candidateVideoOnlyUrls)) {
      streamData.candidateVideoOnlyUrls.forEach((u) => addUnique(this.candidateVideoOnlyUrls, u));
    }
    if (streamData.directMp4Url && !streamData.directMp4Url.startsWith("blob:")) {
      addUnique(this.candidateMp4Urls, streamData.directMp4Url);
    }
    if (Array.isArray(streamData.candidateMp4Urls)) {
      streamData.candidateMp4Urls.forEach((u) => addUnique(this.candidateMp4Urls, u));
    }
    if (streamData.directAudioUrl) {
      addUnique(this.candidateAudioUrls, streamData.directAudioUrl);
    }
    if (Array.isArray(streamData.candidateAudioUrls)) {
      streamData.candidateAudioUrls.forEach((u) => addUnique(this.candidateAudioUrls, u));
    }

    if (!this.hasRealExternalAudio && !this.isProbingAudio) {
      this.raceAudioCandidates(sessionId);
    }
    if (!this.isRealFullVideoLoaded && !this.isProbingVideo) {
      this.raceVideoCandidates(sessionId);
    } else if (
      this.isRealFullVideoLoaded &&
      !this.isProbingVideo &&
      Math.max(this.actualVideoWidth || 0, this.actualVideoHeight || 0) < 1280
    ) {
      this.tryUpgradeToHdVideo(sessionId);
    }
  }

  async tryUpgradeToHdVideo(sessionId) {
    if (this.loadSessionId !== sessionId || this.isProbingVideo) return;
    if (Math.max(this.actualVideoWidth || 0, this.actualVideoHeight || 0) >= 1280) return;

    const hdCandidates = this.candidateVideoOnlyUrls
      .map((u) => ({ url: u, isVideoOnly: true }))
      .filter((item) => item.url && !item.url.startsWith("blob:") && !this.triedVideoUrls.has(item.url));
    if (hdCandidates.length === 0) return;

    this.isProbingVideo = true;
    const hdBatch = hdCandidates.slice(0, 3);
    hdBatch.forEach((item) => this.triedVideoUrls.add(item.url));
    try {
      const winner = await Promise.any(
        hdBatch.map((item) => this.probeSingleVideoCandidateOffscreen(item.url, item.isVideoOnly, 1280, 4200))
      );
      if (this.loadSessionId !== sessionId) return;
      this.isProbingVideo = false;
      this.activateVerifiedRealVideoStream(winner, sessionId);
    } catch (e) {
      if (this.loadSessionId !== sessionId) return;
      this.isProbingVideo = false;
    }
  }

  async raceAudioCandidates(sessionId) {
    if (this.hasRealExternalAudio || this.loadSessionId !== sessionId) return;
    const untried = [...this.candidateAudioUrls, ...this.candidateMp4Urls].filter(
      (u) => u && !u.startsWith("blob:") && !this.triedAudioUrls.has(u)
    );
    if (untried.length === 0) return;

    this.isProbingAudio = true;
    const batch = untried.slice(0, 4);
    batch.forEach((u) => this.triedAudioUrls.add(u));

    try {
      const winner = await Promise.any(batch.map((u) => this.probeSingleAudioCandidateOffscreen(u, 3600)));
      if (this.loadSessionId !== sessionId) return;
      this.isProbingAudio = false;
      this.hasRealExternalAudio = true;

      const ytAud = this.getOrCreateYtAudio();
      ytAud.src = winner.url;
      ytAud.playbackRate = this.playbackSpeed || 1.0;
      ytAud.muted = this.isAudioMuted;
      ytAud.volume = this.isAudioMuted ? 0 : this.audioVolume;
      ytAud.load();

      if (this.isPlaying && this.isRealFullVideoLoaded && this.isVideoOnlyStream) {
        if (this.video && this.video.currentTime > 0.5) {
          try {
            ytAud.currentTime = this.video.currentTime;
          } catch (e) {}
        }
        ytAud.play().then(() => this.hideUnmutePrompt()).catch(() => this.showUnmutePrompt());
      } else if (this.isPlaying && !this.isProbingVideo && !this.isRealFullVideoLoaded) {
        ytAud.play().then(() => this.hideUnmutePrompt()).catch(() => this.showUnmutePrompt());
      }
    } catch (e) {
      if (this.loadSessionId !== sessionId) return;
      this.isProbingAudio = false;
      const remaining = [...this.candidateAudioUrls, ...this.candidateMp4Urls].filter(
        (u) => u && !u.startsWith("blob:") && !this.triedAudioUrls.has(u)
      );
      if (remaining.length > 0) {
        this.raceAudioCandidates(sessionId);
      }
    }
  }

  async raceVideoCandidates(sessionId) {
    if (this.isRealFullVideoLoaded || this.loadSessionId !== sessionId) return;

    // IMPORTANT: Put candidateVideoOnlyUrls (1080p & 720p Full HD streams) FIRST,
    // and keep candidateMp4Urls (legacy 256p/360p muxed stream) at the very end as fallback!
    const hdCandidates = this.candidateVideoOnlyUrls
      .map((u) => ({ url: u, isVideoOnly: true }))
      .filter((item) => item.url && !item.url.startsWith("blob:") && !this.triedVideoUrls.has(item.url));

    const sdFallbackCandidates = this.candidateMp4Urls
      .map((u) => ({ url: u, isVideoOnly: false }))
      .filter((item) => item.url && !item.url.startsWith("blob:") && !this.triedVideoUrls.has(item.url));

    this.isProbingVideo = true;

    // Pass 1: Probe top 1080p / 720p Full HD candidates with strict minLongSide = 640 (rejects 256p/240p/144p!)
    if (hdCandidates.length > 0) {
      const hdBatch = hdCandidates.slice(0, 3);
      hdBatch.forEach((item) => this.triedVideoUrls.add(item.url));
      try {
        // Probe the #1 highest-resolution stream first (1.8s head start), or race the top HD streams requiring >= 640px
        const winner = await Promise.any(
          hdBatch.map((item) => this.probeSingleVideoCandidateOffscreen(item.url, item.isVideoOnly, 640, 3800))
        );
        if (this.loadSessionId !== sessionId) return;
        this.isProbingVideo = false;
        this.activateVerifiedRealVideoStream(winner, sessionId);
        return;
      } catch (e) {
        if (this.loadSessionId !== sessionId) return;
        // If more HD candidates remain, try them before falling back to SD
        const remainingHd = this.candidateVideoOnlyUrls
          .map((u) => ({ url: u, isVideoOnly: true }))
          .filter((item) => item.url && !item.url.startsWith("blob:") && !this.triedVideoUrls.has(item.url));
        if (remainingHd.length > 0) {
          this.isProbingVideo = false;
          this.raceVideoCandidates(sessionId);
          return;
        }
      }
    }

    // Pass 2: Try HLS (.m3u8) master manifest if available
    const nextHls = this.candidateHlsUrls.find((u) => u && !this.triedVideoUrls.has(u));
    if (nextHls) {
      this.triedVideoUrls.add(nextHls);
      this.isProbingVideo = false;
      this.tryHlsStream(nextHls, sessionId, () => this.raceVideoCandidates(sessionId));
      return;
    }

    // Pass 3: Last-resort fallback to sdFallbackCandidates
    if (sdFallbackCandidates.length > 0) {
      const sdBatch = sdFallbackCandidates.slice(0, 3);
      sdBatch.forEach((item) => this.triedVideoUrls.add(item.url));
      try {
        const winner = await Promise.any(
          sdBatch.map((item) => this.probeSingleVideoCandidateOffscreen(item.url, item.isVideoOnly, 0, 3800))
        );
        if (this.loadSessionId !== sessionId) return;
        this.isProbingVideo = false;
        this.activateVerifiedRealVideoStream(winner, sessionId);
        return;
      } catch (e) {}
    }

    this.isProbingVideo = false;
    if (this.hasRealExternalAudio && this.ytAudioEl && this.isPlaying && this.ytAudioEl.paused) {
      this.ytAudioEl.play().then(() => this.hideUnmutePrompt()).catch(() => this.showUnmutePrompt());
    }
  }

  activateVerifiedRealVideoStream(winner, sessionId) {
    if (this.loadSessionId !== sessionId || !this.video) return;

    this.isRealFullVideoLoaded = true;
    this.isVideoOnlyStream = Boolean(winner.isVideoOnly);
    this.isSynthesizedPlatformStream = false;
    this.isChromelessStream = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (winner.duration && winner.duration > 2) {
      this.virtualDuration = winner.duration;
      if (window.timelineInstance) {
        window.timelineInstance.duration = winner.duration;
        window.timelineInstance.renderRuler();
      }
    }

    if (window.currentVideoMeta) {
      window.currentVideoMeta.direct_mp4_url = winner.url;
      window.currentVideoMeta.url = winner.url;
    }

    this.actualVideoWidth = winner.width || 1920;
    this.actualVideoHeight = winner.height || 1080;
    const badgeText = document.getElementById("player-badge-text");
    if (badgeText && winner.width && winner.height) {
      const shortSide = Math.min(winner.width, winner.height);
      const longSide = Math.max(winner.width, winner.height);
      const labelP = longSide >= 1920 || shortSide >= 1080 ? "1080p Full HD" : longSide >= 1280 || shortSide >= 720 ? "720p HD" : `${shortSide}p HD`;
      badgeText.innerText = labelP;
    }

    this.video.loop = false;
    this.video.playbackRate = this.playbackSpeed || 1.0;
    this.video.muted = this.isVideoOnlyStream ? true : this.isAudioMuted;
    this.video.volume = this.isVideoOnlyStream ? 0 : this.isAudioMuted ? 0 : this.audioVolume;

    const onReadyToPlay = () => {
      if (this.loadSessionId !== sessionId) return;
      this.video.removeEventListener("loadeddata", onReadyToPlay);
      this.video.removeEventListener("canplay", onReadyToPlay);

      if (this.movingStreamImg) {
        this.movingStreamImg.classList.add("hidden");
      }
      this.video.classList.remove("hidden");
      this.video.style.opacity = "1";

      const startSec = this.virtualCurrentTime > 1 && this.virtualCurrentTime < winner.duration ? this.virtualCurrentTime : 0;
      if (startSec > 0) {
        try {
          this.video.currentTime = startSec;
        } catch (e) {}
      }

      if (this.isPlaying) {
        this.video.play()
          .then(() => {
            if (!this.isVideoOnlyStream) this.hideUnmutePrompt();
          })
          .catch(() => {
            this.video.muted = true;
            this.video.play().catch(() => {});
            this.showUnmutePrompt();
          });

        if (this.ytAudioEl) {
          if (!this.isVideoOnlyStream) {
            try {
              this.ytAudioEl.pause();
            } catch (e) {}
          } else if (this.hasRealExternalAudio && this.ytAudioEl.paused) {
            if (startSec > 0) {
              try {
                this.ytAudioEl.currentTime = startSec;
              } catch (e) {}
            }
            this.ytAudioEl.play()
              .then(() => this.hideUnmutePrompt())
              .catch(() => this.showUnmutePrompt());
          }
        }
      }
    };

    this.video.addEventListener("loadeddata", onReadyToPlay);
    this.video.addEventListener("canplay", onReadyToPlay);
    this.video.src = winner.url;
    this.video.load();
  }

  tryHlsStream(hlsUrl, sessionId, onFail) {
    if (!this.video || this.loadSessionId !== sessionId) return onFail();
    if (this.hlsInstance) {
      try {
        this.hlsInstance.destroy();
      } catch (e) {}
      this.hlsInstance = null;
    }

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ enableWorker: false });
      this.hlsInstance = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(this.video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (this.loadSessionId !== sessionId) return;
        this.isRealFullVideoLoaded = true;
        this.isVideoOnlyStream = false;
        this.isSynthesizedPlatformStream = false;
        if (this.movingStreamImg) this.movingStreamImg.classList.add("hidden");
        this.video.classList.remove("hidden");
        this.video.style.opacity = "1";
        this.video.muted = this.isAudioMuted;
        this.video.volume = this.isAudioMuted ? 0 : this.audioVolume;
        if (this.isPlaying) {
          this.video.play().catch(() => {
            this.video.muted = true;
            this.video.play().catch(() => {});
            this.showUnmutePrompt();
          });
        }
      });
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data && data.fatal) {
          try {
            hls.destroy();
          } catch (e) {}
          this.hlsInstance = null;
          onFail();
        }
      });
    } else {
      onFail();
    }
  }

  loadDownloadedPlatformVideo({
    ytId,
    title,
    uploader,
    duration,
    isShort,
    hlsUrl,
    directMp4Url,
    directAudioUrl,
    candidateHlsUrls,
    candidateMp4Urls,
    candidateVideoOnlyUrls,
    candidateAudioUrls,
    blobUrl,
    sceneImages,
  }) {
    this.loadSessionId = (this.loadSessionId || 0) + 1;
    this.stopAndResetAllMedia();

    this.ytVideoId = ytId || null;
    this.videoTitle = title || "";
    this.videoUploader = uploader || "YouTube";
    this.virtualDuration = Number(duration) > 0 ? Number(duration) : isShort ? 35 : 90;
    this.virtualCurrentTime = 0;
    this.isShortVideo = Boolean(isShort);
    this.directAudioUrl = directAudioUrl || "";
    this.fallbackBlobUrl = blobUrl || "";
    this.previewSegmentBounds = null;
    this.jumpCutSegments = null;
    this.sceneImages = Array.isArray(sceneImages) ? sceneImages : [];

    this.isRealFullVideoLoaded = false;
    this.isVideoOnlyStream = false;
    this.hasRealExternalAudio = false;
    this.isProbingVideo = false;
    this.isProbingAudio = false;
    this.triedVideoUrls = new Set();
    this.triedAudioUrls = new Set();
    this.candidateHlsUrls = [];
    this.candidateMp4Urls = [];
    this.candidateVideoOnlyUrls = [];
    this.candidateAudioUrls = [];

    this.hideEmptyState();

    // If ANY valid video URL is present (backend stream, direct MP4, HLS, or blob), ALWAYS load it directly into native HTML5 video!
    const effectiveVideoUrl =
      directMp4Url ||
      (candidateMp4Urls && candidateMp4Urls[0]) ||
      hlsUrl ||
      blobUrl;

    if (effectiveVideoUrl) {
      this.switchToNativeVideoMode();
      this.hideEmptyState();
      if (this.video) {
        this.video.style.opacity = "1";
        this.video.classList.remove("hidden");
        if (this.movingStreamImg) {
          this.movingStreamImg.classList.add("hidden");
          this.movingStreamImg.removeAttribute("src");
        }
        this.video.src = effectiveVideoUrl;
        this.video.load();
        this.video.onloadedmetadata = () => {
          if (this.video.videoWidth && this.video.videoHeight) {
            this.actualVideoWidth = this.video.videoWidth;
            this.actualVideoHeight = this.video.videoHeight;
            const shortSide = Math.min(this.video.videoWidth, this.video.videoHeight);
            const longSide = Math.max(this.video.videoWidth, this.video.videoHeight);
            const badgeText = document.getElementById("player-badge-text");
            if (badgeText) {
              badgeText.innerText = longSide >= 1920 || shortSide >= 1080 ? "1080p Full HD" : longSide >= 1280 || shortSide >= 720 ? "720p HD" : `${shortSide}p HD`;
            }
            if (this.video.videoHeight > this.video.videoWidth && window.reframeInstance) {
              window.reframeInstance.applyLivePlayerReframe("9:16");
            }
          }
          if (this.video.duration && this.video.duration > 1) {
            this.virtualDuration = this.video.duration;
            this.updateTimeDisplay(0, this.video.duration);
          }
        };
        this.isPlaying = true;
        if (this.centerPlayBtn) this.centerPlayBtn.classList.add("opacity-0", "pointer-events-none");
        this.updatePlayBtnIcons(true);
        this.video.defaultMuted = false;
        this.video.removeAttribute("muted");
        this.video.muted = false;
        this.video.volume = this.audioVolume > 0 ? this.audioVolume : 1.0;
        this.isAudioMuted = false;
        this.updateVolumeIcon(this.video.volume);

        this.video.play()
          .then(() => {
            this.hideUnmutePrompt();
          })
          .catch(() => {
            // Autoplay with sound blocked by browser policy until user interacts
            this.video.muted = true;
            this.video.play().catch(() => {});
            this.showUnmutePrompt();
          });
      }
      return;
    }

    this.activateNativeMovingMp4Mode();
    this.attachDiscoveredRealStreams({
      hlsUrl,
      directMp4Url,
      directAudioUrl,
      candidateHlsUrls,
      candidateMp4Urls,
      candidateVideoOnlyUrls,
      candidateAudioUrls,
    });
  }

  stopAndResetAllMedia() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.ytPollTimer) {
      clearInterval(this.ytPollTimer);
      this.ytPollTimer = null;
    }
    if (this.hlsInstance) {
      try {
        this.hlsInstance.destroy();
      } catch (e) {}
      this.hlsInstance = null;
    }
    if (this.ytPlayer && typeof this.ytPlayer.destroy === "function") {
      try {
        this.ytPlayer.destroy();
      } catch (e) {}
      this.ytPlayer = null;
    }
    if (this.video) {
      try {
        this.video.pause();
        this.video.removeAttribute("src");
        this.video.load();
      } catch (e) {}
    }
    if (this.ytAudioEl) {
      try {
        this.ytAudioEl.pause();
        this.ytAudioEl.removeAttribute("src");
        this.ytAudioEl.load();
      } catch (e) {}
    }
    if (this.movingStreamImg) {
      this.movingStreamImg.removeAttribute("src");
      this.movingStreamImg.classList.add("hidden");
    }
  }

  activateNativeMovingMp4Mode() {
    this.cleanupActiveEngines();
    this.isSynthesizedPlatformStream = true;
    this.isChromelessStream = false;

    const studioCanvas = document.getElementById("native-studio-canvas");
    if (studioCanvas) {
      studioCanvas.classList.add("hidden");
    }

    if (this.movingStreamImg) {
      this.movingStreamImg.classList.add("hidden");
      this.movingStreamImg.removeAttribute("src");
    }

    if (this.video) {
      this.video.classList.remove("hidden");
      this.video.style.opacity = "1";
      this.video.playsInline = true;
    }

    this.updateTimeDisplay(this.virtualCurrentTime, this.virtualDuration);
    this.startSynthesizedPlayback();
  }

  cleanupActiveEngines() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.ytPollTimer) {
      clearInterval(this.ytPollTimer);
      this.ytPollTimer = null;
    }
    if (this.ytPlayer && typeof this.ytPlayer.destroy === "function") {
      try {
        this.ytPlayer.destroy();
      } catch (e) {}
      this.ytPlayer = null;
    }
    const streamWrap = document.getElementById("chromeless-stream-container");
    if (streamWrap) {
      streamWrap.innerHTML = "";
      streamWrap.classList.add("hidden");
    }
    const studioCanvas = document.getElementById("native-studio-canvas");
    if (studioCanvas) {
      studioCanvas.classList.add("hidden");
    }
  }

  startSynthesizedPlayback() {
    this.isPlaying = true;
    if (this.centerPlayBtn) this.centerPlayBtn.classList.add("opacity-0", "pointer-events-none");
    this.updatePlayBtnIcons(true);

    if (this.movingStreamImg && !this.isRealFullVideoLoaded) {
      this.movingStreamImg.classList.remove("hidden");
      if (this.ytVideoId === "nI-R93CZ7c4" && window.__REAL_MOVING_WEBP_B64__) {
        this.movingStreamImg.src = window.__REAL_MOVING_WEBP_B64__;
      } else if (this.ytVideoId) {
        this.movingStreamImg.src = `https://i.ytimg.com/vi/${this.ytVideoId}/hqdefault.jpg`;
      }
    }

    if (this.ytAudioEl && this.hasRealExternalAudio && this.ytAudioEl.src && !this.isProbingVideo) {
      this.ytAudioEl.play()
        .then(() => this.hideUnmutePrompt())
        .catch(() => this.showUnmutePrompt());
    }
    this.lastTickMs = performance.now();

    if (this.rafId) cancelAnimationFrame(this.rafId);
    const loop = (now) => {
      if (!this.isSynthesizedPlatformStream) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.lastTickMs) / 1000));
      this.lastTickMs = now;

      if (this.isPlaying) {
        const dur = this.virtualDuration || 60;
        let nextTime = this.virtualCurrentTime;
        if (this.ytAudioEl && this.hasRealExternalAudio && !this.ytAudioEl.paused && this.ytAudioEl.duration > 2) {
          nextTime = this.ytAudioEl.currentTime;
        } else if (!this.isProbingVideo) {
          nextTime = this.virtualCurrentTime + dt * (this.playbackSpeed || 1.0);
        }
        if (nextTime >= dur) {
          nextTime = 0;
        }
        this.virtualCurrentTime = nextTime;
        this.handleTimeTick(nextTime, dur);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  pauseSynthesizedPlayback() {
    this.isPlaying = false;
    if (this.centerPlayBtn) this.centerPlayBtn.classList.remove("opacity-0", "pointer-events-none");
    this.updatePlayBtnIcons(false);
    if (this.movingStreamImg && this.ytVideoId === "nI-R93CZ7c4" && window.__REAL_MOVING_POSTER_B64__ && !this.isRealFullVideoLoaded) {
      this.movingStreamImg.src = window.__REAL_MOVING_POSTER_B64__;
    }
    if (this.video) {
      try {
        this.video.pause();
      } catch (e) {}
    }
    if (this.ytAudioEl) {
      try {
        this.ytAudioEl.pause();
      } catch (e) {}
    }
  }

  handleTimeTick(cur, dur) {
    if (this.previewSegmentBounds) {
      if (cur < this.previewSegmentBounds.start || cur >= this.previewSegmentBounds.end) {
        this.seekTo(this.previewSegmentBounds.start);
        return;
      }
    }

    if (this.jumpCutSegments && this.jumpCutSegments.length > 0) {
      const inSpeech = this.jumpCutSegments.some((seg) => cur >= seg.start && cur <= seg.end);
      if (!inSpeech) {
        const nextSeg = this.jumpCutSegments.find((seg) => seg.start > cur);
        if (nextSeg) {
          this.seekTo(nextSeg.start);
          return;
        }
      }
    }

    this.updateTimeDisplay(cur, dur);
    if (window.timelineInstance && !window.timelineInstance.isDraggingPlayhead) {
      if (dur > 2 && window.timelineInstance.duration !== dur) {
        window.timelineInstance.duration = dur;
        window.timelineInstance.renderRuler();
      }
      window.timelineInstance.setTime(cur);
    }
    if (window.subtitlesInstance) {
      window.subtitlesInstance.renderActiveSubtitle(cur);
    }
  }

  switchToNativeVideoMode() {
    this.loadSessionId = (this.loadSessionId || 0) + 1;
    this.stopAndResetAllMedia();
    if (this.video) this.video.style.opacity = "1";
    this.isSynthesizedPlatformStream = false;
    this.isChromelessStream = false;
    this.isRealFullVideoLoaded = true;
    this.isVideoOnlyStream = false;
    this.previewSegmentBounds = null;
    this.cleanupActiveEngines();
    if (this.video) {
      this.video.classList.remove("hidden");
      this.video.muted = this.isAudioMuted;
      this.video.volume = this.isAudioMuted ? 0 : this.audioVolume;
    }
  }

  togglePlay() {
    this.unlockAudioOnUserGesture();

    if (this.isSynthesizedPlatformStream && !this.isRealFullVideoLoaded) {
      if (this.isPlaying) {
        this.pauseSynthesizedPlayback();
      } else {
        this.startSynthesizedPlayback();
      }
      return;
    }

    if (!this.video) return;
    if (this.video.paused) {
      this.isPlaying = true;
      if (this.centerPlayBtn) this.centerPlayBtn.classList.add("opacity-0", "pointer-events-none");
      this.updatePlayBtnIcons(true);
      if (!this.isAudioMuted) {
        this.video.defaultMuted = false;
        this.video.removeAttribute("muted");
        this.video.muted = false;
        this.video.volume = this.audioVolume > 0 ? this.audioVolume : 1.0;
        this.hideUnmutePrompt();
      }
      this.video.play().catch(() => {});
      if (this.isVideoOnlyStream && this.ytAudioEl && this.hasRealExternalAudio) {
        try {
          this.ytAudioEl.currentTime = this.video.currentTime;
        } catch (e) {}
        this.ytAudioEl.play().catch(() => {});
      }
    } else {
      this.isPlaying = false;
      if (this.centerPlayBtn) this.centerPlayBtn.classList.remove("opacity-0", "pointer-events-none");
      this.updatePlayBtnIcons(false);
      this.video.pause();
      if (this.ytAudioEl) {
        try {
          this.ytAudioEl.pause();
        } catch (e) {}
      }
    }
  }

  toggleMute() {
    const isCurrentlyMuted = this.isAudioMuted || (this.video && this.video.muted) || this.audioVolume === 0;
    if (isCurrentlyMuted) {
      this.isAudioMuted = false;
      const targetVol = this.previousVolume > 0 ? this.previousVolume : 1.0;
      this.setVolume(targetVol);
      if (this.video) {
        this.video.defaultMuted = false;
        this.video.removeAttribute("muted");
        this.video.muted = false;
      }
      this.unlockAudioOnUserGesture(true);
      this.hideUnmutePrompt();
    } else {
      this.previousVolume = this.audioVolume || 1.0;
      this.isAudioMuted = true;
      this.setVolume(0);
      if (this.video) this.video.muted = true;
    }
  }

  setVolume(val) {
    val = Math.max(0, Math.min(1, val));
    this.audioVolume = val;
    this.isAudioMuted = val === 0;
    if (this.video && !this.isSynthesizedPlatformStream && !this.isVideoOnlyStream) {
      this.video.volume = val;
      this.video.defaultMuted = val === 0;
      if (val === 0) {
        this.video.muted = true;
      } else {
        this.video.removeAttribute("muted");
        this.video.muted = false;
      }
    }
    if (this.ytAudioEl) {
      this.ytAudioEl.volume = val;
      this.ytAudioEl.muted = val === 0;
    }
    if (this.volumeSlider) {
      this.volumeSlider.value = val;
    }
    this.updateVolumeIcon(val);
  }

  updateVolumeIcon(val) {
    if (!this.volumeBtn) return;
    if (val === 0 || this.isAudioMuted) {
      this.volumeBtn.innerHTML = `<span id="volume-icon" class="text-red-400">🔇</span>`;
    } else if (val < 0.5) {
      this.volumeBtn.innerHTML = `<span id="volume-icon">🔉</span>`;
    } else {
      this.volumeBtn.innerHTML = `<span id="volume-icon">🔊</span>`;
    }
  }

  updatePlayBtnIcons(isPlaying) {
    const icon = isPlaying ? "⏸" : "▶";
    if (this.timelinePlayBtn) {
      this.timelinePlayBtn.innerHTML = icon;
    }
    if (this.inlinePlayBtn) {
      this.inlinePlayBtn.innerHTML = icon;
    }
  }

  updateTimeDisplay(curOverride, durOverride, updateSlider = true) {
    if (!this.timeDisplay) return;
    if (!window.currentVideoId) {
      this.timeDisplay.innerText = "00:00 / 00:00";
      if (this.seekSlider && updateSlider && !this.isScrubbingSlider) {
        this.seekSlider.value = 0;
      }
      return;
    }
    const cur = curOverride !== undefined ? curOverride : this.getCurrentTime();
    const dur = durOverride !== undefined ? durOverride : this.getDuration();
    this.timeDisplay.innerText = `${this.formatTime(cur)} / ${this.formatTime(dur)}`;
    if (this.seekSlider && updateSlider && !this.isScrubbingSlider && dur > 0) {
      this.seekSlider.value = Math.min(100, Math.max(0, (cur / dur) * 100)).toFixed(2);
    }
  }

  showEmptyState() {
    this.switchToNativeVideoMode();
    this.hideUnmutePrompt();
    const emptyState = document.getElementById("empty-player-state");
    const bottomControls = document.getElementById("player-bottom-controls");
    const qualityBadge = document.getElementById("player-quality-badge");
    const delBtn = document.getElementById("player-delete-video-btn");
    const customTextBanner = document.getElementById("player-custom-text-banner");

    if (emptyState) emptyState.classList.remove("hidden");
    if (this.video) {
      this.video.classList.add("hidden");
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }
    if (this.movingStreamImg) {
      this.movingStreamImg.classList.add("hidden");
    }
    this.isPlaying = false;
    this.updatePlayBtnIcons(false);
    this.resetFilters();

    if (this.centerPlayBtn) this.centerPlayBtn.classList.add("hidden");
    if (bottomControls) bottomControls.classList.add("hidden");
    if (qualityBadge) qualityBadge.classList.add("hidden");
    if (delBtn) delBtn.classList.add("hidden");
    if (customTextBanner) customTextBanner.classList.add("hidden");
    if (this.subtitlesOverlay) {
      this.subtitlesOverlay.innerText = "";
      this.subtitlesOverlay.classList.add("hidden");
    }
    this.updateTimeDisplay(0, 0);
  }

  hideEmptyState() {
    const emptyState = document.getElementById("empty-player-state");
    const bottomControls = document.getElementById("player-bottom-controls");
    const qualityBadge = document.getElementById("player-quality-badge");
    const delBtn = document.getElementById("player-delete-video-btn");

    if (emptyState) emptyState.classList.add("hidden");
    if (this.video) this.video.classList.remove("hidden");
    if (this.centerPlayBtn) {
      this.centerPlayBtn.classList.remove("hidden");
    }
    if (bottomControls) {
      bottomControls.classList.remove("hidden");
      bottomControls.classList.add("flex");
    }
    if (qualityBadge) {
      qualityBadge.classList.remove("hidden");
      qualityBadge.classList.add("flex");
    }
    if (delBtn) {
      delBtn.classList.remove("hidden");
      delBtn.classList.add("flex");
    }
    this.updateTimeDisplay();
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  toggleFullscreen() {
    const container = document.getElementById("player-container");
    if (!document.fullscreenElement) {
      if (container && container.requestFullscreen) {
        container.requestFullscreen();
      } else if (this.video && this.video.webkitEnterFullscreen) {
        this.video.webkitEnterFullscreen();
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
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
    if (!window.currentVideoId) return;

    const modal = document.getElementById("video-info-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const resEl = document.getElementById("spec-resolution");
    const durEl = document.getElementById("spec-duration");
    const fpsEl = document.getElementById("spec-fps");

    const dur = this.getDuration();
    if (durEl) durEl.innerText = this.formatTime(dur);

    if (resEl) resEl.innerText = this.actualVideoWidth && this.actualVideoHeight ? `${this.actualVideoWidth}x${this.actualVideoHeight} (HD)` : window.currentVideoMeta?.info?.resolution || "1920x1080 (Full HD)";
    if (fpsEl) fpsEl.innerText = "30.0 FPS";
  }

  applyFilter(type, value) {
    this.filters[type] = value;
    const filterString = `brightness(${this.filters.brightness}) contrast(${this.filters.contrast}) saturate(${this.filters.saturation}) sepia(${this.filters.sepia}%) blur(${this.filters.blur}px)`;
    if (this.video) this.video.style.filter = filterString;
    if (this.movingStreamImg) this.movingStreamImg.style.filter = filterString;
  }

  resetFilters() {
    this.filters = { brightness: 1.0, contrast: 1.0, saturation: 1.0, sepia: 0, blur: 0 };
    if (this.video) this.video.style.filter = "none";
    if (this.movingStreamImg) this.movingStreamImg.style.filter = "none";
  }
}

window.VideoPlayer = VideoPlayer;
