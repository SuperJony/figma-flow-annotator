import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("builds a runtime-neutral Flow Connector visual model", async () => {
  const core = await importCoreModule();
  const visual = core.buildFlowConnectorVisualModel({
    flowAction: " click ",
    routePoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  });

  assert.deepEqual(visual.route.bounds, { x: -6, y: -14, width: 112, height: 28 });
  assert.equal(
    visual.route.svg,
    '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="28" viewBox="0 0 112 28"><path d="M 6 14 L 88 14" fill="none" stroke="#1F3A5A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M 106 14 L 88 22 L 88 6 Z" fill="#1F3A5A"/></svg>',
  );
  assert.deepEqual(visual.label?.center, { x: 50, y: 0 });
  assert.equal(visual.label?.text, "click");
  assert.equal(visual.trunkSegment, null);
});

test("keeps Flow Action labels off the shared Connector Trunk", async () => {
  const core = await importCoreModule();
  const sharedTrunkSegment = {
    end: { x: 300, y: 80 },
    index: 2,
    length: 60,
    start: { x: 240, y: 80 },
  };
  const visual = core.buildFlowConnectorVisualModel({
    flowAction: "Choose A",
    routePoints: [
      { x: 0, y: 20 },
      { x: 160, y: 20 },
      { x: 160, y: 80 },
      sharedTrunkSegment.start,
      sharedTrunkSegment.end,
    ],
    sharedTrunkSegment,
  });

  assert.deepEqual(visual.trunkSegment, sharedTrunkSegment);
  assert.notDeepEqual(visual.label?.center, { x: 270, y: 80 });
  assert.deepEqual(visual.label?.center, { x: 80, y: 20 });
});
