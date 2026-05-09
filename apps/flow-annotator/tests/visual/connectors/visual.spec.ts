import { expect, test } from "@playwright/test";

import { buildConnectorFixture, connectorFixtureDefinitions } from "./fixtures";

test.describe("Flow Connector browser visuals", () => {
  for (const definition of connectorFixtureDefinitions) {
    test(`${definition.name} renders from the connector visual model`, async ({ page }) => {
      const fixture = buildConnectorFixture(definition);

      expect(fixture.routePoints.length).toBeGreaterThanOrEqual(2);
      expect(routeIsOrthogonal(fixture.routePoints)).toBe(true);
      expect(fixture.visual.route.svg).toContain("<path");
      expect(fixture.visual.route.svg).toContain('fill="#1F3A5A"');

      await page.setViewportSize({ width: 720, height: 520 });
      await page.setContent(fixture.html);

      await expect(page.locator(".scene")).toHaveScreenshot(`${definition.name}.png`, {
        animations: "disabled",
        scale: "css",
      });
    });
  }
});

function routeIsOrthogonal(points: Array<{ x: number; y: number }>): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start.x !== end.x && start.y !== end.y) {
      return false;
    }
  }
  return true;
}
