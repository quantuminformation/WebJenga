import "./styles.css";

import {
  createConcreteStressViewer,
  type GroundStressField,
  type GroundStressVolumeLayer,
  type ViewerProbe,
  type ViewerSectionPlane,
} from "./viewer";
import {
  calculateStressState,
  loadConcreteStressRuntime,
  type ConcreteStressRuntime,
  type StressInputs,
  type StressState,
} from "@webjenga/wasm-bridge";

type ThemeMode = "dark" | "light";

interface ViewerEnvironmentState {
  showGround: boolean;
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

interface PlaneSectionField {
  colors: number[];
  columns: number;
  plane: ViewerSectionPlane;
  rows: number;
  uLabel: string;
  uMaxM: number;
  uMinM: number;
  vLabel: string;
  vMaxM: number;
  vMinM: number;
  valuesPa: number[];
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
            <p class="viewport-subline" id="section-dimensions">1.00 x 10.00 x 1.00 m prism</p>
          </div>
          <div class="viewport-head__status">
            <div class="stress-hero">
              <span class="stress-hero__value" id="stress-kpa">0.0</span>
              <span class="stress-hero__unit">kPa</span>
            </div>
            <div class="stress-hero__meta">
              <strong id="stress-hero-label">Base vertical stress</strong>
              <span id="stress-hero-note">Top vertical stress 0.0 kPa</span>
            </div>
            <div class="viewport-actions">
              <div class="pill" id="ratio-label">Adaptive range</div>
              <button class="viewport-button" id="theme-toggle" type="button">Dark mode</button>
              <button class="viewport-button" id="viewport-fullscreen" type="button">Enter fullscreen</button>
            </div>
          </div>
        </header>

        <section class="overlay-card hud-card hud-card--inputs">
          <div class="overlay-card__header">
            <h2>Geometry and load</h2>
            <p>Primary inputs for the concrete pillar. Applied top load is fixed at 2.5 kN in this demo.</p>
          </div>
          <div class="field-grid">
            <div class="field">
              <label for="width">Width (m)</label>
              <input id="width" type="number" min="0.1" step="0.1" value="1.0" />
            </div>
            <div class="field">
              <label for="depth">Depth (m)</label>
              <input id="depth" type="number" min="0.1" step="0.1" value="1.0" />
            </div>
            <div class="field">
              <label for="height">Height (m)</label>
              <input id="height" type="number" min="0.1" step="0.1" value="10.0" />
            </div>
                  <div class="field">
                    <div class="label-row">
                      <label for="density">Density (kg/m^3)</label>
                      <button class="info-button" data-info-key="density" type="button">i</button>
                    </div>
                    <input id="density" type="number" min="100" step="10" value="2400" />
                  </div>
                </div>
        </section>

        <section class="overlay-card hud-card hud-card--assumptions">
          <div class="overlay-card__header">
            <h2>Model assumptions</h2>
            <p>First-order axial pillar stress with elastic spreading in the ground.</p>
          </div>
          <div class="inline-metrics assumptions-grid">
            <div class="mini-chip">
              <strong>Uniform by slice</strong>
              <span>Each horizontal pillar slice carries the same vertical stress across its area.</span>
            </div>
            <div class="mini-chip">
              <strong>Ground estimate</strong>
              <span>The ground view uses elastic half-space stress spread plus geostatic background stress.</span>
            </div>
          </div>
          <div class="toggle-row">
            <button class="toggle-chip" data-info-key="model-scope" type="button">Model scope</button>
            <button class="toggle-chip" data-info-key="ground-model" type="button">Ground model</button>
          </div>
        </section>

        <section class="overlay-card hud-card hud-card--summary">
          <div class="overlay-card__header">
            <h2>Model summary</h2>
            <p>Derived geometry for the current shape.</p>
          </div>
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
        </section>

        <section class="overlay-card hud-card hud-card--camera">
          <div class="overlay-card__header">
            <h2>Camera</h2>
            <p>Drag to orbit, scroll to zoom, hover the pillar to inspect stress.</p>
          </div>
        </section>

        <section class="overlay-card hud-card hud-card--environment">
          <div class="overlay-card__header">
            <h2>Environment</h2>
            <p>Keep the scene stripped back to the essentials.</p>
          </div>
          <div class="toggle-row">
            <button class="toggle-chip" id="toggle-ground" type="button">Ground</button>
          </div>
        </section>

        <section class="overlay-card hud-card hud-card--section">
          <div class="overlay-card__header">
            <h2>Section cut</h2>
            <p>Hover a surface patch, then click to lock a local plane through that exact point.</p>
          </div>
          <div class="toggle-row">
            <button class="toggle-chip" id="toggle-section-plane" type="button" disabled>Show plane</button>
            <button class="toggle-chip" id="open-section-dialog" type="button" disabled>Cross-section window</button>
          </div>
          <span class="field-note" id="selection-hint">Click the pillar or ground to lock a section plane.</span>
        </section>

        <section class="overlay-card hud-card hud-card--views">
          <div class="overlay-card__header">
            <h2>Analysis windows</h2>
            <p>Open floating tools without blocking the main viewer.</p>
          </div>
          <div class="toggle-row">
            <button class="toggle-chip" id="open-report-dialog" type="button">C++ model report</button>
          </div>
        </section>

        <section class="overlay-card hud-card hud-card--probe">
          <div class="overlay-card__header">
            <h2>Probe readout</h2>
            <p>Hover the pillar or ground for local vertical stress.</p>
          </div>
          <div class="stress-readout">
            <strong id="stress-readout-title">3D probe</strong>
            <span id="stress-readout-body">Orbit the scene and hover the pillar or ground to inspect local vertical stress.</span>
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
          <span id="hover-stress">sigma_v = 0.0 kPa</span>
          <span id="hover-note">Vertical stress probe</span>
        </div>

        <div class="viewport-float-stack">
          <div class="floating-scale">
            <span class="floating-scale__eyebrow">Pillar stress scale</span>
            <div class="stress-scale stress-scale--floating">
              <div class="stress-bar">
                <div class="stress-bar-marker" id="stress-bar-marker"></div>
              </div>
              <div class="stress-scale-labels">
                <div>
                  <strong id="stress-range-max">0.0 kPa</strong>
                  <span>Pillar maximum</span>
                </div>
                <div>
                  <strong id="stress-range-min">0.0 kPa</strong>
                  <span>Zero load reference</span>
                </div>
              </div>
            </div>
          </div>

          <section class="perf-panel is-collapsed" id="perf-panel">
            <button class="perf-panel__toggle" id="perf-toggle" type="button" aria-expanded="false">
              <span class="perf-panel__label">Performance</span>
              <strong id="wasm-rate-floating">0.0 calcs/s</strong>
              <span class="perf-panel__chevron" id="perf-toggle-chevron">+</span>
            </button>
            <div class="perf-panel__body">
              <div class="runtime-float__status" id="calc-status">
                <span class="runtime-float__spinner" aria-hidden="true"></span>
                <span id="calc-status-text">Idle</span>
              </div>
              <div class="perf-panel__meta">
                <span>WebAssembly calls per second</span>
                <strong id="perf-peak-rate">0.0 peak</strong>
              </div>
              <div class="perf-panel__graph-frame">
                <canvas id="perf-graph-canvas" aria-label="WebAssembly calls per second graph"></canvas>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  </main>

