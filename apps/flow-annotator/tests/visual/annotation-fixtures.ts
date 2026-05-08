import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

interface FixtureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnnotationSubjectDefinition extends FixtureRect {
  name: string;
}

interface AnnotationFixtureDefinition {
  body: string;
  description: string;
  name: string;
  subjects: AnnotationSubjectDefinition[];
}

interface AnnotationFixture {
  badgeCount: number;
  cardCount: number;
  html: string;
  statusMessage: string;
}

interface PostedStatusMessage {
  message: string;
  tone: 'error' | 'success';
  type: 'status';
}

interface PostedSelectionMessage {
  eligibleCount: number;
  totalCount: number;
  type: 'selection-state';
}

type PostedMessage = PostedSelectionMessage | PostedStatusMessage;

interface FigmaStub {
  closePlugin(): void;
  createFrame(): FakeNode;
  createText(): FakeNode;
  currentPage: FakePageNode;
  loadFontAsync(): Promise<void>;
  notify(): void;
  on(): void;
  showUI(): void;
  ui: {
    onmessage: ((message: unknown) => void) | null;
    postMessage(message: PostedMessage): void;
  };
  viewport: {
    scrollAndZoomIntoView(): void;
  };
}

interface FakePaint {
  color: {
    b: number;
    g: number;
    r: number;
  };
  type: 'SOLID';
}

interface FakeNode {
  absoluteBoundingBox: FixtureRect | null;
  appendChild(child: FakeNode): void;
  characters?: string;
  children: FakeNode[];
  clipsContent: boolean;
  cornerRadius: number;
  fills: FakePaint[];
  fontSize?: number;
  getSharedPluginData(namespace: string, key: string): string;
  height: number;
  id: string;
  name: string;
  parent: FakeNode | null;
  removed: boolean;
  resize(width: number, height: number): void;
  setSharedPluginData(namespace: string, key: string, value: string): void;
  strokes: FakePaint[];
  strokeWeight: number;
  textAutoResize?: string;
  type: 'FRAME' | 'PAGE' | 'TEXT';
  width: number;
  x: number;
  y: number;
}

interface FakePageNode extends FakeNode {
  selection: FakeNode[];
  type: 'PAGE';
}

const NAMESPACE = 'figma_flow_annotator';
const ANNOTATIONS_CONTAINER_NAME = 'FFA Annotations';
const SCENE_PADDING = 36;

export const annotationFixtureDefinitions: AnnotationFixtureDefinition[] = [
  {
    body: 'Confirm the empty cart state before checkout opens.',
    description: 'One subject produces one Annotation Card and one numbered Annotation Badge.',
    name: 'single-subject-annotation',
    subjects: [
      { name: 'Cart Button', x: 72, y: 60, width: 148, height: 88 },
    ],
  },
  {
    body: 'Both controls should share the same review note so later extraction sees one Annotation with two Subject Nodes.',
    description: 'Two subjects share one Annotation Card and two same-number Annotation Badges.',
    name: 'multi-subject-annotation',
    subjects: [
      { name: 'Primary CTA', x: 72, y: 68, width: 142, height: 86 },
      { name: 'Secondary CTA', x: 278, y: 68, width: 154, height: 86 },
    ],
  },
];

export async function buildAnnotationFixture(
  definition: AnnotationFixtureDefinition,
): Promise<AnnotationFixture> {
  const pageNode = createPage();
  const subjects = definition.subjects.map((subject, index) => createSubjectNode(pageNode, subject, index));
  const messages: PostedMessage[] = [];
  const figmaStub = createFigmaStub(pageNode, messages);
  const globalWithFigma = globalThis as typeof globalThis & { figma?: FigmaStub };
  const previousFigma = globalWithFigma.figma;

  pageNode.selection = subjects;
  globalWithFigma.figma = figmaStub;

  try {
    await importPluginCode();

    if (figmaStub.ui.onmessage === null) {
      throw new Error('Plugin UI message handler was not registered.');
    }

    figmaStub.ui.onmessage({
      body: definition.body,
      type: 'create-annotation',
    });

    const statusMessage = await waitForSuccessStatus(messages);
    const generatedNodes = getGeneratedAnnotationNodes(pageNode);
    return {
      badgeCount: generatedNodes.filter((node) => annotationKind(node) === 'annotation-badge').length,
      cardCount: generatedNodes.filter((node) => annotationKind(node) === 'annotation-card').length,
      html: renderAnnotationScene(definition, pageNode),
      statusMessage,
    };
  } finally {
    if (previousFigma === undefined) {
      delete globalWithFigma.figma;
    } else {
      globalWithFigma.figma = previousFigma;
    }
  }
}

