import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(appRoot, '.test-build-annotation');
const namespace = 'figma_flow_annotator';

test('creates an Annotation without scanning unrelated frame descendants for numbering', async () => {
  try {
    const page = createPage();
    const subjectA = createNode(page, 'subject-a', 0);
    const subjectB = createNode(page, 'subject-b', 180);
    const unrelatedFrame = createNode(page, 'unrelated-frame', 480);
    const nestedChild = createNode(unrelatedFrame, 'nested-child', 520);
    const annotationsContainer = createNode(page, 'FFA Annotations', 800);
    const existingCard = createNode(annotationsContainer, 'FFA Annotation Card #4', 820);
    const messages = [];

    annotationsContainer.setSharedPluginData(namespace, 'kind', 'container');
    existingCard.setSharedPluginData(namespace, 'kind', 'annotation-card');
    existingCard.setSharedPluginData(namespace, 'annotation', JSON.stringify({
      schemaVersion: 1,
      id: 'annotation-existing',
      annotationNumber: 4,
      body: 'existing',
      contextFrameId: page.id,
      subjectNodeIds: ['old-subject'],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }));

    nestedChild.getSharedPluginData = () => {
      throw new Error('Annotation numbering must not scan unrelated frame descendants.');
    };
    unrelatedFrame.children = [nestedChild];
    annotationsContainer.children = [existingCard];
    page.children = [subjectA, subjectB, unrelatedFrame, annotationsContainer];
    page.selection = [subjectA, subjectB];
    globalThis.figma = createFigmaStub(page, messages);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'create-annotation', body: 'New note' });
    await flushPluginMessage(messages);

    const createdCard = annotationsContainer.children.find(
      (child) => child.getSharedPluginData(namespace, 'kind') === 'annotation-card' && child !== existingCard,
    );
    const createdRecord = JSON.parse(createdCard.getSharedPluginData(namespace, 'annotation'));
    const createdBadges = annotationsContainer.children.filter(
      (child) => child.getSharedPluginData(namespace, 'kind') === 'annotation-badge',
    );
    const contextRecord = JSON.parse(page.getSharedPluginData(namespace, 'context'));
    const status = messages.find((message) => message.type === 'status' && message.tone === 'success');

    assert.ok(createdCard);
    assert.equal(createdCard.name, 'FFA Annotation Card #5');
    assert.equal(createdRecord.schemaVersion, 1);
    assert.equal(createdRecord.annotationNumber, 5);
    assert.deepEqual(createdRecord.subjectNodeIds, ['subject-a', 'subject-b']);
    assert.equal(createdBadges.length, 2);
    assert.deepEqual(readAnnotationRefs(subjectA), [createdRecord.id]);
    assert.deepEqual(readAnnotationRefs(subjectB), [createdRecord.id]);
    assert.equal(contextRecord.nextAnnotationNumber, 6);
    assert.equal(status.message, 'Created annotation #5 with 2 badge(s).');
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('adds Subject Nodes to a selected Annotation Card without renumbering or duplicate badges', async () => {
  try {
    const page = createPage();
    const subjectA = createNode(page, 'subject-a', 0);
    const subjectB = createNode(page, 'subject-b', 180);
    const annotationsContainer = createNode(page, 'FFA Annotations', 800);
    const existingCard = createNode(annotationsContainer, 'FFA Annotation Card #4', 820);
    const existingBadge = createNode(annotationsContainer, 'FFA Annotation Badge #4', 850);
    const messages = [];

    annotationsContainer.setSharedPluginData(namespace, 'kind', 'container');
    existingCard.setSharedPluginData(namespace, 'kind', 'annotation-card');
    existingCard.setSharedPluginData(namespace, 'annotation', JSON.stringify({
      schemaVersion: 1,
      id: 'annotation-existing',
      annotationNumber: 4,
      body: 'existing body',
      contextFrameId: page.id,
      subjectNodeIds: ['subject-a'],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }));
    existingBadge.setSharedPluginData(namespace, 'kind', 'annotation-badge');
    existingBadge.setSharedPluginData(namespace, 'badgeRef', JSON.stringify({
      schemaVersion: 1,
      annotationId: 'annotation-existing',
      annotationNumber: 4,
      subjectNodeId: 'subject-a',
      contextFrameId: page.id,
    }));
    subjectA.setSharedPluginData(namespace, 'annotationRefs', JSON.stringify({
      schemaVersion: 1,
      annotationIds: ['annotation-existing'],
    }));

    annotationsContainer.children = [existingCard, existingBadge];
    page.children = [subjectA, subjectB, annotationsContainer];
    page.selection = [existingCard, subjectA, subjectB];
    globalThis.figma = createFigmaStub(page, messages);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'add-subject-nodes' });
    await flushPluginMessage(messages);

    const updatedRecord = JSON.parse(existingCard.getSharedPluginData(namespace, 'annotation'));
    const badges = annotationsContainer.children.filter(
      (child) => child.getSharedPluginData(namespace, 'kind') === 'annotation-badge',
    );
    const subjectBBadge = badges.find((badge) => {
      const ref = JSON.parse(badge.getSharedPluginData(namespace, 'badgeRef'));
      return ref.subjectNodeId === 'subject-b';
    });
    const subjectABadges = badges.filter((badge) => {
      const ref = JSON.parse(badge.getSharedPluginData(namespace, 'badgeRef'));
      return ref.subjectNodeId === 'subject-a';
    });
    const status = messages.find((message) => message.type === 'status' && message.tone === 'success');

    assert.equal(updatedRecord.annotationNumber, 4);
    assert.equal(updatedRecord.body, 'existing body');
    assert.deepEqual(updatedRecord.subjectNodeIds, ['subject-a', 'subject-b']);
    assert.equal(badges.length, 2);
    assert.equal(subjectABadges.length, 1);
    assert.ok(subjectBBadge);
    assert.deepEqual(readAnnotationRefs(subjectB), ['annotation-existing']);
    assert.equal(status.message, 'Added 1 subject node(s) to annotation #4 with 1 new badge(s).');
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('explicitly arranges Annotation Badges and Annotation Cards by Annotation Number', async () => {
  try {
    const page = createPage();
    const contextFrame = createNode(page, 'context-frame', 0);
    contextFrame.resize(320, 180);
    const subject = createNode(contextFrame, 'subject-a', 20);
    subject.absoluteBoundingBox = { x: 20, y: 30, width: 120, height: 60 };
    const annotationsContainer = createNode(page, 'FFA Annotations', 800);
    const badge7 = createNode(annotationsContainer, 'FFA Annotation Badge #7', 300);
    const badge2 = createNode(annotationsContainer, 'FFA Annotation Badge #2', 260);
    const card7 = createNode(annotationsContainer, 'FFA Annotation Card #7', 900);
    const card2 = createNode(annotationsContainer, 'FFA Annotation Card #2', 940);
    const messages = [];

    annotationsContainer.setSharedPluginData(namespace, 'kind', 'container');
    setBadgeRecord(badge7, 7, subject.id, page.id);
    setBadgeRecord(badge2, 2, subject.id, page.id);
    setCardRecord(card7, 7, contextFrame.id);
    setCardRecord(card2, 2, contextFrame.id);
    annotationsContainer.children = [badge7, badge2, card7, card2];
    contextFrame.children = [subject];
    page.children = [contextFrame, annotationsContainer];
    page.selection = [subject];
    globalThis.figma = createFigmaStub(page, messages);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'arrange-badges' });
    await flushPluginMessage(messages);
    assert.equal(badge2.x, 126);
    assert.equal(badge2.y, 16);
    assert.equal(badge7.x, 158);
    assert.equal(badge7.y, 16);

    messages.length = 0;
    globalThis.figma.ui.onmessage({ type: 'arrange-cards' });
    await flushPluginMessage(messages);
    assert.equal(card2.x, 0);
    assert.equal(card2.y, 220);
    assert.equal(card7.x, 0);
    assert.equal(card7.y, 336);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('validates Annotation bindings and locates validation issue nodes without shared report data', async () => {
  try {
    const page = createPage();
    const contextFrame = createNode(page, 'context-frame', 0);
    contextFrame.resize(320, 180);
    contextFrame.absoluteBoundingBox = { x: 0, y: 0, width: 320, height: 180 };
    const subjectA = createNode(contextFrame, 'subject-a', 20);
    const subjectB = createNode(contextFrame, 'subject-b', 160);
    const annotationsContainer = createNode(page, 'FFA Annotations', 800);
    const cardMissingBody = createNode(annotationsContainer, 'card-missing-body', 900);
    const cardMissingBadge = createNode(annotationsContainer, 'card-missing-badge', 940);
    const duplicateBadgeA = createNode(annotationsContainer, 'badge-duplicate-a', 260);
    const duplicateBadgeB = createNode(annotationsContainer, 'badge-duplicate-b', 300);
    const messages = [];
    const scrollEvents = [];

    subjectA.absoluteBoundingBox = { x: 20, y: 24, width: 100, height: 50 };
    subjectB.absoluteBoundingBox = { x: 160, y: 24, width: 100, height: 50 };
    subjectA.setSharedPluginData(namespace, 'annotationRefs', JSON.stringify({
      schemaVersion: 1,
      annotationIds: ['annotation-1'],
    }));
    subjectB.setSharedPluginData(namespace, 'annotationRefs', JSON.stringify({
      schemaVersion: 1,
      annotationIds: ['annotation-2', 'annotation-missing-card'],
    }));
    annotationsContainer.setSharedPluginData(namespace, 'kind', 'container');
    setCardRecord(cardMissingBody, 1, contextFrame.id);
    cardMissingBody.setSharedPluginData(namespace, 'annotation', JSON.stringify({
      schemaVersion: 1,
      id: 'annotation-1',
      annotationNumber: 1,
      body: '',
      contextFrameId: contextFrame.id,
      subjectNodeIds: ['subject-a'],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }));
    setCardRecord(cardMissingBadge, 2, contextFrame.id);
    cardMissingBadge.setSharedPluginData(namespace, 'annotation', JSON.stringify({
      schemaVersion: 1,
      id: 'annotation-2',
      annotationNumber: 2,
      body: 'missing badge',
      contextFrameId: contextFrame.id,
      subjectNodeIds: ['subject-b'],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }));
    setBadgeRecord(duplicateBadgeA, 1, subjectA.id, contextFrame.id);
    setBadgeRecord(duplicateBadgeB, 1, subjectA.id, contextFrame.id);

    annotationsContainer.children = [cardMissingBody, cardMissingBadge, duplicateBadgeA, duplicateBadgeB];
    contextFrame.children = [subjectA, subjectB];
    page.children = [contextFrame, annotationsContainer];
    globalThis.figma = createFigmaStub(page, messages, scrollEvents);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'validate-bindings' });
    await flushPluginMessage(messages);

    const reportMessage = messages.find((message) => message.type === 'validation-report');
    assert.ok(reportMessage);
    assert.equal(reportMessage.report.summary.errors, 2);
    assert.equal(reportMessage.report.summary.warnings, 3);
    assert.equal(reportMessage.report.summary.info, 1);
    assert.deepEqual(
      reportMessage.report.issues.map((issue) => issue.code),
      [
        'annotation-missing-badge',
        'annotation-duplicate-badge',
        'annotation-orphaned',
        'annotation-missing-body',
        'annotation-card-outside-design-notes-area',
        'annotation-badges-unarranged',
      ],
    );
    assert.equal(page.getSharedPluginData(namespace, 'validationReport'), '');
    assert.equal(cardMissingBody.getSharedPluginData(namespace, 'validationReport'), '');

    const missingBodyIssue = reportMessage.report.issues.find((issue) => issue.code === 'annotation-missing-body');
    messages.length = 0;
    globalThis.figma.ui.onmessage({ type: 'locate-validation-issue', issueId: missingBodyIssue.id });
    await flushPluginMessage(messages);

    assert.deepEqual(page.selection.map((node) => node.id), ['card-missing-body']);
    assert.deepEqual(scrollEvents.at(-1).map((node) => node.id), ['card-missing-body']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('validates Flow Connector references, locates issues, and cleans stale indexes', async () => {
  try {
    const page = createPage();
    const start = createNode(page, 'start-endpoint', 0);
    const end = createNode(page, 'end-endpoint', 160);
    const invalidEndpoint = createNode(page, 'annotation-card-endpoint', 320);
    const formerEndpoint = createNode(page, 'former-endpoint', 480);
    const connectorsContainer = createNode(page, 'FFA Connectors', 800);
    const orphanConnector = createNode(connectorsContainer, 'connector-orphan-root', 840);
    const invalidConnector = createNode(connectorsContainer, 'connector-invalid-root', 880);
    const duplicateConnectorA = createNode(connectorsContainer, 'connector-duplicate-root-a', 920);
    const duplicateConnectorB = createNode(connectorsContainer, 'connector-duplicate-root-b', 960);
    const messages = [];
    const scrollEvents = [];

    invalidEndpoint.setSharedPluginData(namespace, 'kind', 'annotation-card');
    setConnectorRefs(start, ['connector-duplicate-a', 'connector-deleted-root']);
    setConnectorRefs(end, ['connector-duplicate-a', 'connector-duplicate-b']);
    setConnectorRefs(invalidEndpoint, ['connector-invalid']);
    setConnectorRefs(formerEndpoint, ['connector-deleted-root', 'connector-invalid']);
    connectorsContainer.setSharedPluginData(namespace, 'kind', 'container');
    setConnectorRecord(orphanConnector, 'connector-orphan', 'deleted-start', end.id, 'open');
    setConnectorRecord(invalidConnector, 'connector-invalid', invalidEndpoint.id, end.id, 'open');
    setConnectorRecord(duplicateConnectorA, 'connector-duplicate-a', start.id, end.id, null);
    setConnectorRecord(duplicateConnectorB, 'connector-duplicate-b', start.id, end.id, 'open');

    connectorsContainer.children = [
      orphanConnector,
      invalidConnector,
      duplicateConnectorA,
      duplicateConnectorB,
    ];
    page.children = [start, end, invalidEndpoint, formerEndpoint, connectorsContainer];
    globalThis.figma = createFigmaStub(page, messages, scrollEvents);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'validate-bindings' });
    await flushPluginMessage(messages);

    const reportMessage = messages.find((message) => message.type === 'validation-report');
    assert.ok(reportMessage);
    assert.deepEqual(reportMessage.report.summary, {
      all: 5,
      errors: 3,
      warnings: 2,
      info: 0,
    });
    assert.deepEqual(
      reportMessage.report.issues.map((issue) => issue.code),
      [
        'flow-connector-orphaned',
        'flow-endpoint-invalid',
        'flow-connector-duplicate',
        'flow-action-empty',
        'connector-reverse-index-stale',
      ],
    );

    const staleIssue = reportMessage.report.issues.find((issue) => issue.code === 'connector-reverse-index-stale');
    messages.length = 0;
    globalThis.figma.ui.onmessage({ type: 'locate-validation-issue', issueId: staleIssue.id });
    await flushPluginMessage(messages);

    assert.deepEqual(page.selection.map((node) => node.id), ['start-endpoint', 'former-endpoint']);
    assert.deepEqual(scrollEvents.at(-1).map((node) => node.id), ['start-endpoint', 'former-endpoint']);

    messages.length = 0;
    globalThis.figma.ui.onmessage({ type: 'clean-stale-indexes' });
    await flushPluginMessage(messages);

    const cleanReport = messages.filter((message) => message.type === 'validation-report').at(-1).report;
    const cleanStatus = messages.find((message) => message.type === 'status' && message.tone === 'success');
    assert.deepEqual(readConnectorRefs(start), ['connector-duplicate-a']);
    assert.deepEqual(readConnectorRefs(end), ['connector-duplicate-a', 'connector-duplicate-b']);
    assert.deepEqual(readConnectorRefs(invalidEndpoint), ['connector-invalid']);
    assert.deepEqual(readConnectorRefs(formerEndpoint), ['connector-invalid']);
    assert.equal(cleanReport.issues.some((issue) => issue.code === 'connector-reverse-index-stale'), false);
    assert.equal(cleanReport.issues.some((issue) => issue.code === 'flow-endpoint-invalid'), true);
    assert.equal(connectorsContainer.children.length, 4);
    assert.equal(connectorsContainer.children.some((node) => readConnectorId(node) === 'connector-deleted-root'), false);
    assert.equal(
      cleanStatus.message,
      'Cleaned stale indexes on 2 Flow Endpoint(s); removed 2 stale connector reference(s).',
    );
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('validates route, label, and trunk connector issues without shared report data', async () => {
  try {
    const page = createPage();
    const startCrossing = createNode(page, 'start-crossing', 0);
    const endCrossing = createNode(page, 'end-crossing', 420);
    const crossingObstacle = createNode(page, 'middle-obstacle', 190);
    const startFailure = createNode(page, 'start-failure', 0);
    const endFailure = createNode(page, 'end-failure', 320);
    const walls = [
      createNode(page, 'left-wall', -60),
      createNode(page, 'right-wall', 80),
      createNode(page, 'top-wall', -60),
      createNode(page, 'bottom-wall', -60),
    ];
    const labelStartA = createNode(page, 'label-start-a', 0);
    const labelEndA = createNode(page, 'label-end-a', 220);
    const labelStartB = createNode(page, 'label-start-b', 0);
    const labelEndB = createNode(page, 'label-end-b', 220);
    const trunkStartA = createNode(page, 'trunk-start-a', 0);
    const trunkStartB = createNode(page, 'trunk-start-b', 0);
    const trunkEnd = createNode(page, 'trunk-end', 420);
    const connectorsContainer = createNode(page, 'FFA Connectors', 900);
    const crossingConnector = createNode(connectorsContainer, 'connector-crossing-root', 900);
    const failureConnector = createNode(connectorsContainer, 'connector-failure-root', 940);
    const labelConnectorA = createNode(connectorsContainer, 'connector-label-root-a', 980);
    const labelConnectorB = createNode(connectorsContainer, 'connector-label-root-b', 1020);
    const trunkConnectorA = createNode(connectorsContainer, 'connector-trunk-root-a', 1060);
    const trunkConnectorB = createNode(connectorsContainer, 'connector-trunk-root-b', 1100);
    const messages = [];
    const scrollEvents = [];

    moveNode(startCrossing, { x: 0, y: 0, width: 100, height: 100 });
    moveNode(endCrossing, { x: 420, y: 0, width: 100, height: 100 });
    moveNode(crossingObstacle, { x: 190, y: 0, width: 100, height: 120 });
    moveNode(startFailure, { x: 0, y: 320, width: 80, height: 80 });
    moveNode(endFailure, { x: 320, y: 320, width: 80, height: 80 });
    [
      { x: -60, y: 260, width: 50, height: 200 },
      { x: 80, y: 260, width: 50, height: 200 },
      { x: -60, y: 260, width: 190, height: 50 },
      { x: -60, y: 400, width: 190, height: 50 },
    ].forEach((rect, index) => {
      moveNode(walls[index], rect);
    });
    moveNode(labelStartA, { x: 0, y: 620, width: 100, height: 100 });
    moveNode(labelEndA, { x: 220, y: 620, width: 100, height: 100 });
    moveNode(labelStartB, { x: 0, y: 760, width: 100, height: 100 });
    moveNode(labelEndB, { x: 220, y: 760, width: 100, height: 100 });
    moveNode(trunkStartA, { x: 0, y: 1000, width: 100, height: 100 });
    moveNode(trunkStartB, { x: 0, y: 1140, width: 100, height: 100 });
    moveNode(trunkEnd, { x: 420, y: 1060, width: 100, height: 100 });
    moveNode(connectorsContainer, { x: 900, y: 0, width: 1, height: 1 });

    connectorsContainer.setSharedPluginData(namespace, 'kind', 'container');
    setConnectorRecord(crossingConnector, 'connector-crossing', startCrossing.id, endCrossing.id, 'cross', [
      { x: 100, y: 50 },
      { x: 420, y: 50 },
    ]);
    setConnectorRecord(failureConnector, 'connector-failure', startFailure.id, endFailure.id, 'fail');
    setConnectorRecord(labelConnectorA, 'connector-label-a', labelStartA.id, labelEndA.id, 'A', [
      { x: 100, y: 670 },
      { x: 220, y: 670 },
    ]);
    setConnectorRecord(labelConnectorB, 'connector-label-b', labelStartB.id, labelEndB.id, 'B', [
      { x: 100, y: 810 },
      { x: 220, y: 810 },
    ]);
    setConnectorRecord(trunkConnectorA, 'connector-trunk-a', trunkStartA.id, trunkEnd.id, 'A', [
      { x: 100, y: 1050 },
      { x: 300, y: 1050 },
      { x: 420, y: 1050 },
    ]);
    setConnectorRecord(trunkConnectorB, 'connector-trunk-b', trunkStartB.id, trunkEnd.id, 'B', [
      { x: 100, y: 1190 },
      { x: 320, y: 1190 },
      { x: 420, y: 1190 },
    ]);
    addFlowActionLabel(labelConnectorA, { x: 120, y: 720, width: 90, height: 28 });
    addFlowActionLabel(labelConnectorB, { x: 170, y: 730, width: 90, height: 28 });

    connectorsContainer.children = [
      crossingConnector,
      failureConnector,
      labelConnectorA,
      labelConnectorB,
      trunkConnectorA,
      trunkConnectorB,
    ];
    page.children = [
      startCrossing,
      crossingObstacle,
      endCrossing,
      startFailure,
      ...walls,
      endFailure,
      labelStartA,
      labelEndA,
      labelStartB,
      labelEndB,
      trunkStartA,
      trunkStartB,
      trunkEnd,
      connectorsContainer,
    ];
    globalThis.figma = createFigmaStub(page, messages, scrollEvents);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'validate-bindings' });
    await flushPluginMessage(messages);

    const report = messages.find((message) => message.type === 'validation-report').report;
    assert.equal(report.issues.some((issue) => issue.code === 'connector-route-crosses-obstacle'), true);
    assert.equal(report.issues.some((issue) => issue.code === 'connector-routing-failure'), true);
    assert.equal(report.issues.some((issue) => issue.code === 'flow-action-label-overlap'), true);
    assert.equal(report.issues.some((issue) => issue.code === 'connector-route-refreshable'), true);
    assert.equal(report.issues.some((issue) => issue.code === 'connector-trunk-missing'), true);
    assert.equal(page.getSharedPluginData(namespace, 'validationReport'), '');
    assert.equal(crossingConnector.getSharedPluginData(namespace, 'validationReport'), '');

    const crossingIssue = report.issues.find((issue) => issue.code === 'connector-route-crosses-obstacle');
    messages.length = 0;
    globalThis.figma.ui.onmessage({ type: 'locate-validation-issue', issueId: crossingIssue.id });
    await flushPluginMessage(messages);

    assert.deepEqual(page.selection.map((node) => node.id), ['connector-crossing-root']);
    assert.deepEqual(scrollEvents.at(-1).map((node) => node.id), ['connector-crossing-root']);

    const labelIssue = report.issues.find((issue) => issue.code === 'flow-action-label-overlap');
    messages.length = 0;
    globalThis.figma.ui.onmessage({ type: 'locate-validation-issue', issueId: labelIssue.id });
    await flushPluginMessage(messages);

    assert.deepEqual(page.selection.map((node) => node.id), ['connector-label-root-a', 'connector-label-root-b']);
    assert.deepEqual(scrollEvents.at(-1).map((node) => node.id), ['connector-label-root-a', 'connector-label-root-b']);

    const trunkIssue = report.issues.find((issue) => issue.code === 'connector-trunk-missing');
    messages.length = 0;
    globalThis.figma.ui.onmessage({ type: 'locate-validation-issue', issueId: trunkIssue.id });
    await flushPluginMessage(messages);

    assert.deepEqual(page.selection.map((node) => node.id), ['connector-trunk-root-a', 'connector-trunk-root-b']);
    assert.deepEqual(scrollEvents.at(-1).map((node) => node.id), ['connector-trunk-root-a', 'connector-trunk-root-b']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('ignores hidden Flow Action labels during overlap validation', async () => {
  try {
    const page = createPage();
    const startA = createNode(page, 'hidden-label-start-a', 0);
    const endA = createNode(page, 'hidden-label-end-a', 220);
    const startB = createNode(page, 'hidden-label-start-b', 0);
    const endB = createNode(page, 'hidden-label-end-b', 220);
    const connectorsContainer = createNode(page, 'FFA Connectors', 500);
    const connectorA = createNode(connectorsContainer, 'connector-hidden-label-root-a', 520);
    const connectorB = createNode(connectorsContainer, 'connector-hidden-label-root-b', 560);
    const messages = [];

    moveNode(startA, { x: 0, y: 0, width: 100, height: 100 });
    moveNode(endA, { x: 220, y: 0, width: 100, height: 100 });
    moveNode(startB, { x: 0, y: 180, width: 100, height: 100 });
    moveNode(endB, { x: 220, y: 180, width: 100, height: 100 });
    moveNode(connectorsContainer, { x: 500, y: 0, width: 1, height: 1 });

    connectorsContainer.setSharedPluginData(namespace, 'kind', 'container');
    setConnectorRecord(connectorA, 'connector-hidden-label-a', startA.id, endA.id, 'A');
    setConnectorRecord(connectorB, 'connector-hidden-label-b', startB.id, endB.id, 'B');
    addFlowActionLabel(connectorA, { x: 120, y: 40, width: 90, height: 28 }, false);
    addFlowActionLabel(connectorB, { x: 140, y: 48, width: 90, height: 28 }, false);

    connectorsContainer.children = [connectorA, connectorB];
    page.children = [startA, endA, startB, endB, connectorsContainer];
    globalThis.figma = createFigmaStub(page, messages);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'validate-bindings' });
    await flushPluginMessage(messages);

    const report = messages.find((message) => message.type === 'validation-report').report;
    assert.equal(report.issues.some((issue) => issue.code === 'flow-action-label-overlap'), false);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

async function flushPluginMessage(messages) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (messages.some((message) => message.type === 'status')) {
      return;
    }
    await Promise.resolve();
  }
}

async function importCodeModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(buildDir, `code-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await build({
    bundle: true,
    define: {
      __html__: '""',
    },
    entryPoints: [resolve(appRoot, 'code.ts')],
    format: 'esm',
    outfile,
    platform: 'node',
    target: 'es2019',
  });
  return import(pathToFileURL(outfile).href);
}

function createPage() {
  const page = createNode(null, 'page', 0);
  page.type = 'PAGE';
  page.selection = [];
  page.appendChild = (node) => {
    appendChild(page, node);
  };
  return page;
}

function createNode(parent, id, x) {
  const sharedPluginData = new Map();
  const node = {
    absoluteBoundingBox: { x, y: 0, width: 100, height: 100 },
    appendChild: (child) => {
      appendChild(node, child);
    },
    children: [],
    clipsContent: false,
    cornerRadius: 0,
    fills: [],
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? '',
    height: 100,
    id,
    name: id,
    parent,
    removed: false,
    resize: (width, height) => {
      node.width = width;
      node.height = height;
      node.absoluteBoundingBox.width = width;
      node.absoluteBoundingBox.height = height;
    },
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    strokes: [],
    strokeWeight: 0,
    type: 'FRAME',
    width: 100,
    x,
    y: 0,
  };
  return node;
}

function createTextNode() {
  const text = createNode(null, 'text', 0);
  text.type = 'TEXT';
  text.height = 16;
  text.width = 80;
  text.resize = (width, height) => {
    text.width = width;
    text.height = Math.max(16, height);
  };
  return text;
}

function moveNode(node, rect) {
  node.x = rect.x;
  node.y = rect.y;
  node.width = rect.width;
  node.height = rect.height;
  node.absoluteBoundingBox = rect;
}

function appendChild(parent, child) {
  const existingParent = child.parent;
  if (existingParent && 'children' in existingParent) {
    existingParent.children = existingParent.children.filter((node) => node !== child);
  }
  child.parent = parent;
  parent.children.push(child);
}

function readAnnotationRefs(node) {
  const data = node.getSharedPluginData(namespace, 'annotationRefs');
  return data.length === 0 ? [] : JSON.parse(data).annotationIds;
}

function readConnectorRefs(node) {
  const data = node.getSharedPluginData(namespace, 'connectorRefs');
  return data.length === 0 ? [] : JSON.parse(data).connectorIds;
}

function readConnectorId(node) {
  const data = node.getSharedPluginData(namespace, 'connector');
  return data.length === 0 ? null : JSON.parse(data).id;
}

function setBadgeRecord(badge, annotationNumber, subjectNodeId, contextFrameId) {
  badge.setSharedPluginData(namespace, 'kind', 'annotation-badge');
  badge.setSharedPluginData(namespace, 'badgeRef', JSON.stringify({
    schemaVersion: 1,
    annotationId: `annotation-${annotationNumber}`,
    annotationNumber,
    subjectNodeId,
    contextFrameId,
  }));
}

function setCardRecord(card, annotationNumber, contextFrameId) {
  card.setSharedPluginData(namespace, 'kind', 'annotation-card');
  card.resize(280, 100);
  card.setSharedPluginData(namespace, 'annotation', JSON.stringify({
    schemaVersion: 1,
    id: `annotation-${annotationNumber}`,
    annotationNumber,
    body: `body ${annotationNumber}`,
    contextFrameId,
    subjectNodeIds: ['subject-a'],
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  }));
}

function setConnectorRefs(node, connectorIds) {
  node.setSharedPluginData(namespace, 'connectorRefs', JSON.stringify({
    schemaVersion: 1,
    connectorIds,
  }));
}

function setConnectorRecord(connector, connectorId, startNodeId, endNodeId, flowAction, routePoints) {
  connector.type = 'GROUP';
  connector.setSharedPluginData(namespace, 'kind', 'flow-connector');
  connector.setSharedPluginData(namespace, 'connector', JSON.stringify({
    schemaVersion: 1,
    id: connectorId,
    start: {
      nodeId: startNodeId,
      contextFrameId: 'context-frame',
    },
    end: {
      nodeId: endNodeId,
      contextFrameId: 'context-frame',
    },
    ownerContextFrameId: 'context-frame',
    flowAction,
    ...(routePoints === undefined
      ? {}
      : {
          routeCache: {
            schemaVersion: 1,
            points: routePoints,
          },
        }),
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  }));
}

function addFlowActionLabel(connector, rect, visible = true) {
  const label = createNode(connector, `${connector.id}-label`, rect.x);
  label.name = 'FFA Flow Action Label';
  label.visible = visible;
  moveNode(label, rect);
  connector.children.push(label);
}

function createFigmaStub(page, messages, scrollEvents = []) {
  return {
    closePlugin: () => {},
    createFrame: () => createNode(null, '', 0),
    createText: createTextNode,
    currentPage: page,
    getNodeByIdAsync: async (id) => findNodeById(page, id),
    loadFontAsync: async () => {},
    notify: () => {},
    on: () => {},
    showUI: () => {},
    ui: {
      onmessage: null,
      postMessage: (message) => {
        messages.push(message);
      },
    },
    viewport: {
      scrollAndZoomIntoView: (nodes) => {
        scrollEvents.push(nodes);
      },
    },
  };
}

function findNodeById(node, id) {
  if (node.id === id) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
