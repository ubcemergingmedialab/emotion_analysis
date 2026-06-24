const EMOTIONS = [
  { key: "Joy", color: "#f5c542", label: "Joy" },
  { key: "Surprise", color: "#3dd6c6", label: "Surprise" },
  { key: "Love", color: "#ff6eb4", label: "Love" },
  { key: "Fear", color: "#b06cff", label: "Fear" },
  { key: "Anger", color: "#ff5c5c", label: "Anger" },
  { key: "Sadness", color: "#4a7cff", label: "Sadness" },
];

const EMOTION_KEYS = EMOTIONS.map((e) => e.key);
const DETAIL_SIZE = 150;
const ANIMATION_MS = 420;

const state = {
  rows: [],
  filtered: [],
  selectedWord: null,
};

const detailUi = {
  initialized: false,
  lastWord: null,
  chart: null,
  frame: null,
  values: null,
  color: null,
};

const gridEl = document.getElementById("grid");
const detailPanelEl = document.getElementById("detail-panel");
const searchEl = document.getElementById("search");
const emotionFilterEl = document.getElementById("emotion-filter");
const sortByEl = document.getElementById("sort-by");
const countLabelEl = document.getElementById("count-label");
const statusEl = document.getElementById("status");
const fileInputEl = document.getElementById("file-input");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return normalizeRow(row);
  });
}

function normalizeRow(row) {
  const scores = {};
  for (const key of EMOTION_KEYS) {
    scores[key] = Number(row[key]) || 0;
  }

  return {
    word: row.Word || "",
    scores,
    primaryEmotion: row.PrimaryEmotion || "",
    confidence: Number(row.Confidence) || 0,
    occurrences: Number(row.Occurrences) || 0,
    sources: row.Sources || "",
    valence: row.Valence === "" ? null : Number(row.Valence),
    arousal: row.Arousal === "" ? null : Number(row.Arousal),
    dominance: row.Dominance === "" ? null : Number(row.Dominance),
  };
}

function vertexAngle(index) {
  return -Math.PI / 2 + index * ((2 * Math.PI) / EMOTIONS.length);
}

