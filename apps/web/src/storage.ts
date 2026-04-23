import type { ViewerCameraPose, ViewerSectionPlane } from "./viewer";

export type ThemeMode = "dark" | "light";

export interface ViewerEnvironmentState {
  showGround: boolean;
}

export interface PersistedViewState {
  cameraPose: ViewerCameraPose | null;
  densityKgM3: number;
  depthM: number;
  heightM: number;
  showLockedSectionPlane: boolean;
  widthM: number;
}

export interface FloatingWindowPosition {
  x: number;
  y: number;
}

export type FloatingWindowPositions = Record<string, FloatingWindowPosition>;

export const THEME_STORAGE_KEY = "webjenga.theme";

const VIEWER_ENV_STORAGE_KEY = "webjenga.viewer.environment";
const FLOATING_WINDOW_STORAGE_KEY = "webjenga.floating-windows";
const PERF_PANEL_STORAGE_KEY = "webjenga.perf-panel.collapsed";
const SELECTION_PLANE_STORAGE_KEY = "webjenga.selection-plane";
const VIEW_STATE_STORAGE_KEY = "webjenga.view-state";

export function resolveInitialTheme(): ThemeMode {
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

export function saveTheme(theme: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Ignore storage failures; the theme still changes for the current session.
  }
}

export function loadViewerEnvironment(): ViewerEnvironmentState {
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

export function saveViewerEnvironment(environment: ViewerEnvironmentState) {
  try {
    window.localStorage.setItem(VIEWER_ENV_STORAGE_KEY, JSON.stringify(environment));
  } catch (error) {
    // Ignore storage failures; the toggles still work for the current session.
  }
}

export function loadFloatingWindowPositions(): FloatingWindowPositions {
  try {
    const raw = window.localStorage.getItem(FLOATING_WINDOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

export function saveFloatingWindowPositions(positions: FloatingWindowPositions) {
  try {
    window.localStorage.setItem(FLOATING_WINDOW_STORAGE_KEY, JSON.stringify(positions));
  } catch (error) {
    // Ignore storage failures; open windows still work for the current session.
  }
}

export function loadPerfPanelCollapsed() {
  try {
    return window.localStorage.getItem(PERF_PANEL_STORAGE_KEY) !== "false";
  } catch (error) {
    return true;
  }
}

export function savePerfPanelCollapsed(isCollapsed: boolean) {
  try {
    window.localStorage.setItem(PERF_PANEL_STORAGE_KEY, String(isCollapsed));
  } catch (error) {
    // Ignore storage failures; the toggle still works for the current session.
  }
}

function isFinitePlaneVector(value: unknown): value is { x: number; y: number; z: number } {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number.isFinite((value as { x?: number }).x) &&
      Number.isFinite((value as { y?: number }).y) &&
      Number.isFinite((value as { z?: number }).z)
  );
}

function isStoredSectionPlane(value: unknown): value is ViewerSectionPlane {
  if (!value || typeof value !== "object") {
    return false;
  }

  const plane = value as Partial<ViewerSectionPlane>;
  return (
    (plane.domain === "ground" || plane.domain === "specimen") &&
    typeof plane.title === "string" &&
    typeof plane.uLabel === "string" &&
    typeof plane.vLabel === "string" &&
    Number.isFinite(plane.uMinM) &&
    Number.isFinite(plane.uMaxM) &&
    Number.isFinite(plane.vMinM) &&
    Number.isFinite(plane.vMaxM) &&
    isFinitePlaneVector(plane.origin) &&
    isFinitePlaneVector(plane.normal) &&
    isFinitePlaneVector(plane.uAxis) &&
    isFinitePlaneVector(plane.vAxis)
  );
}

export function loadStoredSelectionPlane() {
  try {
    const raw = window.localStorage.getItem(SELECTION_PLANE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isStoredSectionPlane(parsed) && parsed.domain === "specimen" ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function saveStoredSelectionPlane(plane: ViewerSectionPlane | null) {
  try {
    if (!plane) {
      window.localStorage.removeItem(SELECTION_PLANE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SELECTION_PLANE_STORAGE_KEY, JSON.stringify(plane));
  } catch (error) {
    // Ignore storage failures; the current session still works.
  }
}

function isCameraPose(value: unknown): value is ViewerCameraPose {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pose = value as Partial<ViewerCameraPose>;
  return isFinitePlaneVector(pose.position) && isFinitePlaneVector(pose.target);
}

export function loadPersistedViewState(): PersistedViewState {
  try {
    const raw = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);

    if (!raw) {
      return createDefaultPersistedViewState();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedViewState>;
    return {
      cameraPose: isCameraPose(parsed.cameraPose) ? parsed.cameraPose : null,
      densityKgM3: Number.isFinite(parsed.densityKgM3) ? Math.max(100, parsed.densityKgM3 as number) : 2400,
      depthM: Number.isFinite(parsed.depthM) ? Math.max(0.1, parsed.depthM as number) : 1,
      heightM: Number.isFinite(parsed.heightM) ? Math.max(0.1, parsed.heightM as number) : 10,
      showLockedSectionPlane: parsed.showLockedSectionPlane !== false,
      widthM: Number.isFinite(parsed.widthM) ? Math.max(0.1, parsed.widthM as number) : 1,
    };
  } catch (error) {
    return createDefaultPersistedViewState();
  }
}

export function savePersistedViewState(viewState: PersistedViewState) {
  try {
    window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(viewState));
  } catch (error) {
    // Ignore storage failures; the current session still works.
  }
}

function createDefaultPersistedViewState(): PersistedViewState {
  return {
    cameraPose: null,
    densityKgM3: 2400,
    depthM: 1,
    heightM: 10,
    showLockedSectionPlane: true,
    widthM: 1,
  };
}
