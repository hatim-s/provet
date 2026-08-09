import type { PublicSchemaVersion } from "../versioning/schema-version.js";
import type { SerializedJsonValue } from "../versioning/serialized-json-value.js";

type CliCommandName =
  | "add-case"
  | "add-grader"
  | "diff"
  | "init"
  | "new-eval"
  | "report"
  | "run"
  | "schema"
  | "validate"
  | "version";

type KnownCliErrorCode =
  | "ADAPTER_PROTOCOL_ERROR"
  | "ALREADY_EXISTS"
  | "CANCELLED"
  | "CONFIG_INVALID"
  | "CONFIG_NOT_FOUND"
  | "GRADER_ERROR"
  | "INTERNAL_ERROR"
  | "JUDGE_PARSE_ERROR"
  | "REPORT_ERROR"
  | "RUN_NOT_FOUND"
  | "SECURITY_ERROR"
  | "SELECTION_EMPTY"
  | "STORAGE_ERROR"
  | "TARGET_FAILED"
  | "TIMEOUT"
  | "USAGE_ERROR"
  | "VALIDATION_FAILED"
  | "WORKSPACE_ERROR"
  | "WRITE_CONFLICT";

interface CliEnvelopeMetadata {
  vetVersion: string;
}

interface CliErrorDetail {
  /** Error codes are explicitly extensible within protocol v1. */
  code: KnownCliErrorCode | (string & Record<never, never>);
  details: SerializedJsonValue | null;
  message: string;
  remediation: string;
}

interface CliSuccessEnvelope {
  command: CliCommandName;
  data: SerializedJsonValue;
  meta: CliEnvelopeMetadata;
  ok: true;
  schemaVersion: PublicSchemaVersion;
}

interface CliErrorEnvelope {
  command: CliCommandName;
  error: CliErrorDetail;
  meta: CliEnvelopeMetadata;
  ok: false;
  schemaVersion: PublicSchemaVersion;
}

type CliEnvelope = CliErrorEnvelope | CliSuccessEnvelope;

export type {
  CliCommandName,
  CliEnvelope,
  CliEnvelopeMetadata,
  CliErrorDetail,
  CliErrorEnvelope,
  CliSuccessEnvelope,
  KnownCliErrorCode,
};
