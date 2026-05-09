import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { createFigmaStub, createPage, createSubjectNode } from "./figma-stub";
import type {
  AnnotationFixture,
  AnnotationFixtureDefinition,
  FigmaStub,
  PostedMessage,
  PostedStatusMessage,
} from "./fixture-types";
import {
  annotationKind,
  getGeneratedAnnotationNodes,
  renderAnnotationScene,
} from "./scene-renderer";

export const annotationFixtureDefinitions: AnnotationFixtureDefinition[] = [
  {
    body: "Confirm the empty cart state before checkout opens.",
    description: "One subject produces one Annotation Card and one numbered Annotation Badge.",
    name: "single-subject-annotation",
    subjects: [{ name: "Cart Button", x: 72, y: 60, width: 148, height: 88 }],
  },
  {
    body: "Both controls should share the same review note so later extraction sees one Annotation with two Subject Nodes.",
    description: "Two subjects share one Annotation Card and two same-number Annotation Badges.",
    name: "multi-subject-annotation",
    subjects: [
      { name: "Primary CTA", x: 72, y: 68, width: 142, height: 86 },
      { name: "Secondary CTA", x: 278, y: 68, width: 154, height: 86 },
    ],
  },
];

export async function buildAnnotationFixture(
  definition: AnnotationFixtureDefinition,
): Promise<AnnotationFixture> {
  const pageNode = createPage();
  const subjects = definition.subjects.map((subject, index) =>
    createSubjectNode(pageNode, subject, index),
  );
  const messages: PostedMessage[] = [];
  const figmaStub = createFigmaStub(pageNode, messages);
  const globalWithFigma = globalThis as typeof globalThis & { figma?: FigmaStub };
  const previousFigma = globalWithFigma.figma;

  pageNode.selection = subjects;
  globalWithFigma.figma = figmaStub;

  try {
    await importPluginCode();

    if (figmaStub.ui.onmessage === null) {
      throw new Error("Plugin UI message handler was not registered.");
    }

    figmaStub.ui.onmessage({
      body: definition.body,
      type: "create-annotation",
    });

    const statusMessage = await waitForSuccessStatus(messages);
    const generatedNodes = getGeneratedAnnotationNodes(pageNode);
    return {
      badgeCount: generatedNodes.filter((node) => annotationKind(node) === "annotation-badge")
        .length,
      cardCount: generatedNodes.filter((node) => annotationKind(node) === "annotation-card").length,
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
  const buildDir = await mkdtemp(join(tmpdir(), "ffa-annotation-visual-"));
  const outfile = join(buildDir, `code-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);

  try {
    await build({
      bundle: true,
      define: {
        __html__: '""',
      },
      entryPoints: [resolve("src/plugin/code.ts")],
      format: "esm",
      outfile,
      platform: "node",
      target: "es2019",
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
      if (status.tone !== "success") {
        throw new Error(status.message);
      }
      return status.message;
    }
    await Promise.resolve();
  }

  throw new Error("Timed out waiting for plugin status.");
}

function isStatusMessage(message: PostedMessage): message is PostedStatusMessage {
  return message.type === "status";
}
