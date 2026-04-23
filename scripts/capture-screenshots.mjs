import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright-core";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "artifacts", "screenshots");
const APP_URL = process.env.WEBJENGA_CAPTURE_URL || "http://127.0.0.1:4174/";
const BROWSER_PATHS = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

function timestampLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

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

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function captureState(page, filePath, prepare) {
  if (prepare) {
    await prepare(page);
  }

  await page.screenshot({
    fullPage: true,
    path: filePath,
  });
}

async function waitForApp(page) {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.waitForSelector("#viewer-canvas canvas");
  await page.waitForTimeout(1200);
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({
    executablePath: await resolveBrowserPath(),
    headless: true,
  });

  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 1600, height: 1100 },
    });
    const page = await context.newPage();
    const stamp = timestampLabel();
    const sessionDir = path.join(OUTPUT_DIR, stamp);
    await ensureDir(sessionDir);

    await waitForApp(page);

    await captureState(page, path.join(sessionDir, "01-default.png"));
    await captureState(page, path.join(sessionDir, "02-dark-section.png"), async function (targetPage) {
      await targetPage.getByRole("button", { name: /dark mode|light mode/i }).click();
      await targetPage.getByRole("button", { name: /subsurface/i }).click();
      await targetPage.getByRole("button", { name: /ground/i }).click();
      await targetPage.getByRole("button", { name: /ground/i }).click();
      await targetPage.waitForTimeout(800);
    });
    await captureState(page, path.join(sessionDir, "03-section-probe.png"), async function (targetPage) {
      await targetPage.selectOption("#vertical-section-axis", "yz");
      await targetPage.locator("#vertical-section-offset").fill("0.35");
      await targetPage.locator("#vertical-section-offset").dispatchEvent("input");
      await targetPage.waitForTimeout(400);
      const canvas = targetPage.locator("#vertical-plot-canvas");
      const box = await canvas.boundingBox();

      if (box) {
        await targetPage.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.42);
        await targetPage.waitForTimeout(500);
      }
    });

    console.log(`Saved screenshots to ${sessionDir}`);
  } finally {
    await browser.close();
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
