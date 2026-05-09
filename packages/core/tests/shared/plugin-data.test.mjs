import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("exports shared plugin data namespace and key conventions", async () => {
  const core = await importCoreModule();

  assert.equal(core.SHARED_PLUGIN_DATA.namespace, "figma_flow_annotator");
  assert.deepEqual(Object.values(core.SHARED_PLUGIN_DATA.keys), [
    "kind",
    "annotation",
    "badgeRef",
    "connector",
    "annotationRefs",
    "connectorRefs",
    "context",
  ]);
});