function polarPoint(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function valuesFromRow(row) {
  return EMOTION_KEYS.map((key) => row.scores[key]);
}

function dataPolygonPoints(cx, cy, maxRadius, values) {
  return values
    .map((value, index) => {
      const point = polarPoint(cx, cy, clamp01(value) * maxRadius, vertexAngle(index));
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function emotionFill(emotion) {
  const map = {
    joy: "#f5c542",
    sadness: "#4a7cff",
    anger: "#ff5c5c",
    fear: "#b06cff",
    love: "#ff6eb4",
    surprise: "#3dd6c6",
  };
  return map[emotion] || "#7c9cff";
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function lerpColor(fromHex, toHex, t) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function createHexagonSvg(row, size, { large = false } = {}) {
  const padding = large ? 36 : 18;
  const viewSize = size + padding * 2;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const maxRadius = size / 2;
  const values = valuesFromRow(row);
  const labelClass = large ? "hex-label hex-label-large" : "hex-label";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${viewSize} ${viewSize}`);
  svg.setAttribute("width", viewSize);
  svg.setAttribute("height", viewSize);
  svg.classList.add("hex-svg");

  appendChartGuides(svg, cx, cy, maxRadius, large);

  const dominantColor = emotionFill(row.primaryEmotion);
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  shape.setAttribute("points", dataPolygonPoints(cx, cy, maxRadius, values));
  shape.setAttribute("fill", dominantColor);
  shape.setAttribute("fill-opacity", large ? "0.4" : "0.5");
  shape.setAttribute("stroke", dominantColor);
  shape.setAttribute("stroke-width", large ? 2 : 1.5);
  shape.setAttribute("stroke-linejoin", "round");
  svg.appendChild(shape);

  values.forEach((value, index) => {
    const point = polarPoint(cx, cy, clamp01(value) * maxRadius, vertexAngle(index));
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", point.x);
    dot.setAttribute("cy", point.y);
    dot.setAttribute("r", large ? 3.5 : 2.5);
    dot.setAttribute("fill", EMOTIONS[index].color);
    dot.setAttribute("stroke", "#0f1117");
    dot.setAttribute("stroke-width", large ? 1.2 : 0.8);
    svg.appendChild(dot);
  });

  if (large) {
    EMOTIONS.forEach((emotion, index) => {
      const labelPoint = polarPoint(cx, cy, maxRadius + 16, vertexAngle(index));
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", labelPoint.x);
      text.setAttribute("y", labelPoint.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("class", labelClass);
      text.setAttribute("fill", emotion.color);
      text.textContent = emotion.label;
      svg.appendChild(text);
    });
  }

  return svg;
}

function appendChartGuides(svg, cx, cy, maxRadius, large) {
  for (const level of [0.25, 0.5, 0.75, 1]) {
    const guide = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    guide.setAttribute(
      "points",
      EMOTION_KEYS.map((_, index) => {
        const point = polarPoint(cx, cy, maxRadius * level, vertexAngle(index));
        return `${point.x},${point.y}`;
      }).join(" "),
    );
    guide.setAttribute("fill", "none");
    guide.setAttribute("stroke", "#2e3548");
    guide.setAttribute("stroke-width", large ? 1.2 : 0.8);
    svg.appendChild(guide);
  }

  for (let index = 0; index < EMOTIONS.length; index += 1) {
    const outer = polarPoint(cx, cy, maxRadius, vertexAngle(index));
    const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    axis.setAttribute("x1", cx);
    axis.setAttribute("y1", cy);
    axis.setAttribute("x2", outer.x);
    axis.setAttribute("y2", outer.y);
    axis.setAttribute("stroke", "#2e3548");
    axis.setAttribute("stroke-width", large ? 1 : 0.6);
    svg.appendChild(axis);
  }
}

function createDetailChart() {
  const padding = 36;
  const viewSize = DETAIL_SIZE + padding * 2;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const maxRadius = DETAIL_SIZE / 2;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${viewSize} ${viewSize}`);
  svg.setAttribute("width", viewSize);
  svg.setAttribute("height", viewSize);
  svg.classList.add("hex-svg", "detail-chart");

  appendChartGuides(svg, cx, cy, maxRadius, true);

  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("fill-opacity", "0.4");
  polygon.setAttribute("stroke-width", "2");
  polygon.setAttribute("stroke-linejoin", "round");
  svg.appendChild(polygon);

  const dots = EMOTIONS.map((emotion) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", "3.5");
    dot.setAttribute("fill", emotion.color);
    dot.setAttribute("stroke", "#0f1117");
    dot.setAttribute("stroke-width", "1.2");
    svg.appendChild(dot);
    return dot;
  });

  EMOTIONS.forEach((emotion, index) => {
    const labelPoint = polarPoint(cx, cy, maxRadius + 16, vertexAngle(index));
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", labelPoint.x);
    text.setAttribute("y", labelPoint.y);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("class", "hex-label hex-label-large");
    text.setAttribute("fill", emotion.color);
    text.textContent = emotion.label;
    svg.appendChild(text);
  });

  return { svg, polygon, dots, cx, cy, maxRadius };
}

function applyDetailChart(values, color) {
  const chart = detailUi.chart;
  if (!chart) {
    return;
  }

  chart.polygon.setAttribute("points", dataPolygonPoints(chart.cx, chart.cy, chart.maxRadius, values));
  chart.polygon.setAttribute("fill", color);
  chart.polygon.setAttribute("stroke", color);

  values.forEach((value, index) => {
    const point = polarPoint(
      chart.cx,
      chart.cy,
      clamp01(value) * chart.maxRadius,
      vertexAngle(index),
    );
    chart.dots[index].setAttribute("cx", point.x);
    chart.dots[index].setAttribute("cy", point.y);
  });
}

function cancelDetailAnimation() {
  if (detailUi.frame) {
    cancelAnimationFrame(detailUi.frame);
    detailUi.frame = null;
  }
}

function animateDetailChart(toValues, toColor, onFrame) {
  cancelDetailAnimation();

  const fromValues = detailUi.values ?? toValues.map(() => 0);
  const fromColor = detailUi.color ?? toColor;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - start) / ANIMATION_MS);
    const eased = easeInOutCubic(progress);
    const values = fromValues.map((value, index) => value + (toValues[index] - value) * eased);
    const color = lerpColor(fromColor, toColor, eased);

    applyDetailChart(values, color);
    onFrame(values);

    if (progress < 1) {
      detailUi.frame = requestAnimationFrame(tick);
      return;
    }

    detailUi.values = toValues;
    detailUi.color = toColor;
    detailUi.frame = null;
    onFrame(toValues);
  }

  detailUi.frame = requestAnimationFrame(tick);
}

function ensureDetailShell() {
  if (detailUi.initialized) {
    return;
  }

  detailPanelEl.innerHTML = `
    <h2 class="detail-word" id="detail-title"></h2>
    <div class="detail-meta" id="detail-meta"></div>
    <div class="detail-chart-host" id="detail-chart-host"></div>
    <div class="emotion-bars" id="detail-bars"></div>
  `;

  const host = document.getElementById("detail-chart-host");
  detailUi.chart = createDetailChart();
  host.appendChild(detailUi.chart.svg);

  const bars = document.getElementById("detail-bars");
  bars.innerHTML = EMOTIONS.map(
    (emotion) => `
      <div class="bar-row">
        <span class="bar-label">${emotion.label}</span>
        <div class="bar-track">
          <div class="bar-fill" data-emotion="${emotion.key}" style="background:${emotion.color}"></div>
        </div>
        <span class="bar-value" data-emotion="${emotion.key}">0.00</span>
      </div>
    `,
  ).join("");

  detailUi.initialized = true;
}

function resetDetailShell() {
  cancelDetailAnimation();
  detailUi.initialized = false;
  detailUi.lastWord = null;
  detailUi.chart = null;
  detailUi.values = null;
  detailUi.color = null;
}

