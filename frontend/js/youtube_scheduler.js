/**
 * VideoPro Edit v2.0 - YouTube Auto-Scheduler & Batch Clip Publisher
 * Handles scheduling split video clips directly to YouTube with automated publishAt timestamps.
 */

class YouTubeScheduler {
  constructor() {
    this.modal = document.getElementById("youtube-scheduler-modal");
    this.clips = [];
    this.currentPlan = [];
    this.channelInfo = null;

    this.init();
  }

  init() {
    this.setupListeners();
    this.checkStatus();
  }

  setupListeners() {
    document.getElementById("close-youtube-scheduler-modal")?.addEventListener("click", () => this.closeModal());
    document.getElementById("scheduler-cancel-btn")?.addEventListener("click", () => this.closeModal());
    document.getElementById("nav-scheduler-btn")?.addEventListener("click", () => this.openModal());
    document.getElementById("mobile-nav-scheduler-btn")?.addEventListener("click", () => this.openModal());

    // Tab Switching
    document.querySelectorAll(".scheduler-tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Form inputs change triggers plan recalculation
    const inputs = [
      "sched-start-datetime",
      "sched-interval-select",
      "sched-base-title",
      "sched-description",
      "sched-tags",
    ];
    inputs.forEach((id) => {
      document.getElementById(id)?.addEventListener("input", () => this.recalculatePlan());
      document.getElementById(id)?.addEventListener("change", () => this.recalculatePlan());
    });

    // Save Credentials button
    document.getElementById("save-yt-creds-btn")?.addEventListener("click", () => this.saveCredentials());

    // Execute Schedule button
    document.getElementById("execute-scheduler-btn")?.addEventListener("click", () => this.executeScheduling());
  }

  switchTab(tabName) {
    document.querySelectorAll(".scheduler-tab-btn").forEach((btn) => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add("bg-rose-600", "text-white", "font-bold");
        btn.classList.remove("text-gray-400", "hover:text-white");
      } else {
        btn.classList.remove("bg-rose-600", "text-white", "font-bold");
        btn.classList.add("text-gray-400", "hover:text-white");
      }
    });

    document.querySelectorAll(".scheduler-tab-content").forEach((sec) => {
      sec.classList.add("hidden");
    });
    document.getElementById(`scheduler-tab-${tabName}`)?.classList.remove("hidden");

