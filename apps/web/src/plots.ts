import { clamp, formatFixed } from "./formatting";
import type { PlaneSectionField } from "./stress-sampling";

export interface SectionMarker {
  uM: number;
  vM: number;
}

export interface PlotTheme {
  accent: string;
  accentSoft: string;
  background: string;
  stroke: string;
  text: string;
}

export function drawPerfGraph(
  canvas: HTMLCanvasElement,
  rateHistory: number[],
  theme: PlotTheme
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const widthPx = Math.max(Math.round(canvas.clientWidth * devicePixelRatio), 220);
  const heightPx = Math.max(Math.round(canvas.clientHeight * devicePixelRatio), 96);

  if (canvas.width !== widthPx || canvas.height !== heightPx) {
    canvas.width = widthPx;
    canvas.height = heightPx;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(devicePixelRatio, devicePixelRatio);

  const width = widthPx / devicePixelRatio;
  const height = heightPx / devicePixelRatio;
  const maxRate = Math.max(1, rateHistory.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0));

  context.clearRect(0, 0, width, height);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = theme.stroke;
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);

  if (rateHistory.length < 2) {
    context.fillStyle = theme.text;
    context.font = "600 12px Avenir Next, Segoe UI, sans-serif";
    context.fillText("Waiting for runtime samples...", 12, height * 0.56);
    return;
  }

  context.strokeStyle = theme.stroke;
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
  rateHistory.forEach(function (value, index) {
    const x = (index / Math.max(rateHistory.length - 1, 1)) * width;
    const y = height - (value / maxRate) * (height - 8) - 4;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.strokeStyle = theme.accent;
  context.lineWidth = 2;
  context.stroke();

  context.lineTo(width, height - 4);
  context.lineTo(0, height - 4);
  context.closePath();
  context.fillStyle = "color-mix(in srgb, " + theme.accentSoft + " 32%, transparent)";
  context.fill();

  const latestRate = rateHistory[rateHistory.length - 1];
  context.fillStyle = theme.text;
  context.font = "600 11px Avenir Next, Segoe UI, sans-serif";
  context.fillText(formatFixed(maxRate, 1) + " calcs/s", 8, 14);
  context.fillText(formatFixed(latestRate, 1) + " now", 8, height - 8);
}

export function drawVerticalSectionPlot(
  canvas: HTMLCanvasElement,
  field: PlaneSectionField | null,
  marker: SectionMarker | null,
  theme: PlotTheme
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const widthPx = Math.max(Math.round(canvas.clientWidth * devicePixelRatio), 320);
  const heightPx = Math.max(Math.round(canvas.clientHeight * devicePixelRatio), 240);

  if (canvas.width !== widthPx || canvas.height !== heightPx) {
    canvas.width = widthPx;
    canvas.height = heightPx;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(devicePixelRatio, devicePixelRatio);

  const width = widthPx / devicePixelRatio;
  const height = heightPx / devicePixelRatio;
  const insetLeft = 46;
  const insetRight = 12;
  const insetTop = 14;
  const insetBottom = 22;
  const plotWidth = width - insetLeft - insetRight;
  const plotHeight = height - insetTop - insetBottom;

  if (!field) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = theme.background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = theme.text;
    context.font = "600 14px Avenir Next, Segoe UI, sans-serif";
    context.fillText("Select a surface patch in the viewer to populate this plane.", 18, height * 0.5);
    return;
  }

  const cellWidth = plotWidth / Math.max(field.columns, 1);
  const cellHeight = plotHeight / Math.max(field.rows, 1);

  context.clearRect(0, 0, width, height);
  context.fillStyle = theme.background;
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

  context.strokeStyle = theme.stroke;
  context.lineWidth = 1;
  context.strokeRect(insetLeft, insetTop, plotWidth, plotHeight);

  context.fillStyle = theme.text;
  context.font = "600 11px Avenir Next, Segoe UI, sans-serif";
  context.fillText("sigma", 12, 16);
  context.fillText(field.uLabel, width - insetRight - 8, height - 6);
  context.save();
  context.translate(14, height * 0.58);
  context.rotate(-Math.PI / 2);
  context.fillText(field.vLabel, 0, 0);
  context.restore();

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

function createGroundPlotColorString(colors: number[], valueIndex: number) {
  const colorOffset = valueIndex * 3;
  const r = Math.round(colors[colorOffset] * 255);
  const g = Math.round(colors[colorOffset + 1] * 255);
  const b = Math.round(colors[colorOffset + 2] * 255);

  return "rgb(" + r + ", " + g + ", " + b + ")";
}
