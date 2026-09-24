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
  await page.getByRole("banner").getByText("Studio Net unavailable", { exact: true }).waitFor();
  assert.match(await page.locator(".demo-note").innerText(), /not evidence of a real customer or production incident/i);

  await page.locator(".case-button").filter({ hasText: "Research memo with repair path" }).click();
  await page.locator(".docket__topline").getByText("EXPECTED · REMEDIATION_REQUIRED", { exact: true }).waitFor();
  assert.match(await page.locator(".receipt__note").innerText(), /labeled fixture calculation/i);
  assert.match(await page.locator(".receipt__note").innerText(), /locked/i);

  await page.locator(".case-button").filter({ hasText: "Unsupported source claim trace" }).click();
  await page.locator(".docket__topline").getByText("EXPECTED · BREACHED", { exact: true }).waitFor();
  await page.getByText("Expected PRIMARY", { exact: true }).first().waitFor();
  await page.getByText("Expected CONTRIBUTING", { exact: true }).first().waitFor();
  await page.getByText("Expected CLEAR", { exact: true }).first().waitFor();
  const evidenceLink = page.getByRole("link", { name: "Evidence ↗" }).first();
  assert.match(await evidenceLink.getAttribute("href"), /\/evidence\//);
  await page.screenshot({ path: resolve(reviewDir, "faultline-desktop-1440.png"), fullPage: true });

  await page.locator(".case-button").filter({ hasText: "Evidence changed after submission" }).click();
  await page.locator(".docket__topline").getByText("EXPECTED · BREACHED", { exact: true }).waitFor();
  await page.locator(".basis-note").getByText("EVIDENCE_TAMPERED", { exact: true }).waitFor();
  await page.getByText("Expected PRIMARY", { exact: true }).first().waitFor();
  await page.getByText("Expected CLEAR", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("Expected CONTRIBUTING", { exact: true }).count(), 0, "Tamper fixture only assigns a primary role to the changed agent.");
  const hashValues = await page.locator(".hash-mismatch code").allTextContents();
  assert.equal(hashValues.length, 2, "Tamper fixture shows submitted and fetched hashes.");
  assert.ok(hashValues.every((value) => /^[0-9a-f]{64}$/.test(value.trim())), "Both full SHA-256 values are visible.");
  assert.notEqual(hashValues[0].trim(), hashValues[1].trim(), "Submitted and fetched digests differ.");
  await page.screenshot({ path: resolve(reviewDir, "faultline-tamper-desktop-1440.png"), fullPage: true });
  await page.screenshot({ path: resolve(reviewDir, "faultline-tamper-desktop-viewport.png") });
  await page.getByRole("button", { name: "Plain numbers", exact: true }).click();
  await page.locator(".role-plain-table").waitFor({ state: "visible" });
  await page.locator(".role-rows").waitFor({ state: "hidden" });
  await page.screenshot({ path: resolve(reviewDir, "faultline-tamper-plain-numbers-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: resolve(reviewDir, "faultline-laptop-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 844 });
  const mobileTamperWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(mobileTamperWidth.scroll <= mobileTamperWidth.client, `375px plain-numbers viewport has horizontal overflow: ${JSON.stringify(mobileTamperWidth)}`);
  await page.screenshot({ path: resolve(reviewDir, "faultline-tamper-plain-numbers-mobile-375.png"), fullPage: true });
  await page.screenshot({ path: resolve(reviewDir, "faultline-tamper-plain-numbers-mobile-viewport.png") });
  await page.getByRole("button", { name: "Plain numbers: on", exact: true }).click();
  await page.locator("#mobile-case-picker").selectOption("preview:FLT-ACCEPT-001");
  await page.locator(".docket__topline").getByText("EXPECTED · ACCEPTED", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(reviewDir, "faultline-mobile-375.png"), fullPage: true });
  const mobileWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(mobileWidth.scroll <= mobileWidth.client, `375px viewport has horizontal overflow: ${JSON.stringify(mobileWidth)}`);

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