function updateDetailMeta(row) {
  document.getElementById("detail-title").textContent = row.word;
  document.getElementById("detail-meta").innerHTML = `
    <div><strong>Primary:</strong> ${escapeHtml(row.primaryEmotion)} (${Math.round(row.confidence * 100)}%)</div>
    <div><strong>Occurrences:</strong> ${row.occurrences}</div>
    <div><strong>Source:</strong> ${escapeHtml(row.sources || "unknown")}</div>
    ${
      row.valence != null
        ? `<div><strong>VAD:</strong> V ${row.valence.toFixed(2)} · A ${row.arousal.toFixed(2)} · D ${row.dominance.toFixed(2)}</div>`
        : ""
    }
  `;
}

function updateDetailBars(values) {
  for (const [index, emotion] of EMOTIONS.entries()) {
    const value = values[index];
    const fill = document.querySelector(`.bar-fill[data-emotion="${emotion.key}"]`);
    const label = document.querySelector(`.bar-value[data-emotion="${emotion.key}"]`);
    fill.style.width = `${value * 100}%`;
    label.textContent = value.toFixed(2);
  }
}

function applyFilters() {
  const query = searchEl.value.trim().toLowerCase();
  const emotion = emotionFilterEl.value;

  let rows = state.rows.filter((row) => {
    const matchesQuery = !query || row.word.toLowerCase().includes(query);
    const matchesEmotion = !emotion || row.primaryEmotion === emotion;
    return matchesQuery && matchesEmotion;
  });

  const sortBy = sortByEl.value;
  rows = [...rows].sort((a, b) => {
    if (sortBy === "confidence-desc") {
      return b.confidence - a.confidence || a.word.localeCompare(b.word);
    }
    if (sortBy === "occurrences-desc") {
      return b.occurrences - a.occurrences || a.word.localeCompare(b.word);
    }
    return a.word.localeCompare(b.word);
  });

  state.filtered = rows;
  countLabelEl.textContent = `${rows.length} word${rows.length === 1 ? "" : "s"}`;

  if (state.selectedWord && !rows.some((row) => row.word === state.selectedWord)) {
    state.selectedWord = rows[0]?.word ?? null;
  }

  renderGrid();
  renderDetail();
}

function renderGrid() {
  gridEl.replaceChildren();

  for (const row of state.filtered) {
    const card = document.createElement("article");
    card.className = "card";
    if (row.word === state.selectedWord) {
      card.classList.add("selected");
    }

    card.appendChild(createHexagonSvg(row, 72));
    card.insertAdjacentHTML(
      "beforeend",
      `<p class="card-word">${escapeHtml(row.word)}</p>
       <p class="card-tag">${escapeHtml(row.primaryEmotion)} · ${Math.round(row.confidence * 100)}%</p>`,
    );

    card.addEventListener("click", () => {
      if (state.selectedWord === row.word) {
        return;
      }
      state.selectedWord = row.word;
      renderGrid();
      renderDetail();
    });

    gridEl.appendChild(card);
  }
}

function renderDetail() {
  const row = state.rows.find((entry) => entry.word === state.selectedWord);

  if (!row) {
    resetDetailShell();
    detailPanelEl.innerHTML =
      '<p class="placeholder">Select a word from the grid or search to inspect its emotion hexagon.</p>';
    return;
  }

  const shouldAnimate =
    detailUi.initialized && detailUi.lastWord != null && detailUi.lastWord !== row.word;

  ensureDetailShell();
  updateDetailMeta(row);

  const targetValues = valuesFromRow(row);
  const targetColor = emotionFill(row.primaryEmotion);

  if (shouldAnimate) {
    animateDetailChart(targetValues, targetColor, updateDetailBars);
  } else {
    cancelDetailAnimation();
    detailUi.values = targetValues;
    detailUi.color = targetColor;
    applyDetailChart(targetValues, targetColor);
    updateDetailBars(targetValues);
  }

  detailUi.lastWord = row.word;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setRows(rows) {
  state.rows = rows;
  state.selectedWord = rows[0]?.word ?? null;
  resetDetailShell();
  statusEl.textContent = `Loaded ${rows.length} words`;
  applyFilters();
}

async function loadDefaultCsv() {
  const candidates = [
    "../merged_emotion_lexicon.csv",
    "../emotion_lexicon.csv",
  ];

  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        continue;
      }
      const text = await response.text();
      setRows(parseCsv(text));
      statusEl.textContent = `Loaded ${state.rows.length} words from ${path}`;
      return;
    } catch {
      // try next path or fall back to file picker
    }
  }

  statusEl.textContent = "Could not auto-load CSV — use “Load CSV” or run a local server from the repo root.";
}

searchEl.addEventListener("input", applyFilters);
emotionFilterEl.addEventListener("change", applyFilters);
sortByEl.addEventListener("change", applyFilters);

fileInputEl.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const text = await file.text();
  setRows(parseCsv(text));
  statusEl.textContent = `Loaded ${state.rows.length} words from ${file.name}`;
});

loadDefaultCsv();
