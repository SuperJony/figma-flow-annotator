import {
  ANNOTATIONS_CONTAINER_NAME,
  CONNECTORS_CONTAINER_NAME,
  createEmptyValidationIndexRecord,
  decodeValidationIndexRecord,
  mergeValidationIndexRecord,
  SHARED_PLUGIN_DATA,
  type ValidationIndexReadiness,
  type ValidationIndexRecord,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";

interface ValidationIndexRuntime {
  namespace: string;
}

interface ValidationIndexRecordReadResult {
  invalidSourceNodeIds: string[];
  records: ValidationIndexRecord[];
}

export function readBestEffortMergedValidationIndex(
  runtime: ValidationIndexRuntime,
): ValidationIndexRecord {
  return mergeValidationIndexRecords(readValidationIndexRecords(runtime).records);
}

export function readMergedValidationIndexReadiness(
  runtime: ValidationIndexRuntime,
):
  | ({ kind: "valid"; index: ValidationIndexRecord } & ValidationIndexReadiness)
  | Exclude<ValidationIndexReadiness, { kind: "valid" }> {
  const containers = findValidationIndexContainers(runtime);
  if (containers.length === 0) {
    return { kind: "missing" };
  }

  const { invalidSourceNodeIds, records } = readValidationIndexRecords(runtime, containers);
  if (invalidSourceNodeIds.length > 0) {
    return { kind: "invalid", sourceNodeIds: invalidSourceNodeIds };
  }
  if (records.length === 0) {
    return { kind: "missing" };
  }

  return {
    kind: "valid",
    index: mergeValidationIndexRecords(records),
  };
}

export function findValidationIndexContainers(runtime: ValidationIndexRuntime): FrameNode[] {
  return figma.currentPage.children.flatMap((child) => {
    if (
      child.type !== "FRAME" ||
      (child.name !== ANNOTATIONS_CONTAINER_NAME && child.name !== CONNECTORS_CONTAINER_NAME) ||
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.container
    ) {
      return [];
    }
    return [child];
  });
}

function readValidationIndexRecords(
  runtime: ValidationIndexRuntime,
  containers = findValidationIndexContainers(runtime),
): ValidationIndexRecordReadResult {
  const invalidSourceNodeIds: string[] = [];
  const records: ValidationIndexRecord[] = [];

  containers.forEach((container) => {
    const raw = container.getSharedPluginData(
      runtime.namespace,
      SHARED_PLUGIN_DATA.keys.validationIndex,
    );
    if (raw.length === 0) {
      return;
    }

    const record = decodeValidationIndexRecord(raw);
    if (record === null) {
      invalidSourceNodeIds.push(container.id);
      return;
    }
    records.push(record);
  });

  return { invalidSourceNodeIds, records };
}

function mergeValidationIndexRecords(records: ValidationIndexRecord[]): ValidationIndexRecord {
  return records.reduce(
    (merged, record) => mergeValidationIndexRecord(merged, record),
    createEmptyValidationIndexRecord(),
  );
}
