import { expect, test } from "@playwright/test";

import { annotationFixtureDefinitions, buildAnnotationFixture } from "./fixtures";

test.describe("Annotation browser visuals", () => {
  for (const definition of annotationFixtureDefinitions) {
    test(`${definition.name} renders from the real annotation creation path`, async ({ page }) => {
      const fixture = await buildAnnotationFixture(definition);

      expect(fixture.cardCount).toBe(1);
      expect(fixture.badgeCount).toBe(definition.subjects.length);
      expect(fixture.statusMessage).toBe(
        `Created annotation #1 with ${definition.subjects.length} badge(s).`,
      );

      await page.setViewportSize({ width: 720, height: 520 });
      await page.setContent(fixture.html);

      await expect(page.locator(".annotation-card")).toHaveCount(1);
      await expect(page.locator(".annotation-badge")).toHaveCount(definition.subjects.length);

      await expect(page.locator(".scene")).toHaveScreenshot(`${definition.name}.png`, {
        animations: "disabled",
        scale: "css",
      });
    });
  }
});
