export interface StressInputs {
  appliedLoadN: number;
  densityKgM3: number;
  depthM: number;
  groundPoissonRatio: number;
  groundYoungsModulusMpa: number;
  heightM: number;
  specimenPoissonRatio: number;
  specimenYoungsModulusMpa: number;
  widthM: number;
}

export interface StressSamplePoint {
  groundDepthM: number;
  x: number;
  y: number;
  z: number;
}

export interface RuntimeCallMetrics {
  averageCallDurationMs: number;
  callsPerSecond: number;
  functionCalls: {
    calculateCombinedStressPa: number;
    calculateMaxContactStressPa: number;
    calculateStressAtPointPa: number;
    sampleGroundGridPa: number;
    samplePlaneSectionPa: number;
    printStressReport: number;
  };
  totalCallDurationMs: number;
  totalCalls: number;
}

export interface GroundGridSample {
  columns: number;
  fieldDepthM: number;
  fieldWidthM: number;
  groundDepthM: number;
  rows: number;
  sampleY: number;
}

export interface PlaneSectionSample {
  columns: number;
  groundDepthM: number;
  origin: { x: number; y: number; z: number };
  rows: number;
  uAxis: { x: number; y: number; z: number };
  uMaxM: number;
  uMinM: number;
  vAxis: { x: number; y: number; z: number };
  vMaxM: number;
  vMinM: number;
}

export interface StressState extends StressInputs {
  appliedLoadStressPa: number;
  areaM2: number;
  combinedStressPa: number;
  maxContactStressPa: number;
  massKg: number;
  selfWeightN: number;
  selfWeightStressPa: number;
  volumeM3: number;
}

export interface ConcreteStressRuntime {
  calculateCombinedStressPa(inputs: StressInputs): number;
  calculateMaxContactStressPa(inputs: StressInputs): number;
  calculateStressAtPointPa(inputs: StressInputs, point: StressSamplePoint): number;
  getMetrics(): RuntimeCallMetrics;
  printStressReport(inputs: StressInputs): void;
  sampleGroundGridPa(inputs: StressInputs, sample: GroundGridSample): number[];
  samplePlaneSectionPa(inputs: StressInputs, sample: PlaneSectionSample): number[];
}

export interface LoadConcreteStressRuntimeOptions {
  basePath?: string;
  onStderr?(text: string): void;
  onStdout?(text: string): void;
}

interface RuntimeHandlers {
  stderr(text: string): void;
  stdout(text: string): void;
}

interface EmscriptenModuleLike {
  HEAPF64?: Float64Array;
  _free?(pointer: number): void;
  _malloc?(size: number): number;
  ccall?(
    identifier: string,
    returnType: "number" | null,
    argumentTypes: string[],
    args: number[]
  ): number | void;
  locateFile?(path: string): string;
  onRuntimeInitialized?(): void;
  print?(text: string): void;
  printErr?(text: string): void;
}

type RuntimeGlobal = typeof globalThis & {
  Module?: EmscriptenModuleLike;
};

interface RuntimeState {
  api: ConcreteStressRuntime | null;
  handlers: RuntimeHandlers;
  promise: Promise<ConcreteStressRuntime> | null;
}

const runtimeState: RuntimeState = {
  api: null,
  handlers: {
    stderr() {},
    stdout() {},
  },
  promise: null,
};

function toParams(inputs: StressInputs): StressInputs {
  return {
    appliedLoadN: Number(inputs.appliedLoadN),
    densityKgM3: Number(inputs.densityKgM3),
    depthM: Number(inputs.depthM),
    groundPoissonRatio: Number(inputs.groundPoissonRatio),
    groundYoungsModulusMpa: Number(inputs.groundYoungsModulusMpa),
    heightM: Number(inputs.heightM),
    specimenPoissonRatio: Number(inputs.specimenPoissonRatio),
    specimenYoungsModulusMpa: Number(inputs.specimenYoungsModulusMpa),
    widthM: Number(inputs.widthM),
  };
}