async function importPluginCode(): Promise<void> {
  const buildDir = await mkdtemp(join(tmpdir(), 'ffa-annotation-visual-'));
  const outfile = join(buildDir, `code-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);

  try {
    await build({
      bundle: true,
      define: {
        __html__: '""',
      },
      entryPoints: [resolve('code.ts')],
      format: 'esm',
      outfile,
      platform: 'node',
      target: 'es2019',
    });
    await import(pathToFileURL(outfile).href);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
}

async function waitForSuccessStatus(messages: PostedMessage[]): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = messages.find(isStatusMessage);
    if (status !== undefined) {
      if (status.tone !== 'success') {
        throw new Error(status.message);
      }
      return status.message;
    }
    await Promise.resolve();
  }

  throw new Error('Timed out waiting for plugin status.');
}

function createPage(): FakePageNode {
  const page = createNode(null, 'page', 'page', { x: 0, y: 0, width: 1, height: 1 }, 'PAGE') as FakePageNode;
  page.selection = [];
  return page;
}

function createSubjectNode(
  pageNode: FakePageNode,
  definition: AnnotationSubjectDefinition,
  index: number,
): FakeNode {
  return createNode(
    pageNode,
    `subject-${index + 1}`,
    definition.name,
    definition,
    'FRAME',
  );
}

function createFigmaStub(pageNode: FakePageNode, messages: PostedMessage[]): FigmaStub {
  let frameSequence = 0;
  let textSequence = 0;

  return {
    closePlugin: () => {},
    createFrame: () => {
      frameSequence += 1;
      return createNode(
        pageNode,
        `generated-frame-${frameSequence}`,
        '',
        { x: 0, y: 0, width: 100, height: 100 },
        'FRAME',
      );
    },
    createText: () => {
      textSequence += 1;
      return createTextNode(pageNode, `generated-text-${textSequence}`);
    },
    currentPage: pageNode,
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
      scrollAndZoomIntoView: () => {},
    },
  };
}

function createNode(
  parent: FakeNode | null,
  id: string,
  name: string,
  rect: FixtureRect,
  type: FakeNode['type'],
): FakeNode {
  const sharedPluginData = new Map<string, string>();
  const node: FakeNode = {
    absoluteBoundingBox: { ...rect },
    appendChild: (child) => {
      appendChild(node, child);
    },
    children: [],
    clipsContent: false,
    cornerRadius: 0,
    fills: [],
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? '',
    height: rect.height,
    id,
    name,
    parent: null,
    removed: false,
    resize: (width, height) => {
      node.width = width;
      node.height = height;
      if (node.absoluteBoundingBox !== null) {
        node.absoluteBoundingBox.width = width;
        node.absoluteBoundingBox.height = height;
      }
    },
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    strokes: [],
    strokeWeight: 0,
    type,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };

  if (parent !== null) {
    appendChild(parent, node);
  }

  return node;
}

function createTextNode(parent: FakeNode, id: string): FakeNode {
  const text = createNode(parent, id, '', { x: 0, y: 0, width: 80, height: 16 }, 'TEXT');
  let characters = '';
  let fontSize = 12;
  let requestedWidth = 80;
  let textAutoResize = 'NONE';

  Object.defineProperties(text, {
    characters: {
      get: () => characters,
      set: (value: string) => {
        characters = value;
        recalculateTextSize(text, characters, fontSize, requestedWidth, textAutoResize);
      },
    },
    fontSize: {
      get: () => fontSize,
      set: (value: number) => {
        fontSize = value;
        recalculateTextSize(text, characters, fontSize, requestedWidth, textAutoResize);
      },
    },
    textAutoResize: {
      get: () => textAutoResize,
      set: (value: string) => {
        textAutoResize = value;
        recalculateTextSize(text, characters, fontSize, requestedWidth, textAutoResize);
      },
    },
  });

  text.resize = (width, height) => {
    requestedWidth = width;
    text.width = width;
    text.height = height;
    recalculateTextSize(text, characters, fontSize, requestedWidth, textAutoResize);
  };

  return text;
}

function recalculateTextSize(
  text: FakeNode,
  characters: string,
  fontSize: number,
  requestedWidth: number,
  textAutoResize: string,
): void {
  const averageCharacterWidth = fontSize * 0.56;
  const targetWidth = textAutoResize === 'WIDTH_AND_HEIGHT'
    ? Math.max(averageCharacterWidth, characters.length * averageCharacterWidth)
    : requestedWidth;
  const charactersPerLine = Math.max(1, Math.floor(targetWidth / averageCharacterWidth));
  const lineCount = Math.max(1, Math.ceil(characters.length / charactersPerLine));

  text.width = targetWidth;
  text.height = Math.max(fontSize + 4, lineCount * (fontSize + 4));
}

function appendChild(parent: FakeNode, child: FakeNode): void {
  if (child.parent !== null) {
    child.parent.children = child.parent.children.filter((node) => node !== child);
  }
  child.parent = parent;
  parent.children.push(child);
}

function renderAnnotationScene(definition: AnnotationFixtureDefinition, pageNode: FakePageNode): string {
  const sceneBounds = calculateSceneBounds(definition, pageNode);
  const subjectsHtml = definition.subjects
    .map((subject) => renderSubject(subject, sceneBounds))
    .join('');
  const generatedHtml = getGeneratedAnnotationNodes(pageNode)
    .map((node) => renderGeneratedNode(node, sceneBounds, true))
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
        background: #f4f6f8;
        font-family: Inter, Arial, Helvetica, sans-serif;
      }

      body {
        padding: 20px;
      }

      .scene {
        position: relative;
        width: ${sceneBounds.width}px;
        height: ${sceneBounds.height}px;
        overflow: hidden;
        background:
          linear-gradient(#e2e8f0 1px, transparent 1px),
          linear-gradient(90deg, #e2e8f0 1px, transparent 1px),
          #ffffff;
        background-size: 24px 24px;
        border: 1px solid #cbd5e1;
      }

      .subject,
      .annotation-card,
      .annotation-badge,
      .annotation-text {
        position: absolute;
      }

      .subject {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #64748b;
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        font-weight: 700;
      }

      .annotation-card,
      .annotation-badge {
        overflow: visible;
      }

      .annotation-text {
        overflow: hidden;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main aria-label="${escapeHtml(definition.description)}" class="scene" data-fixture="${definition.name}">
      ${subjectsHtml}
      ${generatedHtml}
    </main>
  </body>
</html>`;
}

function renderSubject(subject: AnnotationSubjectDefinition, sceneBounds: FixtureRect): string {
  return `<div class="subject" style="${rectStyle(subject, sceneBounds)}">${escapeHtml(subject.name)}</div>`;
}

function renderGeneratedNode(node: FakeNode, sceneBounds: FixtureRect, isSceneChild: boolean): string {
  if (node.type === 'TEXT') {
    return renderTextNode(node, sceneBounds, isSceneChild);
  }

  const kind = annotationKind(node);
  const className = kind === 'annotation-badge' ? 'annotation-badge' : 'annotation-card';
  const x = isSceneChild ? node.x - sceneBounds.x : node.x;
  const y = isSceneChild ? node.y - sceneBounds.y : node.y;
  const children = node.children
    .map((child) => renderGeneratedNode(child, sceneBounds, false))
    .join('');
  const style = [
    `left:${x}px`,
    `top:${y}px`,
    `width:${node.width}px`,
    `height:${node.height}px`,
    `background:${paintToHex(node.fills[0])}`,
    `box-shadow:${strokeShadow(node)}`,
    `border-radius:${node.cornerRadius}px`,
  ].join(';');

  return `<div class="${className}" style="${style};">${children}</div>`;
}

function renderTextNode(node: FakeNode, sceneBounds: FixtureRect, isSceneChild: boolean): string {
  const fontSize = node.fontSize ?? 12;
  const x = isSceneChild ? node.x - sceneBounds.x : node.x;
  const y = isSceneChild ? node.y - sceneBounds.y : node.y;
  const style = [
    `left:${x}px`,
    `top:${y}px`,
    `width:${node.width}px`,
    `height:${node.height}px`,
    `color:${paintToHex(node.fills[0])}`,
    `font-size:${fontSize}px`,
    `line-height:${fontSize + 4}px`,
  ].join(';');

  return `<div class="annotation-text" style="${style};">${escapeHtml(node.characters ?? '')}</div>`;
}

function calculateSceneBounds(definition: AnnotationFixtureDefinition, pageNode: FakePageNode): FixtureRect {
  const generatedRects = getGeneratedAnnotationNodes(pageNode).map(localRect);
  const rects = [
    ...definition.subjects,
    ...generatedRects,
  ];
  const left = Math.min(...rects.map((rect) => rect.x)) - SCENE_PADDING;
  const top = Math.min(...rects.map((rect) => rect.y)) - SCENE_PADDING;
  const right = Math.max(...rects.map((rect) => rect.x + rect.width)) + SCENE_PADDING;
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height)) + SCENE_PADDING;
  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

