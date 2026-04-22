import "./styles.css";

import {
  createConcreteStressViewer,
  type GroundStressField,
  type GroundStressVolumeLayer,
  type ViewerProbe,
} from "@webjenga/viewer";
import {
  calculateStressState,
  loadConcreteStressRuntime,
  type ConcreteStressRuntime,
  type RuntimeCallMetrics,
  type StressInputs,
  type StressState,
} from "@webjenga/wasm-bridge";

interface ViewerEnvironmentState {
  showFigure: boolean;
  showGround: boolean;
  showGroundVolume: boolean;
  showHouse: boolean;
  showSky: boolean;
}

interface StressColor {
  b: number;
  g: number;
  r: number;
}

interface StressBounds {
  max: number;
  min: number;
}

interface DisplaySectionState extends StressState {
  fieldRangeMaxPa: number;
  fieldRangeMinPa: number;
  groundDepthM: number;
  rangeMaxPa: number;
  rangeMinPa: number;
  sectionLabel: string;
}

document.querySelector("#app").innerHTML = `
  <main class="viewport-app">
    <section class="viewport-shell" id="viewport-shell">
      <div class="viewport-stage" id="diagram-shell">
        <div class="viewer-canvas" id="viewer-canvas" aria-label="3D section viewer"></div>

        <header class="overlay-card viewport-head">
          <div class="viewport-head__copy">
            <p class="eyebrow">C++ in the browser</p>
            <h1>Concrete stress visualiser</h1>
            <p class="viewport-subline" id="section-dimensions">0.10 x 1.00 x 0.10 m prism</p>
          </div>
          <div class="viewport-head__status">
            <div class="stress-hero">
              <span class="stress-hero__value" id="stress-kpa">0.0</span>
              <span class="stress-hero__unit">kPa</span>
            </div>
            <div class="viewport-actions">
              <div class="pill" id="ratio-label">Adaptive range</div>
              <button class="viewport-button" id="viewport-fullscreen" type="button">Enter fullscreen</button>
            </div>
          </div>
        </header>

        <section class="overlay-card overlay-card--left">
          <div class="overlay-card__header">
            <h2>Model inputs</h2>
            <p>Geometry and axial load</p>
          </div>
          <div class="collapse-stack">
            <details class="collapse-card" open>
              <summary>
                <span class="collapse-card__title">
                  <strong>Geometry and load</strong>
                  <span>Edit the prism size, density, and axial force.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="field-grid">
                  <div class="field">
                    <label for="width">Width (m)</label>
                    <input id="width" type="number" min="0.01" step="0.01" value="0.10" />
                  </div>
                  <div class="field">
                    <label for="depth">Depth (m)</label>
                    <input id="depth" type="number" min="0.01" step="0.01" value="0.10" />
                  </div>
                  <div class="field">
                    <label for="height">Height (m)</label>
                    <input id="height" type="number" min="0.01" step="0.01" value="1.00" />
                  </div>
                  <div class="field">
                    <label for="density">Density (kg/m^3)</label>
                    <input id="density" type="number" min="100" step="10" value="2400" />
                  </div>
                  <div class="field span-2">
                    <label for="applied-load">Applied top load (N)</label>
                    <input id="applied-load" type="number" min="0" step="50" value="2500" />
                  </div>
                </div>
              </div>
            </details>
            <details class="collapse-card" open>
              <summary>
                <span class="collapse-card__title">
                  <strong>Model summary</strong>
                  <span>Derived area and volume for the current shape.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="inline-metrics">
                  <div class="mini-chip">
                    <strong id="area-summary">0.0100 m^2</strong>
                    <span>Cross-sectional area</span>
                  </div>
                  <div class="mini-chip">
                    <strong id="volume-summary">0.0100 m^3</strong>
                    <span>Prism volume</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section class="overlay-card overlay-card--right">
          <div class="overlay-card__header">
            <h2>Viewport controls</h2>
            <p>Scene settings and live stress readout</p>
          </div>
          <div class="collapse-stack">
            <details class="collapse-card" open>
              <summary>
                <span class="collapse-card__title">
                  <strong>Camera</strong>
                  <span>Orbit, zoom, and hover the model or ground.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="tool-field">
                  <strong>Drag to orbit, scroll to zoom, hover the specimen or ground to sample stress.</strong>
                </div>
              </div>
            </details>
            <details class="collapse-card" open>
              <summary>
                <span class="collapse-card__title">
                  <strong>Environment</strong>
                  <span>Turn the site background elements on or off.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="toggle-row">
                  <button class="toggle-chip" id="toggle-ground" type="button">Ground</button>
                  <button class="toggle-chip" id="toggle-sky" type="button">Sky</button>
                  <button class="toggle-chip" id="toggle-ground-volume" type="button">Subsurface</button>
                </div>
              </div>
            </details>
            <details class="collapse-card" open>
              <summary>
                <span class="collapse-card__title">
                  <strong>References</strong>
                  <span>Scale cues placed beside the specimen.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="toggle-row">
                  <button class="toggle-chip" id="toggle-house" type="button">House</button>
                  <button class="toggle-chip" id="toggle-figure" type="button">Figure</button>
                </div>
              </div>
            </details>
            <details class="collapse-card">
              <summary>
                <span class="collapse-card__title">
                  <strong>Relative stress scale</strong>
                  <span>Actual field range, with colours mapped to a concrete reference capacity.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="stress-scale">
                  <div class="stress-bar">
                    <div class="stress-bar-marker" id="stress-bar-marker"></div>
                  </div>
                  <div class="stress-scale-labels">
                    <div>
                      <strong id="stress-range-max">0.0 kPa</strong>
                      <span>Concrete reference max</span>
                    </div>
                    <div>
                      <strong id="stress-range-mid">0.0 kPa</strong>
                      <span>Current field max</span>
                    </div>
                    <div>
                      <strong id="stress-range-min">0.0 kPa</strong>
                      <span>Zero stress</span>
                    </div>
                  </div>
                </div>
              </div>
            </details>
            <details class="collapse-card">
              <summary>
                <span class="collapse-card__title">
                  <strong>Probe readout</strong>
                  <span>Live hover feedback from the whole-volume field.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="stress-readout">
                  <strong id="stress-readout-title">3D probe</strong>
                  <span id="stress-readout-body">Orbit the scene and hover the specimen or ground to inspect surface stress.</span>
                </div>
              </div>
            </details>
            <details class="collapse-card" open>
              <summary>
                <span class="collapse-card__title">
                  <strong>WASM runtime</strong>
                  <span>Live call-rate meter from the WebAssembly bridge.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="inline-metrics runtime-metrics">
                  <div class="mini-chip">
                    <strong id="wasm-calls-rate">0.0 calls/s</strong>
                    <span>Current call rate</span>
                  </div>
                  <div class="mini-chip">
                    <strong id="wasm-total-calls">0</strong>
                    <span>Total bridge calls</span>
                  </div>
                  <div class="mini-chip">
                    <strong id="wasm-point-calls">0</strong>
                    <span>Point samples</span>
                  </div>
                  <div class="mini-chip">
                    <strong id="wasm-call-time">0.00 ms</strong>
                    <span>Average call time</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>

        <div class="overlay-strip">
          <div class="metric-pill">
            <strong id="self-weight-value">0 N</strong>
            <span>Self-weight</span>
          </div>
          <div class="metric-pill">
            <strong id="applied-load-value">0 N</strong>
            <span>Applied load</span>
          </div>
          <div class="metric-pill">
            <strong id="mass-value">0.0 kg</strong>
            <span>Prism mass</span>
          </div>
        </div>

        <div class="hover-card" id="hover-card">
          <strong id="hover-coords">x = 0.00 m, y = 0.00 m, z = 0.00 m</strong>
          <div class="hover-swatch">
            <div class="hover-swatch-indicator" id="hover-swatch-indicator"></div>
          </div>
          <span id="hover-stress">sigma = 0.0 kPa total</span>
          <span id="hover-note">Whole-volume surface probe</span>
        </div>
      </div>
    </section>

    <section class="insights-shell">
      <article class="insight-card insight-card--plot">
        <div class="insight-card__header">
          <div>
            <p class="eyebrow eyebrow--card">Ground surface plot</p>
            <h2>Ground-surface stress section</h2>
          </div>
          <p>Projected x/z surface built from the same sampled field the 3D ground overlay uses.</p>
        </div>
        <div class="ground-plot-frame">
          <canvas id="ground-plot-canvas" aria-label="Ground surface stress plot"></canvas>
        </div>
        <div class="ground-plot-meta">
          <span id="ground-plot-range">Surface range 0.0 to 0.0 kPa</span>
          <span id="ground-plot-footprint">Loaded footprint 0.10 x 0.10 m</span>
        </div>
      </article>
    </section>

    <section class="report-shell">
      <details class="report-card">
        <summary>C++ derivation</summary>
        <pre id="output">Loading WebAssembly runtime...</pre>
      </details>
    </section>
  </main>
`;

