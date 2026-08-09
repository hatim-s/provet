type AdapterKind = "claude-code" | "codex" | "command" | "http";

interface ClaudeCodeAdapterConfiguration {
  arguments: readonly string[];
  model: string | null;
  timeoutSeconds: number;
  type: "claude-code";
}

interface CodexAdapterConfiguration {
  arguments: readonly string[];
  model: string | null;
  timeoutSeconds: number;
  type: "codex";
}

interface CommandAdapterConfiguration {
  arguments: readonly string[];
  executable: string;
  outputFormat: "raw" | "vet-events";
  timeoutSeconds: number;
  type: "command";
}

/** Names an HTTP header whose value is resolved from the environment at invocation time. */
interface HttpHeaderEnvironmentReference {
  environmentVariable: string;
  name: string;
}

interface HttpAdapterConfiguration {
  headers: readonly HttpHeaderEnvironmentReference[];
  timeoutSeconds: number;
  type: "http";
  url: string;
}

/** Defines the shared adapter discriminator without sharing target and judge privileges. */
type AdapterConfiguration =
  | ClaudeCodeAdapterConfiguration
  | CodexAdapterConfiguration
  | CommandAdapterConfiguration
  | HttpAdapterConfiguration;

export type {
  AdapterConfiguration,
  AdapterKind,
  ClaudeCodeAdapterConfiguration,
  CodexAdapterConfiguration,
  CommandAdapterConfiguration,
  HttpAdapterConfiguration,
  HttpHeaderEnvironmentReference,
};
