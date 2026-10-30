/**
 * VideoPro Edit - Main Application Orchestrator
 * Comprehensive handlers for all buttons, real upload progress, modals, tools, and export
 */
document.addEventListener("DOMContentLoaded", () => {
  window.currentVideoId = null;
  window.activeUploadXHR = null;

  // Key Elements
  const videoEl = document.getElementById("main-video");
  const timelineContainer = document.getElementById("timeline-container");
  const fileInput = document.getElementById("video-file-input");

  // Initialize Core Engines
  const player = new VideoPlayer(videoEl);
  const timeline = new TimelineEngine(videoEl, timelineContainer);
  const tasksManager = new TasksManager();
  const splitter = new VideoSplitter();
  const reframe = new AspectRatioManager();
  const silence = new SilenceRemover();
  const highlights = new HighlightsManager();
  const subtitles = new SubtitlesManager();

  window.videoPlayerInstance = player;
  window.timelineInstance = timeline;
  window.tasksManager = tasksManager;
  window.splitterInstance = splitter;
  window.reframeInstance = reframe;
  window.silenceInstance = silence;
  window.highlightsInstance = highlights;
  window.subtitlesInstance = subtitles;

  // ========================================================
  // DELETE VIDEO & RESET WORKSPACE
  // ========================================================
  window.deleteCurrentVideo = async function() {
    if (!window.currentVideoId) {
      timeline.showToast("لا يوجد فيديو محمل حالياً للحذف");
      return;
    }

    const prevId = window.currentVideoId;
    window.currentVideoId = null;

    // Reset file input value so user can re-upload the same file immediately
    if (fileInput) fileInput.value = "";

    // Reset Player to empty state
    player.showEmptyState();

    // Reset Timeline
    timeline.resetTimeline();

    // Reset Subtitles
    if (subtitles) {
      subtitles.cues = [];
      if (subtitles.subtitlesOverlay) {
        subtitles.subtitlesOverlay.innerText = "";
        subtitles.subtitlesOverlay.classList.add("hidden");
      }
    }

    // Notify backend in background to remove upload
    try {
      const fd = new FormData();
      fd.append("video_id", prevId);
      fetch("/api/video/delete", { method: "POST", body: fd }).catch(() => {});
    } catch (e) {}

    timeline.showToast("🗑️ تم حذف الفيديو بنجاح وإعادة ضبط الاستوديو");
  };

  // ========================================================
  // 1. REAL UPLOAD PROGRESS (XMLHttpRequest with % and MB)
  // ========================================================
  const triggerUploadBtn = document.getElementById("upload-trigger-btn");
  if (triggerUploadBtn && fileInput) {
    triggerUploadBtn.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        startRealVideoUpload(file);
      }
    });
  }

  // Drag and Drop on Player
  const playerContainer = document.getElementById("player-container");
  if (playerContainer) {
    playerContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      playerContainer.classList.add("border-purple-500", "border-2");
    });
    playerContainer.addEventListener("dragleave", () => {
      playerContainer.classList.remove("border-purple-500", "border-2");
    });
    playerContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      playerContainer.classList.remove("border-purple-500", "border-2");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        startRealVideoUpload(e.dataTransfer.files[0]);
      }
    });
  }

  function startRealVideoUpload(file) {
    const uploadModal = document.getElementById("upload-progress-modal");
    const nameDisplay = document.getElementById("upload-filename-display");
    const percentBadge = document.getElementById("upload-percentage-badge");
    const progressBar = document.getElementById("upload-progress-bar");
    const sizeDisplay = document.getElementById("upload-size-display");
    const speedDisplay = document.getElementById("upload-speed-display");
    const statusText = document.getElementById("upload-status-text");
    const spinner = document.getElementById("upload-status-spinner");
    const notifyEl = document.getElementById("upload-notification");
    const notifyText = document.getElementById("upload-notification-text");
    const notifyBar = document.getElementById("upload-notification-bar");
    const notifyPercent = document.getElementById("upload-notification-percent");

    // Open upload progress modal
    if (uploadModal) {
      uploadModal.classList.remove("hidden");
      uploadModal.classList.add("flex");
    }
    if (nameDisplay) nameDisplay.innerText = file.name;
    if (percentBadge) percentBadge.innerText = "0%";
    if (progressBar) progressBar.style.width = "0%";
    if (statusText) statusText.innerText = "جاري رفع الفيديو إلى الخادم...";
    if (spinner) spinner.classList.remove("hidden");

    if (notifyEl) {
      notifyEl.classList.remove("hidden");
      if (notifyText) notifyText.innerText = `جاري رفع ومعالجة الفيديو: ${file.name} (0%)`;
      if (notifyBar) notifyBar.style.width = "0%";
      if (notifyPercent) notifyPercent.innerText = "0%";
    }

    const xhr = new XMLHttpRequest();
    window.activeUploadXHR = xhr;
    const startTime = Date.now();
    const fileSize = file.size || 0;

    // Progress event
    xhr.upload.addEventListener("progress", (e) => {
      const totalBytes = (e.lengthComputable && e.total > 0) ? e.total : fileSize;
      const loadedBytes = e.loaded;
      const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 50;

      const loadedMB = (loadedBytes / (1024 * 1024)).toFixed(1);
      const totalMB = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : loadedMB;

      const elapsedSec = (Date.now() - startTime) / 1000;
      const speedMBs = elapsedSec > 0 ? ((loadedBytes / (1024 * 1024)) / elapsedSec).toFixed(1) : "0.0";

      if (percentBadge) percentBadge.innerText = `${percent}%`;
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (sizeDisplay) sizeDisplay.innerText = `${loadedMB} MB / ${totalMB} MB`;
      if (speedDisplay) speedDisplay.innerText = `${speedMBs} MB/s`;

      if (notifyBar) notifyBar.style.width = `${percent}%`;
      if (notifyPercent) notifyPercent.innerText = `${percent}%`;

      if (percent < 100) {
        if (statusText) statusText.innerText = `جاري رفع الفيديو: ${percent}% (${loadedMB}MB من ${totalMB}MB)`;
        if (notifyText) notifyText.innerText = `جاري رفع الفيديو: ${percent}% (${loadedMB}MB / ${totalMB}MB) • ${speedMBs} MB/s`;
      } else {
        if (statusText) statusText.innerText = "جاري معالجة الفيديو في الخادم وتوليد المعاينة...";
        if (notifyText) notifyText.innerText = "اكتمل الرفع 100%! جاري معالجة الفيديو وتجهيز الاستوديو...";
      }
    });

    // Complete event
    xhr.addEventListener("load", () => {
      window.activeUploadXHR = null;
      if (fileInput) fileInput.value = "";
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          window.currentVideoId = data.video_id;

          if (videoEl && data.preview_url) {
            player.hideEmptyState();
            videoEl.src = data.preview_url;
            videoEl.load();
            videoEl.play().catch(() => {});
          }

          if (window.subtitlesManager) {
            window.subtitlesManager.clearCues();
          }

          if (data.info && data.info.duration) {
            timeline.duration = data.info.duration;
            timeline.setTime(0);
            timeline.renderRuler();
            timeline.drawAudioWaveform();
            timeline.renderFilmstrip();
          }

          if (percentBadge) percentBadge.innerText = "100%";
          if (progressBar) progressBar.style.width = "100%";
          if (notifyBar) notifyBar.style.width = "100%";
          if (notifyPercent) notifyPercent.innerText = "100%";

          const resText = data.info?.resolution || '1080p';
          const durText = data.info?.formatted_duration || '';
          if (statusText) statusText.innerText = `تم رفع ومعالجة الفيديو بنجاح! (${resText} • ${durText})`;
          if (notifyText) notifyText.innerText = `تم رفع الفيديو بنجاح! (${resText} • ${durText})`;
          timeline.showToast(`🎉 تم رفع ومعالجة "${file.name}" بنجاح!`);

          setTimeout(() => {
            if (notifyEl) notifyEl.classList.add("hidden");
          }, 5000);

          // Save project to recent projects store
          saveProject({
            id: data.video_id,
            name: file.name,
            duration: durText || "01:24",
            resolution: resText,
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            date: new Date().toLocaleDateString("ar-EG"),
          });

          setTimeout(() => {
            if (uploadModal) {
              uploadModal.classList.add("hidden");
              uploadModal.classList.remove("flex");
            }
          }, 1200);
        } catch (err) {
          if (statusText) statusText.innerText = `خطأ في المعالجة: ${err.message}`;
          if (notifyText) notifyText.innerText = `خطأ في المعالجة: ${err.message}`;
        }
      } else {
        if (statusText) statusText.innerText = `فشل الرفع (كود الخطأ: ${xhr.status})`;
        if (notifyText) notifyText.innerText = `فشل الرفع (كود الخطأ: ${xhr.status})`;
      }
    });

    // Error event
    xhr.addEventListener("error", () => {
      window.activeUploadXHR = null;
      if (fileInput) fileInput.value = "";
      if (statusText) statusText.innerText = "حدث خطأ في الاتصال بالخادم أثناء الرفع";
      if (notifyText) notifyText.innerText = "فشل رفع الفيديو. يرجى التحقق من اتصالك.";
    });

    // Abort event
    xhr.addEventListener("abort", () => {
      window.activeUploadXHR = null;
      if (fileInput) fileInput.value = "";
      if (statusText) statusText.innerText = "تم إلغاء رفع الفيديو";
      if (notifyText) notifyText.innerText = "تم إلغاء الرفع";
      setTimeout(() => notifyEl?.classList.add("hidden"), 2500);
    });

    const formData = new FormData();
    formData.append("file", file);
    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  }

  // Cancel & Close Upload Handler
  const dismissUploadModal = () => {
    if (window.activeUploadXHR) {
      window.activeUploadXHR.abort();
    }
    const modal = document.getElementById("upload-progress-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
    if (fileInput) fileInput.value = "";
  };
  document.getElementById("cancel-upload-btn")?.addEventListener("click", dismissUploadModal);
  document.getElementById("close-upload-modal")?.addEventListener("click", dismissUploadModal);

  // ========================================================
  // 2. HEADER BUTTONS & MODALS
  // ========================================================

  // Brand Logo Click
  document.getElementById("brand-logo-btn")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    timeline.showToast("VideoPro Edit - استوديو الفيديو الاحترافي جاهز للعمل");
  });

  // Home Nav
  document.getElementById("nav-home-btn")?.addEventListener("click", () => {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Projects Modal (Desktop & Mobile)
  const openProjHandler = () => openProjectsModal();
  document.getElementById("nav-projects-btn")?.addEventListener("click", openProjHandler);
  document.getElementById("mobile-nav-projects-btn")?.addEventListener("click", openProjHandler);

  document.getElementById("close-projects-modal")?.addEventListener("click", () => {
    document.getElementById("projects-modal")?.classList.add("hidden");
    document.getElementById("projects-modal")?.classList.remove("flex");
  });
  document.getElementById("create-new-project-btn")?.addEventListener("click", () => {
    document.getElementById("projects-modal")?.classList.add("hidden");
    document.getElementById("projects-modal")?.classList.remove("flex");
    fileInput?.click();
  });

  // YouTube Import Modal Handlers
  const openYouTubeModal = () => {
    const modal = document.getElementById("youtube-import-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      const input = document.getElementById("modal-youtube-url-input");
      if (input) {
        input.focus();
      }
      const statusEl = document.getElementById("youtube-modal-status");
      if (statusEl) statusEl.innerText = "";
    }
  };

  const closeYouTubeModal = () => {
    const modal = document.getElementById("youtube-import-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  };

  document.getElementById("nav-youtube-btn")?.addEventListener("click", openYouTubeModal);
  document.getElementById("mobile-nav-youtube-btn")?.addEventListener("click", openYouTubeModal);
  document.getElementById("tool-youtube-btn")?.addEventListener("click", openYouTubeModal);
  document.getElementById("quick-youtube-btn")?.addEventListener("click", openYouTubeModal);
  document.getElementById("empty-open-youtube-modal-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openYouTubeModal();
  });
  document.getElementById("close-youtube-modal")?.addEventListener("click", closeYouTubeModal);
  document.getElementById("cancel-youtube-modal-btn")?.addEventListener("click", closeYouTubeModal);

  // Helper to load imported YouTube video into studio player & timeline
  const activateImportedVideo = (data, customTitle = null) => {
    window.currentVideoId = data.video_id;

    if (videoEl && data.preview_url) {
      player.hideEmptyState();
      videoEl.src = data.preview_url;
      videoEl.load();
      videoEl.play().catch(() => {});
    }

    if (window.subtitlesManager) {
      window.subtitlesManager.clearCues();
    }

    if (data.info && data.info.duration) {
      timeline.duration = data.info.duration;
      timeline.setTime(0);
      timeline.renderRuler();
      timeline.drawAudioWaveform();
      timeline.renderFilmstrip();
    }

    const resText = data.info?.resolution || (data.info?.width ? `${data.info.width}x${data.info.height}` : '720p HD');
    const durText = data.info?.formatted_duration || '';
    const title = customTitle || data.title || data.filename || "YouTube Video";

    timeline.showToast(`🎉 تم جلب واستيراد "${title}" بنجاح!`);

    saveProject({
      id: data.video_id,
      name: title,
      duration: durText || "01:00",
      resolution: resText,
      size: data.info?.size_mb ? `${data.info.size_mb} MB` : 'YouTube',
      date: new Date().toLocaleDateString("ar-EG"),
    });
  };

  const processYouTubeImport = async (url, quality = "720p", statusEl = null, btn = null) => {
    const cleanUrl = (url || "").trim();
    if (!cleanUrl) {
      const err = "⚠️ يرجى إدخال رابط فيديو YouTube أولاً";
      if (statusEl) statusEl.innerText = err;
      timeline.showToast(err);
      return;
    }

    const ytRegex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/|v\/|live\/)|youtu\.be\/)/i;
    if (!ytRegex.test(cleanUrl) && !cleanUrl.includes("youtube.com") && !cleanUrl.includes("youtu.be")) {
      const err = "⚠️ يرجى التأكد من كتابة رابط يوتيوب صالح (عادي أو Shorts أو youtu.be)";
      if (statusEl) statusEl.innerText = err;
      timeline.showToast(err);
      return;
    }

    if (statusEl) {
      statusEl.innerText = "⏳ جاري الاتصال بخوادم YouTube وتنزيل المقطع...";
    }

    const shortUrlDisplay = cleanUrl.replace(/https?:\/\/(www\.)?/, "").substring(0, 26) + "...";

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "youtube_import",
        title: `جلب فيديو YouTube (${shortUrlDisplay})`,
        icon: "▶️",
        details: "جاري تنزيل الفيديو من سيرفرات YouTube ومعالجة الأبعاد والصوت...",
        dismissModalId: "youtube-import-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("url", cleanUrl);
          formData.append("quality", quality);

          const resp = await fetch("/api/video/import-youtube", {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();
          if (!resp.ok || !data.success) {
            throw new Error(data.detail || data.error || "تعذر تنزيل فيديو YouTube");
          }
          return data;
        },
        onSuccess: (data) => {
          activateImportedVideo(data, data.title);
          if (statusEl) statusEl.innerText = "";
        },
        onError: (err) => {
          if (statusEl) statusEl.innerText = `⚠️ ${err.message}`;
          timeline.showToast(`⚠️ ${err.message}`);
        }
      });
    } else {
      // Direct call fallback
      try {
        if (btn) {
          btn.disabled = true;
          btn.innerText = "⏳ جاري التحميل...";
        }
        const formData = new FormData();
        formData.append("url", cleanUrl);
        formData.append("quality", quality);

        const resp = await fetch("/api/video/import-youtube", {
          method: "POST",
          body: formData,
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data.detail || data.error || "تعذر تنزيل فيديو YouTube");
        }
        activateImportedVideo(data, data.title);
        closeYouTubeModal();
      } catch (err) {
        if (statusEl) statusEl.innerText = `⚠️ ${err.message}`;
        timeline.showToast(`⚠️ ${err.message}`);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "جلب الفيديو 📥";
        }
      }
    }
  };

  // Wire Modal Fetch Button
  document.getElementById("modal-youtube-fetch-btn")?.addEventListener("click", () => {
    const input = document.getElementById("modal-youtube-url-input");
    const quality = document.querySelector('input[name="modal-youtube-quality"]:checked')?.value || "720p";
    const statusEl = document.getElementById("youtube-modal-status");
    const btn = document.getElementById("modal-youtube-fetch-btn");
    processYouTubeImport(input?.value, quality, statusEl, btn);
  });
  document.getElementById("modal-youtube-url-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("modal-youtube-fetch-btn")?.click();
    }
  });

  // Wire Empty State Direct Input
  document.getElementById("empty-youtube-fetch-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const input = document.getElementById("empty-youtube-url-input");
    const statusEl = document.getElementById("empty-youtube-status");
    const btn = document.getElementById("empty-youtube-fetch-btn");
    processYouTubeImport(input?.value, "720p", statusEl, btn);
  });
  document.getElementById("empty-youtube-url-input")?.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("empty-youtube-fetch-btn")?.click();
    }
  });

  // Pricing Modal (Desktop & Mobile)
  const openPricingHandler = () => {

    const modal = document.getElementById("pricing-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  };
  document.getElementById("nav-pricing-btn")?.addEventListener("click", openPricingHandler);
  document.getElementById("mobile-nav-pricing-btn")?.addEventListener("click", openPricingHandler);

  document.getElementById("close-pricing-modal")?.addEventListener("click", () => {
    document.getElementById("pricing-modal")?.classList.add("hidden");
    document.getElementById("pricing-modal")?.classList.remove("flex");
  });

  // Pricing Billing Toggle
  let isAnnualBilling = false;
  document.getElementById("pricing-billing-toggle")?.addEventListener("click", () => {
    isAnnualBilling = !isAnnualBilling;
    const knob = document.getElementById("billing-toggle-knob");
    const proPrice = document.querySelector(".plan-price-pro");
    const bizPrice = document.querySelector(".plan-price-biz");

    if (isAnnualBilling) {
      knob.style.transform = "translateX(-24px)";
      if (proPrice) proPrice.innerText = "$15";
      if (bizPrice) bizPrice.innerText = "$39";
    } else {
      knob.style.transform = "translateX(0)";
      if (proPrice) proPrice.innerText = "$19";
      if (bizPrice) bizPrice.innerText = "$49";
    }
  });

  // Plan select buttons
  document.querySelectorAll(".plan-select-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const plan = btn.dataset.plan;
      if (plan === "free") {
        timeline.showToast("أنت مسجل حالياً في الخطة المجانية");
      } else {
        timeline.showToast(`🎉 تم ترقية حسابك إلى ${plan === 'pro' ? 'خطة برو الاحترافية' : 'خطة الشركات'} بنجاح!`);
        document.getElementById("pricing-modal")?.classList.add("hidden");
        document.getElementById("pricing-modal")?.classList.remove("flex");
        updateUserUI({ name: "مراد العبدالله", isPro: true });
      }
    });
  });

  // Help Modal (Desktop & Mobile)
  const openHelpHandler = () => {
    const modal = document.getElementById("help-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  };
  document.getElementById("nav-help-btn")?.addEventListener("click", openHelpHandler);
  document.getElementById("mobile-nav-help-btn")?.addEventListener("click", openHelpHandler);

  document.getElementById("close-help-modal")?.addEventListener("click", () => {
    document.getElementById("help-modal")?.classList.add("hidden");
    document.getElementById("help-modal")?.classList.remove("flex");
  });
  document.getElementById("contact-support-btn")?.addEventListener("click", () => {
    timeline.showToast("تم إرسال طلب الدعم! سيتواصل معك فريقنا خلال دقائق.");
  });

  // Auth / Login Modal
  document.getElementById("nav-login-btn")?.addEventListener("click", () => {
    const modal = document.getElementById("auth-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  });
  document.getElementById("close-auth-modal")?.addEventListener("click", () => {
    document.getElementById("auth-modal")?.classList.add("hidden");
    document.getElementById("auth-modal")?.classList.remove("flex");
  });

  // Auth Tabs
  const tabSignin = document.getElementById("auth-tab-signin");
  const tabSignup = document.getElementById("auth-tab-signup");
  const authNameContainer = document.getElementById("auth-name-container");
  const authSubmitBtn = document.getElementById("auth-submit-btn");

  tabSignin?.addEventListener("click", () => {
    tabSignin.classList.add("bg-purple-600", "text-white", "font-bold");
    tabSignup.classList.remove("bg-purple-600", "text-white", "font-bold");
    authNameContainer?.classList.add("hidden");
    if (authSubmitBtn) authSubmitBtn.innerText = "دخول إلى الاستوديو";
  });
  tabSignup?.addEventListener("click", () => {
    tabSignup.classList.add("bg-purple-600", "text-white", "font-bold");
    tabSignin.classList.remove("bg-purple-600", "text-white", "font-bold");
    authNameContainer?.classList.remove("hidden");
    if (authSubmitBtn) authSubmitBtn.innerText = "إنشاء حساب وبدء التحرير";
  });

  authSubmitBtn?.addEventListener("click", () => {
    const email = document.getElementById("auth-email-input")?.value || "user@videopro.com";
    const name = email.split("@")[0] || "مراد";
    updateUserUI({ name, isPro: true });
    document.getElementById("auth-modal")?.classList.add("hidden");
    document.getElementById("auth-modal")?.classList.remove("flex");
    timeline.showToast(`مرحباً بك ${name}! تم تسجيل الدخول بنجاح.`);
  });

  document.getElementById("auth-google-btn")?.addEventListener("click", () => {
    updateUserUI({ name: "مراد العبدالله", isPro: true });
    document.getElementById("auth-modal")?.classList.add("hidden");
    document.getElementById("auth-modal")?.classList.remove("flex");
    timeline.showToast("تم تسجيل الدخول بحساب Google بنجاح!");
  });

  document.getElementById("auth-guest-btn")?.addEventListener("click", () => {
    document.getElementById("auth-modal")?.classList.add("hidden");
    document.getElementById("auth-modal")?.classList.remove("flex");
    timeline.showToast("تصفح كضيف مفعّل");
  });

  // User Profile Avatar Click
  document.getElementById("nav-user-avatar")?.addEventListener("click", () => {
    const modal = document.getElementById("user-profile-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  });
  document.getElementById("close-profile-modal")?.addEventListener("click", () => {
    document.getElementById("user-profile-modal")?.classList.add("hidden");
    document.getElementById("user-profile-modal")?.classList.remove("flex");
  });

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    updateUserUI({ name: null, isPro: false });
    document.getElementById("user-profile-modal")?.classList.add("hidden");
    document.getElementById("user-profile-modal")?.classList.remove("flex");
    timeline.showToast("تم تسجيل الخروج");
  });

  function updateUserUI(user) {
    const loginText = document.getElementById("nav-login-text");
    const avatar = document.getElementById("nav-user-avatar");
    if (user.name) {
      if (loginText) loginText.innerText = user.name;
      if (avatar) avatar.innerHTML = `<span class="font-bold text-xs text-purple-300">${user.name.charAt(0)}</span>`;
    } else {
      if (loginText) loginText.innerText = "تسجيل الدخول";
      if (avatar) avatar.innerHTML = `<svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`;
    }
  }

  // Projects Storage Management
  function getSavedProjects() {
    try {
      const p = localStorage.getItem("videopro_saved_projects");
      return p ? JSON.parse(p) : [];
    } catch {
      return [];
    }
  }

  function saveProject(project) {
    const list = getSavedProjects().filter(p => p.id !== project.id);
    list.unshift(project);
    try {
      localStorage.setItem("videopro_saved_projects", JSON.stringify(list));
    } catch {}
  }

  function openProjectsModal() {
    const modal = document.getElementById("projects-modal");
    const listContainer = document.getElementById("projects-list-container");
    if (!modal || !listContainer) return;

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const projects = getSavedProjects();
    listContainer.innerHTML = "";

    if (projects.length === 0) {
      listContainer.innerHTML = `
        <div class="p-6 text-center text-gray-400 text-xs border border-dashed border-gray-800 rounded-xl">
          لا توجد مشاريع محفوظة حتى الآن. قم برفع فيديو للبدء في مشروع جديد.
        </div>
      `;
      return;
    }

    projects.forEach((proj) => {
      const card = document.createElement("div");
      card.className = "flex items-center justify-between p-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-purple-500/50 transition";
      card.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-tr from-purple-800 to-indigo-800 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow">
            ▶
          </div>
          <div>
            <div class="font-bold text-xs sm:text-sm text-gray-100">${proj.name}</div>
            <div class="text-[10px] text-gray-400 font-mono mt-0.5">${proj.resolution} • ${proj.duration} • ${proj.size} • ${proj.date}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="open-proj-btn px-3 py-1.5 rounded-lg btn-primary text-xs font-bold cursor-pointer" data-id="${proj.id}">
            فتح
          </button>
          <button class="del-proj-btn p-1.5 rounded-lg hover:bg-red-950/40 text-gray-500 hover:text-red-400 transition cursor-pointer" data-id="${proj.id}" title="حذف">
            ✕
          </button>
        </div>
      `;
      listContainer.appendChild(card);
    });

    listContainer.querySelectorAll(".open-proj-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const projId = btn.dataset.id;
        window.currentVideoId = projId;
        const targetUrl = `/api/video/stream/${projId}`;
        player.hideEmptyState();
        if (videoEl) {
          videoEl.src = targetUrl;
          videoEl.load();
          videoEl.play().catch(() => {});
        }
        try {
          const res = await fetch(`/api/video/info?video_id=${projId}`);
          const data = await res.json();
          if (data && data.info && data.info.duration) {
            timeline.duration = data.info.duration;
            timeline.setTime(0);
            timeline.renderRuler();
            timeline.drawAudioWaveform();
            timeline.renderFilmstrip();
          }
        } catch {}
        timeline.showToast(`تم فتح المشروع في المشغل بنجاح`);
        modal.classList.add("hidden");
        modal.classList.remove("flex");
      });
    });

    listContainer.querySelectorAll(".del-proj-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const remaining = getSavedProjects().filter(p => p.id !== btn.dataset.id);
        localStorage.setItem("videopro_saved_projects", JSON.stringify(remaining));
        openProjectsModal();
      });
    });
  }

  // ========================================================
  // 3. ALL 9 TOOLS HANDLERS (Sidebar & Mobile Quick Carousel)
  // ========================================================

  // Tool 1: Split
  const toolSplitBtn = document.getElementById("tool-split-btn");
  const quickSplitBtn = document.getElementById("quick-split-btn");
  [toolSplitBtn, quickSplitBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      splitter.openModal();
      setActiveSidebarTool(toolSplitBtn);
    });
  });

  // Tool 2: Subtitles
  const toolSubtitlesBtn = document.getElementById("tool-subtitles-btn");
  const quickSubtitlesBtn = document.getElementById("quick-subtitles-btn");
  [toolSubtitlesBtn, quickSubtitlesBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      subtitles.openModal();
      setActiveSidebarTool(toolSubtitlesBtn);
    });
  });

  // Tool 3: Reframe
  const toolReframeBtn = document.getElementById("tool-reframe-btn");
  const quickReframeBtn = document.getElementById("quick-reframe-btn");
  [toolReframeBtn, quickReframeBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      reframe.openModal();
      setActiveSidebarTool(toolReframeBtn);
    });
  });

  // Tool 4: Silence Remover
  const toolSilenceBtn = document.getElementById("tool-silence-btn");
  const quickSilenceBtn = document.getElementById("quick-silence-btn");
  [toolSilenceBtn, quickSilenceBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      silence.openModal();
      setActiveSidebarTool(toolSilenceBtn);
    });
  });

  // Tool 5: Highlights
  const toolHighlightsBtn = document.getElementById("tool-highlights-btn");
  const quickHighlightsBtn = document.getElementById("quick-highlights-btn");
  [toolHighlightsBtn, quickHighlightsBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      highlights.openModal();
      setActiveSidebarTool(toolHighlightsBtn);
    });
  });

  // Tool 6: Audio & Music
  const toolAudioBtn = document.getElementById("tool-audio-btn");
  const quickAudioBtn = document.getElementById("quick-audio-btn");
  const audioModal = document.getElementById("audio-modal");
  [toolAudioBtn, quickAudioBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع فيديو أولاً لإضافة مقطع صوتي");
        fileInput?.click();
        return;
      }
      if (audioModal) {
        audioModal.classList.remove("hidden");
        audioModal.classList.add("flex");
      }
      setActiveSidebarTool(toolAudioBtn);
    });
  });
  document.getElementById("close-audio-modal")?.addEventListener("click", () => {
    audioModal?.classList.add("hidden");
    audioModal?.classList.remove("flex");
  });

  // Audio modal listeners
  let selectedAudioPreset = "upbeat";
  let customAudioFile = null;

  document.querySelectorAll(".audio-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".audio-preset-btn").forEach(b => b.classList.remove("active", "border-teal-500", "bg-teal-950/50"));
      btn.classList.add("active", "border-teal-500", "bg-teal-950/50");
      selectedAudioPreset = btn.dataset.preset;
    });
  });

  const customAudioInput = document.getElementById("custom-audio-input");
  if (customAudioInput) {
    customAudioInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        customAudioFile = e.target.files[0];
        const label = document.getElementById("audio-file-name");
        if (label) label.innerText = `ملف مختار: ${customAudioFile.name}`;
        timeline.showToast(`تم اختيار المقطع الصوتي: ${customAudioFile.name}`);
      }
    });
  }

  const origVolSlider = document.getElementById("audio-orig-vol-slider");
  const musicVolSlider = document.getElementById("audio-music-vol-slider");
  origVolSlider?.addEventListener("input", (e) => {
    document.getElementById("audio-orig-vol-text").innerText = `${Math.round(e.target.value * 100)}%`;
  });
  musicVolSlider?.addEventListener("input", (e) => {
    document.getElementById("audio-music-vol-text").innerText = `${Math.round(e.target.value * 100)}%`;
  });

  document.getElementById("execute-audio-btn")?.addEventListener("click", async () => {
    if (!window.currentVideoId) {
      timeline.showToast("⚠️ يرجى رفع فيديو أولاً لإضافة مقطع صوتي");
      document.getElementById("audio-modal")?.classList.add("hidden");
      document.getElementById("audio-modal")?.classList.remove("flex");
      document.getElementById("video-file-input")?.click();
      return;
    }

    const vidId = window.currentVideoId;
    const preset = selectedAudioPreset;
    const vVol = origVolSlider ? origVolSlider.value : "1.0";
    const mVol = musicVolSlider ? musicVolSlider.value : "0.5";
    const audioFile = customAudioFile;

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "audio",
        title: `مزج الموسيقى والخلفية الصوتية (${preset})`,
        icon: "🎵",
        dismissModalId: "audio-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("preset", preset);
          formData.append("video_volume", vVol);
          formData.append("music_volume", mVol);
          if (audioFile) {
            formData.append("audio_file", audioFile);
          }

          const res = await fetch("/api/video/add-audio", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || "فشل مزج الصوت");
          return data;
        },
      });
      return;
    }

    const statusText = document.getElementById("audio-status-text");
    const resultBox = document.getElementById("audio-result-box");
    const dlLink = document.getElementById("audio-download-link");
    const btn = document.getElementById("execute-audio-btn");

    if (statusText) statusText.innerText = "جاري مزج وموازنة الصوت مع الفيديو...";
    btn.disabled = true;

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("preset", preset);
      formData.append("video_volume", origVolSlider ? origVolSlider.value : "1.0");
      formData.append("music_volume", musicVolSlider ? musicVolSlider.value : "0.5");
      if (customAudioFile) {
        formData.append("audio_file", customAudioFile);
      }

      const res = await fetch("/api/video/add-audio", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل مزج الصوت");

      if (statusText) statusText.innerText = "تم مزج الصوت والموسيقى بنجاح! 🎵";
      if (resultBox) resultBox.classList.remove("hidden");
      if (dlLink) {
        dlLink.href = data.url;
        dlLink.innerText = `تحميل الفيديو النهائي (${data.size_mb} MB)`;
      }

      if (videoEl && data.url) {
        videoEl.src = data.url;
        videoEl.play().catch(() => {});
      }
      timeline.drawAudioWaveform();
    } catch (err) {
      if (statusText) statusText.innerText = `خطأ: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });

  // Tool 7: Merge Clips
  const toolMergeBtn = document.getElementById("tool-merge-btn");
  const quickMergeBtn = document.getElementById("quick-merge-btn");
  const mergeModal = document.getElementById("merge-modal");
  [toolMergeBtn, quickMergeBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع فيديو أولاً لدمج المقاطع");
        fileInput?.click();
        return;
      }
      if (mergeModal) {
        mergeModal.classList.remove("hidden");
        mergeModal.classList.add("flex");
        renderMergeClipsList();
      }
      setActiveSidebarTool(toolMergeBtn);
    });
  });
  document.getElementById("close-merge-modal")?.addEventListener("click", () => {
    mergeModal?.classList.add("hidden");
    mergeModal?.classList.remove("flex");
  });

  let extraMergeFiles = [];
  const mergeFilesInput = document.getElementById("merge-files-input");
  mergeFilesInput?.addEventListener("change", (e) => {
    if (e.target.files) {
      for (let i = 0; i < e.target.files.length; i++) {
        extraMergeFiles.push(e.target.files[i]);
      }
      renderMergeClipsList();
      timeline.showToast(`تمت إضافة ${e.target.files.length} مقاطع جديدة لقائمة الدمج`);
    }
  });

  function renderMergeClipsList() {
    const listEl = document.getElementById("merge-clips-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    // Primary current video
    const item0 = document.createElement("div");
    item0.className = "flex items-center justify-between p-2.5 rounded-lg bg-gray-900 border border-purple-500/40 text-xs";
    item0.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-5 h-5 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-[10px]">1</span>
        <span class="font-bold text-gray-200">الفيديو الحالي الرئيسي</span>
      </div>
      <span class="text-[10px] text-purple-400 font-semibold">المقطع الأساسي</span>
    `;
    listEl.appendChild(item0);

    // Extra clips
    extraMergeFiles.forEach((file, idx) => {
      const item = document.createElement("div");
      item.className = "flex items-center justify-between p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-xs";
      item.innerHTML = `
        <div class="flex items-center gap-2 truncate">
          <span class="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px]">${idx + 2}</span>
          <span class="font-medium text-gray-300 truncate">${file.name}</span>
        </div>
        <button onclick="window.removeMergeClip(${idx})" class="text-gray-500 hover:text-red-400 p-1 cursor-pointer">✕</button>
      `;
      listEl.appendChild(item);
    });
  }

  window.removeMergeClip = function(idx) {
    extraMergeFiles.splice(idx, 1);
    renderMergeClipsList();
  };

  document.getElementById("execute-merge-btn")?.addEventListener("click", async () => {
    if (!window.currentVideoId) {
      timeline.showToast("⚠️ يرجى رفع فيديو أولاً لدمج المقاطع");
      document.getElementById("merge-modal")?.classList.add("hidden");
      document.getElementById("merge-modal")?.classList.remove("flex");
      document.getElementById("video-file-input")?.click();
      return;
    }

    const vidId = window.currentVideoId;
    const filesToMerge = [...extraMergeFiles];

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "merge",
        title: `دمج وتجميع ${filesToMerge.length + 1} مقاطع فيديو`,
        icon: "🔀",
        dismissModalId: "merge-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          filesToMerge.forEach((f) => {
            formData.append("clip_files", f);
          });

          const res = await fetch("/api/video/merge", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || "فشل دمج المقاطع");
          return data;
        },
      });
      return;
    }

    const statusText = document.getElementById("merge-status-text");
    const resultBox = document.getElementById("merge-result-box");
    const dlLink = document.getElementById("merge-download-link");
    const btn = document.getElementById("execute-merge-btn");

    btn.disabled = true;
    if (statusText) statusText.innerText = "جاري تجميع وتشفير المقاطع في فيديو واحد...";

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      extraMergeFiles.forEach((f) => {
        formData.append("clip_files", f);
      });

      const res = await fetch("/api/video/merge", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل دمج المقاطع");

      if (statusText) statusText.innerText = `تم دمج ${data.total_clips} مقاطع بنجاح في ملف واحد!`;
      if (resultBox) resultBox.classList.remove("hidden");
      if (dlLink) {
        dlLink.href = data.url;
        dlLink.innerText = `تحميل الفيديو المدمج (${data.size_mb} MB)`;
      }

      if (videoEl && data.url) {
        videoEl.src = data.url;
        videoEl.play().catch(() => {});
      }
    } catch (err) {
      if (statusText) statusText.innerText = `خطأ: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });

  // Tool 8: Enhance
  const toolEnhanceBtn = document.getElementById("tool-enhance-btn");
  const quickEnhanceBtn = document.getElementById("quick-enhance-btn");
  const enhanceModal = document.getElementById("enhance-modal");
  [toolEnhanceBtn, quickEnhanceBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      if (enhanceModal) {
        enhanceModal.classList.remove("hidden");
        enhanceModal.classList.add("flex");
      }
      setActiveSidebarTool(toolEnhanceBtn);
    });
  });
  document.getElementById("close-enhance-modal")?.addEventListener("click", () => {
    enhanceModal?.classList.add("hidden");
    enhanceModal?.classList.remove("flex");
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
    timeline.showToast("تمت إعادة ضبط الألوان");
  });

  // Tool 9: Text & Stickers
  const toolTextBtn = document.getElementById("tool-text-btn");
  const quickTextBtn = document.getElementById("quick-text-btn");
  const textModal = document.getElementById("text-modal");
  [toolTextBtn, quickTextBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع فيديو أولاً لحرق النصوص");
        fileInput?.click();
        return;
      }
      if (textModal) {
        textModal.classList.remove("hidden");
        textModal.classList.add("flex");
      }
      setActiveSidebarTool(toolTextBtn);
    });
  });
  document.getElementById("close-text-modal")?.addEventListener("click", () => {
    textModal?.classList.add("hidden");
    textModal?.classList.remove("flex");
  });

  // Sticker chips click
  document.querySelectorAll(".sticker-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const input = document.getElementById("overlay-text-input");
      if (input) {
        input.value = `${input.value} ${chip.innerText}`.trim();
        previewOverlayText();
      }
    });
  });

  function previewOverlayText() {
    const textInput = document.getElementById("overlay-text-input");
    const colorPicker = document.getElementById("overlay-color-picker");
    const sizeSlider = document.getElementById("overlay-size-slider");
    const posSelect = document.getElementById("overlay-position-select");
    const overlay = document.getElementById("player-subtitles-overlay");

    if (overlay && textInput) {
      overlay.innerText = textInput.value;
      overlay.style.color = colorPicker ? colorPicker.value : "#facc15";
      overlay.style.fontSize = `${sizeSlider ? sizeSlider.value : 24}px`;
      
      const pos = posSelect ? posSelect.value : "bottom";
      if (pos === "top") {
        overlay.style.top = "15%";
        overlay.style.bottom = "auto";
      } else if (pos === "center") {
        overlay.style.top = "50%";
        overlay.style.bottom = "auto";
        overlay.style.transform = "translate(-50%, -50%)";
      } else {
        overlay.style.top = "auto";
        overlay.style.bottom = "12%";
        overlay.style.transform = "translateX(-50%)";
      }

      overlay.classList.remove("hidden");
    }
  }

  document.getElementById("preview-text-btn")?.addEventListener("click", () => {
    previewOverlayText();
    timeline.showToast("تمت معاينة النص على الفيديو");
  });

  document.getElementById("execute-text-btn")?.addEventListener("click", async () => {
    if (!window.currentVideoId) {
      timeline.showToast("⚠️ يرجى رفع فيديو أولاً لحرق النصوص");
      document.getElementById("text-modal")?.classList.add("hidden");
      document.getElementById("text-modal")?.classList.remove("flex");
      document.getElementById("video-file-input")?.click();
      return;
    }

    const vidId = window.currentVideoId;
    const textVal = document.getElementById("overlay-text-input")?.value || "VideoPro Edit";
    const fontSize = document.getElementById("overlay-size-slider")?.value || "36";
    const fontColor = document.getElementById("overlay-color-picker")?.value || "yellow";
    const position = document.getElementById("overlay-position-select")?.value || "bottom";

    if (window.tasksManager) {
      window.tasksManager.runBackgroundTask({
        type: "text",
        title: `حرق النص والشعار: "${textVal.slice(0, 16)}"`,
        icon: "✍️",
        dismissModalId: "text-modal",
        apiCall: async () => {
          const formData = new FormData();
          formData.append("video_id", vidId);
          formData.append("text", textVal);
          formData.append("font_size", fontSize);
          formData.append("font_color", fontColor);
          formData.append("position", position);

          const res = await fetch("/api/video/add-text", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || "فشل حرق النص");
          return data;
        },
      });
      return;
    }

    const statusText = document.getElementById("text-status-text");
    const resultBox = document.getElementById("text-result-box");
    const dlLink = document.getElementById("text-download-link");
    const btn = document.getElementById("execute-text-btn");
    const textInput = document.getElementById("overlay-text-input");
    const colorPicker = document.getElementById("overlay-color-picker");
    const sizeSlider = document.getElementById("overlay-size-slider");
    const posSelect = document.getElementById("overlay-position-select");

    btn.disabled = true;
    if (statusText) statusText.innerText = "جاري حرق النص والشعارات على الفيديو...";

    try {
      const formData = new FormData();
      formData.append("video_id", vidId);
      formData.append("text", textInput?.value || "VideoPro Edit");
      formData.append("font_size", sizeSlider?.value || "36");
      formData.append("font_color", colorPicker?.value || "yellow");
      formData.append("position", posSelect?.value || "bottom");

      const res = await fetch("/api/video/add-text", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل حرق النص");

      if (statusText) statusText.innerText = "تم حرق النص بنجاح على الفيديو! ✍️";
      if (resultBox) resultBox.classList.remove("hidden");
      if (dlLink) {
        dlLink.href = data.url;
        dlLink.innerText = `تحميل الفيديو (${data.size_mb} MB)`;
      }

      if (videoEl && data.url) {
        videoEl.src = data.url;
        videoEl.play().catch(() => {});
      }
    } catch (err) {
      if (statusText) statusText.innerText = `خطأ: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });

  function setActiveSidebarTool(activeBtn) {
    document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
    if (activeBtn) activeBtn.classList.add("active");
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => {
      m.classList.add("hidden");
      m.classList.remove("flex");
    });
  }

  // Quick Action "ابدأ الآن" button
  const startNowBtn = document.getElementById("start-now-btn");
  if (startNowBtn) {
    startNowBtn.addEventListener("click", () => {
      splitter.openModal();
    });
  }

  // ========================================================
  // 4. EXPORT FINAL VIDEO WITH LIVE RENDERING PROGRESS
  // ========================================================
  const exportBtn = document.getElementById("export-video-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع فيديو أولاً لتصديره");
        document.getElementById("video-file-input")?.click();
        return;
      }

      const resolution = document.getElementById("export-quality-select")?.value || "1080p";
      const format = document.getElementById("export-format-select")?.value || "mp4";
      const vidId = window.currentVideoId;

      if (window.tasksManager) {
        window.tasksManager.runBackgroundTask({
          type: "export",
          title: `تصدير الفيديو النهائي (${resolution.toUpperCase()} • ${format.toUpperCase()})`,
          icon: "📦",
          apiCall: async () => {
            const formData = new FormData();
            formData.append("video_id", vidId);
            formData.append("resolution", resolution);
            formData.append("format_type", format);
            formData.append("brightness", (player.filters.brightness - 1.0).toFixed(2));
            formData.append("contrast", player.filters.contrast.toFixed(2));
            formData.append("saturation", player.filters.saturation.toFixed(2));

            const res = await fetch("/api/video/export", {
              method: "POST",
              body: formData,
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "فشل تصدير الفيديو");

            // Auto-trigger file download for the user
            if (data.url) {
              const a = document.createElement("a");
              a.href = data.url;
              a.download = data.filename || `videopro_export_${resolution}.${format}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }
            return data;
          },
        });
        return;
      }

      const modal = document.getElementById("export-progress-modal");
      const detailsDisplay = document.getElementById("export-details-display");
      const percentBadge = document.getElementById("export-percent-badge");
      const progressBar = document.getElementById("export-progress-bar");
      const statusText = document.getElementById("export-status-text");
      const dlBtn = document.getElementById("export-download-btn");

      const step1 = document.getElementById("export-step-1");
      const step2 = document.getElementById("export-step-2");
      const step3 = document.getElementById("export-step-3");

      if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
      }
      if (detailsDisplay) detailsDisplay.innerText = `${resolution.toUpperCase()} • ${format.toUpperCase()}`;
      if (percentBadge) percentBadge.innerText = "15%";
      if (progressBar) progressBar.style.width = "15%";
      if (dlBtn) dlBtn.classList.add("hidden");

      // Animate steps
      let progress = 15;
      const progressTimer = setInterval(() => {
        if (progress < 85) {
          progress += Math.floor(Math.random() * 12) + 5;
          if (progress > 85) progress = 85;
          if (percentBadge) percentBadge.innerText = `${progress}%`;
          if (progressBar) progressBar.style.width = `${progress}%`;

          if (progress > 35 && step2) {
            step2.className = "flex items-center gap-2 text-purple-300 font-semibold";
            step2.querySelector("span:first-child").className = "w-2 h-2 rounded-full bg-purple-400 animate-pulse";
          }
          if (progress > 65 && step3) {
            step3.className = "flex items-center gap-2 text-purple-300 font-semibold";
            step3.querySelector("span:first-child").className = "w-2 h-2 rounded-full bg-purple-400 animate-pulse";
          }
        }
      }, 400);

      try {
        const formData = new FormData();
        formData.append("video_id", vidId);
        formData.append("resolution", resolution);
        formData.append("format_type", format);
        formData.append("brightness", (player.filters.brightness - 1.0).toFixed(2));
        formData.append("contrast", player.filters.contrast.toFixed(2));
        formData.append("saturation", player.filters.saturation.toFixed(2));

        const res = await fetch("/api/video/export", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressTimer);

        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "فشل تصدير الفيديو");

        if (percentBadge) percentBadge.innerText = "100%";
        if (progressBar) progressBar.style.width = "100%";
        if (statusText) statusText.innerText = `تم إنهاء وتصدير الفيديو بنجاح! (${data.size_mb} MB)`;

        if (dlBtn) {
          dlBtn.href = data.url;
          dlBtn.download = data.filename;
          dlBtn.classList.remove("hidden");
        }

        const doneBtn = document.getElementById("done-export-btn");
        if (doneBtn) doneBtn.classList.remove("hidden");

        // Auto trigger download
        const a = document.createElement("a");
        a.href = data.url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        timeline.showToast("🎉 تم تحميل الفيديو المصدر بنجاح!");
      } catch (err) {
        clearInterval(progressTimer);
        if (statusText) statusText.innerText = `خطأ في التصدير: ${err.message}`;
        const doneBtn = document.getElementById("done-export-btn");
        if (doneBtn) doneBtn.classList.remove("hidden");
      }
    });
  }

  // Close Export Modal Handlers
  const dismissExportModal = () => {
    const modal = document.getElementById("export-progress-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  };
  document.getElementById("close-export-modal")?.addEventListener("click", dismissExportModal);
  document.getElementById("done-export-btn")?.addEventListener("click", dismissExportModal);

  // Outside click / Backdrop dismiss for all modals
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        // Don't auto-dismiss during active upload
        if (modal.id === "upload-progress-modal" && window.activeUploadXHR) {
          return;
        }
        modal.classList.add("hidden");
        modal.classList.remove("flex");
      }
    });
  });
});