const output = document.getElementById("output");
const width = document.getElementById("width") as HTMLInputElement;
const depth = document.getElementById("depth") as HTMLInputElement;
const height = document.getElementById("height") as HTMLInputElement;
const density = document.getElementById("density") as HTMLInputElement;
const appliedLoad = document.getElementById("applied-load") as HTMLInputElement;
const stressKpa = document.getElementById("stress-kpa");
const selfWeightValue = document.getElementById("self-weight-value");
const appliedLoadValue = document.getElementById("applied-load-value");
const massValue = document.getElementById("mass-value");
const areaSummary = document.getElementById("area-summary");
const volumeSummary = document.getElementById("volume-summary");
const ratioLabel = document.getElementById("ratio-label");
const diagramShell = document.getElementById("diagram-shell");
const sectionDimensions = document.getElementById("section-dimensions");
const viewportHead = document.querySelector(".viewport-head");
const leftOverlayCard = document.querySelector(".overlay-card--left");
const rightOverlayCard = document.querySelector(".overlay-card--right");
const overlayStrip = document.querySelector(".overlay-strip");
const hoverCard = document.getElementById("hover-card");
const hoverCoords = document.getElementById("hover-coords");
const hoverStress = document.getElementById("hover-stress");
const hoverNote = document.getElementById("hover-note");
const hoverSwatchIndicator = document.getElementById("hover-swatch-indicator");
const stressBarMarker = document.getElementById("stress-bar-marker");
const stressRangeMax = document.getElementById("stress-range-max");
const stressRangeMid = document.getElementById("stress-range-mid");
const stressRangeMin = document.getElementById("stress-range-min");
const stressReadoutTitle = document.getElementById("stress-readout-title");
const stressReadoutBody = document.getElementById("stress-readout-body");
const viewerCanvas = document.getElementById("viewer-canvas");
const viewportShell = document.getElementById("viewport-shell");
const viewportFullscreenButton = document.getElementById("viewport-fullscreen");
const toggleGround = document.getElementById("toggle-ground");
const toggleGroundVolume = document.getElementById("toggle-ground-volume");
const toggleSky = document.getElementById("toggle-sky");
const toggleHouse = document.getElementById("toggle-house");
const toggleFigure = document.getElementById("toggle-figure");
const wasmCallsRate = document.getElementById("wasm-calls-rate");
const wasmTotalCalls = document.getElementById("wasm-total-calls");
const wasmPointCalls = document.getElementById("wasm-point-calls");
const wasmCallTime = document.getElementById("wasm-call-time");
const groundPlotCanvas = document.getElementById("ground-plot-canvas") as HTMLCanvasElement;
const groundPlotRange = document.getElementById("ground-plot-range");
const groundPlotFootprint = document.getElementById("ground-plot-footprint");
const collapsibleCards = Array.from(document.querySelectorAll(".collapse-card"));

