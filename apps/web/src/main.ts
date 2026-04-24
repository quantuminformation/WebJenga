import "./styles.css";

import {
  createConcreteStressViewer,
  type ViewerCameraPose,
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
import { createFloatingWindowManager } from "./floating-windows";
import {
  clamp,
  formatFixed,
  formatForce,
  formatRounded,
  formatStepValue,
} from "./formatting";
import {
  drawPerfGraph as drawPerfGraphCanvas,
  drawVerticalSectionPlot as drawVerticalSectionPlotCanvas,
} from "./plots";
import {
  createStressSampler,
  getGroundDepthM,
  getMaterialStressScaleMaxPa,
  getSelfWeightStressAtLocalYPa,
  getStressRatio,
  getStressScaleBounds,
  getTransferredGroundStressPa,
  getVolumeStressState,
  type PlaneSectionField,
} from "./stress-sampling";
import {
  loadPerfPanelCollapsed,
  loadPersistedViewState,
  loadStoredSelectionPlane,
  loadViewerEnvironment,
  resolveInitialTheme,
  savePerfPanelCollapsed,
  savePersistedViewState,
  saveStoredSelectionPlane,
  saveTheme,
  saveViewerEnvironment,
  type ThemeMode,
} from "./storage";

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
                <span>C++ solver calculations per second</span>
                <strong id="perf-peak-rate">0.0 peak</strong>
              </div>
              <div class="perf-panel__graph-frame">
                <canvas id="perf-graph-canvas" aria-label="C++ solver calculations per second graph"></canvas>
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

const windowedLayoutQuery = window.matchMedia("(max-width: 980px)");

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
const persistedViewState = loadPersistedViewState();
let currentTheme: ThemeMode = resolveInitialTheme();
const INPUT_RENDER_DEBOUNCE_MS = 1000;
const DEFAULT_APPLIED_LOAD_N = 2500;
let viewportHeightFrame = 0;

let currentLockedSectionPlane: ViewerSectionPlane | null = loadStoredSelectionPlane();
let hasLockedSectionSelection = Boolean(currentLockedSectionPlane);
let showLockedSectionPlane = persistedViewState.showLockedSectionPlane;
let perfPanelCollapsed = loadPerfPanelCollapsed();
let currentCameraPose: ViewerCameraPose | null = persistedViewState.cameraPose;
let cameraPersistTimer = 0;

width.value = formatStepValue(persistedViewState.widthM);
depth.value = formatStepValue(persistedViewState.depthM);
height.value = formatStepValue(persistedViewState.heightM);
density.value = formatRounded(persistedViewState.densityKgM3);

function persistViewState() {
  savePersistedViewState({
    cameraPose: currentCameraPose,
    densityKgM3: readPositiveValue(density, 2400, 100),
    depthM: readSteppedPositiveValue(depth, 1, 0.1, 0.1),
    heightM: readSteppedPositiveValue(height, 10, 0.1, 0.1),
    showLockedSectionPlane,
    widthM: readSteppedPositiveValue(width, 1, 0.1, 0.1),
  });
}

function schedulePersistViewState(delayMs = 0) {
  if (cameraPersistTimer) {
    window.clearTimeout(cameraPersistTimer);
  }

  cameraPersistTimer = window.setTimeout(function () {
    cameraPersistTimer = 0;
    persistViewState();
  }, delayMs);
}

const viewer = createConcreteStressViewer({
  container: viewerCanvas,
  onCameraChange(cameraPose) {
    currentCameraPose = cameraPose;
    schedulePersistViewState(120);
  },
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

const floatingWindowManager = createFloatingWindowManager({
  diagramShell,
  onClose(windowElement) {
    if (windowElement.id === "section-window") {
      clearSectionCanvasHover();
      drawVerticalSectionPlot();
    }
  },
  windows: floatingWindows,
});

function openInfoWindow(infoKey: string) {
  const content = INFO_CONTENT[infoKey];

  if (!content) {
    return;
  }

  infoWindowTitle.textContent = content.title;
  infoWindowBody.textContent = content.body;
  floatingWindowManager.open(infoWindow, function () {});
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
  drawPerfGraphCanvas(perfGraphCanvas, perfRateHistory, getPlotTheme());
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
const stressSampler = createStressSampler();
let currentPlaneSectionField: PlaneSectionField | null = null;
let currentProbeSectionMarker: { uM: number; vM: number } | null = null;
let currentCanvasSectionMarker: { uM: number; vM: number } | null = null;
let currentCanvasSectionPoint: { x: number; y: number; z: number } | null = null;
let runtimeMetricsTimer = 0;
const perfRateHistory: number[] = [];
let pendingRenderTimer = 0;
let renderQueuedWhileBusy = false;
let isCalculating = false;

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
    : "Click the pillar to lock a section plane.";
}

function updateThemeButton() {
  themeToggle.textContent = currentTheme === "dark" ? "Light mode" : "Dark mode";
}

function readThemeCssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getPlotTheme() {
  return {
    accent: readThemeCssVar("--accent"),
    accentSoft: readThemeCssVar("--accent-2"),
    background: readThemeCssVar("--plot-bg"),
    stroke: readThemeCssVar("--plot-stroke"),
    text: readThemeCssVar("--plot-text"),
  };
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
  persistViewState();
  viewer.update({
    cameraPose: currentCameraPose,
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
  if (!probe || !probe.selectableSection || probe.domain !== "specimen") {
    return;
  }

  currentLockedSectionPlane = probe.plane;
  hasLockedSectionSelection = true;
  saveStoredSelectionPlane(currentLockedSectionPlane);
  currentProbeSectionMarker = null;
  clearSectionCanvasHover();

  showLockedSectionPlane = true;
  persistViewState();

  syncViewerEnvironmentControls();
  updateSectionActionState();
  scheduleImmediateRender();
}

function drawVerticalSectionPlot() {
  drawVerticalSectionPlotCanvas(
    verticalPlotCanvas,
    currentPlaneSectionField,
    getDisplayedSectionMarker(),
    getPlotTheme()
  );
}

function updateRuntimeMetrics() {
  if (!runtime) {
    return;
  }

  const currentRuntimeMetrics = runtime.getMetrics();
  const solverCalculationsPerSecond = currentRuntimeMetrics.calculationsPerSecond;
  if (wasmCallsRate) {
    wasmCallsRate.textContent = formatFixed(solverCalculationsPerSecond, 1) + " calcs/s";
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
  perfRateHistory.push(solverCalculationsPerSecond);
  if (perfRateHistory.length > 48) {
    perfRateHistory.shift();
  }
  wasmRateFloating.textContent = formatFixed(solverCalculationsPerSecond, 1) + " calcs/s";
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

function updateVolumeView(stressState: StressState) {
  const scaleBounds = getStressScaleBounds(stressState);
  const materialScaleMaxPa = getMaterialStressScaleMaxPa(scaleBounds.max);
  const sectionState = getVolumeStressState(stressState);
  const pillarMinPa = 0;
  const pillarMaxPa = Math.max(stressState.appliedLoadStressPa, stressState.maxContactStressPa, 1);
  const groundDepthM = getGroundDepthM(stressState);
  const groundStressField = stressSampler.getGroundStressField(runtime, stressState, materialScaleMaxPa, groundDepthM);
  const groundStressVolumeLayers = stressSampler.getGroundStressVolumeLayers(
    runtime,
    stressState,
    materialScaleMaxPa,
    groundDepthM
  );
  const planeSectionField = stressSampler.getPlaneSectionField(
    runtime,
    stressState,
    currentLockedSectionPlane,
    materialScaleMaxPa,
    groundDepthM
  );
  const bounds = stressSampler.deriveFieldStressBounds(
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
  density.value = formatRounded(inputs.densityKgM3);
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
  persistViewState();
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

  const handlePersistedInput = function () {
    schedulePersistViewState();
    scheduleDebouncedRender();
  };

  width.addEventListener("input", handlePersistedInput);
  depth.addEventListener("input", handlePersistedInput);
  height.addEventListener("input", handlePersistedInput);
  density.addEventListener("input", handlePersistedInput);
  themeToggle.addEventListener("click", function () {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    saveTheme(currentTheme);
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
    floatingWindowManager.open(sectionWindow, drawVerticalSectionPlot);
  });
  openReportDialogButton.addEventListener("click", function () {
    floatingWindowManager.open(reportWindow, function () {});
  });
  document.querySelectorAll("[data-window-close]").forEach(function (button) {
    button.addEventListener("click", function () {
      const windowId = (button as HTMLElement).getAttribute("data-window-close");
      const target = windowId ? document.getElementById(windowId) : null;

      if (!(target instanceof HTMLDivElement)) {
        return;
      }

      floatingWindowManager.close(target);
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
    floatingWindowManager.installDrag(windowElement);
    windowElement.addEventListener("pointerdown", function () {
      floatingWindowManager.bringToFront(windowElement);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      floatingWindowManager.closeOpen();
    }
  });

  document.addEventListener("pointerdown", function (event) {
    const target = event.target as HTMLElement | null;

    if (target?.closest(".floating-window__panel")) {
      return;
    }

    if (target?.closest(".viewer-canvas, .viewer-canvas-element")) {
      floatingWindowManager.closeOpen({ preserveIds: ["section-window"] });
      return;
    }

    floatingWindowManager.closeOpen();
  });

  window.addEventListener("resize", function () {
    requestViewportHeightSync();
    floatingWindowManager.clampOpen();
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
  updateSectionActionState();
  applyTheme();
  applyPerfPanelState();
  if (currentCameraPose) {
    viewer.update({
      cameraPose: currentCameraPose,
    });
  }
  runtimeMetricsTimer = window.setInterval(updateRuntimeMetrics, 250);
  updateRuntimeMetrics();
  scheduleImmediateRender();
}

boot();
