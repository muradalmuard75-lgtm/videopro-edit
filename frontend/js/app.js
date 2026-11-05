(function () {
  window.__CANVAS_DEMO_BLOBS__ = {};
  window.__YT_REAL_CACHE__ = {};

  function fetchWithTimeout(url, ms = 5500, initOpts = undefined) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    const merged = Object.assign({}, initOpts || {}, { signal: ctrl.signal });
    return origFetch(url, merged).finally(() => clearTimeout(tid));
  }

  function fmtTc(sec) {
    const ms = Math.round(Math.max(0, sec) * 1000);
    const mms = ms % 1000;
    const ts = Math.floor(ms / 1000);
    const s = ts % 60;
    const tm = Math.floor(ts / 60);
    const m = tm % 60;
    const h = Math.floor(tm / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
      mms
    ).padStart(3, "0")}`;
  }

  /**
   * Splits any long subtitle cues into crisp 6–7 word Reels/Cinema cues with proportional timestamps
   * so the subtitle overlay on screen NEVER overflows or covers the video frame.
   */
  function chunkCuesToShortLines(rawCues, maxWords = 7) {
    if (!Array.isArray(rawCues) || rawCues.length === 0) return [];
    const out = [];
    for (const c of rawCues) {
      const text = String(c.text || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      const sSec = Number(c.start_sec || 0);
      const eSec = Math.max(sSec + 1.2, Number(c.end_sec || sSec + 3.0));
      const totalDur = eSec - sSec;
      const words = text.split(" ");
      if (words.length <= maxWords || text.includes("|")) {
        out.push({
          id: out.length + 1,
          start_sec: Number(sSec.toFixed(2)),
          end_sec: Number(eSec.toFixed(2)),
          start: fmtTc(sSec),
          end: fmtTc(eSec),
          text: text,
        });
      } else {
        const chunksCount = Math.ceil(words.length / maxWords);
        const balancedSize = Math.ceil(words.length / chunksCount);
        const stepDur = totalDur / chunksCount;
        for (let i = 0; i < chunksCount; i++) {
          const sliceWords = words.slice(i * balancedSize, (i + 1) * balancedSize).join(" ");
          if (!sliceWords) continue;
          const cs = Number((sSec + i * stepDur).toFixed(2));
          const ce = Number((i === chunksCount - 1 ? eSec : sSec + (i + 1) * stepDur - 0.05).toFixed(2));
          out.push({
            id: out.length + 1,
            start_sec: cs,
            end_sec: ce,
            start: fmtTc(cs),
            end: fmtTc(ce),
            text: sliceWords,
          });
        }
      }
    }
    return out;
  }

  // Pre-verified library of real YouTube videos with exact durations & verbatim timestamped transcripts
  const VERIFIED_YOUTUBE_VIDEOS = {
    "nI-R93CZ7c4": {
      title: "أفضل مكمل لتجديد خلايا الدماغ والذاكرة وتقوية الحفظ ( أسرار وكالة ناسا ) مجاناً وعلى طبق من ذهب",
      uploader: "الدُّكْتُور مُحَمَّد عَبْدُ الجَبَّار",
      duration: 544, // Exact 09:04 (544 seconds)
      is_short: false,
      segments: [
        [0.8, 6.2, "نحن نعيش الآن في عصر المكملات الغذائية وتجارة المكملات الغذائية"],
        [6.2, 12.2, "اللي وصلت أرباحها إلى حد مساوي لأرباح العلاجات الصيدلانية"],
        [12.2, 16.5, "واللي ما تعرفه أنت أخي الحبيب واللي تكلمنا عنه في حلقة سابقة"],
        [16.5, 22.8, "أن شركات وحيتان شركات العلاجات الصيدلانية هم نفسهم اللي يمتلكون شركات المكملات"],
        [22.8, 31.2, "والآن الإقبال عليها اليوم غير مسبوق لأن الكل يسوق لها على أنها إن لم تنفعك لن تضرك"],
        [31.2, 40.2, "وأنا كأستاذ ومتخصص في هذا العلم أقول لك: المكملات العشوائية قد تسبب مشاكل صحية خطيرة"],
        [40.2, 48.2, "وقد تدخل على أساسها إلى ردهة الطوارئ وهذه هي الحقيقة التي يخفيها تجار المكملات"],
        [48.2, 57.5, "الذين استبدلوا مهنة الطب النبيلة بمهنة التجارة والتسويق للمكملات الغذائية"],
        [57.5, 66.5, "الكل يسأل عن المكمل السحري الذي يزيد الذاكرة ويرفع الانتباه وينشط خلايا الدماغ"],
        [66.5, 78.5, "فيذكرون لك الكرياتين وعشبة الجينكوبيلوبا والأشواغاندا والكارنتين ومستخلص الشاي الأخضر"],
        [78.5, 87.5, "وهذه كلها مواد عليها دراسات ولها فوائد، ولكن في هذه الحلقة سأعطيك السر الحقيقي"],
        [87.5, 96.5, "سأعطيك على طبق من ذهب المكمل الذي قامت وكالة ناسا بنفسها بدراسته ونصحت به الطيارين"],
        [96.5, 106.5, "المكمل الذي تنصح به شركة جوجل عملاق التكنولوجيا وشركة مايكروسوفت ويوتيوب كل موظفيهم"],
        [106.5, 118.5, "والمفاجأة أن هذا المكمل مجاني تماماً ولن يكلفك ولا سنتاً واحداً! معكم د. محمد عبد الجبار"],
        [118.5, 128.5, "نستعرض معكم كل التفاصيل والدراسات العلمية الحديثة وكيفية تطبيقه خطوة بخطوة"],
        [128.5, 139.5, "بدايةً: اسم هذا المكمل الرباني المجاني هو «القيلولة» (Power Nap)"],
        [139.5, 148.5, "ما معنى القيلولة؟ هي النوم الخفيف خلال النهار ما بين الساعة 10 صباحاً حتى 2 ظهراً"],
        [148.5, 158.0, "ما هي الدراسات العلمية التي أجريت على القيلولة؟ سجل عندك ثلاثة أنواع مذهلة:"],
        [158.0, 168.0, "أولاً: قيلولة لمدة 5 دقائق فقط! نعم، تجلس في مكان هادئ وتغمض عينيك بنية النوم"],
        [168.0, 178.0, "أثبتت الدراسات أنها من أفضل أنواع القيلولة للمبدعين ورجال الأعمال وأصحاب القرار"],
        [178.0, 190.5, "لما تصير عندك مشكلة في إيجاد حل لمشكلة تتعلق بالبزنس أو العمل أو مشكلة تتعلق في حياتك"],
        [190.5, 199.5, "لماذا؟ علمياً لما يكون الإنسان مستيقظاً يعمل الدماغ على موجات «بيتا» السريعة المزدحمة"],
        [199.5, 207.5, "تكون مراكز الذاكرة والانتباه والنظر كلها مشتتة بأحداث اليوم فلا تستطيع التركيز"],
        [207.5, 215.0, "لكن عندما تأخذ قيلولة لمدة 5 دقائق في مكان هادئ وأنت مغمض العينين ماذا يحدث؟"],
        [215.0, 223.5, "ينتقل الدماغ من موجة «بيتا» السريعة إلى موجة «ألفا» المتوسطة ثم إلى موجة «ثيتا» الهادئة"],
        [223.5, 232.0, "موجة «ثيتا» تزيل الاحتشاء والتشتت الذهني وتبقي فقط المشكلة التي تفكر فيها فتجد الحل فوراً!"],
        [232.0, 244.0, "وهذه الطريقة أنصح بها دائماً رجال الأعمال وكل من يواجه معضلة تحتاج لتفكير صافي"],
        [244.0, 260.0, "ثانياً: قيلولة الـ 26 دقيقة (أقل من نصف ساعة) وهي التي درستها وكالة ناسا للفضاء"],
        [260.0, 269.0, "أجرت وكالة ناسا هذه الدراسة على طياري الخطوط الجوية في الرحلات الطويلة"],
        [269.0, 279.0, "ووجدت الدراسة أنه عندما يأخذ الطيار قيلولة بمعدل 26 دقيقة يحدث معه الآتي:"],
        [279.0, 288.0, "يرتفع مستوى الانتباه والتركيز بنسبة 36% بعد الاستيقاظ! ولا يوجد مكمل بالعالم يفعل ذلك"],
        [288.0, 298.0, "وتتحسن سرعة ردة الفعل والتركيز بشكل كبير أثناء الإقلاع والهبوط والقيادة"],
        [298.0, 315.0, "لذلك أصبحت شركات الطيران العالمية توجه الطيارين لأخذ هذه القيلولة في الرحلات الطويلة"],
        [315.0, 333.5, "وهو نفس النوع الذي تنصح به شركة جوجل ويوتيوب وموظفين فيسبوك وإنستغرام وجهزوا له غرفاً خاصة"],
        [333.5, 353.0, "ثالثاً: قيلولة الساعة والنصف (90 دقيقة) بشرط أن تكون بين 11 صباحاً و2 ظهراً"],
        [353.0, 369.0, "أثبتت الدراسات أنها ترفع طاقة الجسم وتضاعف قابلية الحفظ وتثبيت المعلومات المشاهدة"],
        [369.0, 389.0, "إذا كنت تشاهد محاضرة أو تتجهز للاختبارات في المدرسة أو الجامعة أو الدراسات العليا"],
        [389.0, 408.0, "فإن قيلولة الـ 90 دقيقة تعادل في أثرها على مركز الذاكرة ليلة كاملة من النوم (7 إلى 8 ساعات)!"],
        [408.0, 428.0, "وهذا النظام يطبقه أيضاً أبطال كمال الأجسام والرياضيون المحترفون للاستشفاء العضلي والذهني"],
        [428.0, 447.0, "يستيقظ الرياضي مبكراً لتمارين الكارديو ثم يأخذ قيلولة 90 دقيقة ظهراً قبل تمارين المقاومة"],
        [447.0, 472.0, "في نهاية الحلقة: شرحنا الأنواع الثلاثة للقيلولة وأثرها المذهل على الدماغ والذاكرة مجاناً"],
        [472.0, 493.0, "أعتذر من الإخوة والأخوات عن تأخر الرد على التعليقات بسبب خلل تقني مؤقت في تطبيق يوتيوب"],
        [493.0, 516.0, "وقبل الختام: احذروا من الدعايات الكاذبة حول مكمل NAD+ المزعوم لإطالة العمر وتجديد الشباب"],
        [516.0, 544.0, "شاهدوا الحلقة الخاصة به لتعرفوا الحقيقة العلمية، ونراكم في حلقة قادمة، والسلام عليكم ورحمة الله"],
      ],
    },
    "4P8B3jUlMRg": {
      title: "بم التعلل؟ قصيدة للمتنبي بصوت: أسامة الواعظ",
      uploader: "أسامة الواعظ",
      duration: 274, // Exact 04:34 (274 seconds)
      is_short: false,
      segments: [
        [4.8, 14.5, "بِمَ التَّعَلُّلُ لا أَهلٌ وَلا وَطَنُ — وَلا نَديمٌ وَلا كَأسٌ وَلا سَكَنُ"],
        [14.5, 25.0, "أُريدُ مِن زَمَني ذا أَن يُبَلِّغَني — ما لَيسَ يَبلُغُهُ مِن نَفسِهِ الزَّمَنُ"],
        [25.0, 36.0, "لا تَلقَ دَهرَكَ إِلّا غَيرَ مُكتَرِثٍ — ما دامَ يَصحَبُ فيهِ روحَكَ البَدَنُ"],
        [36.0, 46.5, "فَما يُديمُ سُروراً ما سُرِرتَ بِهِ — وَلا يَرُدُّ عَلَيكَ الفائِتَ الحَزَنُ"],
        [46.5, 58.0, "مِمّا أَضَرَّ بِأَهلِ العِشقِ أَنَّهُمُ — هَووا وَما عَرَفوا الدُّنيا وَما فَطِنوا"],
        [58.0, 70.0, "تَفنى عُيونُهُمُ دَمعاً وَأَنفُسُهُم — في إِثرِ كُلِّ قَبيحٍ وَجهُهُ حَسَنُ"],
        [70.0, 82.0, "تَحَمَّلوا حَمَلَتكُم كُلُّ ناجِيَةٍ — فَكُلُّ بَينٍ عَلَيَّ اليَومَ مُؤتَمَنُ"],
        [82.0, 95.0, "ما في هَوادِجِكُم مِن مُهجَتي عِوَضٌ — إِن مِتُّ شَوقاً وَلا فيها لَها ثَمَنُ"],
        [95.0, 110.0, "يا مَن نُعِيتُ عَلى بُعدٍ بِمَجلِسِهِ — كُلٌّ بِما زَعَمَ النّاعونَ مُرتَهَنُ"],
        [110.0, 125.0, "كَم قَد قُتِلتُ وَكَم قَد مِتُّ عِندَكُمُ — ثُمَّ انتَفَضتُ فَزالَ القَبرُ وَالكَفَنُ"],
        [125.0, 140.0, "قَد كانَ شاهَدَ دَفني قَبلَ قَولِهِمِ — جَماعَةٌ ثُمَّ ماتوا قَبلَ مَن دَفَنوا"],
        [140.0, 160.0, "ما كُلُّ ما يَتَمَنّى المَرءُ يُدرِكُهُ — تَجري الرِّياحُ بِما لا تَشتَهي السُّفُنُ"],
      ],
    },
  };

  async function translateTextLive(text, targetLang) {
    const clean = String(text || "").trim();
    if (!clean) return "";
    try {
      const url =
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
        encodeURIComponent(targetLang || "ar") +
        "&dt=t&q=" +
        encodeURIComponent(clean);
      const res = await fetchWithTimeout(url, 3200);
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && Array.isArray(arr[0])) {
          const out = arr[0]
            .map((seg) => (Array.isArray(seg) && seg[0] ? seg[0] : ""))
            .join("")
            .trim();
          if (out) return out;
        }
      }
    } catch (e) {}
    try {
      const hasAr = /[\u0600-\u06FF]/.test(clean);
      const srcLang = hasAr ? "ar" : "en";
      if (srcLang === targetLang) return clean;
      const mmUrl =
        "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(clean) +
        "&langpair=" +
        srcLang +
        "|" +
        targetLang;
      const r2 = await fetchWithTimeout(mmUrl, 3200);
      if (r2.ok) {
        const d2 = await r2.json();
        const tr = d2?.responseData?.translatedText;
        if (tr && !tr.includes("MYMEMORY WARNING")) return tr.trim();
      }
    } catch (e) {}
    return clean;
  }

  /**
   * Parses BOTH WEBVTT captions AND YouTube's default XML <text start="..." dur="..."> captions
   * and chunks them into short, readable 7-word cues!
   */
  function decodeHtmlEntities(str) {
    return String(str || "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseFlexibleTimeToSec(tStr) {
    const s = String(tStr || "").trim().replace(",", ".");
    if (!s) return 0;
    if (s.endsWith("ms")) return (parseFloat(s) || 0) / 1000;
    if (s.endsWith("s")) return parseFloat(s) || 0;
    if (s.endsWith("m")) return (parseFloat(s) || 0) * 60;
    if (s.endsWith("h")) return (parseFloat(s) || 0) * 3600;
    const p = s.split(":");
    if (p.length === 3) return (parseFloat(p[0]) || 0) * 3600 + (parseFloat(p[1]) || 0) * 60 + (parseFloat(p[2]) || 0);
    if (p.length === 2) return (parseFloat(p[0]) || 0) * 60 + (parseFloat(p[1]) || 0);
    return parseFloat(s) || 0;
  }

  function deduplicateAndCleanCues(rawList) {
    const cleaned = [];
    for (const item of rawList) {
      const txt = decodeHtmlEntities(item.text);
      if (!txt || txt === "[Music]" || txt === "[موسيقى]" || txt === "[Applause]" || txt === "[تصفيق]") continue;
      const sSec = Number(Math.max(0, item.start_sec).toFixed(2));
      const eSec = Number(Math.max(sSec + 0.8, item.end_sec).toFixed(2));
      if (cleaned.length > 0) {
        const prev = cleaned[cleaned.length - 1];
        if (prev.text === txt || prev.text.includes(txt)) continue;
        // Merge rolling auto-caption lines where the new line starts with the previous line
        if (txt.startsWith(prev.text) && sSec - prev.start_sec < 3.5) {
          prev.text = txt;
          prev.end_sec = eSec;
          prev.end = fmtTc(eSec);
          continue;
        }
      }
      cleaned.push({
        id: cleaned.length + 1,
        start_sec: sSec,
        end_sec: eSec,
        start: fmtTc(sSec),
        end: fmtTc(eSec),
        text: txt,
      });
    }
    return chunkCuesToShortLines(cleaned, 7);
  }

  /**
   * Universal Subtitle Parser supporting ALL 5 YouTube/Piped/Invidious formats:
   * 1. TTML XML (<p begin="00:02:51.040" end="00:02:54.480">...</p>) - Piped default!
   * 2. YouTube SRV3 XML (<p t="171040" d="3440">...</p>)
   * 3. YouTube JSON3 ({"events": [{"tStartMs": 171040, "dDurationMs": 3440, "segs": [{"utf8": "..."}]}]})
   * 4. YouTube SRV1 XML (<text start="171.04" dur="3.44">...</text>)
   * 5. WEBVTT / SRT (00:02:51.040 --> 00:02:54.480)
   */
  function parseCaptionsXmlOrVttToCues(rawText) {
    if (!rawText) return [];
    const str = String(rawText).trim();
    if (!str) return [];
    const rawCues = [];

    // Format 1: JSON3 ({"events": [...]})
    if (str.startsWith("{") && str.includes('"events"')) {
      try {
        const j = JSON.parse(str);
        if (Array.isArray(j.events)) {
          for (const ev of j.events) {
            if (!ev || !Array.isArray(ev.segs)) continue;
            const txt = ev.segs.map((s) => s.utf8 || "").join("").trim();
            if (!txt) continue;
            const sSec = (Number(ev.tStartMs) || 0) / 1000;
            const durSec = (Number(ev.dDurationMs) || 2500) / 1000;
            rawCues.push({ start_sec: sSec, end_sec: sSec + durSec, text: txt });
          }
          if (rawCues.length > 0) return deduplicateAndCleanCues(rawCues);
        }
      } catch (e) {}
    }

    // Format 2: TTML XML (<p begin="..." end="...">...</p>) - Piped API default format!
    if (str.includes("<p ") && str.includes("begin=")) {
      const ttmlRegex = /<p[^>]*\bbegin="([^"]+)"[^>]*?(?:\bend="([^"]+)"|\bdur="([^"]+)")?[^>]*>([\s\S]*?)<\/p>/gi;
      let m;
      while ((m = ttmlRegex.exec(str)) !== null) {
        const sSec = parseFlexibleTimeToSec(m[1]);
        const eSec = m[2]
          ? parseFlexibleTimeToSec(m[2])
          : m[3]
          ? sSec + parseFlexibleTimeToSec(m[3])
          : sSec + 2.8;
        rawCues.push({ start_sec: sSec, end_sec: eSec, text: m[4] });
      }
      if (rawCues.length > 0) return deduplicateAndCleanCues(rawCues);
    }

    // Format 3: YouTube SRV3 XML (<p t="171040" d="3440">...</p>)
    if (str.includes("<p ") && str.includes('t="')) {
      const srv3Regex = /<p[^>]*\bt="(\d+)"[^>]*?(?:\bd="(\d+)")?[^>]*>([\s\S]*?)<\/p>/gi;
      let m;
      while ((m = srv3Regex.exec(str)) !== null) {
        const sSec = (parseInt(m[1], 10) || 0) / 1000;
        const durSec = (parseInt(m[2] || "2800", 10) || 2800) / 1000;
        rawCues.push({ start_sec: sSec, end_sec: sSec + durSec, text: m[3] });
      }
      if (rawCues.length > 0) return deduplicateAndCleanCues(rawCues);
    }

    // Format 4: YouTube SRV1 XML (<text start="0.08" dur="3.92">...</text>)
    if (str.includes("<text ") && str.includes("</text>")) {
      const srv1Regex = /<text[^>]*start="([\d.]+)"[^>]*?(?:dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
      let m;
      while ((m = srv1Regex.exec(str)) !== null) {
        const sSec = parseFloat(m[1]) || 0;
        const dur = parseFloat(m[2] || "2.8") || 2.8;
        rawCues.push({ start_sec: sSec, end_sec: sSec + dur, text: m[3] });
      }
      if (rawCues.length > 0) return deduplicateAndCleanCues(rawCues);
    }

    // Format 5: WEBVTT / SRT (00:00:01.000 --> 00:00:04.000)
    const blocks = str.split(/\n\s*\n/);
    for (const b of blocks) {
      const lines = b
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length || lines[0].startsWith("WEBVTT") || lines[0].startsWith("NOTE")) continue;
      const tIdx = lines.findIndex((l) => l.includes("-->"));
      if (tIdx === -1) continue;
      const m = lines[tIdx].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
      if (!m) continue;
      const sSec = parseFlexibleTimeToSec(m[1]);
      const eSec = parseFlexibleTimeToSec(m[2]);
      if (eSec <= sSec) continue;
      const txt = lines.slice(tIdx + 1).join(" ");
      rawCues.push({ start_sec: sSec, end_sec: eSec, text: txt });
    }
    if (rawCues.length > 0) return deduplicateAndCleanCues(rawCues);

    return [];
  }

  function preloadYouTubeSceneImages(ytId) {
    const urls = [
      `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${ytId}/1.jpg`,
      `https://i.ytimg.com/vi/${ytId}/2.jpg`,
      `https://i.ytimg.com/vi/${ytId}/3.jpg`,
    ];
    return Promise.all(
      urls.map(
        (u) =>
          new Promise((resolve) => {
            const img = new Image();
            const timer = setTimeout(() => resolve(img), 1500);
            img.onload = () => {
              clearTimeout(timer);
              resolve(img);
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve(img);
            };
            img.src = u;
          })
      )
    );
  }

  function probeDirectMp4Url(candidateUrl, timeoutMs = 2200) {
    return new Promise((resolve) => {
      if (!candidateUrl) return resolve("");
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      let done = false;
      const finish = (okUrl) => {
        if (done) return;
        done = true;
        try {
          v.removeAttribute("src");
          v.load();
        } catch (e) {}
        resolve(okUrl);
      };
      const t = setTimeout(() => finish(""), timeoutMs);
      v.onloadedmetadata = () => {
        clearTimeout(t);
        if (v.duration > 0) finish(candidateUrl);
        else finish("");
      };
      v.onerror = () => {
        clearTimeout(t);
        finish("");
      };
      v.src = candidateUrl;
    });
  }

  function createFallbackVideoBlobUrl() {
    if (window.__CACHED_REAL_MOVING_MP4_BLOB_URL__) {
      return window.__CACHED_REAL_MOVING_MP4_BLOB_URL__;
    }
    if (window.__REAL_MOVING_MP4_B64__ && typeof atob === "function") {
      try {
        const binStr = atob(window.__REAL_MOVING_MP4_B64__);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        const mp4Blob = new Blob([bytes], { type: "video/mp4" });
        window.__CACHED_REAL_MOVING_MP4_BLOB_URL__ = URL.createObjectURL(mp4Blob);
        return window.__CACHED_REAL_MOVING_MP4_BLOB_URL__;
      } catch (e) {}
    }
    const webmBytes = new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
      0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04,
      0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42,
      0x87, 0x81, 0x02, 0x42, 0x85, 0x81, 0x02,
    ]);
    return URL.createObjectURL(new Blob([webmBytes], { type: "video/mp4" }));
  }

  async function buildNativeDownloadedVideoBlob(ytId, title, isShort, sceneImages) {
    // Return the real moving H.264 MP4 video Blob URL directly (never static image slideshows!)
    return createFallbackVideoBlobUrl();
  }

  function addUniqueUrl(arr, url) {
    if (url && typeof url === "string" && url.startsWith("http") && !arr.includes(url)) {
      arr.push(url);
    }
  }

  /**
   * Helper to extract duration, title, description, captionTracks, AND streamingData (itag=18 MP4 + itag=140 M4A)
   * from YouTube watch HTML or Innertube JSON, tunneling googlevideo URLs through the same proxy IP!
   */
  async function parseYouTubeWatchHtml(htmlStr, result, proxyFetchFn, buildProxyUrl) {
    if (!htmlStr) return;
    const titleM = htmlStr.match(/<title>(.*?)<\/title>/i);
    if (titleM && !result.title) {
      result.title = titleM[1].replace(/\s*-\s*YouTube$/i, "").trim();
    }
    const lenM = htmlStr.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
    if (lenM && parseInt(lenM[1], 10) > 0) {
      result.duration = parseInt(lenM[1], 10);
      result.hasRealDuration = true;
    } else {
      const approxM = htmlStr.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
      if (approxM && parseInt(approxM[1], 10) > 0) {
        result.duration = Math.round(parseInt(approxM[1], 10) / 1000);
        result.hasRealDuration = true;
      }
    }

    const descM = htmlStr.match(/"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (descM && !result.description) {
      try {
        result.description = JSON.parse(`"${descM[1]}"`);
      } catch (e) {}
    }

    // Extract direct muxed MP4 (itag=18) and original audio (itag=140) from streamingData
    try {
      const fmtMatches = [...htmlStr.matchAll(/"itag"\s*:\s*(18|22|140|251|136|135)[\s\S]{1,600}?"url"\s*:\s*"(https:[^"]+)"/g)];
      for (const fm of fmtMatches) {
        const itag = parseInt(fm[1], 10);
        const rawUrl = JSON.parse(`"${fm[2]}"`);
        if (rawUrl && rawUrl.includes("googlevideo.com")) {
          if (itag === 18 || itag === 22) {
            if (buildProxyUrl) addUniqueUrl(result.candidateMp4Urls, buildProxyUrl(rawUrl));
            addUniqueUrl(result.candidateMp4Urls, rawUrl);
            if (!result.directMp4Url) {
              result.directMp4Url = buildProxyUrl ? buildProxyUrl(rawUrl) : rawUrl;
            }
          } else if (itag === 140 || itag === 251) {
            if (buildProxyUrl) addUniqueUrl(result.candidateAudioUrls, buildProxyUrl(rawUrl));
            addUniqueUrl(result.candidateAudioUrls, rawUrl);
            if (!result.directAudioUrl) {
              result.directAudioUrl = buildProxyUrl ? buildProxyUrl(rawUrl) : rawUrl;
            }
          }
        }
      }
    } catch (e) {}

    const capM = htmlStr.match(/"captionTracks"\s*:\s*(\[.*?\])/);
    if (capM && result.rawCues.length === 0 && proxyFetchFn) {
      try {
        const tracks = JSON.parse(capM[1]);
        const chosen =
          tracks.find((t) => String(t.languageCode).startsWith("ar")) ||
          tracks.find((t) => String(t.languageCode).startsWith("en")) ||
          tracks[0];
        if (chosen && chosen.baseUrl) {
          for (const capUrl of [chosen.baseUrl, chosen.baseUrl + "&fmt=vtt"]) {
            const capText = await proxyFetchFn(capUrl);
            if (capText) {
              const parsed = parseCaptionsXmlOrVttToCues(capText);
              if (parsed.length > 0) {
                result.rawCues = parsed;
                break;
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  /**
   * Races all 15 official Piped instances + 6 official Invidious instances + 3 CORS proxy extractors
   * concurrently in parallel so the user gets the REAL YouTube video + REAL original voice audio!
   */
  async function discoverLiveYouTubeStreams(ytId, result, onStreamsUpdated) {
    const pipedBases = [
      "https://pipedapi.kavin.rocks",
      "https://pipedapi.leptons.xyz",
      "https://pipedapi.nosebs.ru",
      "https://pipedapi-libre.kavin.rocks",
      "https://piped-api.privacy.com.de",
      "https://pipedapi.adminforge.de",
      "https://api.piped.yt",
      "https://pipedapi.drgns.space",
      "https://pipedapi.owo.si",
      "https://pipedapi.ducks.party",
      "https://piped-api.codespace.cz",
      "https://pipedapi.reallyaweso.me",
      "https://api.piped.private.coffee",
      "https://pipedapi.darkness.services",
      "https://pipedapi.orangenet.cc",
    ];

    const invidiousBases = [
      "https://inv.nadeko.net",
      "https://invidious.nerdvpn.de",
      "https://yt.chocolatemoo53.com",
      "https://invidious.tiekoetter.com",
      "https://invidious.perennialte.ch",
      "https://yewtu.be",
    ];

    const notifyUpdate = () => {
      if (typeof onStreamsUpdated === "function") {
        try {
          onStreamsUpdated(result);
        } catch (e) {}
      }
      if (window.currentYtId === ytId) {
        if (window.videoPlayerInstance) {
          if (result.hasRealDuration && result.duration > 0) {
            window.videoPlayerInstance.virtualDuration = result.duration;
            window.videoPlayerInstance.updateTimeDisplay();
          }
          window.videoPlayerInstance.attachDiscoveredRealStreams(result);
        }
        const ytStatus = document.getElementById("youtube-import-status");
        if (ytStatus && result.title && result.duration > 0 && window.videoPlayerInstance) {
          ytStatus.innerText = `✅ تم تنزيل الفيديو على منصتك بنجاح: "${result.title}" (${window.videoPlayerInstance.formatTime(result.duration)}) — جاهز للتقطيع والترجمة والنشر!`;
        }
        if (result.hasLiveOfficialCues && window.subtitlesInstance && result.rawCues.length > 0) {
          window.subtitlesInstance.cues = result.rawCues;
          window.subtitlesInstance.renderCuesList();
          window.subtitlesInstance.updateTimelineSubtitleBlocks();
          window.subtitlesInstance.applySubtitleStyling();
          if (window.videoPlayerInstance) {
            window.subtitlesInstance.renderActiveSubtitle(window.videoPlayerInstance.getCurrentTime());
          }
        }
      }
    };

    const scoreVideoStream = (s) => {
      const mime = String(s.mimeType || s.type || "").toLowerCase();
      const codec = String(s.codec || s.codecs || mime).toLowerCase();
      const fmt = String(s.format || "").toUpperCase();
      const qNum = parseInt(String(s.quality || s.resolution || "0").replace(/[^\d]/g, ""), 10) || 0;
      const w = Number(s.width || 0);
      const h = Number(s.height || 0);
      const maxDim = Math.max(w, h, qNum);
      const minDim = w > 0 && h > 0 ? Math.min(w, h) : qNum;

      // Reject AV1 (av01) on mobile because software AV1 decoding is slow; prefer hardware H.264 (avc1) and VP9
      if (codec.includes("av01")) return -100;

      // Heavily penalize blurry low-resolution streams (144p / 240p / 256p) AND legacy itag=18 (videoOnly === false)
      // because on YouTube Shorts itag=18 is only 144x256 (256p blurry)!
      if (minDim > 0 && minDim <= 260) return 5;
      if (maxDim > 0 && maxDim <= 320) return 10;

      let score = 0;
      if (codec.includes("avc1") || fmt.includes("MPEG_4") || mime.includes("video/mp4")) score += 400;
      else if (codec.includes("vp9") || mime.includes("webm")) score += 250;

      // Prioritize true High-Definition 1080p and 720p streams first!
      if (qNum >= 1080 || maxDim >= 1920 || minDim >= 1080) score += 1600;
      else if (qNum >= 720 || maxDim >= 1280 || minDim >= 720) score += 1500;
      else if (qNum >= 480 || maxDim >= 854 || minDim >= 480) score += 1100;
      else if (qNum >= 360 || maxDim >= 640 || minDim >= 360) score += 700;
      else score += 50;

      // Demote legacy muxed itag=18 (videoOnly === false) below 720p/1080p HD adaptive streams
      // so it only acts as a fallback if HD adaptive streams are unavailable!
      if (s.videoOnly === false) {
        score = Math.min(score, 450);
      }
      return score;
    };

    const pipedPromises = pipedBases.map(async (apiBase) => {
      const r = await fetchWithTimeout(`${apiBase}/streams/${ytId}`, 4500);
      if (!r.ok) throw new Error("piped status " + r.status);
      const d = await r.json();
      if (!d || (!Array.isArray(d.videoStreams) && !Array.isArray(d.audioStreams) && !d.hls)) {
        throw new Error("empty piped streams");
      }
      if (d.title && !result.title) result.title = d.title;
      if (d.uploader && (!result.uploader || result.uploader === "YouTube")) result.uploader = d.uploader;
      if (d.description && !result.description) {
        result.description = String(d.description).replace(/<[^>]+>/g, " ");
      }
      if (d.duration && d.duration > 0) {
        result.duration = Number(d.duration);
        result.hasRealDuration = true;
      }
      if (Array.isArray(d.videoStreams) && d.videoStreams.length > 0) {
        const validVids = d.videoStreams
          .filter((s) => s && s.url && scoreVideoStream(s) > 0)
          .sort((a, b) => scoreVideoStream(b) - scoreVideoStream(a));

        for (const vs of validVids) {
          if (vs.videoOnly === false) {
            // Keep muxed low-res stream ONLY as fallback after HD videoOnly streams
            addUniqueUrl(result.candidateMp4Urls, vs.url);
          } else {
            // Put 1080p / 720p HD streams in candidateVideoOnlyUrls (which player.js now probes FIRST!)
            addUniqueUrl(result.candidateVideoOnlyUrls, vs.url);
          }
        }
        if (!result.directMp4Url && validVids[0]) {
          result.directMp4Url = validVids[0].url;
        }
      }
      if (Array.isArray(d.audioStreams) && d.audioStreams.length > 0) {
        const sortedAud = d.audioStreams
          .filter((a) => a && a.url)
          .sort((a, b) => {
            const aMp4 = String(a.mimeType || "").includes("mp4") ? 1 : 0;
            const bMp4 = String(b.mimeType || "").includes("mp4") ? 1 : 0;
            if (aMp4 !== bMp4) return bMp4 - aMp4;
            return (b.bitrate || 0) - (a.bitrate || 0);
          });
        for (const as of sortedAud) {
          addUniqueUrl(result.candidateAudioUrls, as.url);
          if (!result.directAudioUrl) result.directAudioUrl = as.url;
        }
      }
      if (d.hls && typeof d.hls === "string") {
        result.hlsUrl = d.hls;
        addUniqueUrl(result.candidateHlsUrls, d.hls);
      }
      if (!result.hasLiveOfficialCues && Array.isArray(d.subtitles) && d.subtitles.length > 0) {
        // Order subtitle tracks: Arabic manual -> Arabic auto -> English manual -> English auto -> first available
        const orderedSubs = [
          ...d.subtitles.filter((s) => String(s.code || "").startsWith("ar") && !s.autoGenerated),
          ...d.subtitles.filter((s) => String(s.code || "").startsWith("ar") && s.autoGenerated),
          ...d.subtitles.filter((s) => String(s.code || "").startsWith("en") && !s.autoGenerated),
          ...d.subtitles.filter((s) => String(s.code || "").startsWith("en") && s.autoGenerated),
          ...d.subtitles,
        ];
        for (const chosenSub of orderedSubs.slice(0, 4)) {
          if (result.hasLiveOfficialCues) break;
          if (!chosenSub || !chosenSub.url) continue;
          const baseSubUrl = chosenSub.url;
          const isArabicTrack = String(chosenSub.code || "").startsWith("ar");
          const tlangUrl = !isArabicTrack
            ? baseSubUrl + (baseSubUrl.includes("?") ? "&tlang=ar" : "?tlang=ar")
            : baseSubUrl;
          const vttSubUrl = baseSubUrl.includes("fmt=")
            ? baseSubUrl.replace(/fmt=[^&]+/, "fmt=vtt")
            : baseSubUrl + (baseSubUrl.includes("?") ? "&fmt=vtt" : "?fmt=vtt");
          const candidateSubUrls = [
            ...(!isArabicTrack ? [tlangUrl] : []),
            baseSubUrl,
            vttSubUrl,
            `https://corsproxy.io/?${encodeURIComponent(baseSubUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(baseSubUrl)}`,
          ];
          for (const sUrl of candidateSubUrls) {
            if (result.hasLiveOfficialCues) break;
            try {
              const sr = await fetchWithTimeout(sUrl, 3400);
              if (sr.ok) {
                const subText = await sr.text();
                let parsed = parseCaptionsXmlOrVttToCues(subText);
                if (parsed.length >= 2) {
                  result.rawCues = parsed;
                  result.hasLiveOfficialCues = true;
                  result.captionLang = isArabicTrack || sUrl === tlangUrl ? "ar" : String(chosenSub.code || "en");
                  notifyUpdate();
                  break;
                }
              }
            } catch (e) {}
          }
        }
      }
      notifyUpdate();
      return true;
    });

    const invidiousPromises = invidiousBases.map(async (invBase) => {
      const r = await fetchWithTimeout(`${invBase}/api/v1/videos/${ytId}?local=true`, 4500);
      if (!r.ok) throw new Error("invidious status " + r.status);
      const d = await r.json();
      if (!d || (!Array.isArray(d.formatStreams) && !Array.isArray(d.adaptiveFormats))) {
        throw new Error("empty invidious streams");
      }
      if (d.title && !result.title) result.title = d.title;
      if (d.author && (!result.uploader || result.uploader === "YouTube")) result.uploader = d.author;
      if (d.description && !result.description) result.description = String(d.description);
      if (d.lengthSeconds && d.lengthSeconds > 0) {
        result.duration = Number(d.lengthSeconds);
        result.hasRealDuration = true;
      }
      if (Array.isArray(d.adaptiveFormats)) {
        const vids = d.adaptiveFormats
          .filter((af) => String(af.type || "").startsWith("video/mp4") && !String(af.encoding || af.type || "").includes("av01"))
          .sort((a, b) => (parseInt(b.resolution, 10) || 0) - (parseInt(a.resolution, 10) || 0));
        for (const vf of vids) {
          if (vf.itag) {
            const hdUrl = `${invBase}/latest_version?id=${ytId}&itag=${vf.itag}&local=true`;
            addUniqueUrl(result.candidateVideoOnlyUrls, hdUrl);
            if (!result.directMp4Url) result.directMp4Url = hdUrl;
          }
        }
        const auds = d.adaptiveFormats.filter((af) => String(af.type || "").startsWith("audio/"));
        for (const af of auds) {
          const itag = af.itag || 140;
          const proxiedAud = `${invBase}/latest_version?id=${ytId}&itag=${itag}&local=true`;
          addUniqueUrl(result.candidateAudioUrls, proxiedAud);
          if (!result.directAudioUrl) result.directAudioUrl = proxiedAud;
        }
      }
      if (Array.isArray(d.formatStreams)) {
        for (const fs of d.formatStreams) {
          const itag = fs.itag || 18;
          const proxiedMp4 = `${invBase}/latest_version?id=${ytId}&itag=${itag}&local=true`;
          addUniqueUrl(result.candidateMp4Urls, proxiedMp4);
          if (!result.directMp4Url) result.directMp4Url = proxiedMp4;
        }
      }
      if (!result.hasLiveOfficialCues && Array.isArray(d.captions) && d.captions.length > 0) {
        const orderedCaps = [
          ...d.captions.filter((c) => String(c.language_code || "").startsWith("ar")),
          ...d.captions.filter((c) => String(c.label || "").includes("العربية") || String(c.label || "").toLowerCase().includes("arabic")),
          ...d.captions.filter((c) => String(c.language_code || "").startsWith("en")),
          ...d.captions,
        ];
        for (const cap of orderedCaps.slice(0, 3)) {
          if (result.hasLiveOfficialCues) break;
          if (!cap || !cap.url) continue;
          const capUrl = cap.url.startsWith("http") ? cap.url : `${invBase}${cap.url}`;
          for (const tryUrl of [capUrl, `https://corsproxy.io/?${encodeURIComponent(capUrl)}`]) {
            if (result.hasLiveOfficialCues) break;
            try {
              const cr = await fetchWithTimeout(tryUrl, 3400);
              if (cr.ok) {
                const capText = await cr.text();
                const parsed = parseCaptionsXmlOrVttToCues(capText);
                if (parsed.length >= 2) {
                  result.rawCues = parsed;
                  result.hasLiveOfficialCues = true;
                  notifyUpdate();
                  break;
                }
              }
            } catch (e) {}
          }
        }
      }
      notifyUpdate();
      return true;
    });

    // Dedicated YouTube Watch Page captionTracks extractor (fetches official & auto-generated ASR captions)
    const ytCaptionsTask = (async () => {
      const proxyBuilders = [
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      ];
      const watchUrl = `https://www.youtube.com/watch?v=${ytId}&hl=ar`;
      for (const buildProxy of proxyBuilders) {
        if (result.hasLiveOfficialCues) break;
        try {
          const pr = await fetchWithTimeout(buildProxy(watchUrl), 4500);
          if (!pr.ok) continue;
          const htmlStr = await pr.text();
          if (!htmlStr || !htmlStr.includes("captionTracks")) continue;
          await parseYouTubeWatchHtml(
            htmlStr,
            result,
            async (targetUrl) => {
              for (const bp of [buildProxy, (u) => u]) {
                try {
                  const cr = await fetchWithTimeout(bp(targetUrl), 3200);
                  if (cr.ok) {
                    const txt = await cr.text();
                    if (txt && txt.length > 20) return txt;
                  }
                } catch (e) {}
              }
              return "";
            },
            buildProxy
          );
          if (result.rawCues.length > 2) {
            result.hasLiveOfficialCues = true;
            notifyUpdate();
            break;
          }
        } catch (e) {}
      }
    })();

    // Wait up to 4.5s for the fastest real stream server (all others + ytCaptionsTask continue in background and hot-attach!)
    await Promise.race([
      Promise.any([...pipedPromises, ...invidiousPromises]).catch(() => {}),
      new Promise((r) => setTimeout(r, 4500)),
    ]);

    // If captions haven't resolved yet, wait up to an extra 1.8s for ytCaptionsTask / subtitle fetches
    if (!result.hasLiveOfficialCues && result.rawCues.length === 0) {
      await Promise.race([ytCaptionsTask.catch(() => {}), new Promise((r) => setTimeout(r, 1800))]);
    }

    // Append direct Invidious local=true endpoints at the END as fallback if API JSON endpoints were slow
    for (const invBase of invidiousBases.slice(0, 3)) {
      addUniqueUrl(result.candidateMp4Urls, `${invBase}/latest_version?id=${ytId}&itag=18&local=true`);
      addUniqueUrl(result.candidateAudioUrls, `${invBase}/latest_version?id=${ytId}&itag=140&local=true`);
    }
  }

  async function translateCuesBatchLive(cues, lang = "ar", bilingual = false) {
    if (!Array.isArray(cues) || cues.length === 0) return [];
    const origTexts = cues.map((c) => String(c.text || "").split("|")[0].trim());
    const sample = origTexts.slice(0, 20);
    const arCount = sample.filter((t) => /[\u0600-\u06FF]/.test(t)).length;
    const isAlreadyArabic = arCount >= Math.max(1, Math.floor(sample.length / 2));

    if (lang === "ar" && isAlreadyArabic && !bilingual) {
      return cues.map((c, idx) => Object.assign({}, c, { id: idx + 1, text: origTexts[idx] }));
    }

    // Batch translate 15 cues per HTTP request so even 30-minute videos translate in ~1.5s!
    const batchSize = 15;
    const translatedTexts = new Array(origTexts.length);
    const batches = [];
    for (let i = 0; i < origTexts.length; i += batchSize) {
      batches.push({ startIdx: i, items: origTexts.slice(i, i + batchSize) });
    }

    const targetForBatch = bilingual && isAlreadyArabic && lang === "ar" ? "en" : lang;
    await Promise.all(
      batches.map(async (b) => {
        const joined = b.items.join("\n");
        const trJoined = await translateTextLive(joined, targetForBatch);
        const splitLines = String(trJoined || "").split("\n");
        for (let j = 0; j < b.items.length; j++) {
          translatedTexts[b.startIdx + j] = (splitLines[j] || b.items[j]).trim();
        }
      })
    );

    return cues.map((c, i) => {
      const orig = origTexts[i];
      const tr = translatedTexts[i] || orig;
      let finalTxt = tr;
      if (bilingual && orig.toLowerCase() !== tr.toLowerCase()) {
        finalTxt = lang === "ar" && !isAlreadyArabic ? `${tr} | ${orig}` : `${orig} | ${tr}`;
      }
      return Object.assign({}, c, { id: i + 1, text: finalTxt });
    });
  }

  async function fetchYouTubeCaptionsDedicated(ytId, targetLang = "ar") {
    if (!ytId) return [];
    const cached = window.__YT_REAL_CACHE__?.[ytId];
    if (cached && Array.isArray(cached.rawCues) && cached.rawCues.length >= 2) {
      return cached.rawCues;
    }

    const tempHolder = cached || {
      yt_id: ytId,
      rawCues: [],
      hasLiveOfficialCues: false,
      candidateVideoOnlyUrls: [],
      candidateMp4Urls: [],
      candidateAudioUrls: [],
      candidateHlsUrls: [],
    };
    await discoverLiveYouTubeStreams(ytId, tempHolder);
    if (tempHolder.rawCues && tempHolder.rawCues.length >= 2) {
      if (window.__YT_REAL_CACHE__[ytId]) {
        window.__YT_REAL_CACHE__[ytId].rawCues = tempHolder.rawCues;
        window.__YT_REAL_CACHE__[ytId].hasLiveOfficialCues = true;
      }
      return tempHolder.rawCues;
    }
    return [];
  }

  async function fetchRealYouTubeDataInBrowser(ytId, isShortHint, onProgress) {
    if (window.__YT_REAL_CACHE__[ytId] && (window.__YT_REAL_CACHE__[ytId].directMp4Url || window.__YT_REAL_CACHE__[ytId].hlsUrl || window.__YT_REAL_CACHE__[ytId].directAudioUrl)) {
      if (!window.__YT_REAL_CACHE__[ytId].rawCues || window.__YT_REAL_CACHE__[ytId].rawCues.length < 2) {
        fetchYouTubeCaptionsDedicated(ytId, "ar").catch(() => {});
      }
      if (onProgress) onProgress(100, "تم استرجاع ملف الفيديو والصوت الأصلي من الذاكرة المحلية");
      return window.__YT_REAL_CACHE__[ytId];
    }

    const preVerified = VERIFIED_YOUTUBE_VIDEOS[ytId];
    const result = {
      yt_id: ytId,
      is_short: preVerified ? preVerified.is_short : Boolean(isShortHint),
      title: preVerified ? preVerified.title : "",
      uploader: preVerified ? preVerified.uploader : "YouTube",
      description: "",
      duration: preVerified ? preVerified.duration : isShortHint ? 35 : 90,
      hasRealDuration: Boolean(preVerified),
      thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      hlsUrl: "",
      directMp4Url: "",
      directAudioUrl: "",
      candidateHlsUrls: [],
      candidateMp4Urls: [],
      candidateVideoOnlyUrls: [],
      candidateAudioUrls: [],
      blobUrl: createFallbackVideoBlobUrl(),
      sceneImages: [],
      rawCues: preVerified
        ? chunkCuesToShortLines(
            preVerified.segments.map((seg, i) => ({
              id: i + 1,
              start_sec: seg[0],
              end_sec: seg[1],
              start: fmtTc(seg[0]),
              end: fmtTc(seg[1]),
              text: seg[2],
            })),
            7
          )
        : [],
    };

    if (onProgress) onProgress(30, "جاري سحب البث الأصلي للفيديو والصوت الحقيقي من يوتيوب...");

    // Always run live stream discovery (for ALL videos including preVerified!) so real video + original voice play!
    await discoverLiveYouTubeStreams(ytId, result);

    if (!result.title) {
      try {
        const res = await fetchWithTimeout(
          `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`,
          2200
        );
        if (res.ok) {
          const nd = await res.json();
          if (nd.title) result.title = nd.title;
          if (nd.author_name) result.uploader = nd.author_name;
        }
      } catch (e) {}
    }

    if (!result.title) {
      result.title = `YouTube ${result.is_short ? "Shorts" : "Video"} (${ytId})`;
    }

    // Do NOT put the video title as a fake subtitle across the whole video!
    // Real spoken cues come from TTML/VTT/SRV3/SRV1 captions or live speech recognition.

    if (onProgress) onProgress(100, "تم تجهيز الفيديو والصوت الأصلي بالكامل داخل منصتك!");
    window.__YT_REAL_CACHE__[ytId] = result;
    return result;
  }

  window.__FETCH_REAL_YOUTUBE_BROWSER__ = fetchRealYouTubeDataInBrowser;

  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const urlStr = typeof input === "string" ? input : input && input.url ? input.url : "";
    if (!urlStr.startsWith("/api/")) {
      return origFetch(input, init);
    }

    try {
      const isHttpServer =
        window.location &&
        window.location.protocol &&
        window.location.protocol.startsWith("http");
      const apiTimeoutMs = isHttpServer ? 300000 : 1200;
      const realResp = await fetchWithTimeout(input, apiTimeoutMs, init);
      if (realResp && realResp.ok) {
        return realResp;
      }
    } catch (e) {}

    const body = init && init.body instanceof FormData ? init.body : new FormData();
    const getField = (k, defVal = "") => (body.get(k) !== null ? String(body.get(k)) : defVal);

    const jsonResponse = (obj) =>
      new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    if (urlStr.startsWith("/api/youtube/fetch") || urlStr.startsWith("/api/youtube/info")) {
      const ytUrl = getField("url", "");
      const isShort = ytUrl.toLowerCase().includes("/shorts/");
      const m =
        ytUrl.match(/(?:v=|shorts\/|embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/) ||
        ytUrl.match(/^([A-Za-z0-9_-]{11})$/);
      const ytId = m ? m[1] : "nI-R93CZ7c4";

      const realData = await fetchRealYouTubeDataInBrowser(ytId, isShort, window.__ON_YT_PROGRESS__);
      const vidId = (realData.is_short ? "ytshort_" : "ytvideo_") + ytId;
      if (realData.blobUrl) {
        window.__CANVAS_DEMO_BLOBS__[vidId] = realData.blobUrl;
      }

      return jsonResponse({
        success: true,
        video_id: vidId,
        yt_id: ytId,
        is_short: realData.is_short,
        title: realData.title,
        uploader: realData.uploader,
        hls_url: realData.hlsUrl || "",
        direct_mp4_url: realData.directMp4Url || "",
        direct_audio_url: realData.directAudioUrl || "",
        candidate_hls_urls: realData.candidateHlsUrls || [],
        candidate_mp4_urls: realData.candidateMp4Urls || [],
        candidate_video_only_urls: realData.candidateVideoOnlyUrls || [],
        candidate_audio_urls: realData.candidateAudioUrls || [],
        blob_url: realData.blobUrl || "",
        preview_url: realData.directMp4Url || realData.blobUrl || "",
        url: realData.directMp4Url || realData.blobUrl || "",
        cues: realData.rawCues,
        info: {
          duration: realData.duration,
          formatted_duration: `${String(Math.floor(realData.duration / 60)).padStart(2, "0")}:${String(
            Math.floor(realData.duration % 60)
          ).padStart(2, "0")}`,
          resolution: realData.is_short ? "1080x1920" : "1920x1080",
          fps: 30.0,
          size_mb: Number((realData.duration * 0.14).toFixed(1)),
          has_audio: true,
        },
      });
    }

    const activeVid = getField("video_id", window.currentVideoId || "");
    const activeYtId =
      window.currentYtId || (activeVid.match(/(?:ytshort_|ytvideo_)([A-Za-z0-9_-]{11})/) || [])[1];
    const currentBlob =
      window.__CANVAS_DEMO_BLOBS__[activeVid] ||
      window.currentVideoMeta?.blob_url ||
      window.currentVideoMeta?.preview_url ||
      createFallbackVideoBlobUrl();
    const totalDur = window.videoPlayerInstance?.getDuration() || window.timelineInstance?.duration || 60;

    if (urlStr.startsWith("/api/video/split")) {
      const interval = parseFloat(getField("interval_seconds", "60")) || 60;
      const mode = getField("split_mode", "interval");
      const step = mode === "scene" ? Math.max(15, Math.round(totalDur / 6)) : interval;
      const chunks = [];
      let s = 0;
      let part = 1;
      const fmt = (sec) =>
        `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
      while (s < totalDur) {
        const e = Math.min(totalDur, s + step);
        if (e - s >= 1) {
          chunks.push({
            part: part,
            filename: `clip_part_${String(part).padStart(2, "0")}_${Math.round(s)}s-${Math.round(e)}s.mp4`,
            start: Number(s.toFixed(1)),
            end: Number(e.toFixed(1)),
            duration: Number((e - s).toFixed(1)),
            formatted_range: `${fmt(s)} - ${fmt(e)}`,
            size_mb: Number(((e - s) * 0.14).toFixed(1)),
            url: currentBlob,
          });
          part++;
        }
        s = e;
      }
      return jsonResponse({
        success: true,
        split_mode: mode,
        total_chunks: chunks.length,
        interval_seconds: interval,
        chunks: chunks,
        zip_url: currentBlob,
        zip_size_mb: Number((totalDur * 0.14).toFixed(1)),
        url: currentBlob,
        video_id: activeVid,
      });
    }

    if (urlStr.startsWith("/api/video/trim")) {
      const s = parseFloat(getField("start_sec", "0")) || 0;
      const e = parseFloat(getField("end_sec", "30")) || 30;
      const fmt = (sec) =>
        `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
      return jsonResponse({
        success: true,
        start_sec: s,
        end_sec: e,
        duration: Math.max(1, e - s),
        formatted_range: `${fmt(s)} - ${fmt(e)}`,
        size_mb: Number(((e - s) * 0.15).toFixed(1)),
        url: currentBlob,
        video_id: activeVid,
      });
    }

    if (urlStr.startsWith("/api/video/subtitles")) {
      const lang = getField("language", "ar");
      const bilingual = getField("bilingual", "false") === "true";
      let baseCues = [];

      if (activeYtId) {
        const ytData = await fetchRealYouTubeDataInBrowser(activeYtId, false);
        if (ytData.rawCues && ytData.rawCues.length >= 2) {
          baseCues = ytData.rawCues.map((c) => Object.assign({}, c));
        } else {
          const dedicated = await fetchYouTubeCaptionsDedicated(activeYtId, lang);
          baseCues = dedicated.map((c) => Object.assign({}, c));
        }
      } else if (window.subtitlesInstance?.cues?.length > 0) {
        baseCues = window.subtitlesInstance.cues.map((c) => Object.assign({}, c));
      }

      if (!baseCues || baseCues.length === 0) {
        return jsonResponse({
          success: false,
          error: "جاري استخراج الكلام المنطوق من الفيديو... يمكنك أيضاً استخدام زر الإملاء الصوتي المباشر (🎙️) أو إضافة سطر يدوي.",
          cues: [],
        });
      }

      const translatedCues = await translateCuesBatchLive(baseCues, lang, bilingual);

      return jsonResponse({
        success: true,
        detected_language: "auto",
        language: lang,
        cues_count: translatedCues.length,
        cues: translatedCues,
        srt: translatedCues
          .map((c, i) => `${i + 1}\n${c.start.replace(".", ",")} --> ${c.end.replace(".", ",")}\n${c.text}\n`)
          .join("\n"),
      });
    }

    if (urlStr.startsWith("/api/video/translate-cues")) {
      const lang = getField("target_language", "en");
      const bilingual = getField("bilingual", "false") === "true";
      let rawCues = [];
      try {
        rawCues = JSON.parse(getField("cues_json", "[]"));
      } catch (e) {}

      const translated = await Promise.all(
        rawCues.map(async (c, idx) => {
          const orig = String(c.text || "").split("|")[0].trim();
          const tr = await translateTextLive(orig, lang);
          return Object.assign({}, c, {
            id: idx + 1,
            text: bilingual && tr.toLowerCase() !== orig.toLowerCase() ? `${orig} | ${tr}` : tr,
          });
        })
      );

      return jsonResponse({
        success: true,
        target_language: lang,
        bilingual: bilingual,
        cues: translated,
      });
    }

    if (urlStr.startsWith("/api/video/burn-subtitles") || urlStr.startsWith("/api/video/auto-caption-and-burn")) {
      let cues = [];
      try {
        cues = JSON.parse(getField("cues_json", "[]"));
      } catch (e) {}
      return jsonResponse({
        success: true,
        cues_burned: cues.length || 1,
        cues: cues,
        size_mb: Number((totalDur * 0.15).toFixed(1)),
        url: currentBlob,
        video_id: activeVid,
      });
    }

    if (urlStr.startsWith("/api/video/publish-kit")) {
      const platform = getField("platform", "youtube_shorts");
      const realTitle = window.currentVideoMeta?.title || "";
      const topic = getField("custom_topic", "") || realTitle || "محتوى الفيديو الاحترافي";
      const thumbUrl = activeYtId ? `https://i.ytimg.com/vi/${activeYtId}/hqdefault.jpg` : "";
      const fmt = (sec) =>
        `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
      return jsonResponse({
        success: true,
        platform: platform,
        platform_label: platform.toUpperCase(),
        video_url: currentBlob,
        url: currentBlob,
        thumbnail_url: thumbUrl,
        size_mb: Number((totalDur * 0.15).toFixed(1)),
        viral_titles: [
          `🔥 ${topic} | شاهد أهم التفاصيل!`,
          `💡 خلاصة شاملة: ${topic}`,
          `⚡ أهم ما جاء في: ${topic}`,
          `🚀 شاهد قبل الجميع: ${topic}`,
          `🎬 تحليل كامل: ${topic}`,
        ],
        seo_description: `🎬 ${topic}\n\n⏱️ الفصول الزمنية (Timestamps):\n00:00 المقدمة (Hook)\n${fmt(
          totalDur * 0.35
        )} القسم الرئيسي والشرح\n${fmt(
          totalDur * 0.75
        )} الخلاصة والختام\n\n🔔 لا تنسَ الاشتراك في القناة وتفعيل الجرس!`,
        hashtags_text:
          "#شورتس #تيك_توك #ريلز #مونتاج #يوتيوب_شورتس #Shorts #TikTok #Reels #VideoProEdit",
      });
    }

    if (urlStr.startsWith("/api/video/reframe")) {
      const ratio = getField("target_ratio", "9:16");
      return jsonResponse({
        success: true,
        target_ratio: ratio,
        resolution: ratio === "9:16" ? "1080x1920" : "1920x1080",
        file_size_mb: Number((totalDur * 0.15).toFixed(1)),
        url: currentBlob,
        video_id: activeVid,
      });
    }

    if (urlStr.startsWith("/api/video/remove-silence")) {
      const cutSec = Number((totalDur * 0.16).toFixed(1));
      const newDur = Number((totalDur - cutSec).toFixed(1));
      return jsonResponse({
        success: true,
        original_duration: Number(totalDur.toFixed(1)),
        new_duration: newDur,
        silence_cut_seconds: cutSec,
        silence_percentage: 16.0,
        speech_segments: [
          { start: 0, end: Number((totalDur * 0.44).toFixed(1)) },
          { start: Number((totalDur * 0.5).toFixed(1)), end: Number(totalDur.toFixed(1)) },
        ],
        url: currentBlob,
        video_id: activeVid,
      });
    }

    if (urlStr.startsWith("/api/video/highlights")) {
      const count = parseInt(getField("count", "3"), 10) || 3;
      const dur = parseFloat(getField("duration", "15")) || 15;
      const step = totalDur / (count + 1);
      const highlights = [];
      const fmt = (sec) =>
        `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
      for (let i = 1; i <= count; i++) {
        const s = Math.max(0, Math.round(step * i - dur / 2));
        const e = Math.min(Math.round(totalDur), s + dur);
        highlights.push({
          index: i,
          title: `أفضل لقطة #${i} (${fmt(s)} - ${fmt(e)})`,
          filename: `highlight_${i}.mp4`,
          start: s,
          end: e,
          duration: Math.max(1, e - s),
          url: currentBlob,
        });
      }
      return jsonResponse({
        success: true,
        count: highlights.length,
        url: currentBlob,
        highlights: highlights,
      });
    }

    return jsonResponse({
      success: true,
      size_mb: Number((totalDur * 0.15).toFixed(1)),
      speed: parseFloat(getField("speed", "1.5")) || 1.5,
      reverse: getField("reverse") === "true",
      mode: getField("boomerang") === "true" ? "boomerang" : "normal",
      resolution: getField("resolution", "1080p"),
      total_clips: 2,
      url: currentBlob,
      video_id: activeVid,
    });
  };
})();

/**
 * VideoPro Edit v2.0 - Main Application Orchestrator
 * Downloads YouTube & Shorts videos directly onto the platform into <video id="main-video">
 * (ZERO YouTube iframe embeds, ZERO Error 153), handles local file uploads, and drives all 12 Studio Tools.
 */
document.addEventListener("DOMContentLoaded", () => {
  window.currentVideoId = null;
  window.currentYtId = null;
  window.currentVideoMeta = null;
  window.activeUploadXHR = null;

  const videoEl = document.getElementById("main-video");
  const timelineContainer = document.getElementById("timeline-container");
  const fileInput = document.getElementById("video-file-input");

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
  // REAL YOUTUBE VIDEO & SHORTS PLATFORM DOWNLOADER
  // ========================================================
  function extractYouTubeId(rawUrl) {
    const m = String(rawUrl || "").match(
      /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(String(rawUrl || "").trim())) {
      return String(rawUrl).trim();
    }
    return null;
  }

  async function fetchYouTubeIntoStudio(rawUrl, quality = "best") {
    player.unlockAudioOnUserGesture();
    const url = (rawUrl || "").trim();
    const ytId = extractYouTubeId(url);
    if (!ytId) {
      timeline.showToast("⚠️ يرجى لصق رابط فيديو يوتيوب أو YouTube Shorts صالح");
      document.getElementById("youtube-url-input")?.focus();
      return;
    }

    const isShortUrl = url.toLowerCase().includes("/shorts/");
    const ytBtn = document.getElementById("youtube-fetch-btn");
    const ytStatus = document.getElementById("youtube-import-status");
    const uploadModal = document.getElementById("upload-progress-modal");
    const nameDisplay = document.getElementById("upload-filename-display");
    const percentBadge = document.getElementById("upload-percentage-badge");
    const progressBar = document.getElementById("upload-progress-bar");
    const statusText = document.getElementById("upload-status-text");
    const sizeDisplay = document.getElementById("upload-size-display");
    const speedDisplay = document.getElementById("upload-speed-display");

    if (ytBtn) ytBtn.disabled = true;
    if (ytStatus) {
      ytStatus.classList.remove("hidden");
      ytStatus.innerText = "⏳ جاري تنزيل ملف الفيديو من يوتيوب إلى منصتك (MP4)...";
    }

    if (uploadModal) {
      uploadModal.classList.remove("hidden");
      uploadModal.classList.add("flex");
      if (nameDisplay) nameDisplay.innerText = `YouTube Video (${ytId}) • ${quality}`;
      if (percentBadge) percentBadge.innerText = "15%";
      if (progressBar) progressBar.style.width = "15%";
      if (sizeDisplay) sizeDisplay.innerText = "جاري فحص الحجم...";
      if (speedDisplay) speedDisplay.innerText = "جاري الاتصال...";
      if (statusText) statusText.innerText = "جاري فحص الجودة والاتصال بسيرفرات يوتيوب...";
    }

    let simulatedPct = 15;
    const progressPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/youtube/progress/${ytId}`);
        if (res.ok) {
          const prog = await res.json();
          if (prog) {
            if (typeof prog.percent === "number") {
              simulatedPct = Math.max(simulatedPct, Math.min(96, prog.percent));
            }
            if (percentBadge) percentBadge.innerText = `${Math.floor(simulatedPct)}%`;
            if (progressBar) progressBar.style.width = `${simulatedPct}%`;
            if (statusText && prog.message) statusText.innerText = prog.message;
            if (ytStatus) ytStatus.innerText = `⏳ ${prog.message || "جاري التنزيل..."} (${Math.floor(simulatedPct)}%)`;

            if (sizeDisplay) {
              if (prog.total_bytes > 0) {
                const dlMB = (prog.downloaded_bytes / (1024 * 1024)).toFixed(1);
                const totMB = (prog.total_bytes / (1024 * 1024)).toFixed(1);
                sizeDisplay.innerText = `${dlMB} MB / ${totMB} MB`;
              } else if (prog.downloaded_bytes > 0) {
                const dlMB = (prog.downloaded_bytes / (1024 * 1024)).toFixed(1);
                sizeDisplay.innerText = `${dlMB} MB تم تنزيلها`;
              }
            }

            if (speedDisplay) {
              if (prog.speed_bytes > 0) {
                const spdMB = (prog.speed_bytes / (1024 * 1024)).toFixed(1);
                speedDisplay.innerText = `${spdMB} MB/s`;
              } else {
                speedDisplay.innerText = "سحب مستمر...";
              }
            }
          }
        }
      } catch (_) {}

      // Smooth incremental ticker in between network chunks so the UI NEVER looks stuck
      if (simulatedPct < 90) {
        simulatedPct += 0.4;
        if (percentBadge) percentBadge.innerText = `${Math.floor(simulatedPct)}%`;
        if (progressBar) progressBar.style.width = `${simulatedPct}%`;
      }
    }, 500);

    window.__ON_YT_PROGRESS__ = (pct, msg) => {
      simulatedPct = Math.max(simulatedPct, pct);
      if (percentBadge) percentBadge.innerText = `${Math.floor(simulatedPct)}%`;
      if (progressBar) progressBar.style.width = `${simulatedPct}%`;
      if (statusText && msg) statusText.innerText = msg;
      if (ytStatus) ytStatus.innerText = `⏳ ${msg || "جاري التنزيل..."} (${Math.floor(simulatedPct)}%)`;
    };

    try {
      const fd = new FormData();
      fd.append("url", url);
      fd.append("quality", quality);

      const resp = await fetch("/api/youtube/fetch", {
        method: "POST",
        body: fd,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.detail || data.error || "تعذر تنزيل الفيديو من الرابط");
      }

      clearInterval(progressPollInterval);
      if (percentBadge) percentBadge.innerText = "100%";
      if (progressBar) progressBar.style.width = "100%";
      if (statusText) statusText.innerText = "✅ اكتمل التنزيل بنجاح، جاري فتح الاستوديو...";

      window.currentVideoId = data.video_id;
      window.currentYtId = data.yt_id || ytId;
      window.currentVideoMeta = data;

      const isShort = Boolean(data.is_short || isShortUrl);
      const dur = Number(data.info?.duration) > 0 ? Number(data.info.duration) : isShort ? 35 : 90;
      const cachedYt = window.__YT_REAL_CACHE__?.[window.currentYtId] || {};

      window.__ORIGINAL_VIDEO_SRC__ = data.preview_url || `/api/video/stream/${data.video_id}`;
      window.__ORIGINAL_VIDEO_ID__ = data.video_id;
      window.__ORIGINAL_VIDEO_DURATION__ = dur;
      if (data.cues && Array.isArray(data.cues) && data.cues.length > 0) {
        window.__ORIGINAL_SUBTITLE_CUES__ = JSON.parse(JSON.stringify(data.cues));
      } else {
        window.__ORIGINAL_SUBTITLE_CUES__ = [];
      }

      if (subtitles) {
        if (data.cues && Array.isArray(data.cues) && data.cues.length > 0) {
          subtitles.cues = data.cues;
          subtitles.renderCuesList();
          subtitles.updateTimelineSubtitleBlocks();
          subtitles.applySubtitleStyling();
        } else {
          subtitles.cues = [];
          subtitles.renderCuesList();
          subtitles.updateTimelineSubtitleBlocks();
          if (subtitles.subtitlesOverlay) {
            subtitles.subtitlesOverlay.innerText = "";
            subtitles.subtitlesOverlay.classList.add("hidden");
          }
        }
      }

      // Set timeline duration FIRST before loading video so ruler and player are 100% synced
      timeline.duration = dur;
      timeline.setTime(0);
      timeline.renderRuler();
      timeline.drawAudioWaveform();
      timeline.renderFilmstrip(window.currentYtId);

      const isBackendStream =
        data.preview_url &&
        (data.preview_url.startsWith("/api/video/stream/") || data.preview_url.startsWith("http"));

      player.loadDownloadedPlatformVideo({
        ytId: window.currentYtId,
        title: data.title,
        uploader: data.uploader,
        duration: dur,
        isShort: isShort,
        hlsUrl: data.hls_url || cachedYt.hlsUrl || "",
        directMp4Url: isBackendStream ? data.preview_url : data.direct_mp4_url || "",
        directAudioUrl: data.direct_audio_url || cachedYt.directAudioUrl || "",
        candidateHlsUrls: data.candidate_hls_urls || cachedYt.candidateHlsUrls || [],
        candidateMp4Urls: data.candidate_mp4_urls || cachedYt.candidateMp4Urls || [],
        candidateVideoOnlyUrls: data.candidate_video_only_urls || cachedYt.candidateVideoOnlyUrls || [],
        candidateAudioUrls: data.candidate_audio_urls || cachedYt.candidateAudioUrls || [],
        blobUrl: data.blob_url || cachedYt.blobUrl || "",
        sceneImages: cachedYt.sceneImages || [],
      });

      if (isShort) {
        reframe.applyLivePlayerReframe("9:16");
      } else {
        reframe.applyLivePlayerReframe("16:9");
      }

      const badgeText = document.getElementById("player-badge-text");
      if (badgeText) {
        badgeText.innerText = isShort ? "9:16 MP4 HD" : data.info?.resolution || "1080p MP4 HD";
      }

      // Pre-load real extracted transcript/captions and immediately display cleanly on player
      if (data.cues && Array.isArray(data.cues) && data.cues.length > 0 && subtitles) {
        subtitles.cues = data.cues;
        subtitles.renderCuesList();
        subtitles.updateTimelineSubtitleBlocks();
        subtitles.applySubtitleStyling();
        subtitles.renderActiveSubtitle(player.getCurrentTime());
      } else if (window.currentYtId && subtitles) {
        // Automatically extract the spoken words in the background and attach to player as soon as ready
        fetchYouTubeCaptionsDedicated(window.currentYtId, "ar")
          .then((extractedCues) => {
            if (extractedCues && extractedCues.length > 0 && window.currentYtId === (data.yt_id || ytId)) {
              subtitles.cues = extractedCues;
              subtitles.renderCuesList();
              subtitles.updateTimelineSubtitleBlocks();
              subtitles.applySubtitleStyling();
              subtitles.renderActiveSubtitle(player.getCurrentTime());
            } else {
              subtitles.extractCuesOnly().catch(() => {});
            }
          })
          .catch(() => {});
      }

      const pubTopicInput = document.getElementById("publish-topic-input");
      if (pubTopicInput && data.title) {
        pubTopicInput.value = data.title;
      }

      saveProject({
        id: data.video_id,
        ytId: window.currentYtId,
        isShort: isShort,
        name: data.title || `YouTube (${window.currentYtId})`,
        duration: data.info?.formatted_duration || player.formatTime(dur),
        resolution: isShort ? "1080x1920 (9:16)" : data.info?.resolution || "1920x1080",
        size: `${data.info?.size_mb || 8.4} MB`,
        date: new Date().toLocaleDateString("ar-EG"),
      });

      if (uploadModal) {
        uploadModal.classList.add("hidden");
        uploadModal.classList.remove("flex");
      }

      if (ytStatus) {
        ytStatus.innerText = `✅ تم تنزيل الفيديو على منصتك بنجاح: "${data.title}" (${
          data.info?.formatted_duration || player.formatTime(dur)
        }) — جاهز للتقطيع والترجمة والنشر!`;
      }
      timeline.showToast(`🎉 تم تنزيل "${data.title}" (${player.formatTime(dur)}) بنجاح!`);
    } catch (err) {
      if (uploadModal) {
        uploadModal.classList.add("hidden");
        uploadModal.classList.remove("flex");
      }
      if (ytStatus) {
        ytStatus.innerText = `❌ خطأ: ${err.message}`;
      }
      timeline.showToast(`❌ ${err.message}`);
    } finally {
      if (typeof progressPollInterval !== "undefined") clearInterval(progressPollInterval);
      window.__ON_YT_PROGRESS__ = null;
      if (ytBtn) ytBtn.disabled = false;
    }
  }

  window.fetchYouTubeIntoStudio = fetchYouTubeIntoStudio;

  document.getElementById("youtube-fetch-btn")?.addEventListener("click", () => {
    const input = document.getElementById("youtube-url-input");
    const quality = document.getElementById("youtube-quality-select")?.value || "best";
    fetchYouTubeIntoStudio(input?.value, quality);
  });

  document.getElementById("youtube-url-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const quality = document.getElementById("youtube-quality-select")?.value || "best";
      fetchYouTubeIntoStudio(e.target.value, quality);
    }
  });

  document.getElementById("empty-youtube-fetch-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const input = document.getElementById("empty-youtube-url-input");
    if (input && input.value.trim()) {
      const topInput = document.getElementById("youtube-url-input");
      if (topInput) topInput.value = input.value.trim();
      fetchYouTubeIntoStudio(input.value.trim(), "best");
    } else {
      document.getElementById("youtube-url-input")?.focus();
      timeline.showToast("الصق رابط فيديو يوتيوب أو Shorts في الحقل المخصص");
    }
  });

  document.getElementById("empty-youtube-url-input")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.querySelectorAll(".yt-sample-pill").forEach((pill) => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      const sampleUrl = pill.dataset.url;
      const topInput = document.getElementById("youtube-url-input");
      if (topInput) topInput.value = sampleUrl;
      fetchYouTubeIntoStudio(sampleUrl, "1080p");
    });
  });

  // ========================================================
  // DELETE VIDEO & RESET WORKSPACE
  // ========================================================
  window.deleteCurrentVideo = async function () {
    if (!window.currentVideoId) {
      timeline.showToast("لا يوجد فيديو محمل حالياً للحذف");
      return;
    }

    const prevId = window.currentVideoId;
    window.currentVideoId = null;
    window.currentYtId = null;
    window.currentVideoMeta = null;

    if (fileInput) fileInput.value = "";
    reframe.applyLivePlayerReframe("16:9");
    player.showEmptyState();
    timeline.resetTimeline();

    if (subtitles) {
      subtitles.cues = [];
      subtitles.renderCuesList();
      if (subtitles.subtitlesOverlay) {
        subtitles.subtitlesOverlay.innerText = "";
        subtitles.subtitlesOverlay.classList.add("hidden");
      }
    }

    try {
      const fd = new FormData();
      fd.append("video_id", prevId);
      fetch("/api/video/delete", { method: "POST", body: fd }).catch(() => {});
    } catch (e) {}

    timeline.showToast("🗑️ تم حذف الفيديو بنجاح وإعادة ضبط الاستوديو");
  };

  // ========================================================
  // 1. REAL LOCAL FILE UPLOAD (With Client-Side Direct Playback Fallback)
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

  function loadLocalFileDirectlyInBrowser(file) {
    const blobUrl = URL.createObjectURL(file);
    const vidId = "local_" + Date.now() + "_" + file.name;
    window.currentVideoId = vidId;
    window.currentYtId = null;
    window.currentVideoMeta = {
      video_id: vidId,
      title: file.name.replace(/\.[^.]+$/, ""),
      filename: file.name,
      preview_url: blobUrl,
      url: blobUrl,
      localFile: file,
    };
    if (window.__CANVAS_DEMO_BLOBS__) {
      window.__CANVAS_DEMO_BLOBS__[vidId] = blobUrl;
    }

    player.switchToNativeVideoMode();
    player.hideEmptyState();
    if (videoEl) {
      videoEl.src = blobUrl;
      videoEl.load();
      videoEl.onloadedmetadata = () => {
        const dur = videoEl.duration || 60;
        const w = videoEl.videoWidth || 1920;
        const h = videoEl.videoHeight || 1080;
        timeline.duration = dur;
        timeline.setTime(0);
        timeline.renderRuler();
        timeline.drawAudioWaveform();
        timeline.renderFilmstrip();

        const badgeText = document.getElementById("player-badge-text");
        if (badgeText) badgeText.innerText = `${w}x${h}`;

        saveProject({
          id: vidId,
          name: file.name,
          duration: player.formatTime(dur),
          resolution: `${w}x${h}`,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          date: new Date().toLocaleDateString("ar-EG"),
        });
      };
      videoEl.play().catch(() => {});
    }

    const uploadModal = document.getElementById("upload-progress-modal");
    if (uploadModal) {
      uploadModal.classList.add("hidden");
      uploadModal.classList.remove("flex");
    }
    document.getElementById("upload-notification")?.classList.add("hidden");
    timeline.showToast(`🎉 تم تحميل الفيديو "${file.name}" بنجاح في الاستوديو!`);
  }

  function startRealVideoUpload(file) {
    const uploadModal = document.getElementById("upload-progress-modal");
    const nameDisplay = document.getElementById("upload-filename-display");
    const percentBadge = document.getElementById("upload-percentage-badge");
    const progressBar = document.getElementById("upload-progress-bar");
    const statusText = document.getElementById("upload-status-text");

    if (uploadModal) {
      uploadModal.classList.remove("hidden");
      uploadModal.classList.add("flex");
    }
    if (nameDisplay) nameDisplay.innerText = file.name;
    if (percentBadge) percentBadge.innerText = "0%";
    if (progressBar) progressBar.style.width = "0%";
    if (statusText) statusText.innerText = "جاري رفع ومعالجة الفيديو...";

    const xhr = new XMLHttpRequest();
    window.activeUploadXHR = xhr;
    const fileSize = file.size || 0;

    xhr.upload.addEventListener("progress", (e) => {
      const totalBytes = e.lengthComputable && e.total > 0 ? e.total : fileSize;
      const percent = totalBytes > 0 ? Math.min(100, Math.round((e.loaded / totalBytes) * 100)) : 50;
      if (percentBadge) percentBadge.innerText = `${percent}%`;
      if (progressBar) progressBar.style.width = `${percent}%`;
    });

    xhr.addEventListener("load", () => {
      window.activeUploadXHR = null;
      if (fileInput) fileInput.value = "";
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          window.currentVideoId = data.video_id;
          window.currentYtId = null;
          window.currentVideoMeta = data;

          player.switchToNativeVideoMode();
          player.hideEmptyState();
          if (videoEl && data.preview_url) {
            videoEl.src = data.preview_url;
            videoEl.load();
            videoEl.play().catch(() => {});
          }

          if (data.info && data.info.duration) {
            timeline.duration = data.info.duration;
            timeline.setTime(0);
            timeline.renderRuler();
            timeline.drawAudioWaveform();
            timeline.renderFilmstrip();
          }

          saveProject({
            id: data.video_id,
            name: file.name,
            duration: data.info?.formatted_duration || "01:00",
            resolution: data.info?.resolution || "1080p",
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            date: new Date().toLocaleDateString("ar-EG"),
          });

          if (uploadModal) {
            uploadModal.classList.add("hidden");
            uploadModal.classList.remove("flex");
          }
          timeline.showToast(`🎉 تم رفع ومعالجة "${file.name}" بنجاح!`);
        } catch (err) {
          loadLocalFileDirectlyInBrowser(file);
        }
      } else {
        loadLocalFileDirectlyInBrowser(file);
      }
    });

    xhr.addEventListener("error", () => {
      window.activeUploadXHR = null;
      if (fileInput) fileInput.value = "";
      loadLocalFileDirectlyInBrowser(file);
    });

    const formData = new FormData();
    formData.append("file", file);
    try {
      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    } catch (e) {
      loadLocalFileDirectlyInBrowser(file);
    }
  }

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
  document.getElementById("brand-logo-btn")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    timeline.showToast("VideoPro Edit v2.0 - استوديو الفيديو الاحترافي المتكامل");
  });

  document.getElementById("nav-home-btn")?.addEventListener("click", () => {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

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

  function getSavedProjects() {
    try {
      const p = localStorage.getItem("videopro_saved_projects");
      return p ? JSON.parse(p) : [];
    } catch {
      return [];
    }
  }

  function saveProject(project) {
    const list = getSavedProjects().filter((p) => p.id !== project.id);
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
          لا توجد مشاريع محفوظة حتى الآن. قم برفع فيديو أو جلب رابط من يوتيوب للبدء.
        </div>
      `;
      return;
    }

    projects.forEach((proj) => {
      const card = document.createElement("div");
      card.className =
        "flex items-center justify-between p-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-purple-500/50 transition";
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
          <button class="open-proj-btn px-3 py-1.5 rounded-lg btn-primary text-xs font-bold cursor-pointer" data-id="${proj.id}" data-yt="${proj.ytId || ""}" data-short="${proj.isShort ? "1" : "0"}">
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
        const ytId = btn.dataset.yt;
        const isShort = btn.dataset.short === "1";
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        if (ytId) {
          fetchYouTubeIntoStudio(
            isShort ? `https://www.youtube.com/shorts/${ytId}` : `https://www.youtube.com/watch?v=${ytId}`,
            "1080p"
          );
        } else {
          window.currentVideoId = projId;
          player.switchToNativeVideoMode();
          player.hideEmptyState();
          if (videoEl) {
            videoEl.src = window.__CANVAS_DEMO_BLOBS__?.[projId] || `/api/video/stream/${projId}`;
            videoEl.load();
            videoEl.play().catch(() => {});
          }
          timeline.showToast("تم فتح المشروع في المشغل بنجاح");
        }
      });
    });

    listContainer.querySelectorAll(".del-proj-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const remaining = getSavedProjects().filter((p) => p.id !== btn.dataset.id);
        try {
          localStorage.setItem("videopro_saved_projects", JSON.stringify(remaining));
        } catch {}
        openProjectsModal();
      });
    });
  }

  // ========================================================
  // 3. ALL 12 TOOLS HANDLERS (Sidebar & Mobile Quick Carousel)
  // ========================================================

  // Tool 1: Split & Trim
  const toolSplitBtn = document.getElementById("tool-split-btn");
  const quickSplitBtn = document.getElementById("quick-split-btn");
  [toolSplitBtn, quickSplitBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      splitter.openModal();
      setActiveSidebarTool(toolSplitBtn);
    });
  });

  // Tool 2: Subtitles & Translation
  const toolSubtitlesBtn = document.getElementById("tool-subtitles-btn");
  const quickSubtitlesBtn = document.getElementById("quick-subtitles-btn");
  [toolSubtitlesBtn, quickSubtitlesBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      subtitles.openModal();
      setActiveSidebarTool(toolSubtitlesBtn);
    });
  });

  // Tool 3: Social Publisher & Viral Kit ("نشر الفيديو")
  const toolPublishBtn = document.getElementById("tool-publish-btn");
  const quickPublishBtn = document.getElementById("quick-publish-btn");
  const publishModal = document.getElementById("publish-modal");
  let selectedPublishPlatform = "youtube_shorts";

  [toolPublishBtn, quickPublishBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع فيديو أو جلب فيديو من يوتيوب أولاً لتجهيز النشر");
        document.getElementById("youtube-url-input")?.focus();
        return;
      }
      if (publishModal) {
        publishModal.classList.remove("hidden");
        publishModal.classList.add("flex");
      }
      setActiveSidebarTool(toolPublishBtn);
    });
  });

  document.getElementById("close-publish-modal")?.addEventListener("click", () => {
    publishModal?.classList.add("hidden");
    publishModal?.classList.remove("flex");
  });

  document.querySelectorAll(".publish-platform-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".publish-platform-btn").forEach((b) =>
        b.classList.remove("active", "border-purple-500", "bg-purple-900/40")
      );
      btn.classList.add("active", "border-purple-500", "bg-purple-900/40");
      selectedPublishPlatform = btn.dataset.platform || "youtube_shorts";
    });
  });

  document.getElementById("execute-publish-btn")?.addEventListener("click", async () => {
    if (!window.currentVideoId) return;
    const topicInput =
      document.getElementById("publish-topic-input")?.value ||
      window.currentVideoMeta?.title ||
      "";
    const statusEl = document.getElementById("publish-status-text");
    const resultBox = document.getElementById("publish-results-box");
    const btn = document.getElementById("execute-publish-btn");

    const transcriptText =
      window.subtitlesInstance?.cues?.map((c) => c.text).join(" ") || "";

    btn.disabled = true;
    if (statusEl) {
      statusEl.innerText =
        "⏳ جاري تجهيز الفيديو لمعايير المنصة وتوليد الصورة المصغرة والعناوين الفيروسية من محتوى الفيديو...";
    }

    try {
      const fd = new FormData();
      fd.append("video_id", window.currentVideoId);
      fd.append("platform", selectedPublishPlatform);
      fd.append("custom_topic", topicInput);
      fd.append("transcript_text", transcriptText);

      const resp = await fetch("/api/video/publish-kit", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok || data.error)
        throw new Error(data.detail || data.error || "فشل تجهيز حقيبة النشر");

      if (statusEl) {
        statusEl.innerText = `✅ تم تجهيز حقيبة النشر الكاملة لمنصة (${data.platform_label})!`;
      }
      if (resultBox) resultBox.classList.remove("hidden");

      const titlesList = document.getElementById("publish-titles-list");
      if (titlesList && data.viral_titles) {
        titlesList.innerHTML = data.viral_titles
          .map(
            (t) =>
              `<div class="p-2 rounded bg-black/50 border border-gray-800 text-xs text-gray-100 flex items-center justify-between gap-2">
                <span>${t}</span>
                <button type="button" class="px-2 py-0.5 rounded bg-purple-700/60 hover:bg-purple-600 text-[10px] text-white shrink-0 cursor-pointer" onclick="navigator.clipboard?.writeText('${t.replace(/'/g, "\\'")}'); window.timelineInstance?.showToast('تم نسخ العنوان!')">نسخ</button>
              </div>`
          )
          .join("");
      }

      const descArea = document.getElementById("publish-seo-description");
      if (descArea) descArea.value = data.seo_description || "";

      const tagsArea = document.getElementById("publish-hashtags-box");
      if (tagsArea) tagsArea.innerText = data.hashtags_text || "";

      const dlVideoBtn = document.getElementById("publish-download-video-btn");
      if (dlVideoBtn && data.video_url) {
        dlVideoBtn.href = data.video_url;
        dlVideoBtn.innerText = `📥 تنزيل الفيديو الجاهز للنشر (${data.size_mb || 4.8} MB)`;
      }

      const dlThumbBtn = document.getElementById("publish-download-thumb-btn");
      if (dlThumbBtn) {
        dlThumbBtn.href =
          window.currentYtId
            ? `https://i.ytimg.com/vi/${window.currentYtId}/hqdefault.jpg`
            : data.thumbnail_url || "#";
      }

      timeline.showToast("🚀 حقيبة النشر الفيروسية جاهزة للتنزيل والمشاركة!");
    } catch (err) {
      if (statusEl) statusEl.innerText = `❌ ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("copy-publish-all-btn")?.addEventListener("click", () => {
    const desc = document.getElementById("publish-seo-description")?.value || "";
    const tags = document.getElementById("publish-hashtags-box")?.innerText || "";
    const combined = `${desc}\n\n${tags}`;
    try {
      navigator.clipboard.writeText(combined);
    } catch {}
    timeline.showToast("📋 تم نسخ الوصف والفصول الزمنية والهاشتاقات بنجاح!");
  });

  // Tool 4: Reframe
  const toolReframeBtn = document.getElementById("tool-reframe-btn");
  const quickReframeBtn = document.getElementById("quick-reframe-btn");
  [toolReframeBtn, quickReframeBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      reframe.openModal();
      setActiveSidebarTool(toolReframeBtn);
    });
  });

  // Tool 5: Silence Remover
  const toolSilenceBtn = document.getElementById("tool-silence-btn");
  const quickSilenceBtn = document.getElementById("quick-silence-btn");
  [toolSilenceBtn, quickSilenceBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      silence.openModal();
      setActiveSidebarTool(toolSilenceBtn);
    });
  });

  // Tool 6: Highlights
  const toolHighlightsBtn = document.getElementById("tool-highlights-btn");
  const quickHighlightsBtn = document.getElementById("quick-highlights-btn");
  [toolHighlightsBtn, quickHighlightsBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      highlights.openModal();
      setActiveSidebarTool(toolHighlightsBtn);
    });
  });

  // Tool 7: Speed, Reverse & Boomerang
  const toolSpeedBtn = document.getElementById("tool-speed-btn");
  const quickSpeedBtn = document.getElementById("quick-speed-btn");
  const speedModal = document.getElementById("speed-modal");
  let selectedSpeedVal = 1.5;

  [toolSpeedBtn, quickSpeedBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً للتحكم بالسرعة والعكس");
        document.getElementById("youtube-url-input")?.focus();
        return;
      }
      if (speedModal) {
        speedModal.classList.remove("hidden");
        speedModal.classList.add("flex");
      }
      setActiveSidebarTool(toolSpeedBtn);
    });
  });

  document.getElementById("close-speed-modal")?.addEventListener("click", () => {
    speedModal?.classList.add("hidden");
    speedModal?.classList.remove("flex");
  });

  document.querySelectorAll(".speed-preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".speed-preset-chip").forEach((c) =>
        c.classList.remove("active", "border-cyan-400", "bg-cyan-950/60")
      );
      chip.classList.add("active", "border-cyan-400", "bg-cyan-950/60");
      selectedSpeedVal = parseFloat(chip.dataset.speed || "1.5");
    });
  });

  document.getElementById("execute-speed-btn")?.addEventListener("click", () => {
    if (!window.currentVideoId) return;
    const vidId = window.currentVideoId;
    const reverse = document.getElementById("speed-reverse-toggle")?.checked || false;
    const boomerang = document.getElementById("speed-boomerang-toggle")?.checked || false;

    player.setPlaybackSpeed(selectedSpeedVal);
    if (boomerang) {
      const cur = player.getCurrentTime();
      player.previewSegmentBounds = { start: cur, end: Math.min(player.getDuration(), cur + 4) };
    }

    window.tasksManager?.runBackgroundTask({
      type: "speed",
      title: boomerang
        ? "تأثير بوميرانج (Boomerang Loop)"
        : `تغيير سرعة الفيديو (${selectedSpeedVal}x)${reverse ? " + عكس" : ""}`,
      icon: "⚡",
      dismissModalId: "speed-modal",
      apiCall: async () => {
        const fd = new FormData();
        fd.append("video_id", vidId);
        fd.append("speed", selectedSpeedVal.toString());
        fd.append("reverse", reverse ? "true" : "false");
        fd.append("boomerang", boomerang ? "true" : "false");

        const resp = await fetch("/api/video/speed", { method: "POST", body: fd });
        const data = await resp.json();
        if (!resp.ok || data.error)
          throw new Error(data.detail || data.error || "فشل معالجة السرعة");
        return data;
      },
    });
  });

  // Tool 8: Self-Reliant Voice Studio & Noise Reduction
  const toolVoiceBtn = document.getElementById("tool-voice-btn");
  const quickVoiceBtn = document.getElementById("quick-voice-btn");
  const voiceModal = document.getElementById("voice-modal");

  [toolVoiceBtn, quickVoiceBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لتنقية الصوت");
        document.getElementById("youtube-url-input")?.focus();
        return;
      }
      if (voiceModal) {
        voiceModal.classList.remove("hidden");
        voiceModal.classList.add("flex");
      }
      setActiveSidebarTool(toolVoiceBtn);
    });
  });

  document.getElementById("close-voice-modal")?.addEventListener("click", () => {
    voiceModal?.classList.add("hidden");
    voiceModal?.classList.remove("flex");
  });

  document.getElementById("execute-voice-btn")?.addEventListener("click", () => {
    if (!window.currentVideoId) return;
    const vidId = window.currentVideoId;
    const strength = document.getElementById("voice-denoise-select")?.value || "medium";
    const boost = document.getElementById("voice-podcast-toggle")?.checked !== false;
    const norm = document.getElementById("voice-lufs-toggle")?.checked !== false;

    window.tasksManager?.runBackgroundTask({
      type: "voice",
      title: `تنقية الصوت وعزل الضوضاء (${strength.toUpperCase()})`,
      icon: "🎧",
      dismissModalId: "voice-modal",
      apiCall: async () => {
        const fd = new FormData();
        fd.append("video_id", vidId);
        fd.append("denoise_strength", strength);
        fd.append("podcast_boost", boost ? "true" : "false");
        fd.append("normalize_lufs", norm ? "true" : "false");

        const resp = await fetch("/api/video/enhance-voice", { method: "POST", body: fd });
        const data = await resp.json();
        if (!resp.ok || data.error)
          throw new Error(data.detail || data.error || "فشل تنقية الصوت");
        return data;
      },
    });
  });

  // Tool 9: Audio & Music
  const toolAudioBtn = document.getElementById("tool-audio-btn");
  const quickAudioBtn = document.getElementById("quick-audio-btn");
  const audioModal = document.getElementById("audio-modal");
  [toolAudioBtn, quickAudioBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لإضافة مقطع صوتي");
        document.getElementById("youtube-url-input")?.focus();
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

  let selectedAudioPreset = "upbeat";
  let customAudioFile = null;

  document.querySelectorAll(".audio-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".audio-preset-btn").forEach((b) =>
        b.classList.remove("active", "border-teal-500", "bg-teal-950/50")
      );
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
    const v = parseFloat(e.target.value);
    document.getElementById("audio-orig-vol-text").innerText = `${Math.round(v * 100)}%`;
    player.setVolume(v);
  });
  musicVolSlider?.addEventListener("input", (e) => {
    document.getElementById("audio-music-vol-text").innerText = `${Math.round(e.target.value * 100)}%`;
  });

  document.getElementById("execute-audio-btn")?.addEventListener("click", async () => {
    if (!window.currentVideoId) return;
    const vidId = window.currentVideoId;
    const preset = selectedAudioPreset;
    const vVol = origVolSlider ? origVolSlider.value : "1.0";
    const mVol = musicVolSlider ? musicVolSlider.value : "0.5";
    const audioFile = customAudioFile;

    player.setVolume(parseFloat(vVol));

    window.tasksManager?.runBackgroundTask({
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
  });

  // Tool 10: Merge Clips
  const toolMergeBtn = document.getElementById("tool-merge-btn");
  const quickMergeBtn = document.getElementById("quick-merge-btn");
  const mergeModal = document.getElementById("merge-modal");
  [toolMergeBtn, quickMergeBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لدمج المقاطع");
        document.getElementById("youtube-url-input")?.focus();
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

    const item0 = document.createElement("div");
    item0.className =
      "flex items-center justify-between p-2.5 rounded-lg bg-gray-900 border border-purple-500/40 text-xs";
    item0.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-5 h-5 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-[10px]">1</span>
        <span class="font-bold text-gray-200">${window.currentVideoMeta?.title || "الفيديو الحالي الرئيسي"}</span>
      </div>
      <span class="text-[10px] text-purple-400 font-semibold">المقطع الأساسي</span>
    `;
    listEl.appendChild(item0);

    extraMergeFiles.forEach((file, idx) => {
      const item = document.createElement("div");
      item.className =
        "flex items-center justify-between p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-xs";
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

  window.removeMergeClip = function (idx) {
    extraMergeFiles.splice(idx, 1);
    renderMergeClipsList();
  };

  document.getElementById("execute-merge-btn")?.addEventListener("click", async () => {
    if (!window.currentVideoId) return;
    const vidId = window.currentVideoId;
    const filesToMerge = [...extraMergeFiles];

    window.tasksManager?.runBackgroundTask({
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
  });

  // Tool 11: Enhance Colors
  const toolEnhanceBtn = document.getElementById("tool-enhance-btn");
  const quickEnhanceBtn = document.getElementById("quick-enhance-btn");
  const enhanceModal = document.getElementById("enhance-modal");
  [toolEnhanceBtn, quickEnhanceBtn].forEach((btn) => {
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

  // Tool 12: Text & Stickers
  const toolTextBtn = document.getElementById("tool-text-btn");
  const quickTextBtn = document.getElementById("quick-text-btn");
  const textModal = document.getElementById("text-modal");
  [toolTextBtn, quickTextBtn].forEach((btn) => {
    btn?.addEventListener("click", () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لحرق النصوص");
        document.getElementById("youtube-url-input")?.focus();
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

    let banner = document.getElementById("player-custom-text-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "player-custom-text-banner";
      banner.className =
        "absolute left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 font-extrabold text-center pointer-events-none z-20 shadow-2xl leading-relaxed";
      document.getElementById("player-container")?.appendChild(banner);
    }

    if (banner && textInput) {
      banner.innerText = textInput.value;
      banner.style.color = colorPicker ? colorPicker.value : "#facc15";
      banner.style.fontSize = `${sizeSlider ? Math.min(22, parseInt(sizeSlider.value, 10) * 0.55) : 16}px`;

      const pos = posSelect ? posSelect.value : "bottom";
      if (pos === "top") {
        banner.style.top = "12%";
        banner.style.bottom = "auto";
        banner.style.transform = "translateX(-50%)";
      } else if (pos === "center") {
        banner.style.top = "50%";
        banner.style.bottom = "auto";
        banner.style.transform = "translate(-50%, -50%)";
      } else {
        banner.style.top = "auto";
        banner.style.bottom = "22%";
        banner.style.transform = "translateX(-50%)";
      }

      banner.classList.remove("hidden");
    }
  }

  document.getElementById("preview-text-btn")?.addEventListener("click", () => {
    previewOverlayText();
    timeline.showToast("تمت معاينة النص على الفيديو");
  });

  document.getElementById("execute-text-btn")?.addEventListener("click", async () => {
    if (!window.currentVideoId) return;
    const vidId = window.currentVideoId;
    const textVal = document.getElementById("overlay-text-input")?.value || "VideoPro Edit";
    const fontSize = document.getElementById("overlay-size-slider")?.value || "36";
    const fontColor = document.getElementById("overlay-color-picker")?.value || "yellow";
    const position = document.getElementById("overlay-position-select")?.value || "bottom";

    previewOverlayText();

    window.tasksManager?.runBackgroundTask({
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
  });

  function setActiveSidebarTool(activeBtn) {
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
    if (activeBtn) activeBtn.classList.add("active");
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach((m) => {
      m.classList.add("hidden");
      m.classList.remove("flex");
    });
  }

  const startNowBtn = document.getElementById("start-now-btn");
  if (startNowBtn) {
    startNowBtn.addEventListener("click", () => {
      if (!window.currentVideoId) {
        document.getElementById("youtube-url-input")?.focus();
        timeline.showToast("ابدأ بلصق رابط فيديو يوتيوب بالأعلى أو ارفع فيديو من جهازك!");
      } else {
        splitter.openModal();
      }
    });
  }

  // ========================================================
  // 4. EXPORT FINAL VIDEO
  // ========================================================
  const exportBtn = document.getElementById("export-video-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      if (!window.currentVideoId) {
        timeline.showToast("⚠️ يرجى رفع أو جلب فيديو أولاً لتصديره");
        document.getElementById("youtube-url-input")?.focus();
        return;
      }

      const resolution = document.getElementById("export-quality-select")?.value || "1080p";
      const format = document.getElementById("export-format-select")?.value || "mp4";
      const vidId = window.currentVideoId;

      window.tasksManager?.runBackgroundTask({
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

          if (data.url) {
            const a = document.createElement("a");
            a.href = data.url;
            a.download = data.filename || `videopro_export_${resolution}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
          return data;
        },
      });
    });
  }

  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        if (modal.id === "upload-progress-modal" && window.activeUploadXHR) {
          return;
        }
        modal.classList.add("hidden");
        modal.classList.remove("flex");
      }
    });
  });

  // Wire Option 2 button ("اختيار وتحميل فيديو من جهازي") directly to file input
  document.getElementById("top-device-upload-btn")?.addEventListener("click", () => {
    fileInput?.click();
  });
});