const VIEWER_ENV_STORAGE_KEY = "webjenga.viewer.environment";
const windowedLayoutQuery = window.matchMedia("(max-width: 980px)");

function loadViewerEnvironment(): ViewerEnvironmentState {
  try {
    const raw = window.localStorage.getItem(VIEWER_ENV_STORAGE_KEY);

    if (!raw) {
      return { showFigure: true, showGround: true, showGroundVolume: true, showHouse: true, showSky: true };
    }

    const parsed = JSON.parse(raw);

    return {
      showFigure: parsed.showFigure !== false,
      showGround: parsed.showGround !== false,
      showGroundVolume: parsed.showGroundVolume !== false,
      showHouse: parsed.showHouse !== false,
      showSky: parsed.showSky !== false,
    };
  } catch (error) {
    return { showFigure: true, showGround: true, showGroundVolume: true, showHouse: true, showSky: true };
  }
}

function saveViewerEnvironment(environment: ViewerEnvironmentState) {
  try {
    window.localStorage.setItem(VIEWER_ENV_STORAGE_KEY, JSON.stringify(environment));
  } catch (error) {
    // Ignore storage failures; the toggles still work for the current session.
  }
}

const viewerEnvironment = loadViewerEnvironment();
const CONCRETE_REFERENCE_MAX_PA = 40_000_000;
const GROUND_FIELD_COLUMNS = 29;
const GROUND_FIELD_ROWS = 29;
const GROUND_VOLUME_COLUMNS = 21;
const GROUND_VOLUME_ROWS = 21;
const GROUND_VOLUME_SLICE_COUNT = 7;
const GROUND_SURFACE_SAMPLE_OFFSET_M = 0.0001;
let viewportHeightFrame = 0;

const viewer = createConcreteStressViewer({
  container: viewerCanvas,
  onProbe: showHoverProbe,
  onProbeLeave: hideHover,
});

function updateFullscreenButton() {
  viewportFullscreenButton.textContent =
    document.fullscreenElement === viewportShell ? "Exit fullscreen" : "Enter fullscreen";
}

function getMeasuredOverlayBottom() {
  const shellRect = viewportShell.getBoundingClientRect();
  const heightBoundaries = [viewportHead, leftOverlayCard, rightOverlayCard];

  if (windowedLayoutQuery.matches) {
    heightBoundaries.push(overlayStrip);
  }

  return heightBoundaries.reduce(function (maxBottom, element) {
    if (!element) {
      return maxBottom;
    }

    const rect = element.getBoundingClientRect();
    return Math.max(maxBottom, rect.bottom - shellRect.top);
  }, 0);
}

function syncViewportHeight() {
  viewportHeightFrame = 0;

  if (document.fullscreenElement === viewportShell) {
    viewportShell.style.removeProperty("height");
    viewportShell.style.removeProperty("min-height");
    return;
  }

  const requiredHeight = Math.max(
    760,
    window.innerHeight - 32,
    Math.ceil(getMeasuredOverlayBottom() + 24)
  );

  viewportShell.style.height = requiredHeight + "px";
  viewportShell.style.minHeight = requiredHeight + "px";
}

function requestViewportHeightSync() {
  if (viewportHeightFrame) {
    return;
  }

  viewportHeightFrame = window.requestAnimationFrame(syncViewportHeight);
}

viewportFullscreenButton.addEventListener("click", async function () {
  try {
    if (document.fullscreenElement === viewportShell) {
      await document.exitFullscreen();
    } else {
      await viewportShell.requestFullscreen();
    }
  } catch (error) {
    // Ignore fullscreen failures; the viewport still works in windowed mode.
  }
  updateFullscreenButton();
  requestViewportHeightSync();
});

document.addEventListener("fullscreenchange", function () {
  updateFullscreenButton();
  requestViewportHeightSync();
});

let currentSection = {
  appliedLoadN: 0,
  appliedLoadStressPa: 0,
  areaM2: 0.01,
  combinedStressPa: 0,
  densityKgM3: 2400,
  depthM: 0.1,
  fieldRangeMaxPa: 500000,
  fieldRangeMinPa: 0,
  groundDepthM: 1.5,
  heightM: 1,
  massKg: 24,
  rangeMaxPa: 500000,
  rangeMinPa: 0,
  sectionLabel: "Whole volume",
  selfWeightN: 0,
  selfWeightStressPa: 0,
  volumeM3: 0.01,
  widthM: 0.1,
} as DisplaySectionState;
let groundFieldCacheKey = "";
let groundFieldCache: GroundStressField | null = null;
let groundVolumeCacheKey = "";
let groundVolumeCache: GroundStressVolumeLayer[] | null = null;
let currentGroundSurfaceField: GroundStressField | null = null;
let currentRuntimeMetrics: RuntimeCallMetrics | null = null;
let runtimeMetricsTimer = 0;

