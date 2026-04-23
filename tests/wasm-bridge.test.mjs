import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(rootDir, "packages", "wasm-bridge", "src", "index.ts");
const tempDir = path.join(os.tmpdir(), "webjenga-tests");
const compiledPath = path.join(tempDir, `wasm-bridge-${process.pid}.mjs`);

async function loadBridgeModule() {
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });

  await mkdir(tempDir, { recursive: true });
  await writeFile(compiledPath, compiled.outputText);
  return import(compiledPath);
}

const bridge = await loadBridgeModule();

function assertNear(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

const defaultInputs = {
  appliedLoadN: 2500,
  densityKgM3: 2400,
  depthM: 1,
  groundPoissonRatio: 0.3,
  groundYoungsModulusMpa: 120,
  heightM: 10,
  specimenPoissonRatio: 0.2,
  specimenYoungsModulusMpa: 30000,
  widthM: 1,
};

test("deriveStressState preserves the first-order stress identities", function () {
  const combinedStressPa = 237859.6;
  const maxContactStressPa = combinedStressPa;
  const state = bridge.deriveStressState(defaultInputs, combinedStressPa, maxContactStressPa);

  assert.equal(state.areaM2, 1);
  assert.equal(state.volumeM3, 10);
  assert.equal(state.massKg, 24000);
  assertNear(state.selfWeightN, 235359.6);
  assertNear(state.selfWeightStressPa, 235359.6);
  assert.equal(state.appliedLoadStressPa, 2500);
  assert.equal(state.combinedStressPa, combinedStressPa);
  assert.equal(state.maxContactStressPa, maxContactStressPa);
});

test("deriveStressState coerces numeric input values before deriving units", function () {
  const state = bridge.deriveStressState(
    {
      ...defaultInputs,
      appliedLoadN: "5000",
      densityKgM3: "2000",
      depthM: "0.5",
      heightM: "4",
      widthM: "2",
    },
    44806.65,
    44806.65
  );

  assert.equal(state.areaM2, 1);
  assert.equal(state.volumeM3, 4);
  assert.equal(state.massKg, 8000);
  assertNear(state.selfWeightN, 78453.2);
  assert.equal(state.appliedLoadStressPa, 5000);
});

test("calculateStressState delegates solver values to the runtime and derives display fields", function () {
  const calls = [];
  const runtime = {
    calculateCombinedStressPa(inputs) {
      calls.push(["combined", inputs]);
      return 12345;
    },
    calculateMaxContactStressPa(inputs) {
      calls.push(["contact", inputs]);
      return 13000;
    },
  };

  const state = bridge.calculateStressState(runtime, defaultInputs);

  assert.deepEqual(
    calls.map(function (entry) {
      return entry[0];
    }),
    ["combined", "contact"]
  );
  assert.equal(calls[0][1], defaultInputs);
  assert.equal(calls[1][1], defaultInputs);
  assert.equal(state.combinedStressPa, 12345);
  assert.equal(state.maxContactStressPa, 13000);
  assert.equal(state.appliedLoadStressPa, 2500);
});
