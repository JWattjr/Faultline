import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openFaultline } from "./browser-test-lib.mjs";

const reviewDir = resolve(import.meta.dirname, "..", ".impeccable", "review");
mkdirSync(reviewDir, { recursive: true });
const app = await openFaultline();
try {
  const { page } = app;
  await page.getByRole("heading", { name: "The handoff, on record." }).waitFor();
  await page.getByRole("heading", { name: "Source-led market brief" }).waitFor();
  await page.getByText("Synthetic fixture preview", { exact: true }).waitFor();
  await page.getByRole("banner").getByText("Studio Next unavailable", { exact: true }).waitFor();
  assert.match(await page.locator(".demo-note").innerText(), /not evidence of a real customer or production incident/i);

  await page.locator(".case-button").filter({ hasText: "Research memo with repair path" }).click();
  await page.locator(".docket__topline").getByText("EXPECTED · REMEDIATION_REQUIRED", { exact: true }).waitFor();
  assert.match(await page.locator(".receipt__note").innerText(), /labeled fixture calculation/i);
  assert.match(await page.locator(".receipt__note").innerText(), /locked/i);

  await page.locator(".case-button").filter({ hasText: "Unsupported source claim trace" }).click();
  await page.locator(".docket__topline").getByText("EXPECTED · BREACHED", { exact: true }).waitFor();
  await page.getByText("Expected PRIMARY", { exact: true }).waitFor();
  await page.getByText("Expected CONTRIBUTING", { exact: true }).waitFor();
  await page.getByText("Expected CLEAR", { exact: true }).waitFor();
  const evidenceLink = page.getByRole("link", { name: "Evidence ↗" }).first();
  assert.match(await evidenceLink.getAttribute("href"), /\/evidence\//);
  await page.screenshot({ path: resolve(reviewDir, "faultline-desktop-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: resolve(reviewDir, "faultline-laptop-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#mobile-case-picker").selectOption("preview:FLT-ACCEPT-001");
  await page.locator(".docket__topline").getByText("EXPECTED · ACCEPTED", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(reviewDir, "faultline-mobile-390.png"), fullPage: true });
  const mobileWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(mobileWidth.scroll <= mobileWidth.client, `390px viewport has horizontal overflow: ${JSON.stringify(mobileWidth)}`);

  const unnamedControls = await page.locator("button, input, select, textarea").evaluateAll((nodes) => nodes.filter((node) => {
    const label = node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.labels?.[0]?.textContent || node.textContent;
    return !label?.trim();
  }).length);
  assert.equal(unnamedControls, 0, "Every interactive control should have an accessible name.");
  assert.deepEqual(app.pageErrors, [], `Browser runtime errors: ${app.pageErrors.join(" | ")}`);
  console.log(`UI review passed against the production build. Screenshots: ${reviewDir}`);
} finally {
  await app.close();
}
