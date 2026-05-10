import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("builds runtime-neutral Annotation Card and Badge visual models", async () => {
  const core = await importCoreModule();
  const card = core.buildAnnotationCardVisualModel({
    annotationNumber: 3,
    body: "Explain this state.",
    subjectSummary: "Primary Button, Secondary Button",
  });
  const badge = core.buildAnnotationBadgeVisualModel({ annotationNumber: 3 });

  assert.equal(card.frame.width, 280);
  assert.equal(card.frame.cornerRadius, 8);
  assert.equal(card.title.text, "Annotation #3");
  assert.equal(card.subjectLabel.text, "Subjects: Primary Button, Secondary Button");
  assert.equal(card.body.width, 248);
  assert.equal(core.getAnnotationCardRenderedHeight({ bodyHeight: 30, visual: card }), 112);
  assert.equal(core.getAnnotationCardRenderedHeight({ bodyHeight: 70, visual: card }), 152);

  assert.equal(badge.frame.size, 28);
  assert.equal(badge.frame.cornerRadius, 14);
  assert.equal(badge.number.text, "3");
  assert.deepEqual(
    core.getCenteredAnnotationBadgeNumberPosition({
      badgeVisual: badge,
      textHeight: 12,
      textWidth: 7,
    }),
    { x: 10.5, y: 8 },
  );
});

test("centralizes Annotation visual layout positions used by operation batches", async () => {
  const core = await importCoreModule();

  assert.deepEqual(
    core.getAnnotationCardCreationBasePosition({
      subjectBounds: { x: 10, y: 20, width: 240, height: 50 },
    }),
    { x: 10, y: 110 },
  );
  assert.deepEqual(
    core.getAnnotationBadgePosition({
      badgeIndex: 2,
      subjectBounds: { x: 100, y: 40, width: 80, height: 48 },
    }),
    { x: 230, y: 26 },
  );

  const batch = core.buildCreateAnnotationOperationBatch({
    annotationId: "annotation-1",
    annotationNumber: 3,
    body: "Body",
    contextFrameId: "frame-1",
    now: "2026-05-10T00:00:00.000Z",
    subjects: [
      {
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-1",
        name: "Primary Button",
      },
    ],
  });
  const cardOperation = batch.operations.find(
    (operation) => operation.type === "create-annotation-card",
  );
  const badgeOperation = batch.operations.find(
    (operation) => operation.type === "create-annotation-badge",
  );

  assert.equal(cardOperation.visual.title.text, "Annotation #3");
  assert.equal(cardOperation.visual.frame.width, 280);
  assert.equal(badgeOperation.visual.number.text, "3");
  assert.equal(badgeOperation.visual.frame.size, 28);
});
