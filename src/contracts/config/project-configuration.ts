import type { PassPolicy } from "../execution/pass-policy.js";
import type { AdapterConfiguration } from "../invocation/adapter-configuration.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";

interface ProjectExecutionDefaults {
  concurrency: number;
  passPolicy: PassPolicy;
  repeat: number;
}

interface NamedJudgeConfiguration {
  adapter: AdapterConfiguration;
  name: string;
}

interface ProjectReportConfiguration {
  templateDirectory: string | null;
}

/** Owns the immutable, secret-free normalized configuration consumed downstream. */
interface NormalizedProjectConfiguration {
  defaults: ProjectExecutionDefaults;
  fingerprint: string;
  judges: readonly NamedJudgeConfiguration[];
  projectRoot: string;
  report: ProjectReportConfiguration;
  schemaVersion: PublicSchemaVersion;
  sourcePath: string;
  sourceVersion: 1;
  target: AdapterConfiguration;
}

/** Loads and normalizes project configuration without exposing filesystem effects. */
interface ProjectConfigurationPort {
  readProjectConfiguration(
    startingDirectory: string,
  ): Promise<NormalizedProjectConfiguration>;
}

export type {
  NamedJudgeConfiguration,
  NormalizedProjectConfiguration,
  ProjectConfigurationPort,
  ProjectExecutionDefaults,
  ProjectReportConfiguration,
};
