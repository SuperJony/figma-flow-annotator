import {
  createEmptyValidationIndexRecord,
  decodeValidationIndexRecord,
  mergeValidationIndexRecord,
  SHARED_PLUGIN_DATA,
  type ValidationIndexReadiness,
  type ValidationIndexRecord,
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
  const { invalidSourceNodeIds, records } = readValidationIndexRecords(runtime);
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

function readValidationIndexRecords(
  runtime: ValidationIndexRuntime,
): ValidationIndexRecordReadResult {
  const invalidSourceNodeIds: string[] = [];
  const records: ValidationIndexRecord[] = [];

  const raw = figma.currentPage.getSharedPluginData(
    runtime.namespace,
    SHARED_PLUGIN_DATA.keys.validationIndex,
  );
  if (raw.length === 0) {
    return { invalidSourceNodeIds, records };
  }

  const record = decodeValidationIndexRecord(raw);
  if (record === null) {
    invalidSourceNodeIds.push(figma.currentPage.id);
    return { invalidSourceNodeIds, records };
  }
  records.push(record);

  return { invalidSourceNodeIds, records };
}

function mergeValidationIndexRecords(records: ValidationIndexRecord[]): ValidationIndexRecord {
  return records.reduce(
    (merged, record) => mergeValidationIndexRecord(merged, record),
    createEmptyValidationIndexRecord(),
  );
}
