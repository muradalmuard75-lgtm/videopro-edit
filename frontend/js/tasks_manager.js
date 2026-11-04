/**
 * VideoPro Edit v2.0 - Background Tasks Manager ("مربع المهام")
 * Handles non-blocking background video processing, live task tracking,
 * green checkmarks on completion, and instant preview/download actions.
 */
class TasksManager {
  constructor() {
    this.tasks = this.loadStoredTasks();
    this.activePollers = new Map();
    this.modal = document.getElementById("tasks-modal");
    this.init();
  }

  loadStoredTasks() {
    try {
      const raw = localStorage.getItem("videopro_tasks");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveTasks() {
    try {
      localStorage.setItem("videopro_tasks", JSON.stringify(this.tasks));
    } catch (e) {}
  }

  init() {
    const headerBtn = document.getElementById("tasks-drawer-btn");
    const mobileHeaderBtn = document.getElementById("mobile-tasks-drawer-btn");
    const floatingBtn = document.getElementById("floating-tasks-btn");
    const closeBtn = document.getElementById("close-tasks-modal");
    const clearBtn = document.getElementById("clear-completed-tasks-btn");

    if (headerBtn) headerBtn.addEventListener("click", () => this.openModal());
    if (mobileHeaderBtn) mobileHeaderBtn.addEventListener("click", () => this.openModal());
    if (floatingBtn) floatingBtn.addEventListener("click", () => this.openModal());
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());
    if (clearBtn) clearBtn.addEventListener("click", () => this.clearCompleted());

    let needsSave = false;
    this.tasks.forEach((t) => {
      if (t.status === "running") {
        t.status = "interrupted";
        t.error = "تمت مقاطعة العملية بسبب تحديث الصفحة أو إغلاق المتصفح";
        needsSave = true;
      }
    });
    if (needsSave) this.saveTasks();

    this.updateBadges();
    this.render();
  }

  openModal() {
    if (!this.modal) return;
    this.modal.classList.remove("hidden");
    this.modal.classList.add("flex");
    this.render();
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.classList.remove("flex");
  }

  getRunningTasks() {
    return this.tasks.filter((t) => t.status === "running");
  }

  getCompletedTasks() {
    return this.tasks.filter((t) => t.status === "completed");
  }

  updateBadges() {
    const running = this.getRunningTasks();
    const completed = this.getCompletedTasks();

    const headerBadge = document.getElementById("tasks-header-badge");
    const mobileHeaderBadge = document.getElementById("mobile-tasks-header-badge");
    const floatingBadge = document.getElementById("floating-tasks-badge");
    const floatingBtn = document.getElementById("floating-tasks-btn");
    const floatingIcon = document.getElementById("floating-tasks-icon");

    const badges = [headerBadge, mobileHeaderBadge, floatingBadge].filter(Boolean);

    if (running.length > 0) {
      const text = `⏳ ${running.length}`;
      badges.forEach((b) => {
        b.innerText = text;
        b.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black shadow animate-pulse inline-block";
        b.classList.remove("hidden");
      });
      if (floatingIcon) floatingIcon.innerHTML = `<span class="inline-block animate-spin">⏳</span>`;
      if (floatingBtn) floatingBtn.classList.add("border-amber-400", "shadow-amber-500/20");
    } else if (completed.length > 0) {
      const text = `✓ ${completed.length}`;
      badges.forEach((b) => {
        b.innerText = text;
        b.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow inline-block";
        b.classList.remove("hidden");
      });
      if (floatingIcon) floatingIcon.innerText = "✓";
      if (floatingBtn) floatingBtn.classList.remove("border-amber-400", "shadow-amber-500/20");
    } else {
      badges.forEach((b) => {
        b.innerText = "0";
        b.classList.add("hidden");
      });
      if (floatingIcon) floatingIcon.innerText = "📋";
      if (floatingBtn) floatingBtn.classList.remove("border-amber-400", "shadow-amber-500/20");
    }

    const modalSummary = document.getElementById("tasks-modal-summary");
    if (modalSummary) {
      if (running.length > 0) {
        modalSummary.innerHTML = `<span class="text-amber-400 font-bold">⏳ ${running.length} قيد المعالجة</span> • <span class="text-emerald-400 font-bold">✓ ${completed.length} مكتملة</span>`;
      } else {
        modalSummary.innerHTML = `<span class="text-emerald-400 font-bold">✓ ${completed.length} مكتملة</span>`;
      }
    }
  }

  async runBackgroundTask({
    type,
    title,
    icon = "⚡",
    details = "",
    apiCall,
    onSuccess,
    onError,
    dismissModalId = null,
  }) {
    if (dismissModalId) {
      const modalToDismiss = document.getElementById(dismissModalId);
      if (modalToDismiss) {
        modalToDismiss.classList.add("hidden");
        modalToDismiss.classList.remove("flex");
      }
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newTask = {
      id: taskId,
      type: type || "general",
      title: title || "عملية معالجة الفيديو",
      icon: icon,
      details: details || "جاري التنفيذ في الخلفية...",
      status: "running",
      startTime: Date.now(),
      completedTime: null,
      result: null,
      error: null,
    };

    this.tasks.unshift(newTask);
    this.saveTasks();
    this.updateBadges();
    this.render();

    if (window.timelineInstance) {
      window.timelineInstance.showToast(`⏳ بدأت العملية: "${title}" في الخلفية! يمكنك متابعة العمل بحرية.`);
    }

    const timerInterval = setInterval(() => {
      const current = this.tasks.find((t) => t.id === taskId);
      if (current && current.status === "running") {
        this.renderRunningTimer(taskId);
      } else {
        clearInterval(timerInterval);
      }
    }, 1000);
    this.activePollers.set(taskId, timerInterval);

    try {
      const data = await apiCall();
      const task = this.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = "completed";
        task.completedTime = Date.now();
        task.result = data;
        task.details = this.computeTaskSummary(type, data);
        this.saveTasks();
        this.updateBadges();
        this.render();

        if (window.timelineInstance) {
          window.timelineInstance.showToast(`🎉 ✓ اكتملت مهمة "${title}" بنجاح! جاهزة للمعاينة والتحميل.`);
        }

        if (typeof onSuccess === "function") {
          onSuccess(data);
        }
      }
    } catch (err) {
      console.error("Task failed:", err);
      const task = this.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = "failed";
        task.completedTime = Date.now();
        task.error = err.message || "حدث خطأ غير متوقع أثناء المعالجة";
        this.saveTasks();
        this.updateBadges();
        this.render();

        if (window.timelineInstance) {
          window.timelineInstance.showToast(`❌ فشلت العملية: "${title}". التفاصيل في مربع المهام.`);
        }

        if (typeof onError === "function") {
          onError(err);
        }
      }
    } finally {
      clearInterval(timerInterval);
      this.activePollers.delete(taskId);
      this.updateBadges();
    }
  }