function formatFixed(value, digits) {
  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatRounded(value) {
  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: 0,
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setToggleState(button, isActive) {
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
}

function syncViewerEnvironmentControls() {
  setToggleState(toggleFigure, viewerEnvironment.showFigure);
  setToggleState(toggleGround, viewerEnvironment.showGround);
  setToggleState(toggleGroundVolume, viewerEnvironment.showGroundVolume);
  setToggleState(toggleHouse, viewerEnvironment.showHouse);
  setToggleState(toggleSky, viewerEnvironment.showSky);
}

function applyViewerEnvironment() {
  syncViewerEnvironmentControls();
  saveViewerEnvironment(viewerEnvironment);
  viewer.update({
    showReferenceFigure: viewerEnvironment.showFigure,
    showGround: viewerEnvironment.showGround,
    showGroundVolume: viewerEnvironment.showGroundVolume,
    showReferenceHouse: viewerEnvironment.showHouse,
    showSky: viewerEnvironment.showSky,
  });
  requestViewportHeightSync();
}

function mixChannel(from, to, amount) {
  return Math.round(from + (to - from) * amount);
}

function mixColor(from: StressColor, to: StressColor, amount: number): StressColor {
  return {
    b: mixChannel(from.b, to.b, amount),
    g: mixChannel(from.g, to.g, amount),
    r: mixChannel(from.r, to.r, amount),
  };
}

function colorToString(color: StressColor) {
  return "rgb(" + color.r + ", " + color.g + ", " + color.b + ")";
}

function getFieldStressBounds(stressState: StressState): StressBounds {
  const min = Math.max(0, stressState.appliedLoadStressPa);
  const max = Math.max(min, stressState.combinedStressPa);

  return {
    max: Math.max(max, min + 1),
    min,
  };
}

function getGroundDepthM(stressState: StressState) {
  return Math.max(
    stressState.heightM * 1.5,
    Math.max(stressState.widthM, stressState.depthM) * 4
  );
}

function getGroundFieldExtent(stressState: StressState) {
  const maxPlanDimension = Math.max(stressState.widthM, stressState.depthM);
  const extent = Math.max(stressState.heightM * 3.2, maxPlanDimension * 9, 1.2);

  return {
    depthM: extent,
    widthM: extent,
  };
}

function getStressRatio(stressPa, minPa, maxPa) {
  return clamp((stressPa - minPa) / Math.max(1, maxPa - minPa), 0, 1);
}

function getStressColor(ratio) {
  const stops = [
    { at: 0.0, color: { b: 232, g: 168, r: 84 } },
    { at: 0.18, color: { b: 201, g: 212, r: 76 } },
    { at: 0.55, color: { b: 79, g: 188, r: 244 } },
    { at: 1.0, color: { b: 53, g: 57, r: 229 } },
  ];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index];
    const end = stops[index + 1];

    if (ratio <= end.at) {
      const localAmount = clamp((ratio - start.at) / (end.at - start.at), 0, 1);
      return mixColor(start.color, end.color, localAmount);
    }
  }

  return stops[stops.length - 1].color;
}

function getMaterialStressScaleMaxPa(fieldMaxPa: number) {
  return Math.max(CONCRETE_REFERENCE_MAX_PA, fieldMaxPa);
}

function formatForce(value) {
  if (Math.abs(value) >= 1000) {
    return formatFixed(value / 1000, 1) + " kN";
  }

  return formatRounded(value) + " N";
}

function getStressAtLocalYPa(localY, stressState) {
  const normalized = clamp(
    (localY + stressState.heightM / 2) / Math.max(stressState.heightM, 1e-6),
    0,
    1
  );

  return (
    stressState.combinedStressPa +
    (stressState.appliedLoadStressPa - stressState.combinedStressPa) * normalized
  );
}

function getSelfWeightStressAtLocalYPa(localY, stressState) {
  return Math.max(0, getStressAtLocalYPa(localY, stressState) - stressState.appliedLoadStressPa);
}

function getVolumeStressState(bounds: StressBounds): {
  representativeStressPa: number;
  sectionBottomColorCss: string;
  sectionGradientMode: "uniform" | "vertical";
  sectionTopColorCss: string;
  sectionUniformColorCss: string;
  volumeBottomColorCss: string;
  volumeTopColorCss: string;
} {
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(bounds.max);
  const topRatio = getStressRatio(bounds.min, 0, materialScaleMaxPa);
  const bottomRatio = getStressRatio(bounds.max, 0, materialScaleMaxPa);
  const representativeStressPa = bounds.min + (bounds.max - bounds.min) / 2;
  const representativeRatio = getStressRatio(representativeStressPa, 0, materialScaleMaxPa);
  const topColor = getStressColor(topRatio);
  const bottomColor = getStressColor(bottomRatio);

  return {
    representativeStressPa,
    sectionBottomColorCss: colorToString(bottomColor),
    sectionGradientMode: "vertical",
    sectionTopColorCss: colorToString(topColor),
    sectionUniformColorCss: colorToString(getStressColor(representativeRatio)),
    volumeBottomColorCss: colorToString(bottomColor),
    volumeTopColorCss: colorToString(topColor),
  };
}

