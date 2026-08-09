import type { NormalizedEvalCase } from "../evals/normalized-eval-case.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";

/** Uses a structured tuple as authority and a derived key only for display/storage lookup. */
interface TrialIdentity {
  caseId: string;
  evalName: string;
  qualifiedCaseId: string;
  trialKey: string;
  trialNumber: number;
}

interface PlannedTrial {
  evalCase: NormalizedEvalCase;
  identity: TrialIdentity;
}

/** Snapshots selection and ordering before any target invocation begins. */
interface RunPlan {
  configurationFingerprint: string;
  concurrency: number;
  createdAt: string;
  runId: string;
  schemaVersion: PublicSchemaVersion;
  trials: readonly PlannedTrial[];
}

interface RunPlanningInput {
  cases: readonly NormalizedEvalCase[];
  concurrency: number;
  configurationFingerprint: string;
  repeatOverride: number | null;
  runId: string;
  startedAt: string;
}

/** Expands an immutable normalized selection into a deterministically ordered run plan. */
interface RunPlanningPort {
  createRunPlan(input: RunPlanningInput): RunPlan;
}

export type {
  PlannedTrial,
  RunPlan,
  RunPlanningInput,
  RunPlanningPort,
  TrialIdentity,
};
