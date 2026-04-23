import "./styles.css";

import {
  createConcreteStressViewer,
  type GroundStressField,
  type GroundStressVolumeLayer,
  type ViewerProbe,
} from "./viewer";
import {
  calculateStressState,
  loadConcreteStressRuntime,
  type ConcreteStressRuntime,
  type RuntimeCallMetrics,
  type StressInputs,
  type StressState,
} from "@webjenga/wasm-bridge";

type ThemeMode = "dark" | "light";

interface ViewerEnvironmentState {
  showFigure: boolean;
  showGround: boolean;
  showGroundVolume: boolean;
  showHouse: boolean;
  showSky: boolean;
}

interface VerticalSectionState {
  axis: "xz" | "yz";
  offsetRatio: number;
  showPlane: boolean;
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

interface VerticalSectionField extends GroundStressField {
  axis: "xz" | "yz";
  offsetM: number;
  horizontalLabel: "x" | "z";
  yMaxM: number;
  yMinM: number;
}

interface StressFlowSelection {
  axis: "xz" | "yz";
  horizontalM: number;
  rowIndex: number;
  stressPa: number;
  valueIndex: number;
  yM: number;
}

interface VerticalPlotLayout {
  height: number;
  insetBottom: number;
  insetLeft: number;
  insetRight: number;
  insetTop: number;
  plotHeight: number;
  plotWidth: number;
  width: number;
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
              <button class="viewport-button" id="theme-toggle" type="button">Dark mode</button>
              <button class="viewport-button" id="viewport-fullscreen" type="button">Enter fullscreen</button>
            </div>
          </div>
        </header>

        <section class="overlay-card overlay-card--left">
          <div class="overlay-card__header">
            <h2>Model inputs</h2>
            <p>Geometry and coupled elastic model</p>
          </div>
          <div class="collapse-stack">
            <details class="collapse-card" open>
              <summary>
                <span class="collapse-card__title">
                  <strong>Geometry and load</strong>
                  <span>Edit the prism size, density, and applied axial force.</span>
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
                  <strong>Elastic materials</strong>
                  <span>Specimen and ground stiffness drive the coupled contact boundary.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="field-grid">
                  <div class="field">
                    <label for="specimen-e">Specimen E (MPa)</label>
                    <input id="specimen-e" type="number" min="100" step="100" value="30000" />
                  </div>
                  <div class="field">
                    <label for="specimen-nu">Specimen nu</label>
                    <input id="specimen-nu" type="number" min="0.01" max="0.49" step="0.01" value="0.20" />
                  </div>
                  <div class="field">
                    <label for="ground-e">Ground E (MPa)</label>
                    <input id="ground-e" type="number" min="1" step="10" value="120" />
                  </div>
                  <div class="field">
                    <label for="ground-nu">Ground nu</label>
                    <input id="ground-nu" type="number" min="0.01" max="0.49" step="0.01" value="0.30" />
                  </div>
                </div>
              </div>
            </details>
            <details class="collapse-card">
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
                  <strong>Vertical section</strong>
                  <span>Inspect a live XZ or YZ slice through the specimen and ground.</span>
                </span>
              </summary>
              <div class="collapse-card__body">
                <div class="field">
                  <label for="vertical-section-axis">Section plane</label>
                  <select id="vertical-section-axis">
                    <option value="xz">XZ section</option>
                    <option value="yz">YZ section</option>
                  </select>
                </div>
                <div class="field">
                  <label for="vertical-section-offset">Section offset</label>
                  <input id="vertical-section-offset" type="range" min="0" max="1" step="0.01" value="0.50" />
                  <span class="field-note" id="vertical-section-offset-label">50% through the depth</span>
                </div>
                <div class="toggle-row">
                  <button class="toggle-chip" id="toggle-section-plane" type="button">Show plane</button>
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
            <details class="collapse-card">
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