function createGroundFieldCacheKey(
  stressState: StressState,
  bounds: StressBounds,
  groundDepthM: number,
  sampleY: number,
  columns: number,
  rows: number
) {
  return [
    formatFixed(stressState.widthM, 4),
    formatFixed(stressState.depthM, 4),
    formatFixed(stressState.heightM, 4),
    formatFixed(stressState.densityKgM3, 1),
    formatFixed(stressState.appliedLoadN, 1),
    formatFixed(groundDepthM, 4),
    formatFixed(bounds.min, 2),
    formatFixed(bounds.max, 2),
    formatFixed(sampleY, 5),
    String(columns),
    String(rows),
  ].join("|");
}

function createGroundPlotColorString(colors: number[], valueIndex: number) {
  const colorOffset = valueIndex * 3;
  const r = Math.round(colors[colorOffset] * 255);
  const g = Math.round(colors[colorOffset + 1] * 255);
  const b = Math.round(colors[colorOffset + 2] * 255);

  return "rgb(" + r + ", " + g + ", " + b + ")";
}

function drawGroundSurfacePlot() {
  const context = groundPlotCanvas.getContext("2d");
  const field = currentGroundSurfaceField;

  if (!context || !field) {
    return;
  }

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const widthPx = Math.max(Math.round(groundPlotCanvas.clientWidth * devicePixelRatio), 320);
  const heightPx = Math.max(Math.round(groundPlotCanvas.clientHeight * devicePixelRatio), 220);

  if (groundPlotCanvas.width !== widthPx || groundPlotCanvas.height !== heightPx) {
    groundPlotCanvas.width = widthPx;
    groundPlotCanvas.height = heightPx;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(devicePixelRatio, devicePixelRatio);

  const width = widthPx / devicePixelRatio;
  const height = heightPx / devicePixelRatio;
  const maxValuePa = field.valuesPa.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0);
  const minValuePa = field.valuesPa.reduce(function (minValue, value) {
    return Math.min(minValue, value);
  }, Number.POSITIVE_INFINITY);
  const valueSpanPa = Math.max(maxValuePa - minValuePa, 1);
  const scale = Math.min(width * 0.24, height * 0.27);
  const centerX = width * 0.5;
  const baseY = height * 0.84;
  const isoTilt = 0.34;
  const elevationScale = height * 0.28;

  function projectPoint(columnIndex: number, rowIndex: number, valuePa: number) {
    const xRatio = columnIndex / Math.max(field.columns - 1, 1);
    const zRatio = rowIndex / Math.max(field.rows - 1, 1);
    const centeredX = xRatio - 0.5;
    const centeredZ = zRatio - 0.5;
    const normalizedValue = (valuePa - minValuePa) / valueSpanPa;

    return {
      x: centerX + (centeredX - centeredZ) * scale,
      y: baseY + (centeredX + centeredZ) * scale * isoTilt - normalizedValue * elevationScale,
    };
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  context.fillRect(0, 0, width, height);

  const cells: Array<{
    color: string;
    depthKey: number;
    points: Array<{ x: number; y: number }>;
  }> = [];

  for (let rowIndex = 0; rowIndex < field.rows - 1; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < field.columns - 1; columnIndex += 1) {
      const topLeftIndex = rowIndex * field.columns + columnIndex;
      const topRightIndex = topLeftIndex + 1;
      const bottomLeftIndex = topLeftIndex + field.columns;
      const bottomRightIndex = bottomLeftIndex + 1;
      const averageValuePa =
        (field.valuesPa[topLeftIndex] +
          field.valuesPa[topRightIndex] +
          field.valuesPa[bottomLeftIndex] +
          field.valuesPa[bottomRightIndex]) /
        4;

      cells.push({
        color: createGroundPlotColorString(field.colors, topLeftIndex),
        depthKey: rowIndex + columnIndex,
        points: [
          projectPoint(columnIndex, rowIndex, field.valuesPa[topLeftIndex]),
          projectPoint(columnIndex + 1, rowIndex, field.valuesPa[topRightIndex]),
          projectPoint(columnIndex + 1, rowIndex + 1, field.valuesPa[bottomRightIndex]),
          projectPoint(columnIndex, rowIndex + 1, field.valuesPa[bottomLeftIndex]),
        ].map(function (point) {
          return {
            x: point.x,
            y: point.y - ((averageValuePa - minValuePa) / valueSpanPa) * height * 0.002,
          };
        }),
      });
    }
  }

  cells
    .sort(function (leftCell, rightCell) {
      return leftCell.depthKey - rightCell.depthKey;
    })
    .forEach(function (cell) {
      context.beginPath();
      context.moveTo(cell.points[0].x, cell.points[0].y);
      cell.points.slice(1).forEach(function (point) {
        context.lineTo(point.x, point.y);
      });
      context.closePath();
      context.fillStyle = cell.color;
      context.strokeStyle = "rgba(16, 32, 51, 0.12)";
      context.lineWidth = 1;
      context.fill();
      context.stroke();
    });

  const footprintXRatio = currentSection.widthM / Math.max(field.widthM, 1e-6);
  const footprintZRatio = currentSection.depthM / Math.max(field.depthM, 1e-6);
  const footprintColumns = footprintXRatio * (field.columns - 1);
  const footprintRows = footprintZRatio * (field.rows - 1);
  const footprintLeft = (field.columns - 1 - footprintColumns) / 2;
  const footprintTop = (field.rows - 1 - footprintRows) / 2;
  const footprintPoints = [
    projectPoint(footprintLeft, footprintTop, minValuePa),
    projectPoint(footprintLeft + footprintColumns, footprintTop, minValuePa),
    projectPoint(footprintLeft + footprintColumns, footprintTop + footprintRows, minValuePa),
    projectPoint(footprintLeft, footprintTop + footprintRows, minValuePa),
  ];

  context.beginPath();
  context.moveTo(footprintPoints[0].x, footprintPoints[0].y);
  footprintPoints.slice(1).forEach(function (point) {
    context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.strokeStyle = "rgba(16, 32, 51, 0.52)";
  context.setLineDash([6, 5]);
  context.lineWidth = 1.5;
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "rgba(16, 32, 51, 0.76)";
  context.font = "600 12px Avenir Next, Segoe UI, sans-serif";
  context.fillText("pressure", width - 74, 22);
  context.fillText("x", width * 0.72, height - 20);
  context.fillText("z", width * 0.18, height - 20);
}

function buildGroundStressField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  bounds: StressBounds,
  groundDepthM: number,
  sampleY: number,
  columns: number,
  rows: number
): GroundStressField {
  const extent = getGroundFieldExtent(stressState);
  const colors = [];
  const valuesPa = [];
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(bounds.max);

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const zRatio = rowIndex / Math.max(rows - 1, 1);
    const z = extent.depthM / 2 - zRatio * extent.depthM;

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const xRatio = columnIndex / Math.max(columns - 1, 1);
      const x = -extent.widthM / 2 + xRatio * extent.widthM;
      const stressPa = runtimeApi.calculateStressAtPointPa(stressState, {
        groundDepthM,
        x,
        y: sampleY,
        z,
      });
      const ratio = getStressRatio(stressPa, 0, materialScaleMaxPa);
      const color = getStressColor(ratio);

      colors.push(color.r / 255, color.g / 255, color.b / 255);
      valuesPa.push(stressPa);
    }
  }

  return {
    colors,
    columns,
    depthM: extent.depthM,
    rows,
    valuesPa,
    widthM: extent.widthM,
  };
}

