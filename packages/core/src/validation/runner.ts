import { validateAnnotationBindings } from "./annotation-validation.ts";
import {
  mergeValidationReports,
  validateFlowConnectorReferences,
  validateFlowConnectorRouteGeometry,
} from "./flow-connector-validation.ts";
import type {
  ValidateAnnotationBindingsInput,
  ValidateFlowConnectorReferencesInput,
  ValidateFlowConnectorRouteGeometryInput,
  ValidationReport,
} from "./types.ts";

export interface ValidationComputationSnapshot {
  annotationBindings: ValidateAnnotationBindingsInput;
  flowConnectorReferences: ValidateFlowConnectorReferencesInput;
  flowConnectorRouteGeometry: ValidateFlowConnectorRouteGeometryInput;
}

export function runValidationComputation(
  snapshot: ValidationComputationSnapshot,
): ValidationReport {
  return mergeValidationReports([
    validateAnnotationBindings(snapshot.annotationBindings),
    validateFlowConnectorReferences(snapshot.flowConnectorReferences),
    validateFlowConnectorRouteGeometry(snapshot.flowConnectorRouteGeometry),
  ]);
}