    if (tabName === "history") {
      this.loadHistory();
    }
  }

  async checkStatus() {
    try {
      const resp = await fetch("/api/youtube/scheduler/status");
      const data = await resp.json();
      const statusBadge = document.getElementById("yt-auth-status-badge");
      const channelDetails = document.getElementById("yt-channel-details");

      if (data.configured && data.channel && data.channel.title) {
        this.channelInfo = data.channel;
        if (statusBadge) {
          statusBadge.className = "px-3 py-1 rounded-full text-xs font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-500/50 flex items-center gap-1.5";
          statusBadge.innerHTML = `<span>🟢</span> <span>متصل بالقناة: ${data.channel.title}</span>`;
        }
        if (channelDetails) {
          channelDetails.classList.remove("hidden");
          channelDetails.innerHTML = `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-900/80 border border-gray-800">
              ${data.channel.avatar ? `<img src="${data.channel.avatar}" class="w-10 h-10 rounded-full border border-rose-500" />` : '<div class="w-10 h-10 rounded-full bg-rose-700 flex items-center justify-center text-white font-bold">YT</div>'}
              <div class="flex-1">
                <div class="font-bold text-sm text-white">${data.channel.title}</div>
                <div class="text-xs text-gray-400">${data.channel.subscriber_count ? `${Number(data.channel.subscriber_count).toLocaleString()} مشترك` : "قناة جاهزة للنشر"}</div>
              </div>
            </div>
          `;
        }
      } else {
        if (statusBadge) {
          statusBadge.className = "px-3 py-1 rounded-full text-xs font-bold bg-amber-900/60 text-amber-300 border border-amber-500/50 flex items-center gap-1.5";
          statusBadge.innerHTML = `<span>🟡</span> <span>بانتظار ربط القناة (أو تفعيل وضع الجدولة التجريبي)</span>`;
        }
      }
    } catch (e) {
      console.warn("YouTube scheduler status check:", e);
    }
  }

  openModal() {
    if (this.modal) {
      this.modal.classList.remove("hidden");
      this.modal.classList.add("flex");
    }
    this.checkStatus();
    if (this.clips && this.clips.length) {
      this.recalculatePlan();
    } else {
      const list = document.getElementById("scheduler-clips-list");
      if (list && !this.clips.length) {
        list.innerHTML = `
          <div class="text-xs text-gray-400 text-center py-6 bg-gray-900/40 rounded-xl border border-gray-800">
            ℹ️ لا توجد مقاطع مقطعة حالياً بالذاكرة.
            <br>
            يمكنك تقطيع أي فيديو من قسم "تقطيع الفيديو" ثم النقر على "جدولة المقاطع على يوتيوب"، أو إعداد وتفقد بيانات القناة من تبويب "إعدادات القناة (Credentials)".
          </div>
        `;
      }
    }
  }

  openWithClips(clips, defaultTitle = "") {
    this.clips = clips || [];
    if (!this.clips.length) {
      if (window.timelineInstance) {
        window.timelineInstance.showToast("⚠️ لا توجد مقاطع مقطعة حالياً، قم بتقطيع الفيديو أولاً.");
      }
      return;
    }

    if (this.modal) {
      this.modal.classList.remove("hidden");
      this.modal.classList.add("flex");
    }

    // Default start time: +30 minutes from now (ISO local)
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const startInput = document.getElementById("sched-start-datetime");
    if (startInput && !startInput.value) {
      startInput.value = localIso;
    }

    const titleInput = document.getElementById("sched-base-title");
    if (titleInput && (!titleInput.value || defaultTitle)) {
      titleInput.value = defaultTitle || (window.currentVideoMeta?.title || "مقطع فيديو حصري");
    }

    this.switchTab("plan");
    this.recalculatePlan();
    this.checkStatus();
  }

  closeModal() {
    if (this.modal) {
      this.modal.classList.add("hidden");
      this.modal.classList.remove("flex");
    }
  }

  async recalculatePlan() {
    const startVal = document.getElementById("sched-start-datetime")?.value;
    const intervalMins = parseInt(document.getElementById("sched-interval-select")?.value || "60", 10);
    const baseTitle = document.getElementById("sched-base-title")?.value || "مقطع فيديو";
    const desc = document.getElementById("sched-description")?.value || "";
    const tags = document.getElementById("sched-tags")?.value || "shorts,videopro";

    if (!startVal || !this.clips.length) return;

    const startDate = new Date(startVal);
    const startIso = startDate.toISOString();

    const fd = new FormData();
    fd.append("clips_json", JSON.stringify(this.clips));
    fd.append("start_time", startIso);
    fd.append("interval_minutes", intervalMins.toString());
    fd.append("base_title", baseTitle);
    fd.append("description", desc);
    fd.append("tags_csv", tags);

    try {
      const resp = await fetch("/api/youtube/scheduler/plan", {
        method: "POST",
        body: fd,
      });
      const data = await resp.json();
      if (data.success && data.plan) {
        this.currentPlan = data.plan;
        this.renderPlanPreview(data.plan);
      }
    } catch (e) {
      console.error("Failed to calculate plan:", e);
    }
  }

  renderPlanPreview(plan) {
    const list = document.getElementById("scheduler-clips-preview-list");
    const countBadge = document.getElementById("scheduler-clips-count");
    if (countBadge) countBadge.innerText = `${plan.length} مقاطع`;

    if (!list) return;
    list.innerHTML = "";

    plan.forEach((item) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between p-3 rounded-xl bg-gray-900/70 border border-gray-800 text-xs";
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded-lg bg-rose-600/30 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold font-mono">
            #${item.part}
          </div>
          <div>
            <div class="font-bold text-gray-200 line-clamp-1">${item.title}</div>
            <div class="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
              <span class="text-rose-300 font-semibold">📅 موعد النشر: ${item.publish_at_formatted}</span>
              ${item.duration ? `<span>• المدة: ${item.duration} ث</span>` : ""}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-1 rounded bg-gray-800 text-gray-400 text-[11px]">جاهز للجدولة</span>
        </div>
      `;
      list.appendChild(row);
    });
  }

  async saveCredentials() {
    const clientId = document.getElementById("yt-client-id")?.value;
    const clientSecret = document.getElementById("yt-client-secret")?.value;
    const refreshToken = document.getElementById("yt-refresh-token")?.value;
    const apiKey = document.getElementById("yt-api-key")?.value;
    const statusMsg = document.getElementById("yt-save-creds-status");

    const fd = new FormData();
    if (clientId) fd.append("client_id", clientId);
    if (clientSecret) fd.append("client_secret", clientSecret);
    if (refreshToken) fd.append("refresh_token", refreshToken);
    if (apiKey) fd.append("api_key", apiKey);

    if (statusMsg) {
      statusMsg.className = "text-xs font-semibold text-rose-400 mt-2";
      statusMsg.innerText = "جاري التحقق وحفظ البيانات...";
    }

    try {
      const resp = await fetch("/api/youtube/scheduler/save-credentials", {
        method: "POST",
        body: fd,
      });
      const data = await resp.json();
      if (data.success) {
        if (statusMsg) {
          statusMsg.className = "text-xs font-semibold text-emerald-400 mt-2";
          statusMsg.innerText = `✅ ${data.message}`;
        }
        this.checkStatus();
        if (window.timelineInstance) {
          window.timelineInstance.showToast("✅ تم حفظ بيانات اعتماد YouTube بنجاح!");
        }
      } else {
        if (statusMsg) {
          statusMsg.className = "text-xs font-semibold text-rose-400 mt-2";
          statusMsg.innerText = `❌ ${data.error || "فشل الحفظ"}`;
        }
      }
    } catch (e) {
      if (statusMsg) {
        statusMsg.className = "text-xs font-semibold text-rose-400 mt-2";
        statusMsg.innerText = `❌ حدث خطأ: ${e.message}`;
      }
    }
  }

  async executeScheduling() {
    if (!this.currentPlan || !this.currentPlan.length) {
      if (window.timelineInstance) window.timelineInstance.showToast("⚠️ لا توجد خطة جدولة لتنفيذها.");
      return;
    }

    const execBtn = document.getElementById("execute-scheduler-btn");
    const statusEl = document.getElementById("scheduler-execution-status");

    if (execBtn) {
      execBtn.disabled = true;
      execBtn.innerHTML = `<span>⏳ جاري جدولة ورفع المقاطع إلى يوتيوب...</span>`;
    }
    if (statusEl) {
      statusEl.classList.remove("hidden");
      statusEl.className = "p-3 rounded-xl bg-purple-900/30 border border-purple-500/40 text-xs text-purple-200";
      statusEl.innerHTML = `جاري بدء اتصال آمن بـ YouTube Data API وجدولة المقاطع...`;
    }

    try {
      const fd = new FormData();
      fd.append("plan_json", JSON.stringify(this.currentPlan));
      fd.append("simulate", "false");

      const resp = await fetch("/api/youtube/scheduler/execute", {
        method: "POST",
        body: fd,
      });
      const data = await resp.json();

      if (data.success && data.results) {
        if (statusEl) {
          statusEl.className = "p-3 rounded-xl bg-emerald-900/40 border border-emerald-500/40 text-xs text-emerald-200";
          statusEl.innerHTML = `
            <div class="font-bold text-sm mb-1.5">🎉 تم جدولة جميع المقاطع بنجاح على يوتيوب!</div>
            <div>تم ضبط مواعيد النشر التلقائي عبر خاصية <code class="bg-black/40 px-1 py-0.5 rounded">publishAt</code>.</div>
          `;
        }

        // Render completed rows
        const list = document.getElementById("scheduler-clips-preview-list");
        if (list) {
          list.innerHTML = "";
          data.results.forEach((res) => {
            const row = document.createElement("div");
            row.className = "flex items-center justify-between p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs";
            row.innerHTML = `
              <div class="flex items-center gap-3">
                <div class="w-7 h-7 rounded-lg bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <div class="font-bold text-white">${res.title}</div>
                  <div class="text-[11px] text-emerald-300 mt-0.5">
                    📅 مجدول للنشر: ${res.publish_at_formatted || res.publish_at}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <a href="${res.url}" target="_blank" class="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow">
                  <span>▶</span> <span>فتح الرابط</span>
                </a>
              </div>
            `;
            list.appendChild(row);
          });
        }

        if (window.timelineInstance) {
          window.timelineInstance.showToast("🎉 تم جدولة نشر جميع المقاطع بنجاح!");
        }
      } else {
        throw new Error(data.error || "فشل تنفيذ الجدولة");
      }
    } catch (e) {
      if (statusEl) {
        statusEl.className = "p-3 rounded-xl bg-rose-900/40 border border-rose-500/40 text-xs text-rose-200";
        statusEl.innerHTML = `❌ ${e.message}`;
      }
    } finally {
      if (execBtn) {
        execBtn.disabled = false;
        execBtn.innerHTML = `<span>🚀 تأكيد وجدولة النشر على يوتيوب</span>`;
      }
    }
  }

  async loadHistory() {
    const container = document.getElementById("scheduler-history-list");
    if (!container) return;
    container.innerHTML = '<div class="text-xs text-gray-400 text-center py-4">جاري تحميل السجل...</div>';

    try {
      const resp = await fetch("/api/youtube/scheduler/history");
      const data = await resp.json();
      if (data.success && data.jobs && data.jobs.length) {
        container.innerHTML = "";
        data.jobs.slice().reverse().forEach((job) => {
          const item = document.createElement("div");
          item.className = "flex items-center justify-between p-3 rounded-xl bg-gray-900/80 border border-gray-800 text-xs";
          item.innerHTML = `
            <div>
              <div class="font-bold text-white">${job.title || "مقطع مجدول"}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">موعد النشر: ${job.publish_at_formatted || job.publish_at || "فوري"}</div>
            </div>
            <div>
              <a href="${job.url}" target="_blank" class="px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs">رابط يوتيوب</a>
            </div>
          `;
          container.appendChild(item);
        });
      } else {
        container.innerHTML = '<div class="text-xs text-gray-400 text-center py-6">لا توجد مقاطع مجدولة سابقة حتى الآن.</div>';
      }
    } catch (e) {
      container.innerHTML = `<div class="text-xs text-rose-400 text-center py-4">فشل تحميل السجل: ${e.message}</div>`;
    }
  }
}

// Global initialization
window.addEventListener("DOMContentLoaded", () => {
  window.youtubeScheduler = new YouTubeScheduler();
  if (window.location.hash === "#scheduler") {
    setTimeout(() => {
      window.youtubeScheduler.openModal();
    }, 150);
  }
});
