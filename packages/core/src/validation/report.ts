import type { Point, RectLike } from "../shared/geometry.ts";
import type { ValidationIssue, ValidationReportSummary } from "./types.ts";

export function addIssue(
  issues: ValidationIssue[],
  input: Omit<ValidationIssue, "id" | "locationNodeIds"> & { locationNodeIds: string[] },
): void {
  const locationNodeIds = unique(input.locationNodeIds);
  if (input.affectedObjectCount === 0 || locationNodeIds.length === 0) {
    return;
  }

  issues.push({
    ...input,
    id: `${input.code}-${issues.length + 1}`,
    locationNodeIds,
  });
}

export function summarizeValidationIssues(issues: ValidationIssue[]): ValidationReportSummary {
  return {
    all: issues.length,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

export function compareRectsThenIds(
  first: { nodeId: string; rect: RectLike },
  second: { nodeId: string; rect: RectLike },
): number {
  return (
    first.rect.y - second.rect.y ||
    first.rect.x - second.rect.x ||
    first.nodeId.localeCompare(second.nodeId)
  );
}

export function compareAnnotationNumbersThenIds(
  first: { annotationNumber: number; nodeId: string },
  second: { annotationNumber: number; nodeId: string },
): number {
  return (
    first.annotationNumber - second.annotationNumber || first.nodeId.localeCompare(second.nodeId)
  );
}

export function groupBy<T>(items: T[], keyForItem: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyForItem(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });
  return groups;
}

export function arraysEqual(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

export function countUnique(values: string[]): number {
  return unique(values).length;
}

export function routePointsEqual(first: Point[] | undefined, second: Point[]): boolean {
  if (first === undefined || first.length !== second.length) {
    return false;
  }

  return first.every(
    (point, index) =>
      Math.abs(point.x - second[index].x) < 0.001 && Math.abs(point.y - second[index].y) < 0.001,
  );
}

export function rectsOverlap(first: RectLike, second: RectLike): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