function buildRuntimeApi(module: EmscriptenModuleLike): ConcreteStressRuntime {
  if (!module.ccall) {
    throw new Error("WebAssembly bridge initialised without ccall support.");
  }

  const metricWindowMs = 1000;
  const recentCalls: Array<{ count: number; timestampMs: number }> = [];
  const functionCalls = {
    calculateCombinedStressPa: 0,
    calculateMaxContactStressPa: 0,
    calculateStressAtPointPa: 0,
    sampleGroundGridPa: 0,
    samplePlaneSectionPa: 0,
    printStressReport: 0,
  };
  let totalCallDurationMs = 0;
  let totalCalls = 0;

  function trimRecentCalls(nowMs: number) {
    while (recentCalls.length && nowMs - recentCalls[0].timestampMs > metricWindowMs) {
      recentCalls.shift();
    }
  }

  function recordCall(functionName: keyof typeof functionCalls, durationMs: number) {
    const nowMs = performance.now();

    functionCalls[functionName] += 1;
    totalCalls += 1;
    totalCallDurationMs += durationMs;
    recentCalls.push({ count: 1, timestampMs: nowMs });
    trimRecentCalls(nowMs);
  }

  function callWithMetrics<T>(
    functionName: keyof typeof functionCalls,
    callback: () => T
  ): T {
    const startedAtMs = performance.now();
    const result = callback();

    recordCall(functionName, performance.now() - startedAtMs);
    return result;
  }

  return {
    calculateCombinedStressPa(inputs) {
      const params = toParams(inputs);

      return callWithMetrics("calculateCombinedStressPa", function () {
        return module.ccall(
          "calculate_combined_stress_pa",
          "number",
          ["number", "number", "number", "number", "number", "number", "number", "number", "number"],
          [
            params.widthM,
            params.depthM,
            params.heightM,
            params.densityKgM3,
            params.specimenYoungsModulusMpa,
            params.specimenPoissonRatio,
            params.groundYoungsModulusMpa,
            params.groundPoissonRatio,
            params.appliedLoadN,
          ]
        ) as number;
      });
    },
    calculateMaxContactStressPa(inputs) {
      const params = toParams(inputs);

      return callWithMetrics("calculateMaxContactStressPa", function () {
        return module.ccall(
          "calculate_max_contact_stress_pa",
          "number",
          ["number", "number", "number", "number", "number", "number", "number", "number", "number"],
          [
            params.widthM,
            params.depthM,
            params.heightM,
            params.densityKgM3,
            params.specimenYoungsModulusMpa,
            params.specimenPoissonRatio,
            params.groundYoungsModulusMpa,
            params.groundPoissonRatio,
            params.appliedLoadN,
          ]
        ) as number;
      });
    },
    calculateStressAtPointPa(inputs, point) {
      const params = toParams(inputs);

      return callWithMetrics("calculateStressAtPointPa", function () {
        return module.ccall(
          "calculate_stress_at_point_pa_export",
          "number",
          [
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
          ],
          [
            params.widthM,
            params.depthM,
            params.heightM,
            params.densityKgM3,
            params.specimenYoungsModulusMpa,
            params.specimenPoissonRatio,
            params.groundYoungsModulusMpa,
            params.groundPoissonRatio,
            params.appliedLoadN,
            Number(point.groundDepthM),
            Number(point.x),
            Number(point.y),
            Number(point.z),
          ]
        ) as number;
      });
    },
    sampleGroundGridPa(inputs, sample) {
      const params = toParams(inputs);
      const valueCount = Math.max(0, Math.trunc(sample.columns) * Math.trunc(sample.rows));

      return callWithMetrics("sampleGroundGridPa", function () {
        if (!module._malloc || !module._free || !module.HEAPF64) {
          throw new Error("WebAssembly bridge initialised without heap allocation support.");
        }

        const outputPointer = module._malloc(valueCount * Float64Array.BYTES_PER_ELEMENT);

        try {
          module.ccall!(
            "sample_ground_grid_pa_export",
            null,
            [
              "number", "number", "number", "number", "number", "number", "number", "number",
              "number", "number", "number", "number", "number", "number", "number", "number",
            ],
            [
              params.widthM,
              params.depthM,
              params.heightM,
              params.densityKgM3,
              params.specimenYoungsModulusMpa,
              params.specimenPoissonRatio,
              params.groundYoungsModulusMpa,
              params.groundPoissonRatio,
              params.appliedLoadN,
              Number(sample.groundDepthM),
              Number(sample.sampleY),
              Number(sample.fieldWidthM),
              Number(sample.fieldDepthM),
              Math.trunc(sample.columns),
              Math.trunc(sample.rows),
              outputPointer,
            ]
          );

          const heapOffset = outputPointer / Float64Array.BYTES_PER_ELEMENT;
          return Array.from(module.HEAPF64.subarray(heapOffset, heapOffset + valueCount));
        } finally {
          module._free(outputPointer);
        }
      });
    },
    samplePlaneSectionPa(inputs, sample) {
      const params = toParams(inputs);
      const valueCount = Math.max(0, Math.trunc(sample.columns) * Math.trunc(sample.rows));

      return callWithMetrics("samplePlaneSectionPa", function () {
        if (!module._malloc || !module._free || !module.HEAPF64) {
          throw new Error("WebAssembly bridge initialised without heap allocation support.");
        }

        const outputPointer = module._malloc(valueCount * Float64Array.BYTES_PER_ELEMENT);

        try {
          module.ccall!(
            "sample_plane_section_pa_export",
            null,
            [
              "number", "number", "number", "number", "number", "number", "number", "number",
              "number", "number", "number", "number", "number", "number", "number", "number",
              "number", "number", "number", "number", "number", "number", "number", "number",
              "number", "number",
            ],
            [
              params.widthM,
              params.depthM,
              params.heightM,
              params.densityKgM3,
              params.specimenYoungsModulusMpa,
              params.specimenPoissonRatio,
              params.groundYoungsModulusMpa,
              params.groundPoissonRatio,
              params.appliedLoadN,
              Number(sample.groundDepthM),
              Number(sample.origin.x),
              Number(sample.origin.y),
              Number(sample.origin.z),
              Number(sample.uAxis.x),
              Number(sample.uAxis.y),
              Number(sample.uAxis.z),
              Number(sample.vAxis.x),
              Number(sample.vAxis.y),
              Number(sample.vAxis.z),
              Number(sample.uMinM),
              Number(sample.uMaxM),
              Number(sample.vMinM),
              Number(sample.vMaxM),
              Math.trunc(sample.columns),
              Math.trunc(sample.rows),
              outputPointer,
            ]
          );

          const heapOffset = outputPointer / Float64Array.BYTES_PER_ELEMENT;
          return Array.from(module.HEAPF64.subarray(heapOffset, heapOffset + valueCount));
        } finally {
          module._free(outputPointer);
        }
      });
    },
    getMetrics() {
      const nowMs = performance.now();
      trimRecentCalls(nowMs);

      return {
        averageCallDurationMs: totalCalls ? totalCallDurationMs / totalCalls : 0,
        callsPerSecond: recentCalls.reduce(function (sum, entry) {
          return sum + entry.count;
        }, 0),
        functionCalls: { ...functionCalls },
        totalCallDurationMs,
        totalCalls,
      };
    },
    printStressReport(inputs) {
      const params = toParams(inputs);

      callWithMetrics("printStressReport", function () {
        module.ccall(
          "print_stress_report",
          null,
          ["number", "number", "number", "number", "number", "number", "number", "number", "number"],
          [
            params.widthM,
            params.depthM,
            params.heightM,
            params.densityKgM3,
            params.specimenYoungsModulusMpa,
            params.specimenPoissonRatio,
            params.groundYoungsModulusMpa,
            params.groundPoissonRatio,
            params.appliedLoadN,
          ]
        );
      });
    },
  };
}

