import type { Point, RectLike } from "../shared/geometry.ts";

export interface RgbColor {
  b: number;
  g: number;
  r: number;
}

export interface AnnotationTextVisualModel {
  fill: RgbColor;
  fontSize: number;
  name: string;
  text: string;
  width: number;
  x: number;
  y: number;
}

export interface AnnotationCardVisualModel {
  body: AnnotationTextVisualModel;
  bodyBottomPadding: number;
  frame: {
    cornerRadius: number;
    fill: RgbColor;
    initialHeight: number;
    minHeight: number;
    stroke: RgbColor;
    strokeWeight: number;
    width: number;
  };
  subjectLabel: AnnotationTextVisualModel;
  title: AnnotationTextVisualModel;
}

export interface AnnotationBadgeVisualModel {
  frame: {
    cornerRadius: number;
    fill: RgbColor;
    size: number;
    stroke: RgbColor;
    strokeWeight: number;
  };
  number: AnnotationTextVisualModel;
}

const ANNOTATION_CARD_WIDTH = 280;
const ANNOTATION_CARD_HORIZONTAL_PADDING = 16;
const ANNOTATION_CARD_TEXT_WIDTH = ANNOTATION_CARD_WIDTH - ANNOTATION_CARD_HORIZONTAL_PADDING * 2;
const ANNOTATION_CARD_INITIAL_HEIGHT = 128;
const ANNOTATION_CARD_MIN_HEIGHT = 112;
const ANNOTATION_CARD_BOTTOM_PADDING = 18;

export const ANNOTATION_CARD_LAYOUT = {
  gap: 16,
  offsetY: 40,
} as const;

export const ANNOTATION_BADGE_LAYOUT = {
  gap: 4,
  size: 28,
} as const;

export function buildAnnotationCardVisualModel(input: {
  annotationNumber: number;
  body: string;
  subjectSummary: string;
}): AnnotationCardVisualModel {
  return {
    body: {
      fill: { r: 0.1, g: 0.1, b: 0.11 },
      fontSize: 12,
      name: "Annotation Body",
      text: input.body,
      width: ANNOTATION_CARD_TEXT_WIDTH,
      x: ANNOTATION_CARD_HORIZONTAL_PADDING,
      y: 64,
    },
    bodyBottomPadding: ANNOTATION_CARD_BOTTOM_PADDING,
    frame: {
      cornerRadius: 8,
      fill: { r: 1, g: 1, b: 1 },
      initialHeight: ANNOTATION_CARD_INITIAL_HEIGHT,
      minHeight: ANNOTATION_CARD_MIN_HEIGHT,
      stroke: { r: 0.21, g: 0.35, b: 0.55 },
      strokeWeight: 1,
      width: ANNOTATION_CARD_WIDTH,
    },
    subjectLabel: {
      fill: { r: 0.34, g: 0.4, b: 0.49 },
      fontSize: 11,
      name: "Subject Nodes",
      text: `Subjects: ${input.subjectSummary}`,
      width: ANNOTATION_CARD_TEXT_WIDTH,
      x: ANNOTATION_CARD_HORIZONTAL_PADDING,
      y: 38,
    },
    title: {
      fill: { r: 0.07, g: 0.12, b: 0.2 },
      fontSize: 13,
      name: `Annotation Number ${input.annotationNumber}`,
      text: `Annotation #${input.annotationNumber}`,
      width: ANNOTATION_CARD_TEXT_WIDTH,
      x: ANNOTATION_CARD_HORIZONTAL_PADDING,
      y: 14,
    },
  };
}

export function buildAnnotationBadgeVisualModel(input: {
  annotationNumber: number;
}): AnnotationBadgeVisualModel {
  return {
    frame: {
      cornerRadius: ANNOTATION_BADGE_LAYOUT.size / 2,
      fill: { r: 0.88, g: 0.22, b: 0.2 },
      size: ANNOTATION_BADGE_LAYOUT.size,
      stroke: { r: 1, g: 1, b: 1 },
      strokeWeight: 2,
    },
    number: {
      fill: { r: 1, g: 1, b: 1 },
      fontSize: 12,
      name: "Annotation Badge Number",
      text: String(input.annotationNumber),
      width: ANNOTATION_BADGE_LAYOUT.size,
      x: 0,
      y: 0,
    },
  };
}

export function getAnnotationCardCreationBasePosition(input: { anchorBounds: RectLike }): Point {
  return {
    x: input.anchorBounds.x,
    y: input.anchorBounds.y + input.anchorBounds.height + ANNOTATION_CARD_LAYOUT.offsetY,
  };
}

export function getAnnotationCardRenderedHeight(input: {
  bodyHeight: number;
  visual: AnnotationCardVisualModel;
}): number {
  return Math.max(
    input.visual.frame.minHeight,
    input.visual.body.y + input.bodyHeight + input.visual.bodyBottomPadding,
  );
}

export function getAnnotationCardBasePosition(input: {
  basePosition: Point;
  cardRect: RectLike;
  existingCardRects: RectLike[];
}): Point {
  let candidate = {
    x: input.basePosition.x,
    y: input.basePosition.y,
  };

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidateRect = {
      x: candidate.x,
      y: candidate.y,
      width: input.cardRect.width,
      height: input.cardRect.height,
    };
    const conflict = input.existingCardRects.find((existingCard) =>
      rectsOverlap(candidateRect, existingCard),
    );
    if (conflict === undefined) {
      return candidate;
    }
    candidate = {
      x: candidate.x,
      y: conflict.y + conflict.height + ANNOTATION_CARD_LAYOUT.gap,
    };
  }

  return candidate;
}

export function getAnnotationBadgePosition(input: {
  badgeIndex: number;
  subjectBounds: RectLike;
}): Point {
  return {
    x:
      input.subjectBounds.x +
      input.subjectBounds.width -
      ANNOTATION_BADGE_LAYOUT.size / 2 +
      input.badgeIndex * (ANNOTATION_BADGE_LAYOUT.size + ANNOTATION_BADGE_LAYOUT.gap),
    y: input.subjectBounds.y - ANNOTATION_BADGE_LAYOUT.size / 2,
  };
}

export function getCenteredAnnotationBadgeNumberPosition(input: {
  badgeVisual: AnnotationBadgeVisualModel;
  textHeight: number;
  textWidth: number;
}): Point {
  return {
    x: (input.badgeVisual.frame.size - input.textWidth) / 2,
    y: (input.badgeVisual.frame.size - input.textHeight) / 2,
  };
}

function rectsOverlap(first: RectLike, second: RectLike): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}
