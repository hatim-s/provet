import type { RunEventRecord } from "../events/run-event-record.js";
import type { RunPlan } from "../execution/run-plan.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";

type RunArtifactState = "completed" | "failed" | "interrupted" | "running";

/**
 * Owns the minimum import seam; SPI-04 remains responsible for final lifecycle,
 * atomicity, event partitioning, and interrupted-run semantics.
 */
interface RunArtifact {
  events: readonly RunEventRecord[];
  plan: RunPlan;
  runId: string;
  schemaVersion: PublicSchemaVersion;
  state: RunArtifactState;
}

interface RunArtifactReference {
  path: string;
  runId: string;
}

interface RunPersistencePort {
  readRunArtifact(selector: string): Promise<RunArtifact | null>;
  writeRunArtifact(artifact: RunArtifact): Promise<RunArtifactReference>;
}

export type {
  RunArtifact,
  RunArtifactReference,
  RunArtifactState,
  RunPersistencePort,
};