function getGroundStressField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  bounds: StressBounds,
  groundDepthM: number
) {
  const sampleY = -stressState.heightM / 2 - GROUND_SURFACE_SAMPLE_OFFSET_M;
  const cacheKey = createGroundFieldCacheKey(
    stressState,
    bounds,
    groundDepthM,
    sampleY,
    GROUND_FIELD_COLUMNS,
    GROUND_FIELD_ROWS
  );

  if (cacheKey === groundFieldCacheKey && groundFieldCache) {
    return groundFieldCache;
  }

  groundFieldCacheKey = cacheKey;
  groundFieldCache = buildGroundStressField(
    runtimeApi,
    stressState,
    bounds,
    groundDepthM,
    sampleY,
    GROUND_FIELD_COLUMNS,
    GROUND_FIELD_ROWS
  );
  return groundFieldCache;
}

function getGroundStressVolumeLayers(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  bounds: StressBounds,
  groundDepthM: number
) {
  const cacheKey = [
    createGroundFieldCacheKey(
      stressState,
      bounds,
      groundDepthM,
      -stressState.heightM / 2 - GROUND_SURFACE_SAMPLE_OFFSET_M,
      GROUND_VOLUME_COLUMNS,
      GROUND_VOLUME_ROWS
    ),
    String(GROUND_VOLUME_SLICE_COUNT),
  ].join("|");

  if (cacheKey === groundVolumeCacheKey && groundVolumeCache) {
    return groundVolumeCache;
  }

  groundVolumeCacheKey = cacheKey;
  groundVolumeCache = Array.from({ length: GROUND_VOLUME_SLICE_COUNT }, function (_, index) {
    const normalizedDepth = (index + 1) / GROUND_VOLUME_SLICE_COUNT;
    const depthBelowSurfaceM = normalizedDepth * groundDepthM;
    const y = -stressState.heightM / 2 - depthBelowSurfaceM;
    const field = buildGroundStressField(
      runtimeApi,
      stressState,
      bounds,
      groundDepthM,
      y,
      GROUND_VOLUME_COLUMNS,
      GROUND_VOLUME_ROWS
    );

    return {
      ...field,
      opacity: 0.18 - normalizedDepth * 0.08,
      yM: y,
    };
  });

  return groundVolumeCache;
}

function updateRuntimeMetrics() {
  if (!runtime) {
    return;
  }

  currentRuntimeMetrics = runtime.getMetrics();
  wasmCallsRate.textContent = formatFixed(currentRuntimeMetrics.callsPerSecond, 1) + " calls/s";
  wasmTotalCalls.textContent = formatRounded(currentRuntimeMetrics.totalCalls);
  wasmPointCalls.textContent = formatRounded(currentRuntimeMetrics.functionCalls.calculateStressAtPointPa);
  wasmCallTime.textContent = formatFixed(currentRuntimeMetrics.averageCallDurationMs, 3) + " ms";
}

function getReadoutStressPa(sectionState: DisplaySectionState) {
  return sectionState.fieldRangeMaxPa;
}

