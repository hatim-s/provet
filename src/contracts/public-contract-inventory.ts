import { PUBLIC_SCHEMA_VERSION } from "./versioning/schema-version.js";

type PublicContractStability = "provisional" | "stable";

interface PublicContractInventoryEntry {
  contractId: string;
  exportedSymbols: readonly string[];
  owner: string;
  schemaVersion: typeof PUBLIC_SCHEMA_VERSION;
  sourcePath: string;
  stability: PublicContractStability;
}

/** Lists every FND-02 public owner module and the symbols it alone may declare. */
const PUBLIC_CONTRACT_INVENTORY = [
  {
    contractId: "provet.cli-envelope",
    exportedSymbols: [
      "CliCommandName",
      "CliEnvelope",
      "CliEnvelopeMetadata",
      "CliErrorDetail",
      "CliErrorEnvelope",
      "CliSuccessEnvelope",
      "KnownCliErrorCode",
    ],
    owner: "cli",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/cli/cli-envelope.ts",
    stability: "provisional",
  },
  {
    contractId: "provet.project-configuration",
    exportedSymbols: [
      "NamedJudgeConfiguration",
      "NormalizedProjectConfiguration",
      "ProjectConfigurationPort",
      "ProjectExecutionDefaults",
      "ProjectReportConfiguration",
    ],
    owner: "config",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/config/project-configuration.ts",
    stability: "stable",
  },
  {
    contractId: "provet.normalized-eval-case",
    exportedSymbols: [
      "EvalCaseSource",
      "EvalNormalizationPort",
      "NormalizedEvalCase",
    ],
    owner: "evals",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/evals/normalized-eval-case.ts",
    stability: "stable",
  },
  {
    contractId: "provet.normalized-trajectory-event",
    exportedSymbols: [
      "NormalizedTrajectoryEvent",
      "TrajectoryMessageEvent",
      "TrajectoryResultEvent",
      "TrajectoryStepEvent",
      "TrajectoryToolCallEvent",
    ],
    owner: "events",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/events/normalized-trajectory-event.ts",
    stability: "provisional",
  },
  {
    contractId: "provet.run-event-record",
    exportedSymbols: ["RunEventPort", "RunEventRecord"],
    owner: "events",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/events/run-event-record.ts",
    stability: "provisional",
  },
  {
    contractId: "provet.pass-policy",
    exportedSymbols: ["PassPolicy"],
    owner: "execution",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/execution/pass-policy.ts",
    stability: "stable",
  },
  {
    contractId: "provet.run-plan",
    exportedSymbols: [
      "PlannedTrial",
      "RunPlan",
      "RunPlanningInput",
      "RunPlanningPort",
      "TrialIdentity",
    ],
    owner: "execution",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/execution/run-plan.ts",
    stability: "stable",
  },
  {
    contractId: "provet.grader-definition",
    exportedSymbols: [
      "CalledToolGraderDefinition",
      "CodeGraderDefinition",
      "ContainsGraderDefinition",
      "EqualsGraderDefinition",
      "FilesUntouchedGraderDefinition",
      "GraderDefinition",
      "JsonSchemaGraderDefinition",
      "JudgeGraderDefinition",
      "MaximumStepsGraderDefinition",
      "MinimumStepsGraderDefinition",
      "NeverCalledToolGraderDefinition",
      "RegularExpressionGraderDefinition",
    ],
    owner: "grading",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/grading/grader-definition.ts",
    stability: "stable",
  },
  {
    contractId: "provet.grading-port",
    exportedSymbols: [
      "GraderInput",
      "GraderVerdict",
      "GraderVerdictStatus",
      "GradingPort",
      "WorkspaceEvidenceReference",
    ],
    owner: "grading",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/grading/grading-port.ts",
    stability: "stable",
  },
  {
    contractId: "provet.adapter-configuration",
    exportedSymbols: [
      "AdapterConfiguration",
      "AdapterKind",
      "ClaudeCodeAdapterConfiguration",
      "CodexAdapterConfiguration",
      "CommandAdapterConfiguration",
      "HttpAdapterConfiguration",
      "HttpHeaderEnvironmentReference",
    ],
    owner: "invocation",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/invocation/adapter-configuration.ts",
    stability: "stable",
  },
  {
    contractId: "provet.invocation-measurements",
    exportedSymbols: ["InvocationMeasurements", "MonetaryAmount", "TokenUsage"],
    owner: "invocation",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/invocation/invocation-measurements.ts",
    stability: "stable",
  },
  {
    contractId: "provet.invocation-port",
    exportedSymbols: [
      "AdapterInvocationResult",
      "AdapterProvenance",
      "JudgeInvocationPort",
      "JudgeInvocationRequest",
      "RedactedJudgeEvidence",
      "TargetCapabilityGrant",
      "TargetInvocationPort",
      "TargetInvocationRequest",
      "TrialWorkspaceReference",
    ],
    owner: "invocation",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/invocation/invocation-port.ts",
    stability: "provisional",
  },
  {
    contractId: "provet.run-artifact",
    exportedSymbols: [
      "RunArtifact",
      "RunArtifactReference",
      "RunArtifactState",
      "RunPersistencePort",
    ],
    owner: "persistence",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/persistence/run-artifact.ts",
    stability: "provisional",
  },
  {
    contractId: "provet.report-view-model",
    exportedSymbols: [
      "ReportCaseStatus",
      "ReportCaseSummary",
      "ReportingPort",
      "ReportSummaryTotals",
      "ReportViewModel",
    ],
    owner: "reporting",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/reporting/report-view-model.ts",
    stability: "provisional",
  },
  {
    contractId: "provet.schema-version",
    exportedSymbols: ["PUBLIC_SCHEMA_VERSION", "PublicSchemaVersion"],
    owner: "versioning",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/versioning/schema-version.ts",
    stability: "stable",
  },
  {
    contractId: "provet.serialized-json-value",
    exportedSymbols: ["SerializedJsonPrimitive", "SerializedJsonValue"],
    owner: "versioning",
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    sourcePath: "src/contracts/versioning/serialized-json-value.ts",
    stability: "stable",
  },
] as const satisfies readonly PublicContractInventoryEntry[];

export {
  PUBLIC_CONTRACT_INVENTORY,
  type PublicContractInventoryEntry,
  type PublicContractStability,
};
