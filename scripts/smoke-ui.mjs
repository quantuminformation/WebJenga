import process from "node:process";
import fs from "node:fs/promises";
import zlib from "node:zlib";

import { chromium } from "playwright-core";

const APP_URL = process.env.WEBJENGA_SMOKE_URL || "http://127.0.0.1:4174/";
const BROWSER_PATHS = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

async function resolveBrowserPath() {
  if (process.env.WEBJENGA_BROWSER_PATH) {
    return process.env.WEBJENGA_BROWSER_PATH;
  }

  for (const candidate of BROWSER_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser path.
    }
  }

  throw new Error("No supported local Chromium browser was found. Set WEBJENGA_BROWSER_PATH.");
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePngRgba(buffer) {
  const signature = "89504e470d0a1a0a";

  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Canvas screenshot was not a PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += length + 12;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const sourceChannels = colorType === 6 ? 4 : 3;
  const rowLength = width * sourceChannels;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const raw = Buffer.alloc(height * rowLength);

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[row * (rowLength + 1)];
    const sourceStart = row * (rowLength + 1) + 1;
    const targetStart = row * rowLength;

    for (let column = 0; column < rowLength; column += 1) {
      const source = inflated[sourceStart + column];
      const left = column >= sourceChannels ? raw[targetStart + column - sourceChannels] : 0;
      const above = row > 0 ? raw[targetStart + column - rowLength] : 0;
      const upperLeft = row > 0 && column >= sourceChannels
        ? raw[targetStart + column - rowLength - sourceChannels]
        : 0;

      switch (filter) {
        case 0:
          raw[targetStart + column] = source;
          break;
        case 1:
          raw[targetStart + column] = (source + left) & 0xff;
          break;
        case 2:
          raw[targetStart + column] = (source + above) & 0xff;
          break;
        case 3:
          raw[targetStart + column] = (source + Math.floor((left + above) / 2)) & 0xff;
          break;
        case 4:
          raw[targetStart + column] = (source + paethPredictor(left, above, upperLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter: ${filter}`);
      }
    }
  }

  return { colorType, data: raw, height, sourceChannels, width };
}

async function canvasHasPaint(page) {
  const screenshot = await page.locator("#viewer-canvas canvas").screenshot();
  const image = decodePngRgba(screenshot);
  const samples = 11;
  const seenColors = new Set();

  for (let yIndex = 1; yIndex <= samples; yIndex += 1) {
    for (let xIndex = 1; xIndex <= samples; xIndex += 1) {
      const x = Math.floor((image.width * xIndex) / (samples + 1));
      const y = Math.floor((image.height * yIndex) / (samples + 1));
      const pixelIndex = (y * image.width + x) * image.sourceChannels;
      const red = image.data[pixelIndex];
      const green = image.data[pixelIndex + 1];
      const blue = image.data[pixelIndex + 2];
      const alpha = image.colorType === 6 ? image.data[pixelIndex + 3] : 255;

      if (alpha > 0) {
        seenColors.add(`${red},${green},${blue}`);
      }

      if (seenColors.size >= 4) {
        return true;
      }
    }
  }

  return false;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: await resolveBrowserPath(),
    headless: true,
  });
  const consoleErrors = [];
  const failedResponses = [];
  const pageErrors = [];

  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 1440, height: 960 },
    });
    const page = await context.newPage();

    page.on("console", function (message) {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", function (error) {
      pageErrors.push(error.message);
    });
    page.on("response", function (response) {
      if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(APP_URL, { waitUntil: "networkidle" });
    await page.waitForSelector("#viewer-canvas canvas");
    await page.waitForFunction(function () {
      return Number.parseFloat(document.querySelector("#stress-kpa")?.textContent || "0") > 0;
    });

    if (!(await canvasHasPaint(page))) {
      throw new Error("Viewer canvas rendered blank.");
    }

    const initialStress = await page.locator("#stress-kpa").textContent();
    await page.locator("#height").fill("5.0");
    await page.locator("#height").dispatchEvent("input");
    await page.waitForTimeout(1300);
    const updatedStress = await page.locator("#stress-kpa").textContent();

    if (initialStress === updatedStress) {
      throw new Error("Changing height did not update the stress readout.");
    }

    await page.getByRole("button", { name: /C\+\+ model report/i }).click();
    await page.waitForSelector("#report-window:not(.is-hidden)");
    await page.waitForFunction(function () {
      return document.querySelector("#output")?.textContent?.includes("Concrete prism stress demo");
    });

    if (consoleErrors.length || failedResponses.length || pageErrors.length) {
      throw new Error(
        ["Browser errors were reported:", ...consoleErrors, ...failedResponses, ...pageErrors].join("\n")
      );
    }

    console.log("UI smoke test passed");
  } finally {
    await browser.close();
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
