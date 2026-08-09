import type { PassPolicy } from "../execution/pass-policy.js";
import type { GraderDefinition } from "../grading/grader-definition.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";

interface EvalCaseSource {
  documentIndex: number;
  path: string;
}

/** Owns the format-independent case shape consumed by planning and grading. */
interface NormalizedEvalCase {
  caseId: string;
  evalName: string;
  graders: readonly GraderDefinition[];
  input: string;
  passPolicy: PassPolicy;
  qualifiedCaseId: string;
  repeat: number;
  schemaVersion: PublicSchemaVersion;
  source: EvalCaseSource;
  workspaceFixturePath: string | null;
}

/** Normalizes discovered YAML and Markdown cases behind one application port. */
interface EvalNormalizationPort {
  readNormalizedEvalCases(
    projectRoot: string,
  ): Promise<readonly NormalizedEvalCase[]>;
}

export type { EvalCaseSource, EvalNormalizationPort, NormalizedEvalCase };