  <div class="floating-window is-hidden" id="section-window" data-window-id="section">
    <section class="floating-window__panel floating-window__panel--section">
      <header class="floating-window__header" data-window-drag>
        <div>
          <p class="eyebrow eyebrow--card">Cross-section</p>
          <h2>Selected plane</h2>
        </div>
        <button class="floating-window__close" data-window-close="section-window" type="button">Close</button>
      </header>
      <p class="floating-window__summary" id="vertical-plot-summary">This is the locked internal slice. The green marker follows the same local plane.</p>
      <div class="ground-plot-frame ground-plot-frame--overlay">
        <canvas id="vertical-plot-canvas" aria-label="Vertical subsurface stress plot"></canvas>
      </div>
      <div class="ground-plot-meta ground-plot-meta--overlay">
        <span id="vertical-plot-range">Section range 0.0 to 0.0 kPa</span>
        <span id="vertical-plot-position">No plane selected</span>
      </div>
      <div class="stress-flow-callout">
        <strong id="stress-flow-title">Selected plane</strong>
        <span id="stress-flow-body">Viewer clicks update this window. The axes below are local to the locked plane.</span>
      </div>
    </section>
  </div>

  <div class="floating-window is-hidden" id="report-window" data-window-id="report">
    <section class="floating-window__panel floating-window__panel--report">
      <header class="floating-window__header" data-window-drag>
        <div>
          <p class="eyebrow eyebrow--card">C++ model report</p>
          <h2>Solver report</h2>
        </div>
        <button class="floating-window__close" data-window-close="report-window" type="button">Close</button>
      </header>
      <pre id="output">Loading WebAssembly runtime...</pre>
    </section>
  </div>

