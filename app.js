/* ============================================================
   chunky.baby — WHO Growth Percentile Estimator & Seasonal
   Baby Clothing Size Predictor
   ============================================================ */

(function () {
  "use strict";

  const CONFIG = window.CHUNKY_CONFIG || {
    amazonTag: "balmy06-20",
    babyRegistryUrl: "https://www.amazon.com/baby-reg/homepage",
    essentialsKit: []
  };

  function withAmazonTag(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (CONFIG.amazonTag && CONFIG.amazonTag.trim() !== "") {
        url.searchParams.set("tag", CONFIG.amazonTag.trim());
      }
      return url.toString();
    } catch {
      return rawUrl;
    }
  }

  /* ----------------------------------------------------------
     1. 3 AM Nursery Night Mode
     ---------------------------------------------------------- */
  const nightToggle = document.getElementById("nightModeToggle");
  const root = document.documentElement;

  function applyTheme(isNight) {
    if (isNight) {
      root.setAttribute("data-theme", "night");
      nightToggle.setAttribute("aria-pressed", "true");
      nightToggle.querySelector(".night-icon").textContent = "☀️";
      nightToggle.querySelector(".night-label").textContent = "Day Mode";
    } else {
      root.removeAttribute("data-theme");
      nightToggle.setAttribute("aria-pressed", "false");
      nightToggle.querySelector(".night-icon").textContent = "🌙";
      nightToggle.querySelector(".night-label").textContent = "3 AM Mode";
    }
  }

  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("chunky_theme");
  } catch {
    // ignore
  }
  const hour = new Date().getHours();
  applyTheme(savedTheme ? savedTheme === "night" : hour >= 22 || hour < 5);

  nightToggle.addEventListener("click", () => {
    const nextNight = root.getAttribute("data-theme") !== "night";
    applyTheme(nextNight);
    try {
      localStorage.setItem("chunky_theme", nextNight ? "night" : "day");
    } catch {
      // ignore
    }
  });

  /* ----------------------------------------------------------
     2. WHO 0–24 Month Reference Tables (Median & Approx SD)
        Weight in kg, Length in cm (extended softly to 36m for
        12-month forward seasonal forecasting)
     ---------------------------------------------------------- */
  const WHO = {
    boy: {
      // [month, medianKg, sdKg, medianCm, sdCm]
      points: [
        [0, 3.35, 0.45, 49.9, 1.9],
        [1, 4.47, 0.55, 54.7, 2.0],
        [2, 5.57, 0.65, 58.4, 2.1],
        [3, 6.38, 0.72, 61.4, 2.15],
        [4, 7.0, 0.78, 63.9, 2.2],
        [6, 7.93, 0.87, 67.6, 2.25],
        [9, 8.9, 0.96, 72.0, 2.35],
        [12, 9.65, 1.04, 75.7, 2.5],
        [15, 10.31, 1.12, 79.1, 2.65],
        [18, 10.94, 1.2, 82.3, 2.8],
        [24, 12.15, 1.35, 87.8, 3.1],
        [30, 13.3, 1.5, 92.4, 3.4],
        [36, 14.34, 1.65, 96.1, 3.7]
      ]
    },
    girl: {
      points: [
        [0, 3.23, 0.43, 49.1, 1.85],
        [1, 4.19, 0.52, 53.7, 1.95],
        [2, 5.13, 0.62, 57.1, 2.05],
        [3, 5.85, 0.7, 59.8, 2.15],
        [4, 6.42, 0.76, 62.1, 2.2],
        [6, 7.3, 0.86, 65.7, 2.3],
        [9, 8.23, 0.96, 70.1, 2.4],
        [12, 8.95, 1.05, 74.0, 2.55],
        [15, 9.6, 1.13, 77.5, 2.7],
        [18, 10.23, 1.22, 80.7, 2.85],
        [24, 11.48, 1.38, 86.4, 3.15],
        [30, 12.65, 1.53, 91.1, 3.45],
        [36, 13.85, 1.68, 95.1, 3.75]
      ]
    }
  };

  function interpolateWHO(sex, month) {
    const pts = WHO[sex].points;
    if (month <= pts[0][0]) {
      const [, wM, wS, lM, lS] = pts[0];
      return { wM, wS, lM, lS };
    }
    const last = pts[pts.length - 1];
    if (month >= last[0]) {
      const [, wM, wS, lM, lS] = last;
      return { wM, wS, lM, lS };
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (month >= a[0] && month <= b[0]) {
        const t = (month - a[0]) / (b[0] - a[0]);
        return {
          wM: a[1] + t * (b[1] - a[1]),
          wS: a[2] + t * (b[2] - a[2]),
          lM: a[3] + t * (b[3] - a[3]),
          lS: a[4] + t * (b[4] - a[4])
        };
      }
    }
    return { wM: last[1], wS: last[2], lM: last[3], lS: last[4] };
  }

  // Standard Normal CDF approximation -> percentile 1..99
  function zToPercentile(z) {
    const clamped = Math.max(-3.2, Math.min(3.2, z));
    const t = 1 / (1 + 0.2316419 * Math.abs(clamped));
    const d = 0.39894228 * Math.exp((-clamped * clamped) / 2);
    const p =
      d *
      t *
      (0.31938153 +
        t * (-0.35656378 + t * (1.78147794 + t * (-1.82125598 + t * 1.33027443))));
    const cdf = clamped >= 0 ? 1 - p : p;
    return Math.max(1, Math.min(99, Math.round(cdf * 100)));
  }

  function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    const mod10 = n % 10;
    if (mod10 === 1) return `${n}st`;
    if (mod10 === 2) return `${n}nd`;
    if (mod10 === 3) return `${n}rd`;
    return `${n}th`;
  }

  // Match weight (lbs) & length (in) to standard US baby clothing size brackets
  function recommendClothingSize(lbs, inches) {
    const brackets = [
      { size: "NB", maxLbs: 9, maxIn: 21.5 },
      { size: "0–3M", maxLbs: 12.5, maxIn: 24 },
      { size: "3–6M", maxLbs: 17, maxIn: 26.5 },
      { size: "6–9M", maxLbs: 20.5, maxIn: 28.5 },
      { size: "9–12M", maxLbs: 24, maxIn: 30.5 },
      { size: "12–18M", maxLbs: 27.5, maxIn: 32.5 },
      { size: "18–24M", maxLbs: 30.5, maxIn: 34.5 },
      { size: "2T", maxLbs: 33.5, maxIn: 36.5 },
      { size: "3T", maxLbs: 37, maxIn: 39 },
      { size: "4T", maxLbs: 99, maxIn: 99 }
    ];
    for (const b of brackets) {
      if (lbs <= b.maxLbs && inches <= b.maxIn) return b.size;
    }
    return "4T";
  }

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  function seasonForMonth(monthIdx) {
    const m = ((monthIdx % 12) + 12) % 12;
    if (m === 11 || m <= 1) return { name: "Winter", emoji: "❄️" };
    if (m >= 2 && m <= 4) return { name: "Spring", emoji: "🌷" };
    if (m >= 5 && m <= 7) return { name: "Summer", emoji: "☀️" };
    return { name: "Fall", emoji: "🍂" };
  }

  /* ----------------------------------------------------------
     3. Wire Up Predictor UI
     ---------------------------------------------------------- */
  const sexRadios = document.querySelectorAll('input[name="sex"]');
  const unitRadios = document.querySelectorAll('input[name="units"]');
  const ageEl = document.getElementById("ageMonths");
  const weightEl = document.getElementById("weightInput");
  const lengthEl = document.getElementById("lengthInput");
  const monthSelect = document.getElementById("currentMonth");

  const ageLabel = document.getElementById("ageLabel");
  const weightLabel = document.getElementById("weightLabel");
  const lengthLabel = document.getElementById("lengthLabel");

  const vibeBadge = document.getElementById("vibeBadge");
  const weightPctEl = document.getElementById("weightPct");
  const lengthPctEl = document.getElementById("lengthPct");
  const weightBar = document.getElementById("weightBar");
  const lengthBar = document.getElementById("lengthBar");
  const currentSizeEl = document.getElementById("currentSize");
  const fitAdviceEl = document.getElementById("fitAdvice");
  const seasonGrid = document.getElementById("seasonGrid");

  MONTH_NAMES.forEach((name, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = name;
    if (idx === new Date().getMonth()) opt.selected = true;
    monthSelect.appendChild(opt);
  });

  let currentUnits = "imperial";

  function getSex() {
    return Array.from(sexRadios).find((r) => r.checked)?.value || "boy";
  }

  function switchUnits(nextUnits) {
    if (nextUnits === currentUnits) return;
    const wVal = parseFloat(weightEl.value);
    const lVal = parseFloat(lengthEl.value);

    if (nextUnits === "metric") {
      weightEl.min = "2.2";
      weightEl.max = "18";
      weightEl.step = "0.1";
      weightEl.value = (wVal * 0.453592).toFixed(1);

      lengthEl.min = "43";
      lengthEl.max = "98";
      lengthEl.step = "0.5";
      lengthEl.value = (lVal * 2.54).toFixed(1);
    } else {
      weightEl.min = "5";
      weightEl.max = "38";
      weightEl.step = "0.2";
      weightEl.value = (wVal / 0.453592).toFixed(1);

      lengthEl.min = "17";
      lengthEl.max = "38";
      lengthEl.step = "0.2";
      lengthEl.value = (lVal / 2.54).toFixed(1);
    }
    currentUnits = nextUnits;
    updateAll();
  }

  function updateAll() {
    const sex = getSex();
    const ageM = parseInt(ageEl.value, 10);
    const rawW = parseFloat(weightEl.value);
    const rawL = parseFloat(lengthEl.value);

    const weightKg = currentUnits === "metric" ? rawW : rawW * 0.453592;
    const lengthCm = currentUnits === "metric" ? rawL : rawL * 2.54;
    const weightLbs = weightKg / 0.453592;
    const lengthIn = lengthCm / 2.54;

    ageLabel.textContent = ageM === 0 ? "Newborn (0 mos)" : ageM === 1 ? "1 month" : `${ageM} months`;
    weightLabel.textContent = currentUnits === "metric" ? `${rawW.toFixed(1)} kg` : `${rawW.toFixed(1)} lbs`;
    lengthLabel.textContent = currentUnits === "metric" ? `${rawL.toFixed(1)} cm` : `${rawL.toFixed(1)} in`;

    const ref = interpolateWHO(sex, ageM);
    const wZ = (weightKg - ref.wM) / ref.wS;
    const lZ = (lengthCm - ref.lM) / ref.lS;

    const wPct = zToPercentile(wZ);
    const lPct = zToPercentile(lZ);

    weightPctEl.textContent = ordinal(wPct);
    lengthPctEl.textContent = ordinal(lPct);
    weightBar.style.width = `${wPct}%`;
    lengthBar.style.width = `${lPct}%`;

    // Playful, warm vibe badge
    if (wPct >= 85) {
      vibeBadge.textContent = "Certified Chunky Thigh Rolls 🧸";
    } else if (wPct >= 65 && wPct > lPct + 12) {
      vibeBadge.textContent = "Official Squishy Rolls Club 💛";
    } else if (lPct >= 80 && wPct < 60) {
      vibeBadge.textContent = "Tall & Stretchy Bean 🌿";
    } else if (wPct >= 40) {
      vibeBadge.textContent = "Classic Cuddle Curve ✨";
    } else {
      vibeBadge.textContent = "Petite & Mighty Peanut 🥜";
    }

    const nowSize = recommendClothingSize(weightLbs, lengthIn);
    currentSizeEl.textContent = nowSize;

    if (wPct >= 75) {
      fitAdviceEl.textContent =
        "Running ahead of age-based tags—size up in snug cotton sleepers or grab stretchy bamboo footies so thighs stay comfy.";
    } else if (lPct >= 80) {
      fitAdviceEl.textContent =
        "Tall torso/legs! Footless sleepers or two-piece sets will give you extra months of wear before toes get squished.";
    } else {
      fitAdviceEl.textContent =
        "Tracking smoothly near standard size charts—stick to this bracket now and use the 4-season forecast below when shopping sales.";
    }

    // Forecast +3, +6, +9, +12 months along the baby's current z-score curves
    const startMonthIdx = parseInt(monthSelect.value, 10);
    const offsets = [3, 6, 9, 12];
    const clampedWZ = Math.max(-2.3, Math.min(2.3, wZ));
    const clampedLZ = Math.max(-2.3, Math.min(2.3, lZ));

    seasonGrid.innerHTML = offsets
      .map((delta) => {
        const futureAge = ageM + delta;
        const futureRef = interpolateWHO(sex, futureAge);
        const projKg = Math.max(2.5, futureRef.wM + clampedWZ * futureRef.wS);
        const projCm = Math.max(45, futureRef.lM + clampedLZ * futureRef.lS);
        const projLbs = projKg / 0.453592;
        const projIn = projCm / 2.54;
        const futureSize = recommendClothingSize(projLbs, projIn);

        const futureMonthIdx = (startMonthIdx + delta) % 12;
        const season = seasonForMonth(futureMonthIdx);
        const estWeightStr =
          currentUnits === "metric" ? `~${projKg.toFixed(1)} kg` : `~${projLbs.toFixed(1)} lbs`;

        return `
          <article class="season-card">
            <div class="season-top">
              <span class="season-name">${season.emoji} ${season.name}</span>
              <span class="season-when">${MONTH_NAMES[futureMonthIdx].slice(0, 3)} (+${delta}m)</span>
            </div>
            <div class="season-size">${futureSize}</div>
            <p class="season-detail">
              Age ${futureAge} mos &middot; Est. ${estWeightStr}
            </p>
          </article>
        `;
      })
      .join("");
  }

  sexRadios.forEach((r) => r.addEventListener("change", updateAll));
  unitRadios.forEach((r) => r.addEventListener("change", () => switchUnits(r.value)));
  ageEl.addEventListener("input", updateAll);
  weightEl.addEventListener("input", updateAll);
  lengthEl.addEventListener("input", updateAll);
  monthSelect.addEventListener("change", updateAll);
  updateAll();

  /* ----------------------------------------------------------
     4. Render Chunky Essentials Kit
     ---------------------------------------------------------- */
  const kitGrid = document.getElementById("kitGrid");
  if (kitGrid && Array.isArray(CONFIG.essentialsKit)) {
    kitGrid.innerHTML = CONFIG.essentialsKit
      .map(
        (item) => `
        <article class="kit-card">
          <div>
            <div class="kit-meta">
              <span class="kit-cat">${item.category}</span>
              <span class="kit-badge">${item.badge}</span>
            </div>
            <h3>${item.name}</h3>
            <p>${item.why}</p>
          </div>
          <a
            class="btn btn-primary"
            href="${withAmazonTag(item.url)}"
            target="_blank"
            rel="nofollow sponsored noopener noreferrer"
          >
            ${item.cta} &rarr;
          </a>
        </article>
      `
      )
      .join("");
  }

  const registryLink = document.getElementById("registryLink");
  if (registryLink) registryLink.href = withAmazonTag(CONFIG.babyRegistryUrl);

  const yearSpan = document.getElementById("yearSpan");
  if (yearSpan) yearSpan.textContent = String(new Date().getFullYear());
})();
