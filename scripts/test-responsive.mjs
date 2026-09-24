import assert from "node:assert/strict";
import { openFaultline } from "./browser-test-lib.mjs";

const app = await openFaultline();
try {
  const { page } = app;
  await page.getByRole("heading", { name: "The handoff, on record." }).waitFor();
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scroll <= dimensions.width, `${width}px viewport overflow: ${JSON.stringify(dimensions)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const shortTargets = await page.locator("button, select, input, textarea, .trace-row__links a, .evidence-links a").evaluateAll((nodes) => nodes.flatMap((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width && rect.height < 44 ? [`${node.tagName.toLowerCase()}.${node.className}: ${Math.round(rect.width)}×${Math.round(rect.height)}`] : [];
  }));
  assert.deepEqual(shortTargets, [], `Interactive touch targets under 44px: ${shortTargets.join(", ")}`);
  assert.deepEqual(app.pageErrors, [], `Browser runtime errors: ${app.pageErrors.join(" | ")}`);
  console.log("Responsive review passed at 1440px, 1280px, and 390px; no horizontal overflow or undersized interactive targets.");
} finally {
  await app.close();
}