  <div class="floating-window is-hidden" id="info-window" data-window-id="info">
    <section class="floating-window__panel floating-window__panel--info">
      <header class="floating-window__header" data-window-drag>
        <div>
          <p class="eyebrow eyebrow--card">Physics note</p>
          <h2 id="info-window-title">Parameter meaning</h2>
        </div>
        <button class="floating-window__close" data-window-close="info-window" type="button">Close</button>
      </header>
      <p class="floating-window__summary" id="info-window-body"></p>
    </section>
  </div>
`;

const output = document.getElementById("output");
const width = document.getElementById("width") as HTMLInputElement;
const depth = document.getElementById("depth") as HTMLInputElement;
const height = document.getElementById("height") as HTMLInputElement;
const density = document.getElementById("density") as HTMLInputElement;
const stressKpa = document.getElementById("stress-kpa");
const stressHeroLabel = document.getElementById("stress-hero-label");
const stressHeroNote = document.getElementById("stress-hero-note");
const selfWeightValue = document.getElementById("self-weight-value");
const appliedLoadValue = document.getElementById("applied-load-value");
const massValue = document.getElementById("mass-value");
const areaSummary = document.getElementById("area-summary");
const volumeSummary = document.getElementById("volume-summary");
const ratioLabel = document.getElementById("ratio-label");
const diagramShell = document.getElementById("diagram-shell");
const sectionDimensions = document.getElementById("section-dimensions");
const hoverCard = document.getElementById("hover-card");
const hoverCoords = document.getElementById("hover-coords");
const hoverStress = document.getElementById("hover-stress");
const hoverNote = document.getElementById("hover-note");
const hoverSwatchIndicator = document.getElementById("hover-swatch-indicator");
const stressBarMarker = document.getElementById("stress-bar-marker");
const stressRangeMax = document.getElementById("stress-range-max");
const stressRangeMin = document.getElementById("stress-range-min");
const stressReadoutTitle = document.getElementById("stress-readout-title");
const stressReadoutBody = document.getElementById("stress-readout-body");
const viewerCanvas = document.getElementById("viewer-canvas");
const viewportShell = document.getElementById("viewport-shell");
const viewportFullscreenButton = document.getElementById("viewport-fullscreen");
const themeToggle = document.getElementById("theme-toggle");
const toggleGround = document.getElementById("toggle-ground");
const toggleSectionPlane = document.getElementById("toggle-section-plane") as HTMLButtonElement;
const selectionHint = document.getElementById("selection-hint");
const openSectionDialogButton = document.getElementById("open-section-dialog") as HTMLButtonElement;
const openReportDialogButton = document.getElementById("open-report-dialog") as HTMLButtonElement;
const wasmCallsRate = document.getElementById("wasm-calls-rate");
const wasmTotalCalls = document.getElementById("wasm-total-calls");
const wasmPointCalls = document.getElementById("wasm-point-calls");
const wasmCallTime = document.getElementById("wasm-call-time");
const wasmRateFloating = document.getElementById("wasm-rate-floating");
const perfPanel = document.getElementById("perf-panel") as HTMLElement;
const perfToggle = document.getElementById("perf-toggle") as HTMLButtonElement;
const perfToggleChevron = document.getElementById("perf-toggle-chevron");
const perfPeakRate = document.getElementById("perf-peak-rate");
const perfGraphCanvas = document.getElementById("perf-graph-canvas") as HTMLCanvasElement;
const calcStatus = document.getElementById("calc-status");
const calcStatusText = document.getElementById("calc-status-text");
const verticalPlotCanvas = document.getElementById("vertical-plot-canvas") as HTMLCanvasElement;
const verticalPlotRange = document.getElementById("vertical-plot-range");
const verticalPlotPosition = document.getElementById("vertical-plot-position");
const verticalPlotSummary = document.getElementById("vertical-plot-summary");
const stressFlowTitle = document.getElementById("stress-flow-title");
const stressFlowBody = document.getElementById("stress-flow-body");
const floatingWindows = Array.from(document.querySelectorAll(".floating-window")) as HTMLDivElement[];
const sectionWindow = document.getElementById("section-window") as HTMLDivElement;
const reportWindow = document.getElementById("report-window") as HTMLDivElement;
const infoWindow = document.getElementById("info-window") as HTMLDivElement;
const infoWindowTitle = document.getElementById("info-window-title");
const infoWindowBody = document.getElementById("info-window-body");

const VIEWER_ENV_STORAGE_KEY = "webjenga.viewer.environment";
const THEME_STORAGE_KEY = "webjenga.theme";
const FLOATING_WINDOW_STORAGE_KEY = "webjenga.floating-windows";
const PERF_PANEL_STORAGE_KEY = "webjenga.perf-panel.collapsed";
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
      return { showGround: true };
    }

    const parsed = JSON.parse(raw);

    return {
      showGround: parsed.showGround !== false,
    };
  } catch (error) {
    return { showGround: true };
  }
}

function saveViewerEnvironment(environment: ViewerEnvironmentState) {
  try {
    window.localStorage.setItem(VIEWER_ENV_STORAGE_KEY, JSON.stringify(environment));
  } catch (error) {
    // Ignore storage failures; the toggles still work for the current session.
  }
}

function loadFloatingWindowPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = window.localStorage.getItem(FLOATING_WINDOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function loadPerfPanelCollapsed() {
  try {
    return window.localStorage.getItem(PERF_PANEL_STORAGE_KEY) !== "false";
  } catch (error) {
    return true;
  }
}

function savePerfPanelCollapsed(isCollapsed: boolean) {
  try {
    window.localStorage.setItem(PERF_PANEL_STORAGE_KEY, String(isCollapsed));
  } catch (error) {
    // Ignore storage failures; the toggle still works for the current session.
  }
}

function saveFloatingWindowPositions(positions: Record<string, { x: number; y: number }>) {
  try {
    window.localStorage.setItem(FLOATING_WINDOW_STORAGE_KEY, JSON.stringify(positions));
  } catch (error) {
    // Ignore storage failures; open windows still work for the current session.
  }
}

const INFO_CONTENT: Record<string, { body: string; title: string }> = {
  density: {
    title: "Density",
    body: "Density controls the pillar self-weight. Heavier concrete produces more gravitational compression toward the base because each layer must support the material above it.",
  },
  "model-scope": {
    title: "Model scope",
    body: "The pillar uses a first-order axial stress model. Each horizontal slice is uniform across its area, and stress rises toward the base because lower slices carry the weight of the material above.",
  },
  "ground-model": {
    title: "Ground model",
    body: "The ground view combines geostatic stress from the ground's own weight with a Boussinesq-style elastic spread of the footing load. This is a useful first-order estimate, not a full FEM soil-contact solve.",
  },
};

const viewerEnvironment = loadViewerEnvironment();
const floatingWindowPositions = loadFloatingWindowPositions();
let currentTheme: ThemeMode = resolveInitialTheme();
const GROUND_FIELD_COLUMNS = 29;
const GROUND_FIELD_ROWS = 29;
const GROUND_VOLUME_COLUMNS = 21;
const GROUND_VOLUME_ROWS = 21;
const GROUND_VOLUME_SLICE_COUNT = 7;
const GROUND_SURFACE_SAMPLE_OFFSET_M = 0.0001;
const GRAVITY_M_S2 = 9.80665;
const INPUT_RENDER_DEBOUNCE_MS = 1000;
const DEFAULT_APPLIED_LOAD_N = 2500;
let viewportHeightFrame = 0;

let hasLockedSectionSelection = false;
let showLockedSectionPlane = true;
let currentLockedSectionPlane: ViewerSectionPlane | null = null;
let perfPanelCollapsed = loadPerfPanelCollapsed();

const viewer = createConcreteStressViewer({
  container: viewerCanvas,
  onProbe: showHoverProbe,
  onProbeLeave: hideHover,
  onProbeSelect: handleProbeSelection,
});

function updateFullscreenButton() {
  viewportFullscreenButton.textContent =
    document.fullscreenElement === viewportShell ? "Exit fullscreen" : "Enter fullscreen";
}

function syncViewportHeight() {
  viewportHeightFrame = 0;

  if (document.fullscreenElement === viewportShell) {
    viewportShell.style.removeProperty("height");
    viewportShell.style.removeProperty("min-height");
    return;
  }

  if (windowedLayoutQuery.matches) {
    viewportShell.style.removeProperty("height");
    viewportShell.style.removeProperty("min-height");
    return;
  }

  const requiredHeight = Math.max(700, window.innerHeight - 20);

  viewportShell.style.height = requiredHeight + "px";
  viewportShell.style.minHeight = requiredHeight + "px";
}

function requestViewportHeightSync() {
  if (viewportHeightFrame) {
    return;
  }

  viewportHeightFrame = window.requestAnimationFrame(syncViewportHeight);
}

let floatingWindowZ = 12;

function getDefaultWindowPosition(windowId: string) {
  switch (windowId) {
    case "section":
      return { x: Math.max(272, diagramShell.clientWidth - 420), y: 92 };
    case "report":
      return { x: 420, y: 88 };
    case "info":
      return { x: 280, y: 120 };
    default:
      return { x: 32, y: 96 };
  }
}

function clampFloatingWindowPosition(windowElement: HTMLDivElement, x: number, y: number) {
  const margin = 12;
  const maxX = Math.max(margin, diagramShell.clientWidth - windowElement.offsetWidth - margin);
  const maxY = Math.max(margin, diagramShell.clientHeight - windowElement.offsetHeight - margin);

  return {
    x: clamp(x, margin, maxX),
    y: clamp(y, margin, maxY),
  };
}

function saveFloatingWindowPosition(windowElement: HTMLDivElement, x: number, y: number) {
  const windowId = windowElement.dataset.windowId;

  if (!windowId) {
    return;
  }

  floatingWindowPositions[windowId] = { x, y };
  saveFloatingWindowPositions(floatingWindowPositions);
}

function applyFloatingWindowPosition(windowElement: HTMLDivElement, x: number, y: number) {
  const clamped = clampFloatingWindowPosition(windowElement, x, y);
  const shellRect = diagramShell.getBoundingClientRect();
  windowElement.style.left = shellRect.left + clamped.x + "px";
  windowElement.style.top = shellRect.top + clamped.y + "px";
  windowElement.dataset.localX = String(clamped.x);
  windowElement.dataset.localY = String(clamped.y);
  saveFloatingWindowPosition(windowElement, clamped.x, clamped.y);
}

function bringFloatingWindowToFront(windowElement: HTMLDivElement) {
  floatingWindowZ += 1;
  windowElement.style.zIndex = String(floatingWindowZ);
}

function clampOpenFloatingWindows() {
  floatingWindows.forEach(function (windowElement) {
    if (windowElement.classList.contains("is-hidden")) {
      return;
    }

    const currentX = Number.parseFloat(windowElement.dataset.localX || "0");
    const currentY = Number.parseFloat(windowElement.dataset.localY || "0");
    applyFloatingWindowPosition(windowElement, currentX, currentY);
  });
}

function openFloatingWindow(windowElement: HTMLDivElement, onOpen: () => void) {
  windowElement.classList.remove("is-hidden");
  bringFloatingWindowToFront(windowElement);

  window.requestAnimationFrame(function () {
    const windowId = windowElement.dataset.windowId || "";
    const savedPosition = floatingWindowPositions[windowId] || getDefaultWindowPosition(windowId);
    applyFloatingWindowPosition(windowElement, savedPosition.x, savedPosition.y);
    onOpen();
  });
}

function closeFloatingWindow(windowElement: HTMLDivElement) {
  windowElement.classList.add("is-hidden");

  if (windowElement.id === "section-window") {
    clearSectionCanvasHover();
    drawVerticalSectionPlot();
  }
}

function closeOpenFloatingWindows(options?: { preserveIds?: string[] }) {
  const preserve = new Set(options?.preserveIds || []);

  floatingWindows.forEach(function (windowElement) {
    if (preserve.has(windowElement.id) || windowElement.classList.contains("is-hidden")) {
      return;
    }

    closeFloatingWindow(windowElement);
  });
}

function openInfoWindow(infoKey: string) {
  const content = INFO_CONTENT[infoKey];

  if (!content) {
    return;
  }

  infoWindowTitle.textContent = content.title;
  infoWindowBody.textContent = content.body;
  openFloatingWindow(infoWindow, function () {});
}

function installFloatingWindowDrag(windowElement: HTMLDivElement) {
  const dragHandle = windowElement.querySelector("[data-window-drag]") as HTMLElement | null;

  if (!dragHandle) {
    return;
  }

  dragHandle.addEventListener("pointerdown", function (event: PointerEvent) {
    const target = event.target as HTMLElement | null;

    if (target?.closest("button")) {
      return;
    }

    bringFloatingWindowToFront(windowElement);
    const originX = Number.parseFloat(windowElement.dataset.localX || "0");
    const originY = Number.parseFloat(windowElement.dataset.localY || "0");
    const startX = event.clientX;
    const startY = event.clientY;

    dragHandle.setPointerCapture(event.pointerId);

    function handleMove(moveEvent: PointerEvent) {
      applyFloatingWindowPosition(
        windowElement,
        originX + moveEvent.clientX - startX,
        originY + moveEvent.clientY - startY
      );
    }

    function handleEnd(endEvent: PointerEvent) {
      dragHandle.releasePointerCapture(endEvent.pointerId);
      dragHandle.removeEventListener("pointermove", handleMove);
      dragHandle.removeEventListener("pointerup", handleEnd);
      dragHandle.removeEventListener("pointercancel", handleEnd);
    }

    dragHandle.addEventListener("pointermove", handleMove);
    dragHandle.addEventListener("pointerup", handleEnd);
    dragHandle.addEventListener("pointercancel", handleEnd);
  });
}

function setCalculatingState(nextIsCalculating: boolean) {
  isCalculating = nextIsCalculating;
  calcStatus.classList.toggle("is-calculating", nextIsCalculating);
  calcStatusText.textContent = nextIsCalculating ? "Calculating..." : "Idle";
}

function applyPerfPanelState() {
  perfPanel.classList.toggle("is-collapsed", perfPanelCollapsed);
  perfToggle.setAttribute("aria-expanded", String(!perfPanelCollapsed));
  perfToggleChevron.textContent = perfPanelCollapsed ? "+" : "−";
  savePerfPanelCollapsed(perfPanelCollapsed);
  drawPerfGraph();
}

function drawPerfGraph() {
  const context = perfGraphCanvas.getContext("2d");

  if (!context) {
    return;
  }

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const widthPx = Math.max(Math.round(perfGraphCanvas.clientWidth * devicePixelRatio), 220);
  const heightPx = Math.max(Math.round(perfGraphCanvas.clientHeight * devicePixelRatio), 96);

  if (perfGraphCanvas.width !== widthPx || perfGraphCanvas.height !== heightPx) {
    perfGraphCanvas.width = widthPx;
    perfGraphCanvas.height = heightPx;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(devicePixelRatio, devicePixelRatio);

  const width = widthPx / devicePixelRatio;
  const height = heightPx / devicePixelRatio;
  const plotBackground = readThemeCssVar("--plot-bg");
  const plotStroke = readThemeCssVar("--plot-stroke");
  const plotText = readThemeCssVar("--plot-text");
  const accent = readThemeCssVar("--accent");
  const accentSoft = readThemeCssVar("--accent-2");
  const maxRate = Math.max(1, perfRateHistory.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0));

  context.clearRect(0, 0, width, height);
  context.fillStyle = plotBackground;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = plotStroke;
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);

  if (perfRateHistory.length < 2) {
    context.fillStyle = plotText;
    context.font = "600 12px Avenir Next, Segoe UI, sans-serif";
    context.fillText("Waiting for runtime samples...", 12, height * 0.56);
    return;
  }

  context.strokeStyle = plotStroke;
  context.setLineDash([4, 4]);
  for (let index = 1; index <= 3; index += 1) {
    const y = (height / 4) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.setLineDash([]);

  context.beginPath();
  perfRateHistory.forEach(function (value, index) {
    const x = (index / Math.max(perfRateHistory.length - 1, 1)) * width;
    const y = height - (value / maxRate) * (height - 8) - 4;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.strokeStyle = accent;
  context.lineWidth = 2;
  context.stroke();

  context.lineTo(width, height - 4);
  context.lineTo(0, height - 4);
  context.closePath();
  context.fillStyle = "color-mix(in srgb, " + accentSoft + " 32%, transparent)";
  context.fill();

  const latestRate = perfRateHistory[perfRateHistory.length - 1];
  context.fillStyle = plotText;
  context.font = "600 11px Avenir Next, Segoe UI, sans-serif";
  context.fillText(formatFixed(maxRate, 1) + " calcs/s", 8, 14);
  context.fillText(formatFixed(latestRate, 1) + " now", 8, height - 8);
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
  areaM2: 1,
  combinedStressPa: 0,
  densityKgM3: 2400,
  depthM: 1,
  fieldRangeMaxPa: 500000,
  fieldRangeMinPa: 0,
  groundPoissonRatio: 0.3,
  groundYoungsModulusMpa: 120,
  groundDepthM: 15,
  heightM: 10,
  massKg: 24000,
  maxContactStressPa: 0,
  rangeMaxPa: 500000,
  rangeMinPa: 0,
  sectionLabel: "Concrete pillar",
  selfWeightN: 0,
  selfWeightStressPa: 0,
  specimenPoissonRatio: 0.2,
  specimenYoungsModulusMpa: 30000,
  volumeM3: 10,
  widthM: 1,
} as DisplaySectionState;
let groundFieldCacheKey = "";
let groundFieldCache: GroundStressField | null = null;
let groundVolumeCacheKey = "";
let groundVolumeCache: GroundStressVolumeLayer[] | null = null;
let planeSectionCacheKey = "";
let planeSectionCache: PlaneSectionField | null = null;
let currentPlaneSectionField: PlaneSectionField | null = null;
let currentProbeSectionMarker: { uM: number; vM: number } | null = null;
let currentCanvasSectionMarker: { uM: number; vM: number } | null = null;
let currentCanvasSectionPoint: { x: number; y: number; z: number } | null = null;
let runtimeMetricsTimer = 0;
const perfRateHistory: number[] = [];
let pendingRenderTimer = 0;
let renderQueuedWhileBusy = false;
let isCalculating = false;

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

function formatStepValue(value: number, digits = 1) {
  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    useGrouping: false,
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPlanePointAt(plane: ViewerSectionPlane, uM: number, vM: number) {
  return {
    x: plane.origin.x + plane.uAxis.x * uM + plane.vAxis.x * vM,
    y: plane.origin.y + plane.uAxis.y * uM + plane.vAxis.y * vM,
    z: plane.origin.z + plane.uAxis.z * uM + plane.vAxis.z * vM,
  };
}

function projectPointToPlaneLocal(plane: ViewerSectionPlane, point: { x: number; y: number; z: number }) {
  const relative = {
    x: point.x - plane.origin.x,
    y: point.y - plane.origin.y,
    z: point.z - plane.origin.z,
  };

  return {
    distanceM:
      relative.x * plane.normal.x + relative.y * plane.normal.y + relative.z * plane.normal.z,
    uM: relative.x * plane.uAxis.x + relative.y * plane.uAxis.y + relative.z * plane.uAxis.z,
    vM: relative.x * plane.vAxis.x + relative.y * plane.vAxis.y + relative.z * plane.vAxis.z,
  };
}

function getDisplayedSectionMarker() {
  return currentCanvasSectionMarker || currentProbeSectionMarker;
}

function syncSectionPlaneHighlight() {
  viewer.update({
    highlightedSectionPoint: currentCanvasSectionPoint,
  });
}

function clearSectionCanvasHover() {
  currentCanvasSectionMarker = null;
  currentCanvasSectionPoint = null;
  syncSectionPlaneHighlight();
}

function updateSectionMarkerFromProbe(probe: ViewerProbe | null) {
  if (!currentLockedSectionPlane || !probe) {
    currentProbeSectionMarker = null;
    drawVerticalSectionPlot();
    return;
  }

  const localPoint = projectPointToPlaneLocal(currentLockedSectionPlane, probe.modelPoint);
  const planeToleranceM = Math.max(
    0.01,
    Math.min(currentSection.widthM, currentSection.depthM, currentSection.heightM) * 0.025
  );
  const insidePlane =
    Math.abs(localPoint.distanceM) <= planeToleranceM &&
    localPoint.uM >= currentLockedSectionPlane.uMinM &&
    localPoint.uM <= currentLockedSectionPlane.uMaxM &&
    localPoint.vM >= currentLockedSectionPlane.vMinM &&
    localPoint.vM <= currentLockedSectionPlane.vMaxM;

  currentProbeSectionMarker = insidePlane
    ? {
        uM: localPoint.uM,
        vM: localPoint.vM,
      }
    : null;
  drawVerticalSectionPlot();
}

function setToggleState(button, isActive) {
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
}

function updateSectionActionState() {
  toggleSectionPlane.disabled = !hasLockedSectionSelection;
  openSectionDialogButton.disabled = !hasLockedSectionSelection;
  selectionHint.textContent = hasLockedSectionSelection
    ? "Plane locked. Open the cross-section window or show the plane in the viewer."
    : "Click the pillar or ground to lock a section plane.";
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
  drawVerticalSectionPlot();
  drawPerfGraph();
}

function syncViewerEnvironmentControls() {
  setToggleState(toggleGround, viewerEnvironment.showGround);
  setToggleState(toggleSectionPlane, showLockedSectionPlane);
}

function applyViewerEnvironment() {
  syncViewerEnvironmentControls();
  updateSectionActionState();
  saveViewerEnvironment(viewerEnvironment);
  viewer.update({
    selectedSectionPlane: currentLockedSectionPlane,
    showReferenceFigure: false,
    showGround: viewerEnvironment.showGround,
    showGroundVolume: viewerEnvironment.showGround,
    showReferenceHouse: false,
    showSection: hasLockedSectionSelection && showLockedSectionPlane,
    showSky: false,
    theme: currentTheme,
  });
  requestViewportHeightSync();
}

function handleProbeSelection(probe: ViewerProbe | null) {
  currentLockedSectionPlane = probe?.selectableSection ? probe.plane : null;
  hasLockedSectionSelection = Boolean(currentLockedSectionPlane);
  currentProbeSectionMarker = null;
  clearSectionCanvasHover();

  if (hasLockedSectionSelection) {
    showLockedSectionPlane = true;
  }

  syncViewerEnvironmentControls();
  updateSectionActionState();
  scheduleImmediateRender();
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

function getStressScaleBounds(stressState: StressState): StressBounds {
  const min = Math.max(0, stressState.appliedLoadStressPa);
  const max = Math.max(min, stressState.combinedStressPa, stressState.maxContactStressPa);

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
  return mixColor(
    { b: 255, g: 0, r: 0 },
    { b: 0, g: 0, r: 255 },
    clamp(ratio, 0, 1)
  );
}

function getMaterialStressScaleMaxPa(fieldMaxPa: number) {
  return Math.max(fieldMaxPa, 1);
}

function formatForce(value) {
  if (Math.abs(value) >= 1000) {
    return formatFixed(value / 1000, 1) + " kN";
  }

  return formatRounded(value) + " N";
}

function getStressAtLocalYPa(localY, stressState) {
  const coverToTopM = clamp(stressState.heightM / 2 - localY, 0, stressState.heightM);
  return stressState.appliedLoadStressPa + stressState.densityKgM3 * GRAVITY_M_S2 * coverToTopM;
}

function getSelfWeightStressAtLocalYPa(localY, stressState) {
  const coverToTopM = clamp(stressState.heightM / 2 - localY, 0, stressState.heightM);
  return stressState.densityKgM3 * GRAVITY_M_S2 * coverToTopM;
}

function getTransferredGroundStressPa(stressState: StressState, yM: number, totalStressPa: number) {
  const groundSurfaceY = -stressState.heightM / 2;

  if (yM >= groundSurfaceY) {
    return totalStressPa;
  }

  const depthBelowSurfaceM = groundSurfaceY - yM;
  const geostaticStressPa = stressState.densityKgM3 * GRAVITY_M_S2 * depthBelowSurfaceM;
  return Math.max(0, totalStressPa - geostaticStressPa);
}

function getVolumeStressState(stressState: StressState): {
  representativeStressPa: number;
  sectionBottomColorCss: string;
  sectionGradientMode: "uniform" | "vertical";
  sectionTopColorCss: string;
  sectionUniformColorCss: string;
  volumeBottomColorCss: string;
  volumeTopColorCss: string;
} {
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(stressState.maxContactStressPa);
  const topRatio = getStressRatio(stressState.appliedLoadStressPa, 0, materialScaleMaxPa);
  const bottomRatio = getStressRatio(stressState.maxContactStressPa, 0, materialScaleMaxPa);
  const representativeStressPa =
    stressState.appliedLoadStressPa +
    (stressState.maxContactStressPa - stressState.appliedLoadStressPa) / 2;
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
  materialScaleMaxPa: number,
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
    formatFixed(materialScaleMaxPa, 2),
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

function buildGroundStressField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  materialScaleMaxPa: number,
  groundDepthM: number,
  sampleY: number,
  columns: number,
  rows: number
): GroundStressField {
  const extent = getGroundFieldExtent(stressState);
  const colors = [];
  const valuesPa = [];

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
      const displayStressPa = getTransferredGroundStressPa(stressState, sampleY, stressPa);
      const ratio = getStressRatio(displayStressPa, 0, materialScaleMaxPa);
      const color = getStressColor(ratio);

      colors.push(color.r / 255, color.g / 255, color.b / 255);
      valuesPa.push(displayStressPa);
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

function createPlaneSectionCacheKey(
  stressState: StressState,
  plane: ViewerSectionPlane,
  materialScaleMaxPa: number,
  groundDepthM: number,
  columns: number,
  rows: number
) {
  return [
    createGroundFieldCacheKey(stressState, materialScaleMaxPa, groundDepthM, plane.origin.y, columns, rows),
    plane.title,
    plane.uLabel,
    plane.vLabel,
    formatFixed(plane.origin.x, 4),
    formatFixed(plane.origin.y, 4),
    formatFixed(plane.origin.z, 4),
    formatFixed(plane.normal.x, 4),
    formatFixed(plane.normal.y, 4),
    formatFixed(plane.normal.z, 4),
    formatFixed(plane.uAxis.x, 4),
    formatFixed(plane.uAxis.y, 4),
    formatFixed(plane.uAxis.z, 4),
    formatFixed(plane.vAxis.x, 4),
    formatFixed(plane.vAxis.y, 4),
    formatFixed(plane.vAxis.z, 4),
    formatFixed(plane.uMinM, 4),
    formatFixed(plane.uMaxM, 4),
    formatFixed(plane.vMinM, 4),
    formatFixed(plane.vMaxM, 4),
  ].join("|");
}

function buildPlaneSectionField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  plane: ViewerSectionPlane,
  materialScaleMaxPa: number,
  groundDepthM: number,
  columns: number,
  rows: number
): PlaneSectionField {
  const valuesPa = [];
  const colors = [];
  const origin = plane.origin;
  const uAxis = plane.uAxis;
  const vAxis = plane.vAxis;

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const vRatio = rowIndex / Math.max(rows - 1, 1);
    const v = plane.vMaxM - vRatio * (plane.vMaxM - plane.vMinM);

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const uRatio = columnIndex / Math.max(columns - 1, 1);
      const u = plane.uMinM + uRatio * (plane.uMaxM - plane.uMinM);
      const point = {
        x: origin.x + uAxis.x * u + vAxis.x * v,
        y: origin.y + uAxis.y * u + vAxis.y * v,
        z: origin.z + uAxis.z * u + vAxis.z * v,
      };
      const stressPa = runtimeApi.calculateStressAtPointPa(stressState, {
        groundDepthM,
        ...point,
      });
      const displayStressPa =
        point.y < -stressState.heightM / 2 ? getTransferredGroundStressPa(stressState, point.y, stressPa) : stressPa;
      const ratio = getStressRatio(displayStressPa, 0, materialScaleMaxPa);
      const color = getStressColor(ratio);

      colors.push(color.r / 255, color.g / 255, color.b / 255);
      valuesPa.push(displayStressPa);
    }
  }

  return {
    colors,
    columns,
    plane,
    rows,
    uLabel: plane.uLabel,
    uMaxM: plane.uMaxM,
    uMinM: plane.uMinM,
    vLabel: plane.vLabel,
    vMaxM: plane.vMaxM,
    vMinM: plane.vMinM,
    valuesPa,
  };
}

function getPlaneSectionField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  plane: ViewerSectionPlane | null,
  materialScaleMaxPa: number,
  groundDepthM: number
) {
  if (!plane) {
    return null;
  }

  const cacheKey = createPlaneSectionCacheKey(
    stressState,
    plane,
    materialScaleMaxPa,
    groundDepthM,
    43,
    55
  );

  if (cacheKey === planeSectionCacheKey && planeSectionCache) {
    return planeSectionCache;
  }

  planeSectionCacheKey = cacheKey;
  planeSectionCache = buildPlaneSectionField(
    runtimeApi,
    stressState,
    plane,
    materialScaleMaxPa,
    groundDepthM,
    43,
    55
  );
  return planeSectionCache;
}

function drawVerticalSectionPlot() {
  const context = verticalPlotCanvas.getContext("2d");
  const field = currentPlaneSectionField;

  if (!context) {
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
  const insetLeft = 46;
  const insetRight = 12;
  const insetTop = 14;
  const insetBottom = 22;
  const plotWidth = width - insetLeft - insetRight;
  const plotHeight = height - insetTop - insetBottom;

  if (!field) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = readThemeCssVar("--plot-bg");
    context.fillRect(0, 0, width, height);
    context.fillStyle = readThemeCssVar("--plot-text");
    context.font = "600 14px Avenir Next, Segoe UI, sans-serif";
    context.fillText("Select a surface patch in the viewer to populate this plane.", 18, height * 0.5);
    return;
  }

  const cellWidth = plotWidth / Math.max(field.columns, 1);
  const cellHeight = plotHeight / Math.max(field.rows, 1);

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
  context.strokeRect(insetLeft, insetTop, plotWidth, plotHeight);

  context.fillStyle = plotText;
  context.font = "600 11px Avenir Next, Segoe UI, sans-serif";
  context.fillText("sigma", 12, 16);
  context.fillText(field.uLabel, width - insetRight - 8, height - 6);
  context.save();
  context.translate(14, height * 0.58);
  context.rotate(-Math.PI / 2);
  context.fillText(field.vLabel, 0, 0);
  context.restore();

  const marker = getDisplayedSectionMarker();

  if (marker) {
    const xRatio = (marker.uM - field.uMinM) / Math.max(field.uMaxM - field.uMinM, 1e-6);
    const yRatio = (field.vMaxM - marker.vM) / Math.max(field.vMaxM - field.vMinM, 1e-6);
    const x = insetLeft + clamp(xRatio, 0, 1) * plotWidth;
    const y = insetTop + clamp(yRatio, 0, 1) * plotHeight;

    context.beginPath();
    context.fillStyle = "#2fcc71";
    context.arc(x, y, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.92)";
    context.lineWidth = 2;
    context.stroke();
  }
}

function getGroundStressField(
  runtimeApi: ConcreteStressRuntime,
  stressState: StressState,
  materialScaleMaxPa: number,
  groundDepthM: number
) {
  const sampleY = -stressState.heightM / 2 - GROUND_SURFACE_SAMPLE_OFFSET_M;
  const cacheKey = createGroundFieldCacheKey(
    stressState,
    materialScaleMaxPa,
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
    materialScaleMaxPa,
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
  materialScaleMaxPa: number,
  groundDepthM: number
) {
  const cacheKey = [
    createGroundFieldCacheKey(
      stressState,
      materialScaleMaxPa,
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
      materialScaleMaxPa,
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

function deriveFieldStressBounds(
  stressState: StressState,
  groundStressField: GroundStressField,
  groundStressVolumeLayers: GroundStressVolumeLayer[],
  planeSectionField: PlaneSectionField | null
): StressBounds {
  let min = Math.min(0, stressState.appliedLoadStressPa, stressState.combinedStressPa);
  let max = Math.max(
    stressState.appliedLoadStressPa,
    stressState.combinedStressPa,
    stressState.maxContactStressPa
  );
  const fields: Array<{ valuesPa: number[] }> = [groundStressField, ...groundStressVolumeLayers];

  if (planeSectionField) {
    fields.push(planeSectionField);
  }

  fields.forEach(function (field) {
    field.valuesPa.forEach(function (value) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
  });

  return {
    max: Math.max(max, min + 1),
    min,
  };
}

function updateRuntimeMetrics() {
  if (!runtime) {
    return;
  }

  const currentRuntimeMetrics = runtime.getMetrics();
  if (wasmCallsRate) {
    wasmCallsRate.textContent = formatFixed(currentRuntimeMetrics.callsPerSecond, 1) + " calcs/s";
  }
  if (wasmTotalCalls) {
    wasmTotalCalls.textContent = formatRounded(currentRuntimeMetrics.totalCalls);
  }
  if (wasmPointCalls) {
    wasmPointCalls.textContent = formatRounded(currentRuntimeMetrics.functionCalls.calculateStressAtPointPa);
  }
  if (wasmCallTime) {
    wasmCallTime.textContent = formatFixed(currentRuntimeMetrics.averageCallDurationMs, 3) + " ms";
  }
  perfRateHistory.push(currentRuntimeMetrics.callsPerSecond);
  if (perfRateHistory.length > 48) {
    perfRateHistory.shift();
  }
  wasmRateFloating.textContent = formatFixed(currentRuntimeMetrics.callsPerSecond, 1) + " calcs/s";
  perfPeakRate.textContent =
    formatFixed(
      perfRateHistory.reduce(function (maxValue, value) {
        return Math.max(maxValue, value);
      }, 0),
      1
    ) + " peak";
  drawPerfGraph();
}

function getReadoutStressPa(sectionState: DisplaySectionState) {
  return sectionState.maxContactStressPa;
}

function hideHover() {
  const readoutStressPa = getReadoutStressPa(currentSection);
  const readoutRatio = getStressRatio(
    readoutStressPa,
    currentSection.rangeMinPa,
    currentSection.rangeMaxPa
  );

  hoverCard.classList.remove("is-visible");
  currentProbeSectionMarker = null;
  hoverSwatchIndicator.style.width = Math.round(readoutRatio * 100) + "%";
  stressReadoutTitle.textContent = currentSection.sectionLabel;
  stressBarMarker.style.top = (100 - readoutRatio * 100) + "%";
  stressReadoutBody.textContent =
    "Pillar range is " +
    formatFixed(currentSection.appliedLoadStressPa / 1000, 1) +
    " to " +
    formatFixed(currentSection.maxContactStressPa / 1000, 1) +
    " kPa.";
  drawVerticalSectionPlot();
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
  const displayPa =
    probe.domain === "ground"
      ? getTransferredGroundStressPa(currentSection, probe.modelPoint.y, totalPa)
      : totalPa;
  const displayKpa = displayPa / 1000;
  const stressRatio = getStressRatio(displayPa, currentSection.rangeMinPa, currentSection.rangeMaxPa);
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
    hoverStress.textContent = "sigma_v = " + formatFixed(displayKpa, 1) + " kPa in ground";
    hoverNote.textContent =
      "Ground point. The display removes the geostatic background term so the footing-induced increment stays visible.";
    stressReadoutTitle.textContent = "Probe on ground";
  } else {
    const selfPa = getSelfWeightStressAtLocalYPa(probe.localPoint.y, currentSection);
    const appliedKpa = currentSection.appliedLoadStressPa / 1000;
    const selfKpa = selfPa / 1000;
    hoverStress.textContent =
      "sigma_v = " + formatFixed(displayKpa, 1) + " kPa (" +
      formatFixed(appliedKpa, 1) + " applied + " +
      formatFixed(selfKpa, 1) + " self-weight)";
    hoverNote.textContent =
      "Pillar point. In this model the stress on a given horizontal slice is uniform across the section and varies only with height.";
    stressReadoutTitle.textContent = "Probe on specimen";
  }

  hoverSwatchIndicator.style.width = Math.round(stressRatio * 100) + "%";
  stressReadoutBody.textContent =
    "Point vertical stress " + formatFixed(displayKpa, 1) + " kPa. Pillar range is " +
    formatFixed(currentSection.appliedLoadStressPa / 1000, 1) + " to " +
    formatFixed(currentSection.maxContactStressPa / 1000, 1) +
    " kPa.";
  stressBarMarker.style.top = (100 - stressRatio * 100) + "%";
  hoverCard.classList.add("is-visible");
  updateSectionMarkerFromProbe(probe);
}

function readPositiveValue(input: HTMLInputElement, fallback: number, minValue: number) {
  const parsed = Number.parseFloat(input.value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minValue, parsed);
}

function readSteppedPositiveValue(
  input: HTMLInputElement,
  fallback: number,
  minValue: number,
  step: number
) {
  const value = readPositiveValue(input, fallback, minValue);
  const stepped = Math.round(value / step) * step;
  return Math.max(minValue, stepped);
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
  const scaleBounds = getStressScaleBounds(stressState);
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(scaleBounds.max);
  const sectionState = getVolumeStressState(stressState);
  const pillarMinPa = 0;
  const pillarMaxPa = Math.max(stressState.appliedLoadStressPa, stressState.maxContactStressPa, 1);
  const groundDepthM = getGroundDepthM(stressState);
  const groundStressField = getGroundStressField(runtime, stressState, materialScaleMaxPa, groundDepthM);
  const groundStressVolumeLayers = getGroundStressVolumeLayers(
    runtime,
    stressState,
    materialScaleMaxPa,
    groundDepthM
  );
  const planeSectionField = getPlaneSectionField(
    runtime,
    stressState,
    currentLockedSectionPlane,
    materialScaleMaxPa,
    groundDepthM
  );
  const bounds = deriveFieldStressBounds(
    stressState,
    groundStressField,
    groundStressVolumeLayers,
    planeSectionField
  );
  const stressRatio = getStressRatio(stressState.maxContactStressPa, pillarMinPa, pillarMaxPa);
  const planeMinPa = planeSectionField?.valuesPa.reduce(function (minValue, value) {
    return Math.min(minValue, value);
  }, Number.POSITIVE_INFINITY) || 0;
  const planeMaxPa = planeSectionField?.valuesPa.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0) || 0;

  currentSection = {
    ...stressState,
    fieldRangeMaxPa: bounds.max,
    fieldRangeMinPa: bounds.min,
    groundDepthM,
    rangeMaxPa: pillarMaxPa,
    rangeMinPa: pillarMinPa,
    sectionLabel: "Concrete pillar",
  };

  sectionDimensions.textContent =
    formatFixed(stressState.widthM, 2) + " x " +
    formatFixed(stressState.heightM, 2) + " x " +
    formatFixed(stressState.depthM, 2) + " m prism";
  ratioLabel.textContent =
    "Pillar " + formatFixed(stressState.appliedLoadStressPa / 1000, 1) + " to " +
    formatFixed(stressState.maxContactStressPa / 1000, 1) + " kPa";
  stressRangeMax.textContent = formatFixed(pillarMaxPa / 1000, 1) + " kPa";
  stressRangeMin.textContent = formatFixed(pillarMinPa / 1000, 1) + " kPa";
  stressBarMarker.style.top = (100 - stressRatio * 100) + "%";
  hoverSwatchIndicator.style.width = Math.round(stressRatio * 100) + "%";
  stressReadoutTitle.textContent = "Concrete pillar";
  currentPlaneSectionField = planeSectionField;
  if (planeSectionField) {
    verticalPlotSummary.textContent =
      planeSectionField.plane.title +
      ". Local " +
      planeSectionField.uLabel +
      "/" +
      planeSectionField.vLabel +
      " coordinates.";
    verticalPlotRange.textContent =
      "Section range " +
      formatFixed(planeMinPa / 1000, 1) +
      " to " +
      formatFixed(planeMaxPa / 1000, 1) +
      " kPa";
    verticalPlotPosition.textContent =
      "Origin (" +
      formatFixed(planeSectionField.plane.origin.x, 3) +
      ", " +
      formatFixed(planeSectionField.plane.origin.y, 3) +
      ", " +
      formatFixed(planeSectionField.plane.origin.z, 3) +
      ") m";
    stressFlowTitle.textContent = planeSectionField.plane.title;
    stressFlowBody.textContent =
      planeSectionField.uLabel +
      " spans " +
      formatFixed(planeSectionField.uMinM, 2) +
      " to " +
      formatFixed(planeSectionField.uMaxM, 2) +
      " m and " +
      planeSectionField.vLabel +
      " spans " +
      formatFixed(planeSectionField.vMinM, 2) +
      " to " +
      formatFixed(planeSectionField.vMaxM, 2) +
      " m around the locked point.";
  } else {
    verticalPlotSummary.textContent =
      "Lock a local surface slice from the viewer to inspect this internal plane.";
    verticalPlotRange.textContent = "Section range 0.0 to 0.0 kPa";
    verticalPlotPosition.textContent = "No plane selected";
    stressFlowTitle.textContent = "Selected plane";
    stressFlowBody.textContent = "The green marker uses the same local coordinates as the locked internal plane.";
  }

  if (!planeSectionField) {
    currentProbeSectionMarker = null;
    clearSectionCanvasHover();
  }

  viewer.update({
    depthM: stressState.depthM,
    groundStressVolumeLayers,
    heightM: stressState.heightM,
    sectionBottomColorCss: sectionState.sectionBottomColorCss,
    sectionGradientMode: sectionState.sectionGradientMode,
    sectionTopColorCss: sectionState.sectionTopColorCss,
    sectionUniformColorCss: sectionState.sectionUniformColorCss,
    groundStressField,
    selectedSectionPlane: currentLockedSectionPlane,
    showReferenceFigure: false,
    showSection: hasLockedSectionSelection && showLockedSectionPlane,
    showGround: viewerEnvironment.showGround,
    showGroundVolume: viewerEnvironment.showGround,
    showReferenceHouse: false,
    showSky: false,
    stressFlowPath: null,
    theme: currentTheme,
    volumeBottomColorCss: sectionState.volumeBottomColorCss,
    volumeSliceCount: 20,
    volumeTopColorCss: sectionState.volumeTopColorCss,
    widthM: stressState.widthM,
  });

  drawVerticalSectionPlot();
  hideHover();
  requestViewportHeightSync();
}

let runtime: ConcreteStressRuntime | null = null;

function renderNow() {
  if (!runtime) {
    return;
  }

  const inputs: StressInputs = {
    appliedLoadN: DEFAULT_APPLIED_LOAD_N,
    densityKgM3: readPositiveValue(density, 2400, 100),
    depthM: readSteppedPositiveValue(depth, 1, 0.1, 0.1),
    groundPoissonRatio: 0.3,
    groundYoungsModulusMpa: 120,
    heightM: readSteppedPositiveValue(height, 10, 0.1, 0.1),
    specimenPoissonRatio: 0.2,
    specimenYoungsModulusMpa: 30000,
    widthM: readSteppedPositiveValue(width, 1, 0.1, 0.1),
  };
  width.value = formatStepValue(inputs.widthM);
  depth.value = formatStepValue(inputs.depthM);
  height.value = formatStepValue(inputs.heightM);
  const stressState = calculateStressState(runtime, inputs);

  output.textContent = "";
  runtime.printStressReport(inputs);

  stressKpa.textContent = formatFixed(stressState.maxContactStressPa / 1000, 1);
  stressHeroLabel.textContent = "Base vertical stress";
  stressHeroNote.textContent =
    "Top vertical stress " + formatFixed(stressState.appliedLoadStressPa / 1000, 1) + " kPa";
  selfWeightValue.textContent = formatForce(stressState.selfWeightN);
  appliedLoadValue.textContent = formatForce(stressState.appliedLoadN);
  massValue.textContent = formatFixed(stressState.massKg, 1) + " kg";
  areaSummary.textContent = formatFixed(stressState.areaM2, 4) + " m^2";
  volumeSummary.textContent = formatFixed(stressState.volumeM3, 4) + " m^3";

  updateVolumeView(stressState);
  updateRuntimeMetrics();
}

async function flushRender() {
  pendingRenderTimer = 0;

  if (!runtime) {
    return;
  }

  if (isCalculating) {
    renderQueuedWhileBusy = true;
    return;
  }

  setCalculatingState(true);
  await new Promise<void>(function (resolve) {
    window.requestAnimationFrame(function () {
      resolve();
    });
  });

  try {
    renderNow();
  } finally {
    setCalculatingState(false);
  }

  if (renderQueuedWhileBusy) {
    renderQueuedWhileBusy = false;
    scheduleImmediateRender();
  }
}

function scheduleRender(delayMs: number) {
  if (pendingRenderTimer) {
    window.clearTimeout(pendingRenderTimer);
  }

  pendingRenderTimer = window.setTimeout(function () {
    void flushRender();
  }, delayMs);
}

function scheduleDebouncedRender() {
  scheduleRender(INPUT_RENDER_DEBOUNCE_MS);
}

function scheduleImmediateRender() {
  scheduleRender(0);
}

async function boot() {
  try {
    const wasmBasePath = new URL("wasm/", window.location.href).pathname.replace(/\/$/, "");
    runtime = await loadConcreteStressRuntime({
      basePath: wasmBasePath,
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

  width.addEventListener("input", scheduleDebouncedRender);
  depth.addEventListener("input", scheduleDebouncedRender);
  height.addEventListener("input", scheduleDebouncedRender);
  density.addEventListener("input", scheduleDebouncedRender);
  themeToggle.addEventListener("click", function () {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
    } catch (error) {
      // Ignore storage failures; the theme still changes for the current session.
    }
    applyTheme();
  });
  perfToggle.addEventListener("click", function () {
    perfPanelCollapsed = !perfPanelCollapsed;
    applyPerfPanelState();
  });
  toggleGround.addEventListener("click", function () {
    viewerEnvironment.showGround = !viewerEnvironment.showGround;
    applyViewerEnvironment();
  });
  toggleSectionPlane.addEventListener("click", function () {
    showLockedSectionPlane = !showLockedSectionPlane;
    applyViewerEnvironment();
  });
  openSectionDialogButton.addEventListener("click", function () {
    openFloatingWindow(sectionWindow, drawVerticalSectionPlot);
  });
  openReportDialogButton.addEventListener("click", function () {
    openFloatingWindow(reportWindow, function () {});
  });
  document.querySelectorAll("[data-window-close]").forEach(function (button) {
    button.addEventListener("click", function () {
      const windowId = (button as HTMLElement).getAttribute("data-window-close");
      const target = windowId ? document.getElementById(windowId) : null;

      if (!(target instanceof HTMLDivElement)) {
        return;
      }

      closeFloatingWindow(target);
    });
  });
  document.querySelectorAll("[data-info-key]").forEach(function (button) {
    button.addEventListener("click", function () {
      const infoKey = (button as HTMLElement).dataset.infoKey;

      if (infoKey) {
        openInfoWindow(infoKey);
      }
    });
  });
  floatingWindows.forEach(function (windowElement) {
    installFloatingWindowDrag(windowElement);
    windowElement.addEventListener("pointerdown", function () {
      bringFloatingWindowToFront(windowElement);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeOpenFloatingWindows();
    }
  });

  document.addEventListener("pointerdown", function (event) {
    const target = event.target as HTMLElement | null;

    if (target?.closest(".floating-window__panel")) {
      return;
    }

    if (target?.closest(".viewer-canvas, .viewer-canvas-element")) {
      closeOpenFloatingWindows();
      return;
    }

    closeOpenFloatingWindows();
  });

  window.addEventListener("resize", function () {
    requestViewportHeightSync();
    clampOpenFloatingWindows();
    drawVerticalSectionPlot();
    drawPerfGraph();
  });

  verticalPlotCanvas.addEventListener("pointermove", function (event) {
    const field = currentPlaneSectionField;

    if (!field) {
      clearSectionCanvasHover();
      drawVerticalSectionPlot();
      return;
    }

    const rect = verticalPlotCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const insetLeft = 46;
    const insetRight = 12;
    const insetTop = 14;
    const insetBottom = 22;
    const plotWidth = rect.width - insetLeft - insetRight;
    const plotHeight = rect.height - insetTop - insetBottom;
    const insidePlot =
      x >= insetLeft &&
      x <= insetLeft + plotWidth &&
      y >= insetTop &&
      y <= insetTop + plotHeight;

    if (!insidePlot) {
      clearSectionCanvasHover();
      drawVerticalSectionPlot();
      return;
    }

    const uRatio = (x - insetLeft) / Math.max(plotWidth, 1);
    const vRatio = (y - insetTop) / Math.max(plotHeight, 1);
    const uM = field.uMinM + uRatio * (field.uMaxM - field.uMinM);
    const vM = field.vMaxM - vRatio * (field.vMaxM - field.vMinM);

    currentCanvasSectionMarker = { uM, vM };
    currentCanvasSectionPoint = getPlanePointAt(field.plane, uM, vM);
    syncSectionPlaneHighlight();
    drawVerticalSectionPlot();
  });

  verticalPlotCanvas.addEventListener("pointerleave", function () {
    clearSectionCanvasHover();
    drawVerticalSectionPlot();
  });

  if (typeof windowedLayoutQuery.addEventListener === "function") {
    windowedLayoutQuery.addEventListener("change", requestViewportHeightSync);
  } else if (typeof windowedLayoutQuery.addListener === "function") {
    windowedLayoutQuery.addListener(requestViewportHeightSync);
  }

  syncViewerEnvironmentControls();
  applyTheme();
  applyPerfPanelState();
  runtimeMetricsTimer = window.setInterval(updateRuntimeMetrics, 250);
  updateRuntimeMetrics();
  scheduleImmediateRender();
}

boot();
