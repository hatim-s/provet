import type { SerializedJsonValue } from "../versioning/serialized-json-value.js";

interface CodeGraderDefinition {
  filePath: string;
  graderId: string;
  type: "code";
}

interface ContainsGraderDefinition {
  caseSensitive: boolean;
  graderId: string;
  type: "contains";
  value: string;
}

interface EqualsGraderDefinition {
  graderId: string;
  type: "equals";
  value: SerializedJsonValue;
}

interface FilesUntouchedGraderDefinition {
  graderId: string;
  patterns: readonly string[];
  type: "files-untouched";
}

interface JsonSchemaGraderDefinition {
  graderId: string;
  schema: SerializedJsonValue;
  type: "json-schema";
}

interface JudgeGraderDefinition {
  graderId: string;
  judgeName: string;
  rubric: string;
  type: "judge";
}

interface MaximumStepsGraderDefinition {
  graderId: string;
  maximumSteps: number;
  type: "maximum-steps";
}

interface MinimumStepsGraderDefinition {
  graderId: string;
  minimumSteps: number;
  type: "minimum-steps";
}

interface CalledToolGraderDefinition {
  graderId: string;
  toolName: string;
  type: "called-tool";
}

interface NeverCalledToolGraderDefinition {
  graderId: string;
  toolName: string;
  type: "never-called-tool";
}

interface RegularExpressionGraderDefinition {
  flags: string;
  graderId: string;
  pattern: string;
  type: "regular-expression";
}

/** Enumerates the closed v1 per-case grader configuration set. */
type GraderDefinition =
  | CalledToolGraderDefinition
  | CodeGraderDefinition
  | ContainsGraderDefinition
  | EqualsGraderDefinition
  | FilesUntouchedGraderDefinition
  | JsonSchemaGraderDefinition
  | JudgeGraderDefinition
  | MaximumStepsGraderDefinition
  | MinimumStepsGraderDefinition
  | NeverCalledToolGraderDefinition
  | RegularExpressionGraderDefinition;

export type {
  CalledToolGraderDefinition,
  CodeGraderDefinition,
  ContainsGraderDefinition,
  EqualsGraderDefinition,
  FilesUntouchedGraderDefinition,
  GraderDefinition,
  JsonSchemaGraderDefinition,
  JudgeGraderDefinition,
  MaximumStepsGraderDefinition,
  MinimumStepsGraderDefinition,
  NeverCalledToolGraderDefinition,
  RegularExpressionGraderDefinition,
};