function hideHover() {
  const readoutStressPa = getReadoutStressPa(currentSection);
  const readoutRatio = getStressRatio(
    readoutStressPa,
    currentSection.rangeMinPa,
    currentSection.rangeMaxPa
  );

  hoverCard.classList.remove("is-visible");
  hoverSwatchIndicator.style.width = Math.round(readoutRatio * 100) + "%";
  stressReadoutTitle.textContent = currentSection.sectionLabel;
  stressBarMarker.style.top = (100 - readoutRatio * 100) + "%";
  stressReadoutBody.textContent =
    "Field range is " +
    formatFixed(currentSection.fieldRangeMinPa / 1000, 1) +
    " to " +
    formatFixed(currentSection.fieldRangeMaxPa / 1000, 1) +
    " kPa, while colours are referenced against a 40.0 MPa concrete capacity.";
}

function showHoverProbe(probe: ViewerProbe) {
  if (!runtime) {
    return;
  }

  const totalPa = runtime.calculateStressAtPointPa(currentSection, {
    groundDepthM: currentSection.groundDepthM,
    x: probe.modelPoint.x,
    y: probe.modelPoint.y,
    z: probe.modelPoint.z,
  });
  const selfPa =
    probe.domain === "specimen"
      ? getSelfWeightStressAtLocalYPa(probe.localPoint.y, currentSection)
      : 0;
  const totalKpa = totalPa / 1000;
  const selfKpa = selfPa / 1000;
  const appliedKpa = currentSection.appliedLoadStressPa / 1000;
  const stressRatio = getStressRatio(totalPa, currentSection.rangeMinPa, currentSection.rangeMaxPa);
  const shellRect = diagramShell.getBoundingClientRect();
  const cardWidth = hoverCard.offsetWidth || 220;
  const cardHeight = hoverCard.offsetHeight || 84;
  let left = probe.clientX - shellRect.left + 18;
  let top = probe.clientY - shellRect.top + 18;

  if (left + cardWidth > shellRect.width - 8) {
    left = probe.clientX - shellRect.left - cardWidth - 18;
  }

  if (top + cardHeight > shellRect.height - 8) {
    top = probe.clientY - shellRect.top - cardHeight - 18;
  }

  hoverCard.style.left = Math.max(8, left) + "px";
  hoverCard.style.top = Math.max(8, top) + "px";
  hoverCoords.textContent = probe.coords
    .map(function (coord) {
      return coord.label + " = " + formatFixed(coord.value, 3) + " m";
    })
    .join(", ");

  if (probe.domain === "ground") {
    hoverStress.textContent = "sigma = " + formatFixed(totalKpa, 1) + " kPa on ground surface";
    hoverNote.textContent =
      "Ground surface point. This stress includes transferred load from the prism footprint.";
    stressReadoutTitle.textContent = "Probe on ground";
  } else {
    hoverStress.textContent =
      "sigma = " + formatFixed(totalKpa, 1) + " kPa (" +
      formatFixed(selfKpa, 1) + " self + " + formatFixed(appliedKpa, 1) + " applied)";
    hoverNote.textContent =
      "Specimen surface point. This point sits at " +
      formatFixed(stressRatio * 100, 1) + "% of the concrete reference capacity scale.";
    stressReadoutTitle.textContent = "Probe on specimen";
  }

  hoverSwatchIndicator.style.width = Math.round(stressRatio * 100) + "%";
  stressReadoutBody.textContent =
    "Point stress " + formatFixed(totalKpa, 1) + " kPa. Current field range is " +
    formatFixed(currentSection.fieldRangeMinPa / 1000, 1) + " to " +
    formatFixed(currentSection.fieldRangeMaxPa / 1000, 1) +
    " kPa, coloured against a 40.0 MPa concrete reference.";
  stressBarMarker.style.top = (100 - stressRatio * 100) + "%";
  hoverCard.classList.add("is-visible");
}

function readPositiveValue(input: HTMLInputElement, fallback: number, minValue: number) {
  const parsed = Number.parseFloat(input.value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minValue, parsed);
}

