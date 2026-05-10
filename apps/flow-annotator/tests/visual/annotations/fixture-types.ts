import type {
  PanelOutboundMessage,
  PanelSelectionStateMessage,
  PanelStatusMessage,
} from "@figma-flow-annotator/core";

export interface FixtureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationSubjectDefinition extends FixtureRect {
  name: string;
}

export interface AnnotationFixtureDefinition {
  body: string;
  description: string;
  name: string;
  subjects: AnnotationSubjectDefinition[];
}

export interface AnnotationFixture {
  badgeCount: number;
  cardCount: number;
  html: string;
  statusMessage: string;
}

export type PostedStatusMessage = PanelStatusMessage;
export type PostedSelectionMessage = PanelSelectionStateMessage;
export type PostedMessage = PanelOutboundMessage;

export interface FigmaStub {
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

export interface FakePaint {
  color: {
    b: number;
    g: number;
    r: number;
  };
  type: "SOLID";
}

export interface FakeNode {
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
  type: "FRAME" | "PAGE" | "TEXT";
  width: number;
  x: number;
  y: number;
}

export interface FakePageNode extends FakeNode {
  selection: FakeNode[];
  type: "PAGE";
}

export const NAMESPACE = "figma_flow_annotator";
export const ANNOTATIONS_CONTAINER_NAME = "FFA Annotations";