  computeTaskSummary(type, data) {
    if (!data) return "اكتمل بنجاح";
    if (type === "youtube") {
      return `تم جلب "${data.title || "فيديو يوتيوب"}" (${data.is_short ? "YouTube Short 9:16" : "فيديو يوتيوب"}) • جاهز للأدوات`;
    }
    if (type === "reframe") {
      return `مقاس ${data.target_ratio || "9:16"} (${data.resolution || "720x1280"}) • حجم الملف: ${data.file_size_mb || "0"} MB`;
    }
    if (type === "split") {
      return `تم التقطيع إلى ${data.total_chunks || 0} مقطع • حجم الأرشيف: ${data.zip_size_mb || "0"} MB`;
    }
    if (type === "trim") {
      return `تم قص المقطع (${data.formatted_range || ""}) • المدة: ${data.duration || 0}s (${data.size_mb || 0} MB)`;
    }
    if (type === "silence") {
      return `تم حذف ${data.silence_cut_seconds || 0} ثانية من الصمت (${data.original_duration || 0}s ➜ ${data.new_duration || 0}s)`;
    }
    if (type === "highlights") {
      return `تم استخراج ${data.count || 0} من أفضل المشاهد جاهزة للتنزيل`;
    }
    if (type === "subtitles") {
      return `تم توليد ${data.cues ? data.cues.length : 0} سطر ترجمة بدقة عالية`;
    }
    if (type === "speed") {
      return `السرعة: ${data.speed || 1}x ${data.reverse ? "• عكس الفيديو" : ""} ${data.mode === "boomerang" ? "• بوميرانج" : ""} (${data.size_mb || 0} MB)`;
    }
    if (type === "voice") {
      return `تمت تنقية الصوت وعزل الضوضاء وموازنة LUFS بنجاح (${data.size_mb || 0} MB)`;
    }
    if (type === "publish") {
      return `تم تجهيز حقيبة النشر لـ ${data.platform_label || data.platform} + الصورة المصغرة والهاشتاقات`;
    }
    if (type === "export") {
      return `تم تصدير الفيديو بجودة ${data.resolution || "1080p"} • الحجم: ${data.size_mb || "0"} MB`;
    }
    if (type === "audio") {
      return `تم مزج المقطع الصوتي بنجاح • الحجم: ${data.size_mb || "0"} MB`;
    }
    if (type === "merge") {
      return `تم دمج ${data.total_clips || 2} مقاطع في ملف واحد (${data.size_mb || "0"} MB)`;
    }
    if (type === "text") {
      return `تم حرق النص والشعارات بنجاح (${data.size_mb || "0"} MB)`;
    }
    if (type === "autocaption" || type === "burn_subtitles") {
      const count = data.cues_burned || (data.cues ? data.cues.length : 0);
      return `تم حرق ${count} سطر ترجمة بنمط Reels/TikTok في الفيديو (${data.size_mb || "0"} MB)`;
    }
    return "اكتمل بنجاح";
  }