function getGeneratedAnnotationNodes(pageNode: FakePageNode): FakeNode[] {
  const container = pageNode.children.find(
    (node) =>
      node.name === ANNOTATIONS_CONTAINER_NAME &&
      node.getSharedPluginData(NAMESPACE, 'kind') === 'container',
  );
  return container?.children ?? [];
}

function localRect(node: FakeNode): FixtureRect {
  return {
    height: node.height,
    width: node.width,
    x: node.x,
    y: node.y,
  };
}

function rectStyle(rect: FixtureRect, sceneBounds: FixtureRect): string {
  return `left:${rect.x - sceneBounds.x}px;top:${rect.y - sceneBounds.y}px;width:${rect.width}px;height:${rect.height}px;`;
}

function annotationKind(node: FakeNode): string {
  return node.getSharedPluginData(NAMESPACE, 'kind');
}

function paintToHex(paint: FakePaint | undefined): string {
  if (paint === undefined) {
    return 'transparent';
  }

  const red = Math.round(paint.color.r * 255);
  const green = Math.round(paint.color.g * 255);
  const blue = Math.round(paint.color.b * 255);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function strokeShadow(node: FakeNode): string {
  if (node.strokeWeight <= 0 || node.strokes[0] === undefined) {
    return 'none';
  }

  return `inset 0 0 0 ${node.strokeWeight}px ${paintToHex(node.strokes[0])}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function isStatusMessage(message: PostedMessage): message is PostedStatusMessage {
  return message.type === 'status';
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;',
  };
  return value.replace(/[&"'<>]/g, (character) => entities[character]);
}
