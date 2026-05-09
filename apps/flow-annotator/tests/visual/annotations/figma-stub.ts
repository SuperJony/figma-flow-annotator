import type {
  AnnotationSubjectDefinition,
  FakeNode,
  FakePageNode,
  FigmaStub,
  FixtureRect,
  PostedMessage,
} from "./fixture-types";

export function createPage(): FakePageNode {
  const page = createNode(
    null,
    "page",
    "page",
    { x: 0, y: 0, width: 1, height: 1 },
    "PAGE",
  ) as FakePageNode;
  page.selection = [];
  return page;
}

export function createSubjectNode(
  pageNode: FakePageNode,
  definition: AnnotationSubjectDefinition,
  index: number,
): FakeNode {
  return createNode(pageNode, `subject-${index + 1}`, definition.name, definition, "FRAME");
}

export function createFigmaStub(pageNode: FakePageNode, messages: PostedMessage[]): FigmaStub {
  let frameSequence = 0;
  let textSequence = 0;

  return {
    closePlugin: () => {},
    createFrame: () => {
      frameSequence += 1;
      return createNode(
        pageNode,
        `generated-frame-${frameSequence}`,
        "",
        { x: 0, y: 0, width: 100, height: 100 },
        "FRAME",
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
  type: FakeNode["type"],
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
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? "",
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
  const text = createNode(parent, id, "", { x: 0, y: 0, width: 80, height: 16 }, "TEXT");
  let characters = "";
  let fontSize = 12;
  let requestedWidth = 80;
  let textAutoResize = "NONE";

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
  const targetWidth =
    textAutoResize === "WIDTH_AND_HEIGHT"
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
