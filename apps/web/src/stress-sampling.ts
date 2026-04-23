import {
  type ConcreteStressRuntime,
  type StressState,
} from "@webjenga/wasm-bridge";
import type {
  GroundStressField,
  GroundStressVolumeLayer,
  ViewerSectionPlane,
} from "./viewer";
import { clamp, formatFixed } from "./formatting";

export interface StressColor {
  b: number;
  g: number;
  r: number;
}

export interface StressBounds {
  max: number;
  min: number;
}

export interface PlaneSectionField {
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

export interface VolumeStressViewState {
  representativeStressPa: number;
  sectionBottomColorCss: string;
  sectionGradientMode: "uniform" | "vertical";
  sectionTopColorCss: string;
  sectionUniformColorCss: string;
  volumeBottomColorCss: string;
  volumeTopColorCss: string;
}

const GROUND_FIELD_COLUMNS = 29;
const GROUND_FIELD_ROWS = 29;
const GROUND_VOLUME_COLUMNS = 21;
const GROUND_VOLUME_ROWS = 21;
const GROUND_VOLUME_SLICE_COUNT = 7;
const GROUND_SURFACE_SAMPLE_OFFSET_M = 0.0001;
const GRAVITY_M_S2 = 9.80665;

export { GRAVITY_M_S2 };

export function mixChannel(from: number, to: number, amount: number) {
  return Math.round(from + (to - from) * amount);
}

export function mixColor(from: StressColor, to: StressColor, amount: number): StressColor {
  return {
    b: mixChannel(from.b, to.b, amount),
    g: mixChannel(from.g, to.g, amount),
    r: mixChannel(from.r, to.r, amount),
  };
}

export function colorToString(color: StressColor) {
  return "rgb(" + color.r + ", " + color.g + ", " + color.b + ")";
}

export function getStressScaleBounds(stressState: StressState): StressBounds {
  const min = Math.max(0, stressState.appliedLoadStressPa);
  const max = Math.max(min, stressState.combinedStressPa, stressState.maxContactStressPa);

  return {
    max: Math.max(max, min + 1),
    min,
  };
}

export function getGroundDepthM(stressState: StressState) {
  return Math.max(
    stressState.heightM * 1.5,
    Math.max(stressState.widthM, stressState.depthM) * 4
  );
}

export function getGroundFieldExtent(stressState: StressState) {
  const maxPlanDimension = Math.max(stressState.widthM, stressState.depthM);
  const extent = Math.max(stressState.heightM * 3.2, maxPlanDimension * 9, 1.2);

  return {
    depthM: extent,
    widthM: extent,
  };
}

export function getStressRatio(stressPa: number, minPa: number, maxPa: number) {
  return clamp((stressPa - minPa) / Math.max(1, maxPa - minPa), 0, 1);
}

export function getStressColor(ratio: number) {
  return mixColor(
    { b: 255, g: 0, r: 0 },
    { b: 0, g: 0, r: 255 },
    clamp(ratio, 0, 1)
  );
}

export function getMaterialStressScaleMaxPa(fieldMaxPa: number) {
  return Math.max(fieldMaxPa, 1);
}

export function getSelfWeightStressAtLocalYPa(localY: number, stressState: StressState) {
  const coverToTopM = clamp(stressState.heightM / 2 - localY, 0, stressState.heightM);
  return stressState.densityKgM3 * GRAVITY_M_S2 * coverToTopM;
}

export function getTransferredGroundStressPa(stressState: StressState, yM: number, totalStressPa: number) {
  const groundSurfaceY = -stressState.heightM / 2;

  if (yM >= groundSurfaceY) {
    return totalStressPa;
  }

  const depthBelowSurfaceM = groundSurfaceY - yM;
  const geostaticStressPa = stressState.densityKgM3 * GRAVITY_M_S2 * depthBelowSurfaceM;
  return Math.max(0, totalStressPa - geostaticStressPa);
}

export function getVolumeStressState(stressState: StressState): VolumeStressViewState {
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

export function createStressSampler() {
  let groundFieldCacheKey = "";
  let groundFieldCache: GroundStressField | null = null;
  let groundVolumeCacheKey = "";
  let groundVolumeCache: GroundStressVolumeLayer[] | null = null;
  let planeSectionCacheKey = "";
  let planeSectionCache: PlaneSectionField | null = null;

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
    const colors: number[] = [];
    const sampledValuesPa = runtimeApi.sampleGroundGridPa(stressState, {
      columns,
      fieldDepthM: extent.depthM,
      fieldWidthM: extent.widthM,
      groundDepthM,
      rows,
      sampleY,
    });
    const valuesPa: number[] = [];

    sampledValuesPa.forEach(function (stressPa) {
      const displayStressPa = getTransferredGroundStressPa(stressState, sampleY, stressPa);
      const ratio = getStressRatio(displayStressPa, 0, materialScaleMaxPa);
      const color = getStressColor(ratio);

      colors.push(color.r / 255, color.g / 255, color.b / 255);
      valuesPa.push(displayStressPa);
    });

    if (valuesPa.length !== rows * columns) {
      throw new Error("Unexpected ground grid sample count returned from WebAssembly.");
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
    const origin = plane.origin;
    const uAxis = plane.uAxis;
    const vAxis = plane.vAxis;
    const sampledValuesPa = runtimeApi.samplePlaneSectionPa(stressState, {
      columns,
      groundDepthM,
      origin,
      rows,
      uAxis,
      uMaxM: plane.uMaxM,
      uMinM: plane.uMinM,
      vAxis,
      vMaxM: plane.vMaxM,
      vMinM: plane.vMinM,
    });
    const valuesPa: number[] = [];
    const colors: number[] = [];

    sampledValuesPa.forEach(function (stressPa, valueIndex) {
      const rowIndex = Math.floor(valueIndex / columns);
      const columnIndex = valueIndex % columns;
      const vRatio = rowIndex / Math.max(rows - 1, 1);
      const v = plane.vMaxM - vRatio * (plane.vMaxM - plane.vMinM);
      const uRatio = columnIndex / Math.max(columns - 1, 1);
      const u = plane.uMinM + uRatio * (plane.uMaxM - plane.uMinM);
      const point = {
        x: origin.x + uAxis.x * u + vAxis.x * v,
        y: origin.y + uAxis.y * u + vAxis.y * v,
        z: origin.z + uAxis.z * u + vAxis.z * v,
      };
      const displayStressPa =
        point.y < -stressState.heightM / 2
          ? getTransferredGroundStressPa(stressState, point.y, stressPa)
          : stressPa;
      const ratio = getStressRatio(displayStressPa, 0, materialScaleMaxPa);
      const color = getStressColor(ratio);

      colors.push(color.r / 255, color.g / 255, color.b / 255);
      valuesPa.push(displayStressPa);
    });

    if (valuesPa.length !== rows * columns) {
      throw new Error("Unexpected plane section sample count returned from WebAssembly.");
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

  return {
    deriveFieldStressBounds(
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
    },
    getGroundStressField(
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
    },
    getGroundStressVolumeLayers(
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
    },
    getPlaneSectionField(
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
    },
  };
}