        <section class="overlay-card overlay-card--section">
          <div class="section-callout__header">
            <div>
              <p class="eyebrow eyebrow--card">Section overlay</p>
              <h2>Coupled specimen-ground section</h2>
            </div>
            <p id="vertical-plot-summary">XZ section at the depth mid-plane.</p>
          </div>
          <div class="ground-plot-frame ground-plot-frame--overlay">
            <canvas id="vertical-plot-canvas" aria-label="Vertical subsurface stress plot"></canvas>
          </div>
          <div class="ground-plot-meta ground-plot-meta--overlay">
            <span id="vertical-plot-range">Section range 0.0 to 0.0 kPa</span>
            <span id="vertical-plot-position">XZ section at z = 0.050 m</span>
          </div>
          <div class="stress-flow-callout">
            <strong id="stress-flow-title">Stress flow</strong>
            <span id="stress-flow-body">Click a point in the section overlay to trace compression from the top face into the ground.</span>
          </div>
        </section>
      </div>
    </section>

    <section class="insights-shell">
      <details class="insight-card insight-card--plot">
        <summary>Ground-surface stress plot</summary>
        <div class="insight-card__body">
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
        </div>
      </details>
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
const specimenE = document.getElementById("specimen-e") as HTMLInputElement;
const specimenNu = document.getElementById("specimen-nu") as HTMLInputElement;
const groundE = document.getElementById("ground-e") as HTMLInputElement;
const groundNu = document.getElementById("ground-nu") as HTMLInputElement;
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
const sectionOverlayCard = document.querySelector(".overlay-card--section");
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
const themeToggle = document.getElementById("theme-toggle");
const toggleGround = document.getElementById("toggle-ground");
const toggleGroundVolume = document.getElementById("toggle-ground-volume");
const toggleSky = document.getElementById("toggle-sky");
const toggleHouse = document.getElementById("toggle-house");
const toggleFigure = document.getElementById("toggle-figure");
const verticalSectionAxis = document.getElementById("vertical-section-axis") as HTMLSelectElement;
const verticalSectionOffset = document.getElementById("vertical-section-offset") as HTMLInputElement;
const verticalSectionOffsetLabel = document.getElementById("vertical-section-offset-label");
const toggleSectionPlane = document.getElementById("toggle-section-plane");
const wasmCallsRate = document.getElementById("wasm-calls-rate");
const wasmTotalCalls = document.getElementById("wasm-total-calls");
const wasmPointCalls = document.getElementById("wasm-point-calls");
const wasmCallTime = document.getElementById("wasm-call-time");
const groundPlotCanvas = document.getElementById("ground-plot-canvas") as HTMLCanvasElement;
const groundPlotRange = document.getElementById("ground-plot-range");
const groundPlotFootprint = document.getElementById("ground-plot-footprint");
const verticalPlotCanvas = document.getElementById("vertical-plot-canvas") as HTMLCanvasElement;
const verticalPlotRange = document.getElementById("vertical-plot-range");
const verticalPlotPosition = document.getElementById("vertical-plot-position");
const verticalPlotSummary = document.getElementById("vertical-plot-summary");
const stressFlowTitle = document.getElementById("stress-flow-title");
const stressFlowBody = document.getElementById("stress-flow-body");
const collapsibleCards = Array.from(document.querySelectorAll(".collapse-card"));

const VIEWER_ENV_STORAGE_KEY = "webjenga.viewer.environment";
const THEME_STORAGE_KEY = "webjenga.theme";
const VERTICAL_SECTION_STORAGE_KEY = "webjenga.vertical-section";
const windowedLayoutQuery = window.matchMedia("(max-width: 980px)");

function resolveInitialTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch (error) {
    // Ignore storage failures and fall back to the system preference.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

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

function loadVerticalSectionState(): VerticalSectionState {
  try {
    const raw = window.localStorage.getItem(VERTICAL_SECTION_STORAGE_KEY);

    if (!raw) {
      return { axis: "xz", offsetRatio: 0.5, showPlane: true };
    }

    const parsed = JSON.parse(raw);

    return {
      axis: parsed.axis === "yz" ? "yz" : "xz",
      offsetRatio: clamp(Number(parsed.offsetRatio) || 0.5, 0, 1),
      showPlane: parsed.showPlane !== false,
    };
  } catch (error) {
    return { axis: "xz", offsetRatio: 0.5, showPlane: true };
  }
}

function saveViewerEnvironment(environment: ViewerEnvironmentState) {
  try {
    window.localStorage.setItem(VIEWER_ENV_STORAGE_KEY, JSON.stringify(environment));
  } catch (error) {
    // Ignore storage failures; the toggles still work for the current session.
  }
}

function saveVerticalSectionState(sectionState: VerticalSectionState) {
  try {
    window.localStorage.setItem(VERTICAL_SECTION_STORAGE_KEY, JSON.stringify(sectionState));
  } catch (error) {
    // Ignore storage failures; the controls still work for the current session.
  }
}

const viewerEnvironment = loadViewerEnvironment();
let currentTheme: ThemeMode = resolveInitialTheme();
const verticalSectionState = loadVerticalSectionState();
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
  const heightBoundaries = [viewportHead, leftOverlayCard, rightOverlayCard, sectionOverlayCard];

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
  groundPoissonRatio: 0.3,
  groundYoungsModulusMpa: 120,
  groundDepthM: 1.5,
  heightM: 1,
  massKg: 24,
  rangeMaxPa: 500000,
  rangeMinPa: 0,
  sectionLabel: "Whole volume",
  selfWeightN: 0,
  selfWeightStressPa: 0,
  specimenPoissonRatio: 0.2,
  specimenYoungsModulusMpa: 30000,
  volumeM3: 0.01,
  widthM: 0.1,
} as DisplaySectionState;
let groundFieldCacheKey = "";
let groundFieldCache: GroundStressField | null = null;
let groundVolumeCacheKey = "";
let groundVolumeCache: GroundStressVolumeLayer[] | null = null;
let verticalSectionCacheKey = "";
let verticalSectionCache: VerticalSectionField | null = null;
let currentGroundSurfaceField: GroundStressField | null = null;
let currentVerticalSectionField: VerticalSectionField | null = null;
let currentStressFlowSelection: StressFlowSelection | null = null;
let currentVerticalPlotLayout: VerticalPlotLayout | null = null;
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

function updateThemeButton() {
  themeToggle.textContent = currentTheme === "dark" ? "Light mode" : "Dark mode";
}

function readThemeCssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme() {
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.style.colorScheme = currentTheme;
  updateThemeButton();
  viewer.update({
    theme: currentTheme,
  });
  drawGroundSurfacePlot();
  drawVerticalSectionPlot();
}

function syncViewerEnvironmentControls() {
  setToggleState(toggleFigure, viewerEnvironment.showFigure);
  setToggleState(toggleGround, viewerEnvironment.showGround);
  setToggleState(toggleGroundVolume, viewerEnvironment.showGroundVolume);
  setToggleState(toggleHouse, viewerEnvironment.showHouse);
  setToggleState(toggleSectionPlane, verticalSectionState.showPlane);
  setToggleState(toggleSky, viewerEnvironment.showSky);
  verticalSectionAxis.value = verticalSectionState.axis;
  verticalSectionOffset.value = String(verticalSectionState.offsetRatio);
  const offsetPercent = Math.round(verticalSectionState.offsetRatio * 100);
  verticalSectionOffsetLabel.textContent =
    verticalSectionState.axis === "xz"
      ? offsetPercent + "% through the depth"
      : offsetPercent + "% through the width";
}

function applyViewerEnvironment() {
  syncViewerEnvironmentControls();
  saveViewerEnvironment(viewerEnvironment);
  saveVerticalSectionState(verticalSectionState);
  viewer.update({
    sectionAxis: verticalSectionState.axis,
    sectionOffsetRatio: verticalSectionState.offsetRatio,
    showReferenceFigure: viewerEnvironment.showFigure,
    showGround: viewerEnvironment.showGround,
    showGroundVolume: viewerEnvironment.showGroundVolume,
    showReferenceHouse: viewerEnvironment.showHouse,
    showSection: verticalSectionState.showPlane,
    showSky: viewerEnvironment.showSky,
    theme: currentTheme,
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
    formatFixed(stressState.specimenYoungsModulusMpa, 1),
    formatFixed(stressState.specimenPoissonRatio, 3),
    formatFixed(stressState.groundYoungsModulusMpa, 1),
    formatFixed(stressState.groundPoissonRatio, 3),
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
  const plotBackground = readThemeCssVar("--plot-bg");
  const plotStroke = readThemeCssVar("--plot-stroke");
  const plotText = readThemeCssVar("--plot-text");
  const plotFootprint = readThemeCssVar("--plot-footprint");

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
  context.fillStyle = plotBackground;
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
      context.strokeStyle = plotStroke;
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
  context.strokeStyle = plotFootprint;
  context.setLineDash([6, 5]);
  context.lineWidth = 1.5;
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = plotText;
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

function buildVerticalSectionField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  bounds: StressBounds,
  groundDepthM: number,
  sectionState: VerticalSectionState,
  columns: number,
  rows: number
): VerticalSectionField {
  const extent = getGroundFieldExtent(stressState);
  const horizontalLabel = sectionState.axis === "xz" ? "x" : "z";
  const spanM = sectionState.axis === "xz" ? extent.widthM : extent.depthM;
  const perpendicularSpanM = sectionState.axis === "xz" ? stressState.depthM : stressState.widthM;
  const offsetM = -perpendicularSpanM / 2 + sectionState.offsetRatio * perpendicularSpanM;
  const valuesPa = [];
  const colors = [];
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(bounds.max);
  const yMaxM = stressState.heightM / 2;
  const yMinM = -groundDepthM - stressState.heightM / 2;

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const yRatio = rowIndex / Math.max(rows - 1, 1);
    const y = yMaxM - yRatio * (yMaxM - yMinM);

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const horizontalRatio = columnIndex / Math.max(columns - 1, 1);
      const horizontal = -spanM / 2 + horizontalRatio * spanM;
      const point =
        sectionState.axis === "xz"
          ? { x: horizontal, y, z: offsetM }
          : { x: offsetM, y, z: horizontal };
      const stressPa = runtimeApi.calculateStressAtPointPa(stressState, {
        groundDepthM,
        ...point,
      });
      const ratio = getStressRatio(stressPa, 0, materialScaleMaxPa);
      const color = getStressColor(ratio);

      colors.push(color.r / 255, color.g / 255, color.b / 255);
      valuesPa.push(stressPa);
    }
  }

  return {
    axis: sectionState.axis,
    colors,
    columns,
    depthM: stressState.depthM,
    horizontalLabel,
    offsetM,
    rows,
    valuesPa,
    widthM: spanM,
    yMaxM,
    yMinM,
  };
}

function getVerticalSectionField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  bounds: StressBounds,
  groundDepthM: number,
  sectionState: VerticalSectionState
) {
  const cacheKey = [
    createGroundFieldCacheKey(
      stressState,
      bounds,
      groundDepthM,
      sectionState.offsetRatio,
      37,
      49
    ),
    sectionState.axis,
    String(sectionState.offsetRatio),
  ].join("|");

  if (cacheKey === verticalSectionCacheKey && verticalSectionCache) {
    return verticalSectionCache;
  }

  verticalSectionCacheKey = cacheKey;
  verticalSectionCache = buildVerticalSectionField(
    runtimeApi,
    stressState,
    bounds,
    groundDepthM,
    sectionState,
    37,
    49
  );
  return verticalSectionCache;
}

function projectVerticalPlotPoint(
  field: VerticalSectionField,
  layout: VerticalPlotLayout,
  horizontalM: number,
  yM: number
) {
  return {
    x:
      layout.insetLeft +
      ((horizontalM + field.widthM / 2) / Math.max(field.widthM, 1e-6)) * layout.plotWidth,
    y:
      layout.insetTop +
      ((field.yMaxM - yM) / Math.max(field.yMaxM - field.yMinM, 1e-6)) * layout.plotHeight,
  };
}

function syncStressFlowSelection() {
  const field = currentVerticalSectionField;

  if (!runtime || !field || !currentStressFlowSelection || currentStressFlowSelection.axis !== field.axis) {
    currentStressFlowSelection = null;
    stressFlowTitle.textContent = "Stress flow";
    stressFlowBody.textContent =
      "Click a point in the section overlay to trace compression from the top face into the ground.";
    viewer.update({
      stressFlowPath: null,
    });
    return;
  }

  const horizontalLabel = field.horizontalLabel;
  const offsetLabel =
    field.axis === "xz"
      ? "z = " + formatFixed(field.offsetM + currentSection.depthM / 2, 3) + " m"
      : "x = " + formatFixed(field.offsetM + currentSection.widthM / 2, 3) + " m";
  const pointCoordinate =
    horizontalLabel + " = " + formatFixed(currentStressFlowSelection.horizontalM + field.widthM / 2, 3) + " m";
  const pointStressKpa = currentStressFlowSelection.stressPa / 1000;
  const pointCoordinates =
    field.axis === "xz"
      ? {
          x: currentStressFlowSelection.horizontalM,
          z: field.offsetM,
        }
      : {
          x: field.offsetM,
          z: currentStressFlowSelection.horizontalM,
        };
  const topStressPa = runtime.calculateStressAtPointPa(currentSection, {
    groundDepthM: currentSection.groundDepthM,
    x: pointCoordinates.x,
    y: currentSection.heightM / 2 - 0.0005,
    z: pointCoordinates.z,
  });
  const baseStressPa = runtime.calculateStressAtPointPa(currentSection, {
    groundDepthM: currentSection.groundDepthM,
    x: pointCoordinates.x,
    y: -currentSection.heightM / 2 + 0.0005,
    z: pointCoordinates.z,
  });
  const groundStressPa = runtime.calculateStressAtPointPa(currentSection, {
    groundDepthM: currentSection.groundDepthM,
    x: pointCoordinates.x,
    y: -currentSection.heightM / 2 - currentSection.groundDepthM * 0.55,
    z: pointCoordinates.z,
  });

  stressFlowTitle.textContent = pointCoordinate + ", " + offsetLabel;
  stressFlowBody.textContent =
    "Top " +
    formatFixed(topStressPa / 1000, 1) +
    " kPa, selected " +
    formatFixed(pointStressKpa, 1) +
    " kPa, base " +
    formatFixed(baseStressPa / 1000, 1) +
    " kPa, ground " +
    formatFixed(groundStressPa / 1000, 1) +
    " kPa.";
  viewer.update({
    stressFlowPath: {
      axis: field.axis,
      groundY: -currentSection.heightM / 2 - currentSection.groundDepthM * 0.82,
      horizontalM: currentStressFlowSelection.horizontalM,
      offsetM: field.offsetM,
      pointY: currentStressFlowSelection.yM,
      topY: currentSection.heightM / 2,
    },
  });
}

function drawVerticalSectionPlot() {
  const context = verticalPlotCanvas.getContext("2d");
  const field = currentVerticalSectionField;

  if (!context || !field) {
    return;
  }

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const widthPx = Math.max(Math.round(verticalPlotCanvas.clientWidth * devicePixelRatio), 320);
  const heightPx = Math.max(Math.round(verticalPlotCanvas.clientHeight * devicePixelRatio), 240);

  if (verticalPlotCanvas.width !== widthPx || verticalPlotCanvas.height !== heightPx) {
    verticalPlotCanvas.width = widthPx;
    verticalPlotCanvas.height = heightPx;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(devicePixelRatio, devicePixelRatio);

  const width = widthPx / devicePixelRatio;
  const height = heightPx / devicePixelRatio;
  const plotBackground = readThemeCssVar("--plot-bg");
  const plotStroke = readThemeCssVar("--plot-stroke");
  const plotText = readThemeCssVar("--plot-text");
  const plotFootprint = readThemeCssVar("--plot-footprint");
  const flowStroke = readThemeCssVar("--accent");
  const flowFill = readThemeCssVar("--accent-2");
  const insetLeft = 46;
  const insetRight = 14;
  const insetTop = 14;
  const insetBottom = 24;
  const plotWidth = width - insetLeft - insetRight;
  const plotHeight = height - insetTop - insetBottom;
  const cellWidth = plotWidth / field.columns;
  const cellHeight = plotHeight / field.rows;
  const groundSurfaceRatio =
    (field.yMaxM - (-currentSection.heightM / 2)) / Math.max(field.yMaxM - field.yMinM, 1e-6);
  const groundSurfaceY = insetTop + plotHeight * groundSurfaceRatio;
  const specimenHorizontalSpan = field.axis === "xz" ? currentSection.widthM : currentSection.depthM;
  const specimenLeft =
    insetLeft +
    ((field.widthM / 2 - specimenHorizontalSpan / 2) / Math.max(field.widthM, 1e-6)) * plotWidth;
  const specimenRight =
    insetLeft +
    ((field.widthM / 2 + specimenHorizontalSpan / 2) / Math.max(field.widthM, 1e-6)) * plotWidth;
  const specimenTop = insetTop;
  const specimenBottom = groundSurfaceY;

  currentVerticalPlotLayout = {
    height,
    insetBottom,
    insetLeft,
    insetRight,
    insetTop,
    plotHeight,
    plotWidth,
    width,
  };

  context.clearRect(0, 0, width, height);
  context.fillStyle = plotBackground;
  context.fillRect(0, 0, width, height);

  for (let rowIndex = 0; rowIndex < field.rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < field.columns; columnIndex += 1) {
      const valueIndex = rowIndex * field.columns + columnIndex;
      context.fillStyle = createGroundPlotColorString(field.colors, valueIndex);
      context.fillRect(
        insetLeft + columnIndex * cellWidth,
        insetTop + rowIndex * cellHeight,
        cellWidth + 0.75,
        cellHeight + 0.75
      );
    }
  }

  context.strokeStyle = plotStroke;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(insetLeft, groundSurfaceY);
  context.lineTo(width - insetRight, groundSurfaceY);
  context.stroke();

  context.strokeStyle = plotFootprint;
  context.setLineDash([6, 4]);
  context.strokeRect(specimenLeft, specimenTop, specimenRight - specimenLeft, specimenBottom - specimenTop);
  context.setLineDash([]);

  const selectedPoint =
    currentStressFlowSelection && currentStressFlowSelection.axis === field.axis
      ? projectVerticalPlotPoint(
          field,
          currentVerticalPlotLayout,
          currentStressFlowSelection.horizontalM,
          currentStressFlowSelection.yM
        )
      : null;

  if (selectedPoint) {
    const basePoint = projectVerticalPlotPoint(
      field,
      currentVerticalPlotLayout,
      currentStressFlowSelection.horizontalM,
      -currentSection.heightM / 2
    );
    const topPoint = projectVerticalPlotPoint(
      field,
      currentVerticalPlotLayout,
      currentStressFlowSelection.horizontalM,
      currentSection.heightM / 2
    );
    const bottomPoint = projectVerticalPlotPoint(
      field,
      currentVerticalPlotLayout,
      currentStressFlowSelection.horizontalM,
      field.yMinM
    );

    context.strokeStyle = flowStroke;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(topPoint.x, topPoint.y);
    context.lineTo(selectedPoint.x, selectedPoint.y);
    context.lineTo(basePoint.x, basePoint.y);
    context.stroke();

    context.beginPath();
    context.moveTo(basePoint.x, basePoint.y);
    context.lineTo(basePoint.x, bottomPoint.y - 14);
    context.stroke();

    context.beginPath();
    context.moveTo(basePoint.x, basePoint.y);
    context.lineTo(basePoint.x - 24, bottomPoint.y);
    context.moveTo(basePoint.x, basePoint.y);
    context.lineTo(basePoint.x + 24, bottomPoint.y);
    context.stroke();

    context.fillStyle = flowFill;
    context.beginPath();
    context.arc(selectedPoint.x, selectedPoint.y, 5.5, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = flowStroke;
    context.stroke();

    context.beginPath();
    context.moveTo(selectedPoint.x, selectedPoint.y - 15);
    context.lineTo(selectedPoint.x, selectedPoint.y + 15);
    context.moveTo(selectedPoint.x - 10, selectedPoint.y);
    context.lineTo(selectedPoint.x + 10, selectedPoint.y);
    context.stroke();

    context.beginPath();
    context.moveTo(selectedPoint.x, selectedPoint.y - 15);
    context.lineTo(selectedPoint.x - 4, selectedPoint.y - 8);
    context.moveTo(selectedPoint.x, selectedPoint.y - 15);
    context.lineTo(selectedPoint.x + 4, selectedPoint.y - 8);
    context.moveTo(selectedPoint.x, selectedPoint.y + 15);
    context.lineTo(selectedPoint.x - 4, selectedPoint.y + 8);
    context.moveTo(selectedPoint.x, selectedPoint.y + 15);
    context.lineTo(selectedPoint.x + 4, selectedPoint.y + 8);
    context.stroke();
  }

  context.fillStyle = plotText;
  context.font = "600 11px Avenir Next, Segoe UI, sans-serif";
  context.fillText("sigma", 12, 16);
  context.fillText(field.horizontalLabel, width - insetRight - 8, height - 6);
  context.save();
  context.translate(14, height * 0.58);
  context.rotate(-Math.PI / 2);
  context.fillText("y", 0, 0);
  context.restore();
  context.fillText("ground", insetLeft + 6, groundSurfaceY + 14);
  context.fillText("specimen", specimenLeft + 6, specimenTop + 14);
}

function handleVerticalPlotSelection(event: MouseEvent) {
  const field = currentVerticalSectionField;
  const layout = currentVerticalPlotLayout;

  if (!field || !layout) {
    return;
  }

  const rect = verticalPlotCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (
    x < layout.insetLeft ||
    x > layout.width - layout.insetRight ||
    y < layout.insetTop ||
    y > layout.height - layout.insetBottom
  ) {
    return;
  }

  const columnIndex = clamp(
    Math.floor(((x - layout.insetLeft) / Math.max(layout.plotWidth, 1e-6)) * field.columns),
    0,
    field.columns - 1
  );
  const rowIndex = clamp(
    Math.floor(((y - layout.insetTop) / Math.max(layout.plotHeight, 1e-6)) * field.rows),
    0,
    field.rows - 1
  );
  const horizontalM = -field.widthM / 2 + (columnIndex / Math.max(field.columns - 1, 1)) * field.widthM;
  const yM = field.yMaxM - (rowIndex / Math.max(field.rows - 1, 1)) * (field.yMaxM - field.yMinM);
  const valueIndex = rowIndex * field.columns + columnIndex;

  if (
    currentStressFlowSelection &&
    currentStressFlowSelection.axis === field.axis &&
    currentStressFlowSelection.valueIndex === valueIndex
  ) {
    currentStressFlowSelection = null;
  } else {
    currentStressFlowSelection = {
      axis: field.axis,
      horizontalM,
      rowIndex,
      stressPa: field.valuesPa[valueIndex],
      valueIndex,
      yM,
    };
  }

  syncStressFlowSelection();
  drawVerticalSectionPlot();
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

function readClampedValue(
  input: HTMLInputElement,
  fallback: number,
  minValue: number,
  maxValue: number
) {
  const parsed = Number.parseFloat(input.value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, minValue, maxValue);
}

function updateVolumeView(stressState: StressState) {
  const bounds = getFieldStressBounds(stressState);
  const sectionState = getVolumeStressState(bounds);
  const groundDepthM = getGroundDepthM(stressState);
  const groundStressField = getGroundStressField(runtime, stressState, bounds, groundDepthM);
  const groundStressVolumeLayers = getGroundStressVolumeLayers(runtime, stressState, bounds, groundDepthM);
  const verticalSectionField = getVerticalSectionField(
    runtime,
    stressState,
    bounds,
    groundDepthM,
    verticalSectionState
  );
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(bounds.max);
  const stressRatio = getStressRatio(sectionState.representativeStressPa, 0, materialScaleMaxPa);
  const groundSurfaceMinPa = groundStressField.valuesPa.reduce(function (minValue, value) {
    return Math.min(minValue, value);
  }, Number.POSITIVE_INFINITY);
  const groundSurfaceMaxPa = groundStressField.valuesPa.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0);
  const verticalMinPa = verticalSectionField.valuesPa.reduce(function (minValue, value) {
    return Math.min(minValue, value);
  }, Number.POSITIVE_INFINITY);
  const verticalMaxPa = verticalSectionField.valuesPa.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0);
  const sectionOffsetLabel =
    verticalSectionState.axis === "xz"
      ? "z = " + formatFixed(verticalSectionField.offsetM + stressState.depthM / 2, 3) + " m"
      : "x = " + formatFixed(verticalSectionField.offsetM + stressState.widthM / 2, 3) + " m";

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
  currentVerticalSectionField = verticalSectionField;
  verticalPlotSummary.textContent =
    (verticalSectionState.axis === "xz" ? "XZ" : "YZ") +
    " section through the coupled specimen-ground field.";
  verticalPlotRange.textContent =
    "Section range " +
    formatFixed(verticalMinPa / 1000, 1) +
    " to " +
    formatFixed(verticalMaxPa / 1000, 1) +
    " kPa";
  verticalPlotPosition.textContent =
    (verticalSectionState.axis === "xz" ? "XZ" : "YZ") +
    " section at " +
    sectionOffsetLabel;
  saveVerticalSectionState(verticalSectionState);

  viewer.update({
    depthM: stressState.depthM,
    groundStressVolumeLayers,
    heightM: stressState.heightM,
    sectionAxis: verticalSectionState.axis,
    sectionBottomColorCss: sectionState.sectionBottomColorCss,
    sectionGradientMode: sectionState.sectionGradientMode,
    sectionOffsetRatio: verticalSectionState.offsetRatio,
    sectionTopColorCss: sectionState.sectionTopColorCss,
    sectionUniformColorCss: sectionState.sectionUniformColorCss,
    groundStressField,
    showReferenceFigure: viewerEnvironment.showFigure,
    showSection: verticalSectionState.showPlane,
    showGround: viewerEnvironment.showGround,
    showGroundVolume: viewerEnvironment.showGroundVolume,
    showReferenceHouse: viewerEnvironment.showHouse,
    showSky: viewerEnvironment.showSky,
    theme: currentTheme,
    volumeBottomColorCss: sectionState.volumeBottomColorCss,
    volumeSliceCount: 18,
    volumeTopColorCss: sectionState.volumeTopColorCss,
    widthM: stressState.widthM,
  });

  syncStressFlowSelection();
  drawGroundSurfacePlot();
  drawVerticalSectionPlot();
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
    groundPoissonRatio: readClampedValue(groundNu, 0.3, 0.01, 0.49),
    groundYoungsModulusMpa: readPositiveValue(groundE, 120, 1),
    heightM: readPositiveValue(height, 1, 0.01),
    specimenPoissonRatio: readClampedValue(specimenNu, 0.2, 0.01, 0.49),
    specimenYoungsModulusMpa: readPositiveValue(specimenE, 30000, 100),
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
  specimenE.addEventListener("input", render);
  specimenNu.addEventListener("input", render);
  groundE.addEventListener("input", render);
  groundNu.addEventListener("input", render);
  themeToggle.addEventListener("click", function () {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
    } catch (error) {
      // Ignore storage failures; the theme still changes for the current session.
    }
    applyTheme();
  });
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
  toggleSectionPlane.addEventListener("click", function () {
    verticalSectionState.showPlane = !verticalSectionState.showPlane;
    applyViewerEnvironment();
  });
  verticalSectionAxis.addEventListener("input", function () {
    verticalSectionState.axis = verticalSectionAxis.value === "yz" ? "yz" : "xz";
    syncViewerEnvironmentControls();
    render();
  });
  verticalSectionOffset.addEventListener("input", function () {
    verticalSectionState.offsetRatio = clamp(Number(verticalSectionOffset.value), 0, 1);
    syncViewerEnvironmentControls();
    render();
  });
  verticalPlotCanvas.addEventListener("click", handleVerticalPlotSelection);
  collapsibleCards.forEach(function (card) {
    card.addEventListener("toggle", requestViewportHeightSync);
  });

  window.addEventListener("resize", function () {
    requestViewportHeightSync();
    drawGroundSurfacePlot();
    drawVerticalSectionPlot();
  });

  if (typeof windowedLayoutQuery.addEventListener === "function") {
    windowedLayoutQuery.addEventListener("change", requestViewportHeightSync);
  } else if (typeof windowedLayoutQuery.addListener === "function") {
    windowedLayoutQuery.addListener(requestViewportHeightSync);
  }

  syncViewerEnvironmentControls();
  applyTheme();
  runtimeMetricsTimer = window.setInterval(updateRuntimeMetrics, 250);
  render();
}

boot();
