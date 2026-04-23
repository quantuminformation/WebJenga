export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function formatFixed(value: number, digits: number) {
  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatRounded(value: number) {
  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: 0,
  });
}

export function formatStepValue(value: number, digits = 1) {
  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    useGrouping: false,
  });
}

export function formatForce(value: number) {
  if (Math.abs(value) >= 1000) {
    return formatFixed(value / 1000, 1) + " kN";
  }

  return formatRounded(value) + " N";
}
