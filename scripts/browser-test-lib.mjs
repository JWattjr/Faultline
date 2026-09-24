import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "..");

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a local browser test port."));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function chromePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    chromium.executablePath(),
    process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    process.env.PROGRAMFILES && resolve(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && resolve(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
    process.env.PROGRAMFILES && resolve(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe"),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function waitReady(url, server, getOutput) {
  let latestError = "not started";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next server exited (${server.exitCode}): ${getOutput()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      latestError = `HTTP ${response.status}`;
    } catch (error) {
      latestError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Next server did not become ready (${latestError}): ${getOutput()}`);
}

export async function openFaultline() {
  const executablePath = chromePath();
  if (!executablePath) throw new Error("No Chromium, Chrome, or Edge executable found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to run browser gates.");
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let output = "";
  const server = spawn(process.execPath, [resolve(root, "scripts/next.mjs"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  server.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  let browser;
  try {
    await waitReady(origin, server, () => output);
    browser = await chromium.launch({ executablePath, headless: true, args: process.platform === "win32" ? [] : ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" });
    await context.route("https://studionet.genlayer.com/**", (route) => route.abort("failed"));
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return {
      browser,
      context,
      page,
      origin,
      pageErrors,
      server,
      close: async () => {
        await browser.close();
        server.kill();
      },
    };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    server.kill();
    throw error;
  }
}
