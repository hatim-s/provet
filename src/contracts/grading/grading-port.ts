import type { NormalizedEvalCase } from "../evals/normalized-eval-case.js";
import type { TrialIdentity } from "../execution/run-plan.js";
import type { AdapterInvocationResult } from "../invocation/invocation-port.js";
import type { InvocationMeasurements } from "../invocation/invocation-measurements.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";
import type { GraderDefinition } from "./grader-definition.js";

interface WorkspaceEvidenceReference {
  diffArtifactPath: string;
  finalWorkspacePath: string;
}

interface GraderInput {
  definition: GraderDefinition;
  evalCase: NormalizedEvalCase;
  schemaVersion: PublicSchemaVersion;
  targetResult: AdapterInvocationResult;
  trial: TrialIdentity;
  workspaceEvidence: WorkspaceEvidenceReference | null;
}

type GraderVerdictStatus = "fail" | "grader-error" | "pass";

/** Keeps assertion failure separate from grader execution or protocol failure. */
interface GraderVerdict {
  graderId: string;
  judgeMeasurements: InvocationMeasurements | null;
  reasoning: string;
  schemaVersion: PublicSchemaVersion;
  score: number | null;
  status: GraderVerdictStatus;
}

interface GradingPort {
  grade(input: GraderInput): Promise<GraderVerdict>;
}

export type {
  GraderInput,
  GraderVerdict,
  GraderVerdictStatus,
  GradingPort,
  WorkspaceEvidenceReference,
};