  renderRunningTimer(taskId) {
    const el = document.getElementById(`task-timer-${taskId}`);
    const task = this.tasks.find((t) => t.id === taskId);
    if (el && task) {
      const elapsed = Math.max(1, Math.floor((Date.now() - task.startTime) / 1000));
      el.innerText = `قيد المعالجة منذ ${elapsed} ثانية...`;
    }
  }

  render() {
    const listContainer = document.getElementById("tasks-list-container");
    if (!listContainer) return;

    if (this.tasks.length === 0) {
      listContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-center text-gray-400 gap-3 border border-dashed border-gray-800 rounded-2xl bg-[#0b101a]/50">
          <div class="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-2xl text-purple-400">
            📋
          </div>
          <div>
            <h4 class="font-bold text-gray-200 text-sm">مربع المهام فارغ حالياً</h4>
            <p class="text-xs text-gray-400 mt-1 max-w-sm leading-relaxed">
              عند تشغيل أي عملية في الاستوديو (جلب يوتيوب، تقطيع، ترجمة، نشر، تنقية صوت...) ستعمل تلقائياً هنا في الخلفية دون أن تضطر للانتظار.
            </p>
          </div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = "";

    this.tasks.forEach((task) => {
      const card = document.createElement("div");
      card.id = `task-card-${task.id}`;

      if (task.status === "running") {
        const elapsed = Math.max(1, Math.floor((Date.now() - task.startTime) / 1000));
        card.className = "p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#141b2a] to-[#111723] border border-amber-500/40 shadow-lg flex flex-col gap-2.5 transition";
        card.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-base shrink-0 animate-pulse">
                ${task.icon}
              </div>
              <div>
                <h4 class="font-bold text-xs sm:text-sm text-white">${task.title}</h4>
                <div class="flex items-center gap-2 text-[11px] text-amber-300/90 font-medium mt-0.5">
                  <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block"></span>
                  <span id="task-timer-${task.id}">قيد المعالجة منذ ${elapsed} ثانية...</span>
                </div>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 flex items-center gap-1">
              <svg class="w-3 h-3 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
              <span>قيد المعالجة ⏳</span>
            </span>
          </div>
          <div class="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-amber-500 via-purple-500 to-indigo-500 rounded-full w-full animate-pulse"></div>
          </div>
          <p class="text-[10px] text-gray-400">يمكنك التصفح والعمل بحرية في الاستوديو، سننبهك فور انتهاء هذه المهمة.</p>
        `;
      } else if (task.status === "completed") {
        const timeSpent = task.completedTime ? Math.max(1, Math.round((task.completedTime - task.startTime) / 1000)) : 2;
        const resUrl = task.result?.url || task.result?.preview_url || task.result?.video_url || task.result?.zip_url || "";
        const isSplit = task.type === "split";
        const isSubtitles = task.type === "subtitles";
        const isHighlights = task.type === "highlights";

        card.className = "p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#0f1726] border border-emerald-500/50 hover:border-emerald-400 shadow-xl flex flex-col gap-3 transition";
        card.innerHTML = `
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-lg shrink-0 shadow">
                ✓
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-bold text-xs sm:text-sm text-white">${task.title}</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center gap-1 shadow-sm">
                    <span class="text-xs">✓</span>
                    <span>مكتمل</span>
                  </span>
                </div>
                <div class="text-[11px] text-emerald-300/80 font-medium mt-0.5">${task.details}</div>
                <div class="text-[10px] text-gray-400 font-mono mt-0.5">استغرقت: ${timeSpent} ثانية • ${new Date(task.completedTime || Date.now()).toLocaleTimeString("ar-EG")}</div>
              </div>
            </div>
            <button onclick="window.tasksManager.deleteTask('${task.id}')" class="text-gray-500 hover:text-red-400 p-1 transition cursor-pointer text-xs" title="حذف من القائمة">✕</button>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-800/80">
            ${
              isSplit ? `
                <button onclick="window.tasksManager.loadTaskIntoPlayer('${task.id}')" class="flex-1 min-w-[120px] py-1.5 px-3 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition cursor-pointer">
                  <span>معاينة (المقطع 1)</span>
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              ` : isHighlights ? `
                <button onclick="window.tasksManager.loadTaskIntoPlayer('${task.id}')" class="flex-1 min-w-[120px] py-1.5 px-3 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition cursor-pointer">
                  <span>معاينة (اللقطة 1)</span>
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              ` : isSubtitles ? `
                <button onclick="window.tasksManager.applySubtitlesToPlayer('${task.id}')" class="flex-1 min-w-[120px] py-1.5 px-3 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition cursor-pointer">
                  <span>معاينة وتطبيق الترجمة</span>
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              ` : resUrl ? `
                <button onclick="window.tasksManager.loadTaskIntoPlayer('${task.id}')" class="flex-1 min-w-[120px] py-1.5 px-3 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition cursor-pointer">
                  <span>معاينة في المشغل</span>
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              ` : ""
            }

            ${
              isSplit && task.result?.zip_url ? `
                <a href="${task.result.zip_url}" download class="flex-1 min-w-[140px] py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition text-center cursor-pointer">
                  <span>تحميل ملف ZIP الكامل (${task.result.zip_size_mb || 0} MB)</span>
                </a>
              ` : resUrl ? `
                <a href="${resUrl}" download class="flex-1 min-w-[120px] py-1.5 px-3 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition cursor-pointer">
                  <span>تحميل الملف</span>
                </a>
              ` : ""
            }

            ${
              (isSplit && task.result?.chunks) ? `
                <button onclick="window.tasksManager.toggleAccordion('${task.id}')" class="py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer">
                  <span>عرض المقاطع (${task.result.chunks.length})</span>
                  <span id="chevron-${task.id}">▼</span>
                </button>
              ` : ""
            }
          </div>

          ${
            isSplit && task.result?.chunks ? `
              <div id="subclips-${task.id}" class="hidden flex flex-col gap-1.5 pt-2 border-t border-gray-800/60 max-h-48 overflow-y-auto">
                ${task.result.chunks.map((c) => `
                  <div class="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-gray-800 text-[11px]">
                    <div class="flex items-center gap-2">
                      <span class="w-5 h-5 rounded bg-purple-700/60 text-purple-200 font-bold flex items-center justify-center text-[10px]">${c.part}</span>
                      <span class="text-gray-200 font-medium truncate">${c.filename}</span>
                      <span class="text-gray-400 font-mono text-[10px]">(${c.duration}s • ${c.size_mb}MB)</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button onclick="window.previewChunk('${c.url}')" class="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">معاينة</button>
                      <a href="${c.url}" download="${c.filename}" class="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold">تنزيل</a>
                    </div>
                  </div>
                `).join("")}
              </div>
            ` : ""
          }
        `;
      } else {
        card.className = "p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#170e14] border border-red-500/40 shadow-lg flex flex-col gap-2 transition";
        card.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center text-lg shrink-0">
                ✕
              </div>
              <div>
                <h4 class="font-bold text-xs sm:text-sm text-white">${task.title}</h4>
                <div class="text-[11px] text-red-400 font-medium mt-0.5">${task.error || "فشلت المعالجة"}</div>
              </div>
            </div>
            <button onclick="window.tasksManager.deleteTask('${task.id}')" class="text-gray-500 hover:text-red-400 p-1 cursor-pointer">✕</button>
          </div>
        `;
      }

      listContainer.appendChild(card);
    });
  }

  toggleAccordion(taskId) {
    const el = document.getElementById(`subclips-${taskId}`);
    const chevron = document.getElementById(`chevron-${taskId}`);
    if (el) {
      el.classList.toggle("hidden");
      if (chevron) {
        chevron.innerText = el.classList.contains("hidden") ? "▼" : "▲";
      }
    }
  }

  async loadTaskIntoPlayer(taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task || !task.result) return;

    let url = task.result.url || task.result.preview_url || task.result.video_url;
    if (!url && task.result.chunks && task.result.chunks[0]) {
      url = task.result.chunks[0].url;
    }
    if (!url && task.result.highlights && task.result.highlights[0]) {
      url = task.result.highlights[0].url;
    }
    if (!url) return;

    const videoEl = document.getElementById("main-video");
    const timeline = window.timelineInstance;
    const player = window.videoPlayerInstance;

    if (player) {
      player.hideEmptyState();
    }
    if (videoEl) {
      videoEl.classList.remove("hidden");
      videoEl.src = url;
      videoEl.load();
      videoEl.play().catch(() => {});
    }

    const newVidId =
      task.result.video_id ||
      task.result.filename ||
      (task.result.chunks && task.result.chunks[0]?.filename) ||
      (task.result.highlights && task.result.highlights[0]?.filename) ||
      `task_${taskId}`;
    window.currentVideoId = newVidId;

    if (videoEl) {
      videoEl.onloadedmetadata = () => {
        if (timeline) {
          timeline.duration = videoEl.duration || 60;
          timeline.setTime(0);
          timeline.renderRuler();
          timeline.drawAudioWaveform();
          timeline.renderFilmstrip();
        }
      };
    }

    if (timeline) {
      timeline.showToast(`🎬 تم تحميل نتيجة "${task.title}" في المشغل بنجاح!`);
    }

    this.closeModal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  applySubtitlesToPlayer(taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task || !task.result || !task.result.cues) return;

    if (window.subtitlesInstance) {
      window.subtitlesInstance.cues = task.result.cues;
      window.subtitlesInstance.updateTimelineSubtitleBlocks();
      if (window.timelineInstance) {
        window.timelineInstance.setTime(0);
        window.timelineInstance.showToast("📝 تم تطبيق خطوط الترجمة على التايم لاين والمشغل!");
      }
      const video = document.getElementById("main-video");
      if (video) video.currentTime = 0;
    }
    this.closeModal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  deleteTask(taskId) {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.saveTasks();
    this.updateBadges();
    this.render();
  }

  clearCompleted() {
    this.tasks = this.tasks.filter((t) => t.status === "running");
    this.saveTasks();
    this.updateBadges();
    this.render();
    if (window.timelineInstance) {
      window.timelineInstance.showToast("تم مسح كافة المهام المكتملة");
    }
  }
}

window.TasksManager = TasksManager;
