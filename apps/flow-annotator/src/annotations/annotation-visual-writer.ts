import {
  type CreateAnnotationBadgeOperation,
  type CreateAnnotationCardOperation,
  getAnnotationCardBasePosition,
  getAnnotationCardRenderedHeight,
  getCenteredAnnotationBadgeNumberPosition,
  type RgbColor,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import type { FigmaFileOperationWriter } from "../figma/file-operations";
import { createText, ensureContainer, localRect, NAMESPACE, solidPaint } from "../figma/runtime";

export function createAnnotationVisualWriter(): FigmaFileOperationWriter {
  return {
    createAnnotationBadge,
    createAnnotationCard,
    ensureContainer,
  };
}

function createAnnotationCard(
  container: FrameNode,
  operation: CreateAnnotationCardOperation,
): FrameNode {
  const card = figma.createFrame();
  const visual = operation.visual;
  card.name = operation.name;
  card.fills = [solidPaintFromRgb(visual.frame.fill)];
  card.strokes = [solidPaintFromRgb(visual.frame.stroke)];
  card.strokeWeight = visual.frame.strokeWeight;
  card.cornerRadius = visual.frame.cornerRadius;
  card.clipsContent = false;
  card.resize(visual.frame.width, visual.frame.initialHeight);
  container.appendChild(card);

  const title = createText(
    visual.title.name,
    visual.title.text,
    visual.title.fontSize,
    solidPaintFromRgb(visual.title.fill),
    visual.title.width,
  );
  card.appendChild(title);
  title.x = visual.title.x;
  title.y = visual.title.y;

  const subjectLabel = createText(
    visual.subjectLabel.name,
    visual.subjectLabel.text,
    visual.subjectLabel.fontSize,
    solidPaintFromRgb(visual.subjectLabel.fill),
    visual.subjectLabel.width,
  );
  card.appendChild(subjectLabel);
  subjectLabel.x = visual.subjectLabel.x;
  subjectLabel.y = visual.subjectLabel.y;

  const body = createText(
    visual.body.name,
    visual.body.text,
    visual.body.fontSize,
    solidPaintFromRgb(visual.body.fill),
    visual.body.width,
  );
  card.appendChild(body);
  body.x = visual.body.x;
  body.y = visual.body.y;
  card.resize(
    visual.frame.width,
    getAnnotationCardRenderedHeight({ bodyHeight: body.height, visual }),
  );

  const position = getAnnotationCardBasePosition({
    basePosition: operation.basePosition,
    cardRect: localRect(card),
    existingCardRects: getExistingAnnotationCardRects(container, card),
  });
  card.x = position.x;
  card.y = position.y;

  return card;
}

function createAnnotationBadge(
  container: FrameNode,
  operation: CreateAnnotationBadgeOperation,
): FrameNode {
  const badge = figma.createFrame();
  const visual = operation.visual;
  badge.name = operation.name;
  badge.fills = [solidPaintFromRgb(visual.frame.fill)];
  badge.strokes = [solidPaintFromRgb(visual.frame.stroke)];
  badge.strokeWeight = visual.frame.strokeWeight;
  badge.cornerRadius = visual.frame.cornerRadius;
  badge.clipsContent = false;
  badge.resize(visual.frame.size, visual.frame.size);
  container.appendChild(badge);
  badge.x = operation.position.x;
  badge.y = operation.position.y;

  const number = createText(
    visual.number.name,
    visual.number.text,
    visual.number.fontSize,
    solidPaintFromRgb(visual.number.fill),
    visual.number.width,
  );
  number.textAutoResize = "WIDTH_AND_HEIGHT";
  badge.appendChild(number);
  const numberPosition = getCenteredAnnotationBadgeNumberPosition({
    badgeVisual: visual,
    textHeight: number.height,
    textWidth: number.width,
  });
  number.x = numberPosition.x;
  number.y = numberPosition.y;

  return badge;
}

function solidPaintFromRgb(color: RgbColor): SolidPaint {
  return solidPaint(color.r, color.g, color.b);
}

function getExistingAnnotationCardRects(container: FrameNode, card: FrameNode): Rect[] {
  return container.children
    .filter(
      (child): child is FrameNode =>
        child !== card &&
        child.type === "FRAME" &&
        child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) ===
          VISUAL_NODE_KINDS.annotationCard,
    )
    .map(localRect);
}
