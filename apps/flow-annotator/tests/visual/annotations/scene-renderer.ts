import type {
  AnnotationFixtureDefinition,
  FakeNode,
  FakePageNode,
  FakePaint,
  FixtureRect,
} from "./fixture-types";
import { ANNOTATIONS_CONTAINER_NAME, NAMESPACE } from "./fixture-types";

const SCENE_PADDING = 36;

export function renderAnnotationScene(
  definition: AnnotationFixtureDefinition,
  pageNode: FakePageNode,
): string {
  const sceneBounds = calculateSceneBounds(definition, pageNode);
  const subjectsHtml = definition.subjects
    .map((subject) => renderSubject(subject, sceneBounds))
    .join("");
  const generatedHtml = getGeneratedAnnotationNodes(pageNode)
    .map((node) => renderGeneratedNode(node, sceneBounds, true))
    .join("");

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

export function getGeneratedAnnotationNodes(pageNode: FakePageNode): FakeNode[] {
  const container = pageNode.children.find(
    (node) =>
      node.name === ANNOTATIONS_CONTAINER_NAME &&
      node.getSharedPluginData(NAMESPACE, "kind") === "container",
  );
  return container?.children ?? [];
}

export function annotationKind(node: FakeNode): string {
  return node.getSharedPluginData(NAMESPACE, "kind");
}

function renderSubject(subject: FixtureRect & { name: string }, sceneBounds: FixtureRect): string {
  return `<div class="subject" style="${rectStyle(subject, sceneBounds)}">${escapeHtml(subject.name)}</div>`;
}

function renderGeneratedNode(
  node: FakeNode,
  sceneBounds: FixtureRect,
  isSceneChild: boolean,
): string {
  if (node.type === "TEXT") {
    return renderTextNode(node, sceneBounds, isSceneChild);
  }

  const kind = annotationKind(node);
  const className = kind === "annotation-badge" ? "annotation-badge" : "annotation-card";
  const x = isSceneChild ? node.x - sceneBounds.x : node.x;
  const y = isSceneChild ? node.y - sceneBounds.y : node.y;
  const children = node.children
    .map((child) => renderGeneratedNode(child, sceneBounds, false))
    .join("");
  const style = [
    `left:${x}px`,
    `top:${y}px`,
    `width:${node.width}px`,
    `height:${node.height}px`,
    `background:${paintToHex(node.fills[0])}`,
    `box-shadow:${strokeShadow(node)}`,
    `border-radius:${node.cornerRadius}px`,
  ].join(";");

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
  ].join(";");

  return `<div class="annotation-text" style="${style};">${escapeHtml(node.characters ?? "")}</div>`;
}

function calculateSceneBounds(
  definition: AnnotationFixtureDefinition,
  pageNode: FakePageNode,
): FixtureRect {
  const generatedRects = getGeneratedAnnotationNodes(pageNode).map(localRect);
  const rects = [...definition.subjects, ...generatedRects];
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

function paintToHex(paint: FakePaint | undefined): string {
  if (paint === undefined) {
    return "transparent";
  }

  const red = Math.round(paint.color.r * 255);
  const green = Math.round(paint.color.g * 255);
  const blue = Math.round(paint.color.b * 255);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function strokeShadow(node: FakeNode): string {
  if (node.strokeWeight <= 0 || node.strokes[0] === undefined) {
    return "none";
  }

  return `inset 0 0 0 ${node.strokeWeight}px ${paintToHex(node.strokes[0])}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    '"': "&quot;",
    "'": "&#39;",
    "<": "&lt;",
    ">": "&gt;",
  };
  return value.replace(/[&"'<>]/g, (character) => entities[character]);
}