export function deriveStressState(
  inputs: StressInputs,
  combinedStressPa: number,
  maxContactStressPa: number
): StressState {
  const params = toParams(inputs);
  const areaM2 = params.widthM * params.depthM;
  const volumeM3 = areaM2 * params.heightM;
  const massKg = params.densityKgM3 * volumeM3;
  const selfWeightN = massKg * 9.80665;

  return {
    ...params,
    appliedLoadStressPa: params.appliedLoadN / areaM2,
    areaM2,
    combinedStressPa,
    maxContactStressPa,
    massKg,
    selfWeightN,
    selfWeightStressPa: selfWeightN / areaM2,
    volumeM3,
  };
}

export function calculateStressState(
  runtime: ConcreteStressRuntime,
  inputs: StressInputs
): StressState {
  const combinedStressPa = runtime.calculateCombinedStressPa(inputs);
  const maxContactStressPa = runtime.calculateMaxContactStressPa(inputs);
  return deriveStressState(inputs, combinedStressPa, maxContactStressPa);
}

export async function loadConcreteStressRuntime(
  options: LoadConcreteStressRuntimeOptions = {}
): Promise<ConcreteStressRuntime> {
  runtimeState.handlers.stdout = options.onStdout ?? function () {};
  runtimeState.handlers.stderr = options.onStderr ?? function () {};

  if (runtimeState.api) {
    return runtimeState.api;
  }

  if (runtimeState.promise) {
    return runtimeState.promise;
  }

  const basePath = options.basePath ?? "/wasm";
  const buildToken = String(Date.now());
  const runtimeGlobal = globalThis as RuntimeGlobal;

  runtimeState.promise = new Promise(function (resolve, reject) {
    const previousModule = runtimeGlobal.Module;
    const script = document.createElement("script");

    runtimeGlobal.Module = {
      locateFile(path) {
        return basePath + "/" + path + "?v=" + buildToken;
      },
      onRuntimeInitialized() {
        const module = runtimeGlobal.Module;

        if (!module) {
          runtimeState.promise = null;
          reject(new Error("WebAssembly bridge initialised without an Emscripten module."));
          return;
        }

        runtimeState.api = buildRuntimeApi(module);
        resolve(runtimeState.api);
      },
      print(text) {
        runtimeState.handlers.stdout(String(text));
      },
      printErr(text) {
        runtimeState.handlers.stderr(String(text));
      },
    };

    script.async = true;
    script.onerror = function () {
      runtimeState.promise = null;
      runtimeGlobal.Module = previousModule;
      reject(new Error("Failed to load the WebAssembly bridge from " + basePath + "/main.js"));
    };
    script.src = basePath + "/main.js?v=" + buildToken;
    document.body.appendChild(script);
  });

  return runtimeState.promise;
}
