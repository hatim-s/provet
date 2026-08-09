import type { NormalizedTrajectoryEvent } from "../events/normalized-trajectory-event.js";
import type { TrialIdentity } from "../execution/run-plan.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";
import type { SerializedJsonValue } from "../versioning/serialized-json-value.js";
import type { AdapterKind } from "./adapter-configuration.js";
import type { InvocationMeasurements } from "./invocation-measurements.js";

interface AdapterProvenance {
  adapterKind: AdapterKind;
  detectedVersion: string | null;
  rawEventFormat: string;
}

/** Declares the target's upper capability bound without claiming host isolation. */
interface TargetCapabilityGrant {
  networkAccess: "configured-destination-only" | "none";
  workspaceAccess: "none" | "read-only" | "read-write";
}

interface TrialWorkspaceReference {
  path: string;
}

interface TargetInvocationRequest {
  capabilityGrant: TargetCapabilityGrant;
  input: string;
  schemaVersion: PublicSchemaVersion;
  trial: TrialIdentity;
  workspace: TrialWorkspaceReference | null;
}

/** Gives a judge only redacted immutable evidence and never a target workspace. */
interface JudgeInvocationRequest {
  caseInput: string;
  evidence: RedactedJudgeEvidence;
  judgeName: string;
  rubric: string;
  schemaVersion: PublicSchemaVersion;
  trial: TrialIdentity;
}

interface RedactedJudgeEvidence {
  finalOutput: string;
  trajectory: readonly NormalizedTrajectoryEvent[];
}

/** Preserves normalized and raw provider evidence until redaction/persistence policy runs. */
interface AdapterInvocationResult {
  measurements: InvocationMeasurements;
  output: string;
  provenance: AdapterProvenance;
  rawEvents: readonly SerializedJsonValue[];
  schemaVersion: PublicSchemaVersion;
  trajectory: readonly NormalizedTrajectoryEvent[];
}

interface TargetInvocationPort {
  invokeTarget(
    request: TargetInvocationRequest,
  ): Promise<AdapterInvocationResult>;
}

interface JudgeInvocationPort {
  invokeJudge(
    request: JudgeInvocationRequest,
  ): Promise<AdapterInvocationResult>;
}

export type {
  AdapterInvocationResult,
  AdapterProvenance,
  JudgeInvocationPort,
  JudgeInvocationRequest,
  RedactedJudgeEvidence,
  TargetCapabilityGrant,
  TargetInvocationPort,
  TargetInvocationRequest,
  TrialWorkspaceReference,
};
