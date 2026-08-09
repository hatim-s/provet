import type { InvocationMeasurements } from "../invocation/invocation-measurements.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";

type ReportCaseStatus = "fail" | "grader-error" | "pass" | "skipped";

interface ReportCaseSummary {
  caseId: string;
  judgeMeasurements: InvocationMeasurements;
  passedTrials: number;
  status: ReportCaseStatus;
  targetMeasurements: InvocationMeasurements;
  trialCount: number;
}

interface ReportSummaryTotals {
  failed: number;
  graderErrors: number;
  passed: number;
  skipped: number;
  total: number;
}

/** Is the sole input accepted by terminal, JSON, and gated static HTML renderers. */
interface ReportViewModel {
  cases: readonly ReportCaseSummary[];
  generatedAt: string;
  runId: string;
  schemaVersion: PublicSchemaVersion;
  totals: ReportSummaryTotals;
}

interface ReportingPort {
  createReportViewModel(runSelector: string): Promise<ReportViewModel>;
}

export type {
  ReportCaseStatus,
  ReportCaseSummary,
  ReportingPort,
  ReportSummaryTotals,
  ReportViewModel,
};