function updateVolumeView(stressState: StressState) {
  const bounds = getFieldStressBounds(stressState);
  const sectionState = getVolumeStressState(bounds);
  const groundDepthM = getGroundDepthM(stressState);
  const groundStressField = getGroundStressField(runtime, stressState, bounds, groundDepthM);
  const groundStressVolumeLayers = getGroundStressVolumeLayers(runtime, stressState, bounds, groundDepthM);
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(bounds.max);
  const stressRatio = getStressRatio(sectionState.representativeStressPa, 0, materialScaleMaxPa);
  const groundSurfaceMinPa = groundStressField.valuesPa.reduce(function (minValue, value) {
    return Math.min(minValue, value);
  }, Number.POSITIVE_INFINITY);
  const groundSurfaceMaxPa = groundStressField.valuesPa.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0);

  currentSection = {
    ...stressState,
    fieldRangeMaxPa: bounds.max,
    fieldRangeMinPa: bounds.min,
    groundDepthM,
    rangeMaxPa: materialScaleMaxPa,
    rangeMinPa: 0,
    sectionLabel: "Whole volume",
  };

  sectionDimensions.textContent =
    formatFixed(stressState.widthM, 2) + " x " +
    formatFixed(stressState.heightM, 2) + " x " +
    formatFixed(stressState.depthM, 2) + " m prism";
  ratioLabel.textContent =
    "Field " + formatFixed(bounds.min / 1000, 1) + " to " +
    formatFixed(bounds.max / 1000, 1) + " kPa";
  stressRangeMax.textContent = formatFixed(materialScaleMaxPa / 1_000_000, 1) + " MPa";
  stressRangeMid.textContent = formatFixed(bounds.max / 1000, 1) + " kPa";
  stressRangeMin.textContent = "0.0 kPa";
  stressBarMarker.style.top = (100 - stressRatio * 100) + "%";
  hoverSwatchIndicator.style.width = Math.round(stressRatio * 100) + "%";
  stressReadoutTitle.textContent = "Whole volume gradient";
  currentGroundSurfaceField = groundStressField;
  groundPlotRange.textContent =
    "Surface range " +
    formatFixed(groundSurfaceMinPa / 1000, 1) +
    " to " +
    formatFixed(groundSurfaceMaxPa / 1000, 1) +
    " kPa";
  groundPlotFootprint.textContent =
    "Loaded footprint " +
    formatFixed(stressState.widthM, 2) +
    " x " +
    formatFixed(stressState.depthM, 2) +
    " m";

  viewer.update({
    depthM: stressState.depthM,
    groundStressVolumeLayers,
    heightM: stressState.heightM,
    sectionBottomColorCss: sectionState.sectionBottomColorCss,
    sectionGradientMode: sectionState.sectionGradientMode,
    sectionTopColorCss: sectionState.sectionTopColorCss,
    sectionUniformColorCss: sectionState.sectionUniformColorCss,
    groundStressField,
    showReferenceFigure: viewerEnvironment.showFigure,
    showSection: false,
    showGround: viewerEnvironment.showGround,
    showGroundVolume: viewerEnvironment.showGroundVolume,
    showReferenceHouse: viewerEnvironment.showHouse,
    showSky: viewerEnvironment.showSky,
    volumeBottomColorCss: sectionState.volumeBottomColorCss,
    volumeSliceCount: 18,
    volumeTopColorCss: sectionState.volumeTopColorCss,
    widthM: stressState.widthM,
  });

  drawGroundSurfacePlot();
  hideHover();
  requestViewportHeightSync();
}

let runtime: ConcreteStressRuntime | null = null;

function render() {
  if (!runtime) {
    return;
  }

  const inputs: StressInputs = {
    appliedLoadN: Math.max(0, readPositiveValue(appliedLoad, 2500, 0)),
    densityKgM3: readPositiveValue(density, 2400, 100),
    depthM: readPositiveValue(depth, 0.1, 0.01),
    heightM: readPositiveValue(height, 1, 0.01),
    widthM: readPositiveValue(width, 0.1, 0.01),
  };
  const stressState = calculateStressState(runtime, inputs);

  output.textContent = "";
  runtime.printStressReport(inputs);

  stressKpa.textContent = formatFixed(stressState.combinedStressPa / 1000, 1);
  selfWeightValue.textContent = formatForce(stressState.selfWeightN);
  appliedLoadValue.textContent = formatForce(stressState.appliedLoadN);
  massValue.textContent = formatFixed(stressState.massKg, 1) + " kg";
  areaSummary.textContent = formatFixed(stressState.areaM2, 4) + " m^2";
  volumeSummary.textContent = formatFixed(stressState.volumeM3, 4) + " m^3";

  updateVolumeView(stressState);
  updateRuntimeMetrics();
}

async function boot() {
  try {
    runtime = await loadConcreteStressRuntime({
      basePath: "/wasm",
      onStdout(text) {
        output.textContent += text + "\n";
      },
      onStderr(text) {
        output.textContent += "[stderr] " + text + "\n";
      },
    });
  } catch (error) {
    output.textContent = String(error);
    throw error;
  }

  width.addEventListener("input", render);
  depth.addEventListener("input", render);
  height.addEventListener("input", render);
  density.addEventListener("input", render);
  appliedLoad.addEventListener("input", render);
  toggleGround.addEventListener("click", function () {
    viewerEnvironment.showGround = !viewerEnvironment.showGround;
    applyViewerEnvironment();
  });
  toggleGroundVolume.addEventListener("click", function () {
    viewerEnvironment.showGroundVolume = !viewerEnvironment.showGroundVolume;
    applyViewerEnvironment();
  });
  toggleSky.addEventListener("click", function () {
    viewerEnvironment.showSky = !viewerEnvironment.showSky;
    applyViewerEnvironment();
  });
  toggleHouse.addEventListener("click", function () {
    viewerEnvironment.showHouse = !viewerEnvironment.showHouse;
    applyViewerEnvironment();
  });
  toggleFigure.addEventListener("click", function () {
    viewerEnvironment.showFigure = !viewerEnvironment.showFigure;
    applyViewerEnvironment();
  });
  collapsibleCards.forEach(function (card) {
    card.addEventListener("toggle", requestViewportHeightSync);
  });

  window.addEventListener("resize", function () {
    requestViewportHeightSync();
    drawGroundSurfacePlot();
  });

  if (typeof windowedLayoutQuery.addEventListener === "function") {
    windowedLayoutQuery.addEventListener("change", requestViewportHeightSync);
  } else if (typeof windowedLayoutQuery.addListener === "function") {
    windowedLayoutQuery.addListener(requestViewportHeightSync);
  }

  syncViewerEnvironmentControls();
  runtimeMetricsTimer = window.setInterval(updateRuntimeMetrics, 250);
  render();
}

boot();
