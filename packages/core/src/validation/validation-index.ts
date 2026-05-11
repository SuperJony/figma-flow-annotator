export interface ValidationIndexRecord {
  schemaVersion: 1;
  subjectNodeIds: string[];
  annotationCardNodeIds: string[];
  annotationBadgeNodeIds: string[];
  flowEndpointNodeIds: string[];
  contextFrameIds: string[];
  ownerContextFrameIds: string[];
  connectorRootNodeIds: string[];
  connectorObstacleCandidateNodeIds: string[];
}

export type ValidationIndexField = Exclude<keyof ValidationIndexRecord, "schemaVersion">;

export type ValidationIndexUpdate = Partial<Record<ValidationIndexField, string[]>>;

const validationIndexFields = [
  "subjectNodeIds",
  "annotationCardNodeIds",
  "annotationBadgeNodeIds",
  "flowEndpointNodeIds",
  "contextFrameIds",
  "ownerContextFrameIds",
  "connectorRootNodeIds",
  "connectorObstacleCandidateNodeIds",
] as const satisfies readonly ValidationIndexField[];

export function createEmptyValidationIndexRecord(): ValidationIndexRecord {
  return {
    schemaVersion: 1,
    subjectNodeIds: [],
    annotationCardNodeIds: [],
    annotationBadgeNodeIds: [],
    flowEndpointNodeIds: [],
    contextFrameIds: [],
    ownerContextFrameIds: [],
    connectorRootNodeIds: [],
    connectorObstacleCandidateNodeIds: [],
  };
}

export function createValidationIndexRecord(update: ValidationIndexUpdate): ValidationIndexRecord {
  return mergeValidationIndexRecord(createEmptyValidationIndexRecord(), update);
}

export function decodeValidationIndexRecord(value: string): ValidationIndexRecord | null {
  const parsed = parseJson(value);
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    return null;
  }

  return createValidationIndexRecord(
    Object.fromEntries(
      validationIndexFields.map((field) => [field, readStringArray(parsed[field])]),
    ) as ValidationIndexUpdate,
  );
}

export function decodeOrCreateValidationIndexRecord(value: string): ValidationIndexRecord {
  return decodeValidationIndexRecord(value) ?? createEmptyValidationIndexRecord();
}

export function mergeValidationIndexRecord(
  record: ValidationIndexRecord,
  update: ValidationIndexUpdate,
): ValidationIndexRecord {
  return {
    schemaVersion: 1,
    subjectNodeIds: mergeIds(record.subjectNodeIds, update.subjectNodeIds),
    annotationCardNodeIds: mergeIds(record.annotationCardNodeIds, update.annotationCardNodeIds),
    annotationBadgeNodeIds: mergeIds(record.annotationBadgeNodeIds, update.annotationBadgeNodeIds),
    flowEndpointNodeIds: mergeIds(record.flowEndpointNodeIds, update.flowEndpointNodeIds),
    contextFrameIds: mergeIds(record.contextFrameIds, update.contextFrameIds),
    ownerContextFrameIds: mergeIds(record.ownerContextFrameIds, update.ownerContextFrameIds),
    connectorRootNodeIds: mergeIds(record.connectorRootNodeIds, update.connectorRootNodeIds),
    connectorObstacleCandidateNodeIds: mergeIds(
      record.connectorObstacleCandidateNodeIds,
      update.connectorObstacleCandidateNodeIds,
    ),
  };
}

export function serializeValidationIndexRecord(record: ValidationIndexRecord): string {
  return JSON.stringify(createValidationIndexRecord(record));
}

function mergeIds(existing: string[], next: string[] = []): string[] {
  const merged: string[] = [];
  for (const id of [...existing, ...next]) {
    if (typeof id === "string" && id.length > 0 && !merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function parseJson(value: string): unknown {
  if (value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (_error: unknown) {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
